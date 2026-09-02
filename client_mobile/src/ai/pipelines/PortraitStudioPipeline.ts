/**
 * PortraitStudioPipeline — FaceApp/Lensa/Remini sınıfı portre araçları.
 *
 * Bu hattaki her yetenek `operatesOnFaces: true` işaretlidir; AiEngine bu
 * yüzden yüz onayı (rıza beyanı) olmadan çalıştırmaz.
 */
import type { Result } from '@/core/result/Result';
import { AiEngine, type RunResult } from '@/ai/engine/AiEngine';

export type AvatarStyle = 'cinematic' | 'editorial' | 'anime' | 'oil-paint' | 'cyberpunk';
export type StudioBackdrop = 'seamless-gray' | 'office' | 'gradient' | 'outdoor-bokeh';

export const PortraitStudioPipeline = {
  /** Yüz onarımı — bozuk/eski fotoğraflardaki yüz detayını geri getirir. */
  async restoreFace(sourceUri: string, strength: number): Promise<Result<RunResult>> {
    return AiEngine.run('face-restore', {
      sourceUri,
      maxEdgePx: 2048,
      params: { strength: Math.max(0, Math.min(1, strength)) },
    });
  },

  /** HD netleştirme — 2x/4x süper çözünürlük. */
  async enhanceHd(sourceUri: string, scale: 2 | 4): Promise<Result<RunResult>> {
    return AiEngine.run('hd-upscale', {
      sourceUri,
      // 4x'te çıktı kenarı hızla 8K'ya çıkar; tavanı burada sabitliyoruz ki
      // bellek tepe noktası cihazı öldürmesin.
      maxEdgePx: scale === 4 ? 4096 : 2560,
      params: { scale },
    });
  },

  /** AI sihirli avatarlar — tek portreden stilize seri üretim. */
  async generateAvatars(
    sourceUri: string,
    style: AvatarStyle,
    count: number,
  ): Promise<Result<RunResult>> {
    return AiEngine.run('ai-avatar', {
      sourceUri,
      maxEdgePx: 1024,
      params: { style, count: Math.min(count, 12) },
      preferRemote: true,
    });
  },

  /** Profesyonel stüdyo arka planı — matting + yeniden ışıklandırma. */
  async studioBackground(sourceUri: string, backdrop: StudioBackdrop): Promise<Result<RunResult>> {
    return AiEngine.run('studio-background', {
      sourceUri,
      maxEdgePx: 2048,
      params: { backdrop },
    });
  },

  /** Yaşlandırma / dönüşüm efektleri. `deltaYears` negatif = gençleştirme. */
  async ageTransform(sourceUri: string, deltaYears: number): Promise<Result<RunResult>> {
    return AiEngine.run('age-transform', {
      sourceUri,
      maxEdgePx: 1536,
      params: { deltaYears: Math.max(-40, Math.min(40, deltaYears)) },
      preferRemote: true,
    });
  },
};
