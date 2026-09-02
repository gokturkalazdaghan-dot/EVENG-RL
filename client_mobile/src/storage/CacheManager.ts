/**
 * CacheManager — CachePolicy'nin dosya sistemi adaptörü.
 *
 * Neden gerekli: 4K video düzenlemede tek bir proje 2-3 GB ara dosya üretir.
 * Temizlenmezse kullanıcı "uygulama 12 GB yer kaplıyor" diyip siler — bu,
 * bu kategoride en büyük churn sebeplerinden biridir.
 *
 * Bu sınıf hangi dosyanın silineceğine KARAR VERMEZ; planı CachePolicy üretir,
 * burada yalnızca uygulanır.
 */
import RNFS from 'react-native-fs';

import { createLogger } from '@/core/logging/Logger';
import { appError, Err, Ok, type Result } from '@/core/result/Result';
import {
  safeBytes,
  CACHE_LIMIT_BYTES,
  planEviction,
  planUserClear,
  type CacheEntry,
  type EvictableBucket,
  type EvictionPlan,
} from '@/storage/CachePolicy';
import { EVICTABLE_BUCKETS, PATHS } from '@/storage/paths';

const log = createLogger('CacheManager');

/** Silinmesi yasak yollar: aktif proje, süren render. */
const pinnedPaths = new Set<string>();

/**
 * Bir yolu temizlikten korur. Dönen fonksiyon korumayı kaldırır — `try/finally`
 * içinde kullanılmalıdır, aksi halde iptal edilen bir render'ın çıktısı
 * sonsuza kadar korunur ve tavan hesabını bozar.
 */
export function pinPath(path: string): () => void {
  pinnedPaths.add(path);
  return () => {
    pinnedPaths.delete(path);
  };
}

export interface CacheUsage {
  /** Yalnızca SİLİNEBİLİR alanın toplamı — tavan bununla karşılaştırılır. */
  readonly totalBytes: number;
  readonly limitBytes: number;
  readonly byBucket: Readonly<Record<EvictableBucket, number>>;
}

/**
 * Bir kovayı özyinelemeli tarar.
 *
 * Yalnızca SİLİNEBİLİR kovalar taranır. Korunan kovaları hiç taramamak,
 * Zero-Deletion politikasının ikinci savunma hattıdır: yanlışlıkla plana
 * girmeleri fiziksel olarak imkânsız hale gelir. Ayrıca 10 GB'lık bir bulut
 * aynasını her bakımda taramak, ölçülebilir bir pil ve I/O maliyetidir.
 */
async function scanBucket(bucket: EvictableBucket): Promise<CacheEntry[]> {
  const root = PATHS[bucket];
  if (!(await RNFS.exists(root))) return [];

  const entries: CacheEntry[] = [];
  const queue: string[] = [root];

  while (queue.length > 0) {
    const dir = queue.pop()!;
    const items = await RNFS.readDir(dir).catch(() => []);

    for (const item of items) {
      if (item.isDirectory()) {
        queue.push(item.path);
        continue;
      }
      entries.push({
        path: item.path,
        bucket,
        sizeBytes: safeBytes(item.size),
        lastAccessMs: item.mtime ? new Date(item.mtime).getTime() : 0,
      });
    }
  }
  return entries;
}

async function scanAll(): Promise<CacheEntry[]> {
  const perBucket = await Promise.all(EVICTABLE_BUCKETS.map(scanBucket));
  return perBucket.flat();
}

async function applyPlan(plan: EvictionPlan): Promise<number> {
  let deleted = 0;
  for (const entry of plan.toDelete) {
    // Yarış durumu: plan üretildikten sonra dosya pinlenmiş olabilir.
    if (pinnedPaths.has(entry.path)) continue;
    const removed = await RNFS.unlink(entry.path).then(
      () => true,
      () => false, // dosya bu arada silinmiş olabilir — hata değil
    );
    if (removed) deleted += 1;
  }
  return deleted;
}

export const CacheManager = {
  async usage(): Promise<CacheUsage> {
    const entries = await scanAll();
    const byBucket: Record<EvictableBucket, number> = {
      renderCache: 0,
      thumbnails: 0,
      models: 0,
    };
    let totalBytes = 0;

    for (const entry of entries) {
      // scanAll yalnızca silinebilir kovaları döndürür; tip daraltması güvenli.
      byBucket[entry.bucket as EvictableBucket] += entry.sizeBytes;
      totalBytes += entry.sizeBytes;
    }
    return { totalBytes, limitBytes: CACHE_LIMIT_BYTES, byBucket };
  },

  /**
   * Otomatik bakım. Çağrıldığı yerler (bkz. core/lifecycle/AppLifecycle.ts):
   *   - uygulama arka plana alındığında,
   *   - her dışa aktarım tamamlandığında.
   *
   * Ön planda ve kullanıcı düzenleme yaparken ÇAĞRILMAZ: dosya sistemi taraması
   * kare bütçesini bozar.
   */
  async runMaintenance(): Promise<Result<{ freedBytes: number; deletedFiles: number }>> {
    try {
      const entries = await scanAll();
      const plan = planEviction({
        entries,
        pinnedPaths,
        nowMs: Date.now(),
      });

      if (plan.toDelete.length === 0) {
        return Ok({ freedBytes: 0, deletedFiles: 0 });
      }

      const deletedFiles = await applyPlan(plan);
      log.info(
        `Bakım: ${plan.staleCount} bayat + ${plan.evictedCount} eviction, ` +
          `${Math.round(plan.freedBytes / 1024 / 1024)} MB`,
      );
      return Ok({ freedBytes: plan.freedBytes, deletedFiles });
    } catch (e) {
      log.error('Bakım başarısız', e);
      return Err(appError('CACHE_WRITE_FAILED', 'cache maintenance failed', { retryable: true }));
    }
  },

  /** Ayarlar > Depolama ekranındaki manuel temizlik. */
  async clearUserInitiated(options: { includeModels?: boolean } = {}): Promise<Result<number>> {
    try {
      const entries = await scanAll();
      const plan = planUserClear(entries, pinnedPaths, options);
      await applyPlan(plan);
      return Ok(plan.freedBytes);
    } catch (e) {
      log.error('Manuel temizlik başarısız', e);
      return Err(appError('CACHE_WRITE_FAILED', 'user cache clear failed', { retryable: true }));
    }
  },
};
