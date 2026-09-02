/**
 * TemplateDesignPipeline — Canva sınıfı akıllı tasarım/şablon motoru.
 *
 * `autoResize` tamamen yerel ve deterministiktir (model gerektirmez): içerik
 * kutusu tespiti + güvenli alan (safe-area) kuralları ile yeniden yerleşim.
 * Şablon önerisi ise sunucudaki öneri modelinden gelir.
 */
import type { Result } from '@/core/result/Result';
import { AiEngine, type RunResult } from '@/ai/engine/AiEngine';

export type AspectPreset =
  | 'story-9x16'
  | 'reel-9x16'
  | 'post-1x1'
  | 'landscape-16x9'
  | 'pin-2x3'
  | 'thumbnail-16x9';

export const ASPECT_RATIOS: Readonly<Record<AspectPreset, number>> = {
  'story-9x16': 9 / 16,
  'reel-9x16': 9 / 16,
  'post-1x1': 1,
  'landscape-16x9': 16 / 9,
  'pin-2x3': 2 / 3,
  'thumbnail-16x9': 16 / 9,
};

export const TemplateDesignPipeline = {
  /** Tek dokunuşla şablon önerisi — içeriğe göre sıralanmış şablon listesi. */
  async suggestTemplates(sourceUri: string, locale: string): Promise<Result<RunResult>> {
    return AiEngine.run('smart-template', {
      sourceUri,
      maxEdgePx: 768, // öneri için küçük önizleme yeterli, bant genişliği tasarrufu
      params: { locale },
      preferRemote: true,
    });
  },

  /** Otomatik boyutlandırma — aynı tasarımı tüm oranlara uyarlar. */
  async autoResize(
    sourceUri: string,
    presets: readonly AspectPreset[],
  ): Promise<Result<RunResult>> {
    return AiEngine.run('auto-resize', {
      sourceUri,
      maxEdgePx: 4096,
      params: { presets: presets.join(','), ratios: presets.map((p) => ASPECT_RATIOS[p]).join(',') },
    });
  },
};
