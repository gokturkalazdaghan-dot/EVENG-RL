/**
 * VideoEffectsPipeline — CapCut/InShot sınıfı video araçları.
 *
 * Video, fotoğraftan farklı olarak segment segment işlenir: 60 saniyelik 4K bir
 * klibi tek seferde belleğe almak imkânsızdır. Her segment kendi arena'sında
 * işlenir, çıktısı render cache'ine yazılır ve segment referansı serbest kalır.
 */
import { createLogger } from '@/core/logging/Logger';
import type { Result } from '@/core/result/Result';
import { AiEngine, type RunResult } from '@/ai/engine/AiEngine';
import { ThermalGovernor } from '@/performance/ThermalGovernor';
import { PATHS } from '@/storage/paths';
import { pinPath } from '@/storage/CacheManager';

const log = createLogger('VideoEffects');

export interface CaptionCue {
  startMs: number;
  endMs: number;
  text: string;
}

export const VideoEffectsPipeline = {
  /** Otomatik altyazı — offline'da whisper-tiny, online'da sunucu modeli. */
  async autoCaptions(sourceUri: string): Promise<Result<RunResult>> {
    return AiEngine.run('auto-captions', { sourceUri, maxEdgePx: 0 });
  },

  /** Akıllı nesne takibi — seçilen nesnenin kare kare konumunu üretir. */
  async trackObject(
    sourceUri: string,
    seedBox: { x: number; y: number; w: number; h: number },
  ): Promise<Result<RunResult>> {
    return AiEngine.run('object-tracking', {
      sourceUri,
      maxEdgePx: 1280, // takip için yüksek çözünürlük gereksiz, ısınmayı artırır
      params: { seedX: seedBox.x, seedY: seedBox.y, seedW: seedBox.w, seedH: seedBox.h },
    });
  },

  /**
   * Smart Slo-Mo — kare aradeğerlemesiyle (frame interpolation) akıcı ağır çekim.
   * `targetFactor` 2 = iki kat yavaş.
   */
  async smartSlowMotion(
    sourceUri: string,
    range: { startMs: number; endMs: number },
    targetFactor: 2 | 4 | 8,
  ): Promise<Result<RunResult>> {
    const unpin = pinPath(`${PATHS.renderCache}/slowmo`);
    try {
      return await AiEngine.run('smart-slowmo', {
        sourceUri,
        maxEdgePx: 1920,
        params: { startMs: range.startMs, endMs: range.endMs, factor: targetFactor },
        // Aradeğerleme her kareyi ister; kare atlama burada kaliteyi bozar,
        // bu yüzden stride'ı 1'e sabitliyoruz ve yükü çözünürlükten kısıyoruz.
        frameStride: 1,
      });
    } finally {
      unpin();
    }
  },

  /** Metinden video üretimi — yalnızca sunucu. */
  async textToVideo(prompt: string, durationSec: number): Promise<Result<RunResult>> {
    log.debug(`text-to-video ${durationSec}sn`);
    return AiEngine.run('text-to-video', {
      sourceUri: '',
      maxEdgePx: ThermalGovernor.budget.maxOutputEdgePx,
      params: { prompt, durationSec },
      preferRemote: true,
    });
  },
};
