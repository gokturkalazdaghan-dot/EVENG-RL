/**
 * ModelStore — çevrimdışı model dosyalarının indirilmesi ve yönetimi.
 *
 * NEDEN PAKETTE DEĞİL: Tüm modeller ~260 MB. Uygulama paketine eklemek
 * indirme oranını ölçülebilir biçimde düşürür (App Store hücresel indirme
 * sınırı 200 MB) ve model güncellemesi için uygulama sürümü gerektirir.
 *
 * NEDEN DOĞRULAMA ZORUNLU: İndirilen model dosyası, cihazda ÇALIŞAN KOD
 * gibidir. MitM ile değiştirilmiş bir model, çıktıyı bozmaktan çok daha
 * fazlasını yapabilir. Bu yüzden:
 *   1. İndirme SSL pinlenmiş kanaldan yapılır,
 *   2. Dosyanın SHA-256 özeti ModelRegistry'deki değerle karşılaştırılır,
 *   3. Doğrulanmayan dosya SİLİNİR ve kurulum başarısız sayılır.
 *
 * ÖLÇÜLÜ BAĞLANTI: Hücresel bağlantıda kullanıcı onayı olmadan büyük
 * indirme başlatılmaz — "faturam neden şişti" şikâyetlerinin sebebi budur.
 */
import RNFS from 'react-native-fs';
import { Platform } from 'react-native';

import { createLogger } from '@/core/logging/Logger';
import { safeBytes } from '@/storage/CachePolicy';
import { appError, Err, Ok, type Result } from '@/core/result/Result';
import { NetworkMonitor } from '@/connectivity/NetworkMonitor';
import { PATHS } from '@/storage/paths';
import { pinPath } from '@/storage/CacheManager';
import { describe, type Capability, type LocalModelSpec } from '@/ai/engine/ModelRegistry';

const log = createLogger('ModelStore');

/** Model dosyalarının dağıtıldığı, SSL pinlenmiş host. */
const MODEL_CDN = 'https://api.armanalabs.com/v1/models';

/** Hücresel bağlantıda onaysız indirilebilecek en büyük dosya. */
export const METERED_AUTO_DOWNLOAD_LIMIT_BYTES = 5 * 1024 * 1024;

function fileNameFor(spec: LocalModelSpec): string {
  return Platform.OS === 'ios' ? spec.ios : spec.android;
}

/** Sürüm dosya adına gömülür: eski sürüm otomatik olarak "kurulu değil" olur. */
function localPathFor(capability: Capability, spec: LocalModelSpec): string {
  return `${PATHS.models}/v${spec.version}_${fileNameFor(spec)}`;
}

export interface DownloadProgress {
  readonly capability: Capability;
  readonly receivedBytes: number;
  readonly totalBytes: number;
}

export type InstallOptions = {
  /** Kullanıcı hücresel indirmeyi açıkça onayladı mı. */
  readonly allowMetered?: boolean;
  readonly onProgress?: (progress: DownloadProgress) => void;
};

export const ModelStore = {
  async isInstalled(capability: Capability): Promise<boolean> {
    const spec = describe(capability).localModel;
    if (!spec) return false;
    return RNFS.exists(localPathFor(capability, spec));
  },

  async pathFor(capability: Capability): Promise<string> {
    const spec = describe(capability).localModel;
    if (!spec) throw new Error(`${capability} için yerel model tanımı yok`);
    return localPathFor(capability, spec);
  },

  /**
   * Modeli indirir ve doğrular.
   *
   * İndirme sırasında dosya CacheManager tarafından silinmesin diye
   * pinlenir — 60 MB'lık bir indirmenin ortasında önbellek bakımının
   * devreye girip dosyayı silmesi, sonsuz yeniden indirme döngüsü üretir.
   */
  async install(capability: Capability, options: InstallOptions = {}): Promise<Result<string>> {
    const spec = describe(capability).localModel;
    if (!spec) {
      return Err(appError('MODEL_UNAVAILABLE', `${capability} için yerel model yok`));
    }

    const destination = localPathFor(capability, spec);
    if (await RNFS.exists(destination)) return Ok(destination);

    if (!NetworkMonitor.isOnline) {
      return Err(
        appError('NETWORK_UNAVAILABLE', 'model indirilemiyor: çevrimdışı', {
          i18nKey: 'errors.NETWORK_UNAVAILABLE',
          retryable: true,
        }),
      );
    }

    // Hücresel bağlantıda büyük indirme kullanıcı onayı ister.
    if (
      NetworkMonitor.isMetered &&
      options.allowMetered !== true &&
      spec.sizeBytes > METERED_AUTO_DOWNLOAD_LIMIT_BYTES
    ) {
      return Err(
        appError('NETWORK_UNAVAILABLE', 'ölçülü bağlantıda onay gerekli', {
          i18nKey: 'models.meteredConfirmRequired',
        }),
      );
    }

    const temporary = `${destination}.part`;
    const unpin = pinPath(temporary);

    try {
      const { promise } = RNFS.downloadFile({
        fromUrl: `${MODEL_CDN}/${fileNameFor(spec)}?v=${spec.version}`,
        toFile: temporary,
        // İlerleme her %1'de bir bildirilir; her pakette bildirmek JS
        // köprüsünü gereksiz meşgul eder.
        progressDivider: 1,
        begin: () => undefined,
        progress: (result) =>
          options.onProgress?.({
            capability,
            receivedBytes: result.bytesWritten,
            totalBytes: result.contentLength,
          }),
      });

      const result = await promise;
      if (result.statusCode !== 200) {
        await RNFS.unlink(temporary).catch(() => undefined);
        return Err(
          appError('MODEL_UNAVAILABLE', `indirme başarısız: HTTP ${result.statusCode}`, {
            retryable: true,
          }),
        );
      }

      // --- Bütünlük doğrulaması ---
      const digest = await RNFS.hash(temporary, 'sha256');
      if (digest.toLowerCase() !== spec.sha256.toLowerCase()) {
        // Doğrulanmayan dosya ÇALIŞTIRILMAZ ve saklanmaz.
        await RNFS.unlink(temporary).catch(() => undefined);
        log.error(`Model bütünlük doğrulaması başarısız: ${capability}`);
        return Err(
          appError('MODEL_UNAVAILABLE', 'model integrity check failed', { retryable: true }),
        );
      }

      await RNFS.moveFile(temporary, destination);
      await this.pruneOldVersions(capability, spec);

      log.info(`Model kuruldu: ${capability} v${spec.version}`);
      return Ok(destination);
    } catch (e) {
      await RNFS.unlink(temporary).catch(() => undefined);
      log.warn(`Model indirilemedi: ${capability}`, e);
      return Err(appError('MODEL_UNAVAILABLE', 'model download failed', { retryable: true }));
    } finally {
      unpin();
    }
  },

  /** Eski sürüm dosyalarını siler — güncelleme sonrası yer kaplamasınlar. */
  async pruneOldVersions(capability: Capability, current: LocalModelSpec): Promise<void> {
    const name = fileNameFor(current);
    const entries = await RNFS.readDir(PATHS.models).catch(() => []);

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(name)) continue;
      if (entry.name === `v${current.version}_${name}`) continue;
      await RNFS.unlink(entry.path).catch(() => undefined);
      log.debug(`Eski model sürümü silindi: ${entry.name}`);
    }
  },

  /** Kurulu modellerin toplam boyutu — Depolama ekranı gösterir. */
  async installedBytes(): Promise<number> {
    const entries = await RNFS.readDir(PATHS.models).catch(() => []);
    return entries.reduce((sum, entry) => sum + safeBytes(entry.size), 0);
  },
};
