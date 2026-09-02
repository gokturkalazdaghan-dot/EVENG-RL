import {
  CACHE_LIMIT_BYTES,
  STALE_AFTER_MS,
  planEviction,
  planUserClear,
  type CacheBucket,
  type CacheEntry,
  safeBytes,
} from '@/storage/CachePolicy';

const MB = 1024 * 1024;
const NOW = 1_700_000_000_000;

let counter = 0;
const entry = (
  bucket: CacheBucket,
  sizeMb: number,
  ageMs = 0,
  path = `/cache/${bucket}/file-${++counter}`,
): CacheEntry => ({
  path,
  bucket,
  sizeBytes: sizeMb * MB,
  lastAccessMs: NOW - ageMs,
});

const plan = (entries: CacheEntry[], pinned: string[] = []) =>
  planEviction({ entries, pinnedPaths: new Set(pinned), nowMs: NOW });

describe('planEviction — bayat temizlik', () => {
  it('7 günden eski render artıklarını tavan aşılmasa bile siler', () => {
    const stale = entry('renderCache', 50, STALE_AFTER_MS + 1);
    const fresh = entry('renderCache', 50, 1000);

    const result = plan([stale, fresh]);

    expect(result.toDelete.map((e) => e.path)).toEqual([stale.path]);
    expect(result.staleCount).toBe(1);
  });

  it('eski önizleme ve modelleri bayat saymaz', () => {
    // Yalnızca render artıkları terk edilmiş ara çıktıdır. Eski bir modeli
    // "bayat" diye silmek çevrimdışı yeteneği sessizce kaldırır.
    const result = plan([
      entry('thumbnails', 10, STALE_AFTER_MS * 4),
      entry('models', 60, STALE_AFTER_MS * 4),
    ]);

    expect(result.toDelete).toHaveLength(0);
  });
});

describe('planEviction — tavan', () => {
  it('tavanın altındayken hiçbir şey silmez', () => {
    const result = plan([entry('renderCache', 100), entry('thumbnails', 50)]);
    expect(result.toDelete).toHaveLength(0);
    expect(result.freedBytes).toBe(0);
  });

  it('tavan aşıldığında hedefe (%70) kadar iner', () => {
    // 1400 MB > 1024 MB tavan; hedef 1024 * 0.7 = ~717 MB
    const entries = Array.from({ length: 14 }, (_, i) => entry('renderCache', 100, i * 1000));

    const result = plan(entries);

    expect(result.remainingBytes).toBeLessThanOrEqual(CACHE_LIMIT_BYTES * 0.7);
    expect(result.evictedCount).toBeGreaterThan(0);
  });

  it('tavanı tam sınıra kadar değil, altına indirir (thrashing önleme)', () => {
    const entries = Array.from({ length: 12 }, (_, i) => entry('renderCache', 100, i * 1000));
    const result = plan(entries);

    // Sınırın hemen altında bırakmak, her yeni dosyada yeniden temizlik
    // tetikler; belirgin bir pay bırakılmalı.
    expect(result.remainingBytes).toBeLessThan(CACHE_LIMIT_BYTES * 0.75);
  });
});

describe('planEviction — silme sırası', () => {
  it('modelleri en son feda eder', () => {
    // Hepsi aynı yaşta: karar yalnızca kova önceliğinden gelmeli.
    const model = entry('models', 400, 0);
    const thumb = entry('thumbnails', 400, 0);
    const render = entry('renderCache', 400, 0);

    const result = plan([model, thumb, render]);
    const deleted = result.toDelete.map((e) => e.bucket);

    expect(deleted[0]).toBe('renderCache');
    expect(deleted).not.toContain('models');
  });

  it('aynı kovada en eski erişileni önce siler (LRU)', () => {
    const oldest = entry('renderCache', 400, 90_000);
    const middle = entry('renderCache', 400, 60_000);
    const newest = entry('renderCache', 400, 1_000);

    const result = plan([newest, middle, oldest]);

    expect(result.toDelete[0]?.path).toBe(oldest.path);
    expect(result.toDelete.map((e) => e.path)).not.toContain(newest.path);
  });

  it('aynı girdi için deterministik plan üretir', () => {
    const entries = [
      entry('renderCache', 400, 5000, '/cache/render/b'),
      entry('renderCache', 400, 5000, '/cache/render/a'),
      entry('renderCache', 400, 5000, '/cache/render/c'),
    ];

    const first = plan([...entries]).toDelete.map((e) => e.path);
    const second = plan([...entries].reverse()).toDelete.map((e) => e.path);

    expect(first).toEqual(second);
  });
});

describe('planEviction — korunan dosyalar', () => {
  it('pinlenmiş dosyayı hiçbir koşulda silmez', () => {
    const active = entry('renderCache', 900, STALE_AFTER_MS * 2, '/cache/render/active-export');
    const other = entry('renderCache', 900, 0);

    const result = plan([active, other], [active.path]);

    expect(result.toDelete.map((e) => e.path)).not.toContain(active.path);
  });

  it('korunan dosyalar tek başına tavanı aşsa bile aktif işi bozmaz', () => {
    // Kullanıcının süren 2 GB'lık dışa aktarımı: plan hedefe ULAŞAMAZ ama
    // hiçbir şeyi bozmaz. "Hedefe ulaşmak" kullanıcının işini öldürmekten
    // daha önemli değildir.
    const pinned = entry('renderCache', 2048, 0, '/cache/render/exporting');
    const result = plan([pinned], [pinned.path]);

    expect(result.toDelete).toHaveLength(0);
    expect(result.remainingBytes).toBeGreaterThan(CACHE_LIMIT_BYTES);
  });

  it('korunan dosyaların boyutu tavan hesabına dahildir', () => {
    // Pinlenmiş 800 MB yok sayılsaydı, 400 MB'lık silinebilir içerik tavanın
    // altında görünür ve temizlik hiç çalışmazdı.
    const pinned = entry('renderCache', 800, 0, '/cache/render/pinned');
    const evictable = Array.from({ length: 4 }, (_, i) => entry('thumbnails', 100, i * 1000));

    const result = plan([pinned, ...evictable], [pinned.path]);

    expect(result.evictedCount).toBeGreaterThan(0);
  });
});

describe('planUserClear', () => {
  it('modelleri varsayılan olarak korur', () => {
    const result = planUserClear(
      [entry('renderCache', 100), entry('thumbnails', 50), entry('models', 200)],
      new Set(),
    );

    expect(result.toDelete.map((e) => e.bucket)).toEqual(['renderCache', 'thumbnails']);
  });

  it('açıkça istendiğinde modelleri de siler', () => {
    const result = planUserClear(
      [entry('renderCache', 100), entry('models', 200)],
      new Set(),
      { includeModels: true },
    );

    expect(result.toDelete).toHaveLength(2);
    expect(result.freedBytes).toBe(300 * MB);
  });

  it('manuel temizlikte bile pinlenmiş dosyaya dokunmaz', () => {
    const active = entry('renderCache', 100, 0, '/cache/render/active');
    const result = planUserClear([active], new Set([active.path]), { includeModels: true });

    expect(result.toDelete).toHaveLength(0);
  });
});

// ===================== Zero-Deletion politikası =====================
import { partitionEntries, PROTECTED_BUCKETS, isEvictable } from '@/storage/CachePolicy';

describe('Zero-Deletion — korunan içerik ASLA silinmez', () => {
  it('projeler bakım planına hiç girmez', () => {
    const project = entry('projects', 900, STALE_AFTER_MS * 10, '/docs/projects/dugun.proj');
    const render = entry('renderCache', 900, 0);

    const result = plan([project, render]);

    expect(result.toDelete.map((e) => e.path)).not.toContain(project.path);
  });

  it('bulut aynası tavan aşılsa bile silinmez', () => {
    // Buluttaki 10 GB, cihazdaki önbellek tavanının konusu değildir.
    const cloud = entry('cloudMirror', 10_240, 0, '/docs/cloud/album');
    const result = plan([cloud]);

    expect(result.toDelete).toHaveLength(0);
    expect(result.protectedBytes).toBe(10_240 * MB);
  });

  it('kullanıcı çıktıları bir yıl eskise bile silinmez', () => {
    const export1 = entry('userExports', 500, STALE_AFTER_MS * 52, '/docs/exports/reel.mp4');
    expect(plan([export1]).toDelete).toHaveLength(0);
  });

  it('korunan içerik tavan hesabına GİRMEZ', () => {
    // Buluttaki 5 GB yüzünden cihazdaki küçük resimleri silmek anlamsızdır.
    const cloud = entry('cloudMirror', 5120, 0, '/docs/cloud/big');
    const thumbs = Array.from({ length: 3 }, (_, i) => entry('thumbnails', 50, i * 1000));

    const result = plan([cloud, ...thumbs]);

    expect(result.toDelete).toHaveLength(0);
    expect(result.remainingBytes).toBe(150 * MB);
  });

  it('manuel temizlik de korunan içeriğe dokunmaz', () => {
    // Kullanıcı "önbelleği temizle" derken projelerinin silinmesini kastetmez.
    const result = planUserClear(
      [entry('projects', 400), entry('cloudMirror', 400), entry('renderCache', 100)],
      new Set(),
      { includeModels: true },
    );

    expect(result.toDelete.map((e) => e.bucket)).toEqual(['renderCache']);
  });

  it('tüm korunan kovalar silinemez olarak sınıflandırılır', () => {
    for (const bucket of PROTECTED_BUCKETS) {
      expect(isEvictable(bucket)).toBe(false);
    }
  });

  it('partitionEntries korunan ve silinebiliri doğru ayırır', () => {
    const { evictable, protectedEntries } = partitionEntries([
      entry('renderCache', 1),
      entry('projects', 1),
      entry('models', 1),
      entry('userExports', 1),
      entry('cloudMirror', 1),
      entry('thumbnails', 1),
    ]);

    expect(evictable).toHaveLength(3);
    expect(protectedEntries).toHaveLength(3);
  });
});


describe('safeBytes — tek bozuk boyut tahliyeyi kapatmasın', () => {
  it('geçerli boyutlar olduğu gibi geçer', () => {
    expect(safeBytes(1024)).toBe(1024);
    expect(safeBytes('2048')).toBe(2048);
  });

  it('eksik veya bozuk boyut 0 sayılır, NaN DEĞİL', () => {
    // NaN olsaydı: toplam NaN → `NaN > CACHE_LIMIT_BYTES` false →
    // tahliye hiç tetiklenmez → disk sessizce dolar.
    for (const bozuk of [undefined, null, NaN, Infinity, -Infinity, -5, 0, 'abc', {}, []]) {
      const sonuc = safeBytes(bozuk);
      expect(Number.isFinite(sonuc)).toBe(true);
      expect(sonuc).toBe(0);
    }
  });

  it('tek bozuk girdi toplamı ZEHİRLEMEZ', () => {
    const boyutlar = [100, undefined, 50, 'abc', 25];
    const toplam = boyutlar.reduce<number>((sum, b) => sum + safeBytes(b), 0);

    expect(toplam).toBe(175);
    expect(Number.isNaN(toplam)).toBe(false);

    // Kusurun tam ifadesi: eski davranışla eşik karşılaştırması çöküyordu.
    const eskiToplam = boyutlar.reduce<number>((sum, b) => sum + Number(b), 0);
    expect(Number.isNaN(eskiToplam)).toBe(true);
    expect(eskiToplam > 100).toBe(false);
    expect(toplam > 100).toBe(true);
  });

  it('bozuk boyutlu girdi tahliye sıralamasını bozmaz', () => {
    const entries = [
      { path: 'a', bucket: 'renderCache' as const, sizeBytes: safeBytes(300), lastAccessMs: 1 },
      { path: 'b', bucket: 'renderCache' as const, sizeBytes: safeBytes(undefined), lastAccessMs: 2 },
      { path: 'c', bucket: 'renderCache' as const, sizeBytes: safeBytes(100), lastAccessMs: 3 },
    ];
    const sirali = [...entries].sort((x, y) => y.sizeBytes - x.sizeBytes);
    expect(sirali.map((e) => e.path)).toEqual(['a', 'c', 'b']);
  });
});
