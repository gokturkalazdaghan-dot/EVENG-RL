/**
 * Dosya sistemi yerleşimi.
 *
 * ÜÇ SINIF, ÜÇ FARKLI ÖMÜR
 *
 *   KORUNAN (asla otomatik silinmez — Zero-Deletion):
 *     projects/     kullanıcının projeleri, yedeklenir
 *     cloudMirror/  iCloud/Drive senkron aynası
 *     userExports/  kullanıcının dışa aktardığı çıktılar
 *
 *   SİLİNEBİLİR (yeniden üretilebilir/indirilebilir):
 *     render/       ara render çıktıları
 *     thumbnails/   zaman çizelgesi önizlemeleri
 *     models/       TFLite/CoreML model dosyaları
 *
 * iOS'ta yedeklenen dizine büyük geçici dosya koymak hem App Store reddine
 * (Guideline 2.5 — data storage) hem de "uygulama iCloud kotamı doldurdu"
 * şikâyetlerine yol açar; bu yüzden silinebilir kovalar Caches altında ve
 * yedekten hariç tutulur.
 */
import RNFS from 'react-native-fs';

import {
  EVICTABLE_BUCKETS,
  PROTECTED_BUCKETS,
  type CacheBucket,
  type EvictableBucket,
} from '@/storage/CachePolicy';

export const PATHS: Readonly<Record<CacheBucket, string>> = {
  // --- Korunan ---
  projects: `${RNFS.DocumentDirectoryPath}/projects`,
  cloudMirror: `${RNFS.DocumentDirectoryPath}/cloud`,
  userExports: `${RNFS.DocumentDirectoryPath}/exports`,

  // --- Silinebilir ---
  renderCache: `${RNFS.CachesDirectoryPath}/render`,
  thumbnails: `${RNFS.CachesDirectoryPath}/thumbnails`,
  models: `${RNFS.CachesDirectoryPath}/models`,
};

export { EVICTABLE_BUCKETS, PROTECTED_BUCKETS };
export type { EvictableBucket };

export async function ensureDirectories(): Promise<void> {
  // Korunan dizinler yedeklenir — kullanıcının emeği cihaz değişiminde
  // kaybolmamalı.
  await Promise.all(PROTECTED_BUCKETS.map((bucket) => RNFS.mkdir(PATHS[bucket])));

  // Silinebilir dizinler iCloud yedeğinden çıkarılır. Android'de bu seçenek
  // yok sayılır (yedekleme zaten data_extraction_rules.xml ile kapalı).
  await Promise.all(
    EVICTABLE_BUCKETS.map((bucket) =>
      RNFS.mkdir(PATHS[bucket], { NSURLIsExcludedFromBackupKey: true }),
    ),
  );
}
