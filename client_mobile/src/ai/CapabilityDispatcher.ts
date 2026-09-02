/**
 * CapabilityDispatcher — araç kimliğinden İŞLEM HATTINA.
 *
 * NEDEN VAR
 * EditorScreen her araç için doğrudan `AiEngine.run(capability, { sourceUri,
 * maxEdgePx: 2048 })` çağırıyordu. Yani boru hatlarının (pipelines) her
 * yetenek için ayarladığı kenar tavanları, parametreler ve uzak/yerel
 * tercihi HİÇ UYGULANMIYORDU. Somut sonuçları:
 *
 *   - `ai-avatar` 1024 yerine 2048 kenarla ve yerel olarak çalışıyordu —
 *     boru hattının "bellek tepe noktası cihazı öldürmesin" diye koyduğu
 *     tavan devre dışıydı.
 *   - `hd-upscale` 4x seçilse bile 2048'e kırpılıyordu; kullanıcı 4x
 *     istiyor, 2x'ten küçük çıktı alıyordu.
 *   - `auto-captions` bir VİDEO işlemi olduğu halde 2048 kenar alıyordu
 *     (`maxEdgePx: 0` olması gerekirken).
 *   - `manual-reshape` gibi 4096'ya kadar çalışabilen ücretsiz yerel
 *     araçlar gereksiz yere yarı çözünürlükte çalışıyordu.
 *
 * Boru hatları yazılmış ama HİÇBİR YERDEN ÇAĞRILMIYORDU: dosyalar depoda
 * duruyor, kod incelemesinde doğru görünüyor, çalışma anında devre dışı.
 *
 * BURASI SAF EŞLEME
 * Karar yok, ağ yok, durum yok — yalnızca "hangi yetenek hangi çağrıya
 * gider". Bu yüzden testi native taklidi olmadan yazılabiliyor.
 */
import { AiEngine, type RunResult } from '@/ai/engine/AiEngine';
import type { Capability } from '@/ai/engine/ModelRegistry';
import { ManualStudio, type ReshapeRegion } from '@/ai/generate/ManualStudio';
import { GenerativePhotoPipeline } from '@/ai/pipelines/GenerativePhotoPipeline';
import {
  PortraitStudioPipeline,
  type AvatarStyle,
  type StudioBackdrop,
} from '@/ai/pipelines/PortraitStudioPipeline';
import { TemplateDesignPipeline } from '@/ai/pipelines/TemplateDesignPipeline';
import { VideoEffectsPipeline } from '@/ai/pipelines/VideoEffectsPipeline';
import { appError, Err, type Result } from '@/core/result/Result';

/** Araç panelinden gelen, kullanıcı ayarlarını taşıyan serbest parametreler. */
export interface ToolParams {
  readonly strength?: number;
  readonly scale?: 2 | 4;
  readonly intensity?: number;
  readonly aperture?: number;
  readonly maskUri?: string;
  readonly prompt?: string;
  readonly style?: AvatarStyle;
  readonly backdrop?: StudioBackdrop;
  readonly region?: ReshapeRegion;
  readonly conceptId?: string;
  readonly locale?: string;
  readonly targetYears?: number;
}

/**
 * Kullanıcıya ARAÇ OLARAK gösterilmeyen yetenekler.
 *
 * `nsfw-classify` bir moderasyon sınıflandırıcısıdır. Araç olarak
 * çalıştırılabilseydi kullanıcı, moderasyon modelini keyfî girdiyle
 * çalıştırabilirdi — sunucu tarafında da aynı sebeple yasak
 * (KNOWN_CAPABILITIES dışında).
 */
export const NON_TOOL_CAPABILITIES: ReadonlySet<Capability> = new Set(['nsfw-classify']);

/**
 * Kaynak görsel GEREKTİRMEYEN yetenekler.
 *
 * `text-to-video` metinden üretir; boş bir tuvalde de çalışır. Diğer her
 * araç için kaynak yoksa çağrı YAPILMAZ — "hiçbir şey olmadı" yerine
 * açık bir hata döner.
 */
export const SOURCELESS_CAPABILITIES: ReadonlySet<Capability> = new Set(['text-to-video']);

/**
 * Araç çubuğundan DOĞRUDAN çalıştırılamayan, kendi ekranını gerektiren
 * yetenekler. Çağıran taraf bunları ilgili akışa yönlendirmelidir.
 */
export const DEDICATED_FLOW_CAPABILITIES: ReadonlySet<Capability> = new Set(['even-generate']);

const clamp01 = (value: number | undefined, fallback: number): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(1, value));
};

/**
 * Aracı KENDİ boru hattı üzerinden çalıştırır.
 *
 * Bilinmeyen yetenek sessizce `AiEngine.run`'a düşMEZ: eşlemeye yeni bir
 * yetenek eklenmediğinde bunun fark edilmesi gerekir, yoksa yeni araç
 * ayarsız (2048 kenar, parametresiz) çalışır ve kimse anlamaz.
 */
export async function dispatchCapability(
  capability: Capability,
  sourceUri: string | undefined,
  params: ToolParams = {},
): Promise<Result<RunResult>> {
  if (NON_TOOL_CAPABILITIES.has(capability)) {
    return Err(appError('UNKNOWN', `araç olarak çalıştırılamaz: ${capability}`));
  }

  if (!sourceUri && !SOURCELESS_CAPABILITIES.has(capability)) {
    return Err(
      appError('UNKNOWN', 'kaynak medya yok', { i18nKey: 'editor.noSourceSelected' }),
    );
  }

  const uri = sourceUri ?? '';

  switch (capability) {
    // ---- Portre & yüz ----
    case 'face-restore':
      return PortraitStudioPipeline.restoreFace(uri, clamp01(params.strength, 0.6));
    case 'hd-upscale':
      return PortraitStudioPipeline.enhanceHd(uri, params.scale === 4 ? 4 : 2);
    case 'ai-avatar':
      return PortraitStudioPipeline.generateAvatars(uri, params.style ?? 'cinematic', 6);
    case 'studio-background':
      return PortraitStudioPipeline.studioBackground(uri, params.backdrop ?? 'seamless-gray');
    case 'age-transform':
      // Boru hattı DELTA yıl bekliyor (-40..+40), mutlak yaş değil.
      return PortraitStudioPipeline.ageTransform(uri, params.targetYears ?? 20);

    // ---- Fotoğraf & üretken ----
    case 'magic-eraser':
      return GenerativePhotoPipeline.magicErase(uri, { maskUri: params.maskUri ?? '' });
    case 'generative-remove':
      return GenerativePhotoPipeline.generativeRemove(
        uri,
        { maskUri: params.maskUri ?? '' },
        params.prompt,
      );
    case 'lens-blur':
      return GenerativePhotoPipeline.lensBlur(uri, params.aperture ?? 2.8);
    case 'generative-expand':
      return GenerativePhotoPipeline.generativeExpand(uri, 'all', 1.3);
    case 'concept-portrait':
      return GenerativePhotoPipeline.conceptPortrait(uri, params.conceptId ?? '');

    // ---- Video & efekt ----
    case 'auto-captions':
      return VideoEffectsPipeline.autoCaptions(uri);
    case 'object-tracking':
      return VideoEffectsPipeline.trackObject(uri, { x: 0.5, y: 0.5, w: 0.2, h: 0.2 });
    case 'smart-slowmo':
      return VideoEffectsPipeline.smartSlowMotion(uri, { startMs: 0, endMs: 2000 }, 2);
    case 'text-to-video':
      return VideoEffectsPipeline.textToVideo(params.prompt ?? '', 5);

    // ---- Tasarım ----
    case 'smart-template':
      return TemplateDesignPipeline.suggestTemplates(uri, params.locale ?? 'en');
    case 'auto-resize':
      return TemplateDesignPipeline.autoResize(uri, ['post-1x1', 'story-9x16']);

    // ---- Manuel & Botox stüdyo (ücretsiz, sınırsız, tamamen yerel) ----
    case 'manual-reshape':
      return ManualStudio.reshape(uri, params.region ?? 'jawline', clamp01(params.intensity, 0.4));
    case 'botox-jawline':
      return ManualStudio.botoxJawline(uri, clamp01(params.intensity, 0.4));
    case 'skin-smooth':
      return ManualStudio.smoothSkin(uri, clamp01(params.intensity, 0.4));
    case 'blemish-eraser':
      return ManualStudio.eraseBlemish(uri, { x: 0.5, y: 0.5, radius: 0.05 });

    // ---- Even Girl Generate ----
    case 'even-generate':
      // KENDİ EKRANI VAR. Even Girl Generate 3-5 kelimelik kavram, 5 referans
      // foto ve arka plan seçimi ister; araç çubuğundan tek dokunuşla
      // çalıştırılamaz. Buradan boş parametrelerle çağırmak, doğrulamanın
      // "empty-concept" ile reddedeceği bir istek üretir ve kullanıcı
      // sebebini anlamaz.
      return Err(
        appError('UNKNOWN', 'even-generate kendi akışını gerektirir', {
          i18nKey: 'generate.opensDedicatedFlow',
        }),
      );
    case 'light-sync':
    case 'cinematic-bokeh':
    case 'pore-preserve':
      // Bu üçü Even Girl Generate'in alt adımlarıdır; tek başlarına da
      // çalışabilirler ve boru hattı ayarları AiEngine varsayılanlarıyla
      // aynıdır — burada eşleme yapılmasının sebebi, `default` dalına
      // düşüp SESSİZCE genel ayarla çalışmalarını engellemek.
      return AiEngine.run(capability, { sourceUri: uri, maxEdgePx: 4096 });

    // ---- Temel araçlar (model gerektirmez) ----
    case 'crop':
    case 'color-filter':
    case 'trim':
      return AiEngine.run(capability, { sourceUri: uri, maxEdgePx: 4096 });

    case 'nsfw-classify':
      // Yukarıda zaten reddedildi; TypeScript'in birlik kapsamı için burada.
      return Err(appError('UNKNOWN', 'araç değil'));
  }
}
