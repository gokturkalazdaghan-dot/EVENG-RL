/**
 * Zaman çizelgesi çekirdeği — CapCut sınıfı düzenlemenin veri modeli.
 *
 * Bu mantıktaki hatalar SESSİZDİR: bir kare yanlış yerde başlar, bir
 * animasyon kesim noktasında sıçrar, iki klip aynı karede üst üste biner.
 * Kullanıcı bunu ancak dışa aktardıktan sonra görür — yani en pahalı anda.
 */
import {
  applyEasing,
  durationMs,
  isActiveAt,
  normalizeKeyframes,
  PROPERTY_DEFAULTS,
  resolveAt,
  snapToFrame,
  valueAt,
  type Clip,
  type Timeline,
  type Track,
} from '@/editor/timeline/Timeline';

function clip(over: Partial<Clip> = {}): Clip {
  return {
    clipId: 'c1',
    sourceUri: 'file:///a.mp4',
    startMs: 0,
    durationMs: 1000,
    sourceInMs: 0,
    properties: {},
    keyframes: {},
    ...over,
  };
}

function track(over: Partial<Track> = {}): Track {
  return {
    trackId: 't1',
    kind: 'video',
    zIndex: 0,
    muted: false,
    locked: false,
    clips: [clip()],
    ...over,
  };
}

function timeline(tracks: Track[], fps = 30): Timeline {
  return { timelineId: 'tl', tracks, fps };
}

describe('Keyframe normalleştirme', () => {
  it('sırasız keyframe listesi ZAMANA GÖRE sıralanır', () => {
    // Kullanıcı bir keyframe'i sürükleyip diğerinin önüne geçirdiğinde
    // liste bozulur; sıralı varsayan bir arama yanlış aralık bulur ve
    // değer bir anda geriye sıçrar.
    const frames = normalizeKeyframes([
      { timeMs: 500, value: 0.5, easing: 'linear' },
      { timeMs: 0, value: 0, easing: 'linear' },
      { timeMs: 250, value: 1, easing: 'linear' },
    ]);

    expect(frames.map((f) => f.timeMs)).toEqual([0, 250, 500]);
  });

  it('aynı ana düşen keyframe\'de SONUNCUSU kazanır', () => {
    // Kullanıcı bir keyframe'i tam olarak var olanın üstüne bırakınca
    // yeni değer geçerli olmalı.
    const frames = normalizeKeyframes([
      { timeMs: 100, value: 0.2, easing: 'linear' },
      { timeMs: 100, value: 0.9, easing: 'linear' },
    ]);

    expect(frames).toHaveLength(1);
    expect(frames[0]?.value).toBe(0.9);
  });

  it('NaN ve sonsuz değerler ATILIR', () => {
    // Tek bir NaN, o karedeki tüm hesabı NaN yapar ve kare kaybolur.
    const frames = normalizeKeyframes([
      { timeMs: Number.NaN, value: 1, easing: 'linear' },
      { timeMs: 100, value: Number.POSITIVE_INFINITY, easing: 'linear' },
      { timeMs: 200, value: 0.5, easing: 'linear' },
    ]);

    expect(frames).toHaveLength(1);
    expect(frames[0]?.timeMs).toBe(200);
  });
});

describe('Değer interpolasyonu', () => {
  it('keyframe yoksa SABİT değer kullanılır, varsayılan değil', () => {
    // Sabit değeri atlayıp varsayılana düşmek, kullanıcının elle
    // ayarladığı opaklığı sessizce 1'e döndürür.
    const c = clip({ properties: { opacity: 0.3 } });
    expect(valueAt(c, 'opacity', 500)).toBe(0.3);
  });

  it('sabit değer de yoksa varsayılan', () => {
    expect(valueAt(clip(), 'opacity', 0)).toBe(PROPERTY_DEFAULTS.opacity);
    expect(valueAt(clip(), 'rotation', 0)).toBe(0);
  });

  it('iki keyframe arasında doğrusal geçiş', () => {
    const c = clip({
      keyframes: {
        opacity: [
          { timeMs: 0, value: 0, easing: 'linear' },
          { timeMs: 1000, value: 1, easing: 'linear' },
        ],
      },
    });

    expect(valueAt(c, 'opacity', 0)).toBe(0);
    expect(valueAt(c, 'opacity', 500)).toBeCloseTo(0.5, 5);
    expect(valueAt(c, 'opacity', 1000)).toBe(1);
  });

  it('ilk keyframe\'den ÖNCE ve son keyframe\'den SONRA değer TUTULUR', () => {
    // Extrapolasyon, uzun bir klibin sonunda opaklığın eksiye düşmesi
    // gibi anlamsız değerler üretir.
    const c = clip({
      keyframes: {
        opacity: [
          { timeMs: 400, value: 0.4, easing: 'linear' },
          { timeMs: 600, value: 0.6, easing: 'linear' },
        ],
      },
    });

    expect(valueAt(c, 'opacity', 0)).toBe(0.4);
    expect(valueAt(c, 'opacity', 5000)).toBe(0.6);
  });

  it('hold eğrisi SOLDURMAZ — sonraki keyframe\'e kadar sabit', () => {
    // Sticker/metin görünürlüğü için gerekli: 'linear' ile yapılan bir
    // görünürlük geçişi istenmeyen bir solma üretir.
    const c = clip({
      keyframes: {
        opacity: [
          { timeMs: 0, value: 0, easing: 'hold' },
          { timeMs: 1000, value: 1, easing: 'linear' },
        ],
      },
    });

    expect(valueAt(c, 'opacity', 1)).toBe(0);
    expect(valueAt(c, 'opacity', 999)).toBe(0);
    expect(valueAt(c, 'opacity', 1000)).toBe(1);
  });

  it('yüz keyframe ile de doğru aralık bulunur (ikili arama)', () => {
    const frames = Array.from({ length: 100 }, (_, i) => ({
      timeMs: i * 10,
      value: i / 100,
      easing: 'linear' as const,
    }));
    const c = clip({ durationMs: 2000, keyframes: { opacity: frames } });

    expect(valueAt(c, 'opacity', 500)).toBeCloseTo(0.5, 5);
    expect(valueAt(c, 'opacity', 505)).toBeCloseTo(0.505, 5);
  });

  it('eğriler 0 ve 1 uçlarında sabit', () => {
    for (const easing of ['linear', 'ease-in', 'ease-out', 'ease-in-out'] as const) {
      expect(applyEasing(easing, 0)).toBe(0);
      expect(applyEasing(easing, 1)).toBe(1);
    }
  });

  it('eğri girdisi 0..1 dışına taşarsa KIRPILIR', () => {
    expect(applyEasing('linear', -5)).toBe(0);
    expect(applyEasing('linear', 5)).toBe(1);
  });
});

describe('Klip aktifliği', () => {
  it('bitiş anı DIŞARIDA — bitişik klipler aynı karede çakışmaz', () => {
    // İkisinin birden aktif sayılması, bir karede iki görüntünün üst üste
    // binmesi demektir.
    const a = clip({ startMs: 0, durationMs: 1000 });
    const b = clip({ clipId: 'c2', startMs: 1000, durationMs: 1000 });

    expect(isActiveAt(a, 999)).toBe(true);
    expect(isActiveAt(a, 1000)).toBe(false);
    expect(isActiveAt(b, 1000)).toBe(true);
  });
});

describe('Çözümleme', () => {
  it('katmanlar ALTTAN ÜSTE sıralanır', () => {
    const üst = track({ trackId: 'ust', zIndex: 10 });
    const alt = track({ trackId: 'alt', zIndex: 0 });
    const resolved = resolveAt(timeline([üst, alt]), 100);

    expect(resolved.map((r) => r.trackId)).toEqual(['alt', 'ust']);
  });

  it('eşit zIndex\'te LİSTE SIRASI belirler — kararlı', () => {
    // Kararsız sıralama, aynı projenin iki açılışta farklı görünmesi
    // demektir.
    const a = track({ trackId: 'a', zIndex: 5 });
    const b = track({ trackId: 'b', zIndex: 5 });
    const c = track({ trackId: 'c', zIndex: 5 });

    for (let i = 0; i < 20; i += 1) {
      expect(resolveAt(timeline([a, b, c]), 100).map((r) => r.trackId)).toEqual(['a', 'b', 'c']);
    }
  });

  it('sessiz katmanın sesi 0\'a çekilir ama YİNE ÇİZİLİR', () => {
    const t = track({ muted: true, clips: [clip({ properties: { volume: 0.8 } })] });
    const resolved = resolveAt(timeline([t]), 100);

    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.properties.volume).toBe(0);
  });

  it('kilitli katman ÇİZİLİR — kilit düzenlemeyi engeller, görünürlüğü değil', () => {
    const t = track({ locked: true });
    expect(resolveAt(timeline([t]), 100)).toHaveLength(1);
  });

  it('kaynak anı kırpma başlangıcını içerir', () => {
    // Kırpma başlangıcı eklenmeseydi klip kısalır ama aynı kareden
    // başlardı.
    const t = track({ clips: [clip({ startMs: 500, sourceInMs: 2000 })] });
    const resolved = resolveAt(timeline([t]), 700);

    expect(resolved[0]?.sourceTimeMs).toBe(2200);
  });

  it('aktif olmayan klip çözümlemeye GİRMEZ', () => {
    const t = track({ clips: [clip({ startMs: 5000 })] });
    expect(resolveAt(timeline([t]), 100)).toEqual([]);
  });
});

describe('Süre ve kare hizalama', () => {
  it('toplam süre en geç biten klibe göre', () => {
    const t = track({
      clips: [clip({ startMs: 0, durationMs: 500 }), clip({ clipId: 'c2', startMs: 2000, durationMs: 300 })],
    });
    expect(durationMs(timeline([t]))).toBe(2300);
  });

  it('boş zaman çizelgesinin süresi 0', () => {
    expect(durationMs(timeline([]))).toBe(0);
  });

  it('zaman en yakın kareye hizalanır', () => {
    // 30 fps → kare 33,333 ms. Kareler: 0, 33, 67, 100…
    expect(snapToFrame(0, 30)).toBe(0);
    expect(snapToFrame(30, 30)).toBe(33);
    expect(snapToFrame(60, 30)).toBe(67);
    expect(snapToFrame(90, 30)).toBe(100);
  });

  it('tam ortadaki değer YUKARI yuvarlanır', () => {
    // 50 ms, kare 1 (33) ile kare 2 (67) arasında tam ortada. Bu testi
    // ilk yazarken 33 bekledim ve YANILDIM: JavaScript'te .5 yukarı
    // yuvarlanır. Davranışın kendisi doğru; yazılı olması, ileride
    // birinin "yanlış" sanıp değiştirmesini engelliyor.
    expect(snapToFrame(50, 30)).toBe(67);
  });

  it('geçersiz fps hizalamayı ÇÖKERTMEZ', () => {
    // Sıfıra bölme bir kareyi NaN yapar ve o kare kaybolur.
    expect(snapToFrame(100, 0)).toBe(100);
    expect(snapToFrame(100, Number.NaN)).toBe(100);
    expect(snapToFrame(100, -30)).toBe(100);
  });
});
