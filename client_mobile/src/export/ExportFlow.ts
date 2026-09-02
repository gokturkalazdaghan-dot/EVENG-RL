/**
 * ExportFlow — dışa aktarım akışının tek koordinatörü.
 *
 * SIRA
 *   1. Sunucu kotasını sor (gerçek kapı).
 *   2. Hak yoksa paywall'a yönlendir — kayıt DENENMEZ.
 *   3. Hak varsa tam çözünürlüklü, FİLİGRANSIZ çıktıyı galeriye kaydet.
 *   4. Başarılıysa hem sunucu hem istemci sayacını ilerlet.
 *   5. Hak tükendiyse ekran koruması otomatik açılır.
 *
 * NEDEN SUNUCU ÖNCE: İstemci sayacı şifreli depoda tutulur ama uygulamayı
 * silip yeniden kurmak onu sıfırlar. Sunucu sayacı anonim app_user_id'ye
 * bağlıdır ve yeniden kurulumdan etkilenmez.
 */
import { createLogger } from '@/core/logging/Logger';
import { appError, Err, Ok, type Result } from '@/core/result/Result';
import { pinnedRequest } from '@/security/SslPinning';
import { ExportGate } from '@/export/ExportGate';
import { CrossShare, type ShareRequest, type ShareTarget } from '@/share/CrossShare';

const log = createLogger('ExportFlow');

interface ServerQuota {
  readonly allowed: boolean;
  readonly watermarked: boolean;
  readonly remainingFree: number | null;
  readonly protectScreen: boolean;
}

export type ExportOutcome =
  | { readonly kind: 'saved'; readonly remainingFree: number | null }
  | { readonly kind: 'paywall'; readonly reason: 'quota-exhausted' }
  | { readonly kind: 'failed'; readonly retryable: boolean };

export const ExportFlow = {
  /**
   * Dışa aktarım izni.
   *
   * Sunucuya ulaşılamazsa istemci sayacına düşülür — uçaktaki bir kullanıcıya
   * "kota bilinmiyor" deyip hakkını kullandırmamak, ödediği şeyi vermemektir.
   */
  async check(): Promise<Result<ServerQuota>> {
    const result = await pinnedRequest<ServerQuota>({ path: '/v1/export/quota' });

    if (result.ok) return result;

    log.warn('Sunucu kotası alınamadı — istemci sayacına düşülüyor');
    const local = ExportGate.check();

    return Ok({
      allowed: local.allowed,
      watermarked: false,
      remainingFree: local.allowed ? local.remainingFree : 0,
      protectScreen: !local.allowed,
    });
  },

  /**
   * Galeriye kaydeder.
   *
   * `saveToGallery` çağıranın sağladığı platform fonksiyonudur (CameraRoll
   * veya native köprü); bu katman izin ve sayaç yönetiminden sorumludur.
   */
  async save(
    filePath: string,
    saveToGallery: (path: string) => Promise<void>,
  ): Promise<ExportOutcome> {
    const quota = await this.check();
    if (!quota.ok) return { kind: 'failed', retryable: true };

    if (!quota.value.allowed) {
      // Kayıt DENENMEZ: hak yokken galeriye yazıp sonra silmek, kullanıcının
      // galerisinde bir an için dosya oluşturur.
      return { kind: 'paywall', reason: 'quota-exhausted' };
    }

    try {
      await saveToGallery(filePath);
    } catch (e) {
      log.warn('Galeriye kaydedilemedi', e);
      return { kind: 'failed', retryable: true };
    }

    // Sayaçlar YALNIZCA başarılı kayıttan sonra ilerler.
    const committed = await pinnedRequest<{ remainingFree: number | null }>({
      path: '/v1/export/commit',
      method: 'POST',
      body: {},
    });
    await ExportGate.commit();

    const remaining = committed.ok ? committed.value.remainingFree : ExportGate.remaining;
    log.info(`Dışa aktarıldı — kalan hak: ${remaining ?? 'sınırsız'}`);

    return { kind: 'saved', remainingFree: remaining };
  },

  /**
   * Paylaşım.
   *
   * Paylaşım galeriye KAYIT DEĞİLDİR ve ücretsiz hakkı tüketmez: kullanıcı
   * içeriği zaten üretmiştir, başka bir uygulamaya göndermek ayrı bir kota
   * gerektirmez. Kota yalnızca cihaza indirmede uygulanır.
   */
  async share(target: ShareTarget, request: ShareRequest): Promise<Result<void>> {
    const result = await CrossShare.share(target, request);
    if (!result.ok) {
      return Err(appError('UNKNOWN', 'share failed', { i18nKey: 'share.failed', retryable: true }));
    }
    return Ok(undefined);
  },
};
