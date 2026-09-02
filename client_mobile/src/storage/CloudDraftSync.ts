/**
 * CloudDraftSync — projelerin KULLANICININ KENDİ bulutuna yedeklenmesi.
 *
 * NEDEN BİZİM SUNUCUMUZ DEĞİL
 * Projeleri kendi sunucumuzda tutmak, "sıfır veri toplama" ilkesini kökten
 * bozar: kullanıcının medyası, hesabı olmayan bir uygulamada bile bizim
 * altyapımızda depolanmış olur. Bunun yerine platformun kendi bulut
 * konteynerini kullanıyoruz:
 *   iOS     : iCloud Documents (NSUbiquitousContainer)
 *   Android : Google Drive uygulama klasörü / SAF
 * Veri kullanıcının hesabında, kullanıcının kotasında ve kullanıcının
 * kontrolünde kalır. Biz erişemeyiz.
 *
 * ZERO-DELETION
 * Bu servisin SİLME METODU YOKTUR — bilerek. Ne zaman aşımı, ne kota, ne de
 * "eski proje" gerekçesiyle bulutta bir şey silinmez. Silme, yalnızca
 * kullanıcının kendi bulut arayüzünden yapabileceği bir eylemdir.
 *
 * ÇAKIŞMA
 * Aynı proje iki cihazda düzenlenirse, hangisinin "doğru" olduğuna karar
 * VERMİYORUZ: her iki sürüm de saklanır ve kullanıcıya seçtirilir. Otomatik
 * birleştirme veya "son yazan kazanır", kullanıcının emeğini sessizce siler.
 */
import { NativeModules } from 'react-native';

import { createLogger } from '@/core/logging/Logger';
import { appError, Err, Ok, type Result } from '@/core/result/Result';
import { NetworkMonitor } from '@/connectivity/NetworkMonitor';

const log = createLogger('CloudDraftSync');

/**
 * `folder`: kullanıcının SAF ile seçtiği herhangi bir klasör (cihaz belleği,
 * OneDrive, Dropbox…). Drive olmayan bir ağaç için `drive` döndürmek
 * arayüzde kullanıcıya yalan söylemek olurdu, o yüzden ayrı bir değer.
 */
export type CloudProvider = 'icloud' | 'drive' | 'folder' | 'none';

export interface CloudDraft {
  readonly draftId: string;
  /** Kullanıcının verdiği ad — buluttaki dosya adı. */
  readonly title: string;
  readonly sizeBytes: number;
  readonly updatedAtMs: number;
  /** Bu cihazda yerel kopyası var mı. */
  readonly availableOffline: boolean;
}

export interface ConflictedDraft extends CloudDraft {
  /** Çakışan diğer sürüm — kullanıcı seçene kadar İKİSİ DE saklanır. */
  readonly conflictingVersionId: string;
  readonly conflictingUpdatedAtMs: number;
}

interface NativeCloudBridge {
  /** Kullanıcının bulut hesabı bağlı mı ve hangi sağlayıcı. */
  provider(): Promise<CloudProvider>;
  /** Yalnızca Android: klasör seçici niyetinin tanımı. */
  folderPickerIntent?(): Promise<{ action: string; flags: number }>;
  /** Yalnızca Android: seçilen ağacı kalıcı izinle kaydeder. */
  setFolder?(treeUri: string): Promise<CloudProvider>;
  /** Yerel dosyayı buluta yükler; var olan sürümü SİLMEZ, yeni sürüm yazar. */
  upload(draftId: string, localPath: string, title: string): Promise<void>;
  download(draftId: string, destinationPath: string): Promise<void>;
  list(): Promise<CloudDraft[]>;
  conflicts(): Promise<ConflictedDraft[]>;
  /** Çakışmayı kullanıcının seçimiyle çözer; SEÇİLMEYEN SÜRÜM DE KORUNUR
   *  (yeniden adlandırılarak saklanır, silinmez). */
  resolveConflict(draftId: string, keepVersionId: string): Promise<void>;
}

const bridge = NativeModules.EvenGirlCloudDrafts as NativeCloudBridge | undefined;

export const CloudDraftSync = {
  async provider(): Promise<CloudProvider> {
    return (await bridge?.provider().catch(() => 'none' as const)) ?? 'none';
  },

  get isAvailable(): boolean {
    return bridge !== undefined;
  },

  /**
   * Kullanıcı henüz bir hedef seçmemişse klasör seçimi gerekir mi.
   *
   * iOS'ta iCloud kapsayıcısı otomatiktir; Android'de kullanıcı bir kez
   * klasör SEÇMEK ZORUNDADIR. Bunu sormadan yedeklemeye çalışmak
   * `no_folder` hatasıyla döner ve kullanıcı neden olduğunu anlamaz.
   */
  get needsFolderSelection(): boolean {
    return bridge?.setFolder !== undefined;
  },

  /**
   * Android klasör seçimini tamamlar.
   *
   * Köprü desteklemiyorsa (iOS) sessizce başarı DÖNMEZ: çağıran taraf
   * yanlış platformda bu akışı çalıştırdığını bilmelidir.
   */
  async setFolder(treeUri: string): Promise<Result<CloudProvider>> {
    if (!bridge?.setFolder) {
      return Err(appError('UNKNOWN', 'klasör seçimi bu platformda yok'));
    }
    if (treeUri.trim() === '') {
      return Err(appError('UNKNOWN', 'boş klasör adresi'));
    }
    try {
      return Ok(await bridge.setFolder(treeUri));
    } catch (e) {
      log.warn('Klasör kaydedilemedi', e);
      return Err(appError('UNKNOWN', 'folder selection failed', { retryable: true }));
    }
  },

  /**
   * Projeyi buluta yedekler.
   *
   * Ölçülü (hücresel) bağlantıda otomatik yükleme YAPILMAZ: kullanıcı
   * onayı ister. 2 GB'lık bir video projesini farkında olmadan hücresel
   * veriyle yüklemek, faturaya yansıyan gerçek bir zarardır.
   */
  async backup(
    draftId: string,
    localPath: string,
    title: string,
    options: { allowMetered?: boolean } = {},
  ): Promise<Result<void>> {
    if (!bridge) {
      return Err(appError('UNKNOWN', 'bulut köprüsü yok', { i18nKey: 'cloud.unavailable' }));
    }
    if (!NetworkMonitor.isOnline) {
      return Err(
        appError('NETWORK_UNAVAILABLE', 'offline', {
          i18nKey: 'errors.NETWORK_UNAVAILABLE',
          retryable: true,
        }),
      );
    }
    if (NetworkMonitor.isMetered && options.allowMetered !== true) {
      return Err(
        appError('NETWORK_UNAVAILABLE', 'ölçülü bağlantıda onay gerekli', {
          i18nKey: 'cloud.meteredConfirmRequired',
        }),
      );
    }

    try {
      await bridge.upload(draftId, localPath, title);
      return Ok(undefined);
    } catch (e) {
      log.warn('Yedekleme başarısız', e);
      return Err(appError('UNKNOWN', 'cloud upload failed', { retryable: true }));
    }
  },

  async restore(draftId: string, destinationPath: string): Promise<Result<void>> {
    if (!bridge) {
      return Err(appError('UNKNOWN', 'bulut köprüsü yok', { i18nKey: 'cloud.unavailable' }));
    }
    try {
      await bridge.download(draftId, destinationPath);
      return Ok(undefined);
    } catch (e) {
      log.warn('Geri yükleme başarısız', e);
      return Err(appError('UNKNOWN', 'cloud download failed', { retryable: true }));
    }
  },

  async list(): Promise<readonly CloudDraft[]> {
    return (await bridge?.list().catch(() => [])) ?? [];
  },

  /** Çözülmemiş çakışmalar — kullanıcıya gösterilir, otomatik çözülmez. */
  async conflicts(): Promise<readonly ConflictedDraft[]> {
    return (await bridge?.conflicts().catch(() => [])) ?? [];
  },

  /**
   * Kullanıcının çakışma seçimi.
   * Seçilmeyen sürüm SİLİNMEZ; "(çakışma kopyası)" olarak saklanır.
   */
  async resolveConflict(draftId: string, keepVersionId: string): Promise<Result<void>> {
    if (!bridge) return Err(appError('UNKNOWN', 'bulut köprüsü yok'));
    try {
      await bridge.resolveConflict(draftId, keepVersionId);
      return Ok(undefined);
    } catch (e) {
      log.warn('Çakışma çözülemedi', e);
      return Err(appError('UNKNOWN', 'conflict resolution failed', { retryable: true }));
    }
  },

  // SİLME METODU BİLEREK YOKTUR.
  //
  // `delete(draftId)` eklemek isteyen biri önce docs/STORAGE.md içindeki
  // Zero-Deletion bölümünü ve bu yorumu okumak zorunda kalsın diye buraya
  // bir yer tutucu bırakılmadı: metodun yokluğu, en güçlü belgedir.
};
