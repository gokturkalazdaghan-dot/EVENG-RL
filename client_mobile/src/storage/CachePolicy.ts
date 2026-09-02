/**
 * CachePolicy — önbellek temizliğinin SAF karar mantığı.
 *
 * ZERO-DELETION POLİTİKASI
 * Bu dosyanın en önemli özelliği, NE SİLMEDİĞİDİR.
 *
 * Silinebilenler yalnızca CİHAZ ÜSTÜ GEÇİCİ dosyalardır: ara render çıktıları,
 * küçük resimler, yeniden indirilebilir model dosyaları. Bunların ortak yanı,
 * kaybedilmelerinin kullanıcı için TELAFİ EDİLEBİLİR olmasıdır.
 *
 * Silinemeyenler:
 *   - Kullanıcının projeleri (yerel veya buluta senkronize)
 *   - Kullanıcının kendi görselleri
 *   - Buluttaki (iCloud / Google Drive) her şey
 *
 * Bunlar tavan dolsa da, dosya bir yıl eskise de, cihazda yer kalmasa da
 * SİLİNMEZ. Kullanıcının emeğini alan kararı uygulama değil kullanıcı verir.
 *
 * TİP DÜZEYİNDE GÜVENCE: Kova listesi ikiye ayrılmıştır ve `planEviction`
 * yalnızca `EvictableBucket` kabul eder. Yeni bir kalıcı kova eklendiğinde
 * yanlışlıkla silinebilir listeye girmesi derleme hatası üretir.
 */

/** Silinebilir kovalar — hepsi yeniden üretilebilir veya yeniden indirilebilir. */
export type EvictableBucket = 'renderCache' | 'thumbnails' | 'models';

/**
 * ASLA silinmeyen kovalar. Bakım planı bu kovaları görmez bile;
 * tarama sonuçlarından `partitionEntries` ile ayrılırlar.
 */
export type ProtectedBucket = 'projects' | 'cloudMirror' | 'userExports';

export type CacheBucket = EvictableBucket | ProtectedBucket;

export const EVICTABLE_BUCKETS: readonly EvictableBucket[] = [
  'renderCache',
  'thumbnails',
  'models',
];

export const PROTECTED_BUCKETS: readonly ProtectedBucket[] = [
  'projects',
  'cloudMirror',
  'userExports',
];

export function isEvictable(bucket: CacheBucket): bucket is EvictableBucket {
  return (EVICTABLE_BUCKETS as readonly string[]).includes(bucket);
}

/**
 * Dosya sistemi boyutunu güvenli bir sayıya indirger.
 *
 * NEDEN GEREKLİ — TEK BOZUK DEĞER TAHLİYEYİ TAMAMEN KAPATIYORDU
 * `react-native-fs` boyutu `number` olarak tipler ama değer native
 * katmandan gelir; bazı Android sağlayıcılarında dize veya eksik olabilir.
 * Toplama `Number(undefined)` girdiğinde sonuç `NaN` olur ve:
 *
 *   NaN > CACHE_LIMIT_BYTES  →  false   → tahliye HİÇ tetiklenmez
 *   [3, NaN, 1].sort(...)    →  bozuk   → tahliye sırası anlamsızlaşır
 *
 * Yani tek bir bozuk girdi, disk dolana kadar sessizce tüm önbellek
 * yönetimini devre dışı bırakıyordu.
 *
 * BİLİNMEYEN BOYUT 0 SAYILIR: uydurulmuş bir boyut yazmak yerine toplamı
 * eksik bildirmek, `NaN`'ın her şeyi kapatmasından kesinlikle iyidir —
 * bilinen dosyalar için tahliye çalışmaya devam eder.
 */
export function safeBytes(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export interface CacheEntry {
  readonly path: string;
  readonly bucket: CacheBucket;
  readonly sizeBytes: number;
  /** Son erişim/değişiklik zamanı (ms). */
  readonly lastAccessMs: number;
}

/** Yüksek sayı = önce feda edilir. */
export const EVICTION_PRIORITY: Readonly<Record<EvictableBucket, number>> = {
  renderCache: 3, // yeniden üretilebilir, hacmin çoğunu kaplar
  thumbnails: 2,  // ucuz ve hızlı yeniden üretilir
  models: 1,      // yeniden indirmek pahalı + ÇEVRİMDIŞI MODU BOZAR, en son
};

export const CACHE_LIMIT_BYTES = 1024 * 1024 * 1024; // 1 GB
export const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 7 gün
/**
 * Tavan aşıldığında tavanın %70'ine kadar inilir. Tam tavana kadar silmek,
 * her yeni dosyada yeniden temizlik tetikler (thrashing).
 */
export const RECLAIM_TARGET_RATIO = 0.7;

/**
 * Tarama sonucunu ikiye ayırır.
 *
 * Bu fonksiyon Zero-Deletion politikasının uygulandığı TEK yerdir: korunan
 * kovalar buradan sonra plana hiç girmez. Politikayı tek bir noktada
 * uygulamak, "acaba başka bir yerde de siliniyor mu?" sorusunu ortadan
 * kaldırır.
 */
export function partitionEntries(entries: readonly CacheEntry[]): {
  readonly evictable: readonly CacheEntry[];
  readonly protectedEntries: readonly CacheEntry[];
} {
  const evictable: CacheEntry[] = [];
  const protectedEntries: CacheEntry[] = [];

  for (const entry of entries) {
    if (isEvictable(entry.bucket)) evictable.push(entry);
    else protectedEntries.push(entry);
  }
  return { evictable, protectedEntries };
}

export interface PlanInput {
  readonly entries: readonly CacheEntry[];
  /** Silinmesi yasak yollar: aktif proje dosyaları, süren render çıktıları. */
  readonly pinnedPaths: ReadonlySet<string>;
  readonly nowMs: number;
  readonly limitBytes?: number;
  readonly staleAfterMs?: number;
  readonly reclaimTargetRatio?: number;
}

export interface EvictionPlan {
  readonly toDelete: readonly CacheEntry[];
  readonly freedBytes: number;
  /** Plan sonrası SİLİNEBİLİR alanda kalacak toplam boyut. */
  readonly remainingBytes: number;
  /** Korunan (asla silinmeyen) içeriğin toplam boyutu — yalnızca raporlama. */
  readonly protectedBytes: number;
  readonly staleCount: number;
  readonly evictedCount: number;
}

/**
 * İki aşamalı plan:
 *
 *   0. AYIRMA — korunan kovalar (projeler, bulut aynası, kullanıcı çıktıları)
 *      plandan tamamen çıkarılır. Tavan hesabına da GİRMEZLER: buluttaki
 *      10 GB proje yüzünden cihazdaki küçük resimleri silmek anlamsızdır.
 *   1. BAYAT TEMİZLİK — 7 günden eski render artıkları, tavan aşılmasa bile
 *      silinir. Bunlar tanım gereği terk edilmiş ara çıktılardır.
 *   2. TAVAN EVICTION — hâlâ tavanın üstündeyse, kova önceliği ve LRU
 *      sırasıyla hedefe inilene kadar silinir.
 */
export function planEviction(input: PlanInput): EvictionPlan {
  const limitBytes = input.limitBytes ?? CACHE_LIMIT_BYTES;
  const staleAfterMs = input.staleAfterMs ?? STALE_AFTER_MS;
  const reclaimRatio = input.reclaimTargetRatio ?? RECLAIM_TARGET_RATIO;

  // --- Aşama 0: Zero-Deletion ayrımı
  const { evictable, protectedEntries } = partitionEntries(input.entries);
  const protectedBytes = protectedEntries.reduce((sum, entry) => sum + entry.sizeBytes, 0);

  const deletable = evictable.filter((entry) => !input.pinnedPaths.has(entry.path));
  const pinnedBytes = evictable
    .filter((entry) => input.pinnedPaths.has(entry.path))
    .reduce((sum, entry) => sum + entry.sizeBytes, 0);

  // --- Aşama 1: bayat render artıkları
  const stale = deletable.filter(
    (entry) => entry.bucket === 'renderCache' && input.nowMs - entry.lastAccessMs > staleAfterMs,
  );
  const staleSet = new Set(stale.map((entry) => entry.path));

  const survivors = deletable.filter((entry) => !staleSet.has(entry.path));
  let remaining = pinnedBytes + survivors.reduce((sum, entry) => sum + entry.sizeBytes, 0);

  const toDelete: CacheEntry[] = [...stale];

  // --- Aşama 2: tavan eviction
  if (remaining > limitBytes) {
    const target = limitBytes * reclaimRatio;

    const ordered = [...survivors].sort((a, b) => {
      const aBucket = a.bucket as EvictableBucket;
      const bBucket = b.bucket as EvictableBucket;
      const byPriority = EVICTION_PRIORITY[bBucket] - EVICTION_PRIORITY[aBucket];
      if (byPriority !== 0) return byPriority;
      // Eşit öncelikte en eski erişim önce gider (LRU).
      if (a.lastAccessMs !== b.lastAccessMs) return a.lastAccessMs - b.lastAccessMs;
      // Tam eşitlikte deterministik olsun diye yola göre sırala: aynı girdi
      // her çalıştırmada aynı planı üretmelidir (testlenebilirlik).
      return a.path.localeCompare(b.path);
    });

    for (const entry of ordered) {
      if (remaining <= target) break;
      toDelete.push(entry);
      remaining -= entry.sizeBytes;
    }
  }

  const freedBytes = toDelete.reduce((sum, entry) => sum + entry.sizeBytes, 0);

  return {
    toDelete,
    freedBytes,
    remainingBytes: remaining,
    protectedBytes,
    staleCount: stale.length,
    evictedCount: toDelete.length - stale.length,
  };
}

/**
 * Kullanıcının başlattığı temizlik ("Önbelleği Temizle" düğmesi).
 *
 * Korunan kovalara BURADA da dokunulmaz: kullanıcı "önbelleği temizle" derken
 * projelerinin silinmesini kastetmez. Proje silme ayrı ve açık bir eylemdir.
 *
 * Modeller varsayılan olarak korunur: silinmeleri çevrimdışı yeteneği sessizce
 * kaldırır ve kullanıcı bunu ancak uçakta fark eder.
 */
export function planUserClear(
  entries: readonly CacheEntry[],
  pinnedPaths: ReadonlySet<string>,
  options: { includeModels?: boolean } = {},
): EvictionPlan {
  const { evictable, protectedEntries } = partitionEntries(entries);
  const protectedBytes = protectedEntries.reduce((sum, entry) => sum + entry.sizeBytes, 0);

  const toDelete = evictable.filter((entry) => {
    if (pinnedPaths.has(entry.path)) return false;
    if (entry.bucket === 'models' && !options.includeModels) return false;
    return true;
  });

  const freedBytes = toDelete.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  const evictableBytes = evictable.reduce((sum, entry) => sum + entry.sizeBytes, 0);

  return {
    toDelete,
    freedBytes,
    remainingBytes: evictableBytes - freedBytes,
    protectedBytes,
    staleCount: 0,
    evictedCount: toDelete.length,
  };
}
