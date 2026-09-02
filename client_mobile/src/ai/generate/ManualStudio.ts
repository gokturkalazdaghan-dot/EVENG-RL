/**
 * ManualStudio — Manuel & Botox modu.
 *
 * TAMAMEN ÜCRETSİZ VE SINIRSIZ. Zorunlu fırçalama yoktur; kullanıcı isterse
 * her ayarı elle yapar. Tüm araçlar cihaz üstünde çalışır — medya cihazdan
 * çıkmaz.
 */
import type { Result } from '@/core/result/Result';
import { AiEngine, type RunResult } from '@/ai/engine/AiEngine';

/** Yeniden şekillendirme bölgeleri. */
export type ReshapeRegion =
  | 'jawline'
  | 'cheek'
  | 'nose'
  | 'eyes'
  | 'lips'
  | 'chin'
  | 'waist'
  | 'hips'
  | 'legs'
  | 'shoulders';

/** Ayar yoğunluğu: -1 (tam ters) .. 0 (nötr) .. 1 (tam). */
export type Intensity = number;

const clamp = (value: number): number => Math.max(-1, Math.min(1, value));

export const ManualStudio = {
  /** Yüz/vücut yeniden şekillendirme — manuel, bölge bazlı. */
  async reshape(
    sourceUri: string,
    region: ReshapeRegion,
    intensity: Intensity,
  ): Promise<Result<RunResult>> {
    return AiEngine.run('manual-reshape', {
      sourceUri,
      maxEdgePx: 4096,
      params: { region, intensity: clamp(intensity) },
    });
  },

  /** Botox etkili çene hattı sıkılaştırma. */
  async botoxJawline(sourceUri: string, intensity: Intensity): Promise<Result<RunResult>> {
    return AiEngine.run('botox-jawline', {
      sourceUri,
      maxEdgePx: 4096,
      params: { intensity: clamp(intensity) },
    });
  },

  /**
   * Cilt pürüzsüzleştirme.
   *
   * `preservePores` VARSAYILAN OLARAK AÇIK: gözenekleri tamamen silmek
   * plastik görünüm üretir ve "uncanny valley" etkisinin ana kaynağıdır.
   * Kullanıcı isterse kapatabilir.
   */
  async smoothSkin(
    sourceUri: string,
    intensity: Intensity,
    options: { preservePores?: boolean } = {},
  ): Promise<Result<RunResult>> {
    return AiEngine.run('skin-smooth', {
      sourceUri,
      maxEdgePx: 4096,
      params: {
        intensity: clamp(intensity),
        preservePores: options.preservePores !== false,
      },
    });
  },

  /** Leke/sivilce silgisi — dokunulan noktayı çevresiyle harmanlar. */
  async eraseBlemish(
    sourceUri: string,
    point: { x: number; y: number; radius: number },
  ): Promise<Result<RunResult>> {
    return AiEngine.run('blemish-eraser', {
      sourceUri,
      maxEdgePx: 4096,
      params: { x: point.x, y: point.y, radius: point.radius },
    });
  },
};
