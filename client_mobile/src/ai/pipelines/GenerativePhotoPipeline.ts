/**
 * GenerativePhotoPipeline — Picsart/Lightroom/EPIK sınıfı fotoğraf araçları.
 */
import type { Result } from '@/core/result/Result';
import { AiEngine, type RunResult } from '@/ai/engine/AiEngine';
import { NetworkMonitor } from '@/connectivity/NetworkMonitor';

export interface MaskRegion {
  /** Maske PNG'sinin cache içindeki yolu — piksel dizisi köprüden geçmez. */
  maskUri: string;
}

export type ExpandDirection = 'left' | 'right' | 'top' | 'bottom' | 'all';

export const GenerativePhotoPipeline = {
  /**
   * Sihirli silgi — küçük nesneleri yerel inpainting ile siler.
   * Offline'da da çalışır; ücretsiz katmandadır.
   */
  async magicErase(sourceUri: string, mask: MaskRegion): Promise<Result<RunResult>> {
    return AiEngine.run('magic-eraser', {
      sourceUri,
      maxEdgePx: 2048,
      params: { maskUri: mask.maskUri },
    });
  },

  /**
   * Üretken kaldırma — silinen alanı sahneye uygun içerikle DOLDURUR
   * (sihirli silgiden farkı: sadece kapatmaz, üretir). Difüzyon gerektirir.
   */
  async generativeRemove(
    sourceUri: string,
    mask: MaskRegion,
    prompt?: string,
  ): Promise<Result<RunResult>> {
    return AiEngine.run('generative-remove', {
      sourceUri,
      maxEdgePx: 2048,
      params: { maskUri: mask.maskUri, prompt: prompt ?? '' },
      preferRemote: true,
    });
  },

  /** Akıllı lens bulanıklaştırma — derinlik haritasından portre bokeh'i. */
  async lensBlur(sourceUri: string, aperture: number): Promise<Result<RunResult>> {
    return AiEngine.run('lens-blur', {
      sourceUri,
      maxEdgePx: 3072,
      params: { aperture: Math.max(1.2, Math.min(16, aperture)) },
    });
  },

  /** AI genişletme (outpainting) — kadrajı verilen yöne doğru büyütür. */
  async generativeExpand(
    sourceUri: string,
    direction: ExpandDirection,
    ratio: number,
  ): Promise<Result<RunResult>> {
    return AiEngine.run('generative-expand', {
      sourceUri,
      maxEdgePx: 2048,
      params: { direction, ratio: Math.max(1.1, Math.min(2, ratio)) },
      // Hücresel bağlantıda kullanıcı büyük transferi zaten onayladıysa devam.
      preferRemote: !NetworkMonitor.isMetered,
    });
  },

  /** Konsept portreler — şablon + stil yönlendirmeli üretim. */
  async conceptPortrait(sourceUri: string, conceptId: string): Promise<Result<RunResult>> {
    return AiEngine.run('concept-portrait', {
      sourceUri,
      maxEdgePx: 1536,
      params: { conceptId },
      preferRemote: true,
    });
  },
};
