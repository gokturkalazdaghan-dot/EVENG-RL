/**
 * Zaman çizelgesi düzenleme işlemleri.
 *
 * Buradaki hataların ortak yanı: kullanıcı işlemi yaptığını sanır, sonuç
 * dışa aktarımda ortaya çıkar. Çakışan iki klip, kesim noktasında sıçrayan
 * bir animasyon, taşındığında yerinde kalan bir efekt — hepsi sessiz.
 */
import { valueAt, type Clip, type Timeline, type Track } from '@/editor/timeline/Timeline';
import {
  addClip,
  MIN_CLIP_MS,
  moveClip,
  overlaps,
  removeClip,
  setKeyframe,
  splitClip,
  trimClip,
} from '@/editor/timeline/TimelineEdits';

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

function tl(clips: Clip[], over: Partial<Track> = {}): Timeline {
  return {
    timelineId: 'tl',
    fps: 30,
    tracks: [
      { trackId: 't1', kind: 'video', zIndex: 0, muted: false, locked: false, clips, ...over },
    ],
  };
}

const unwrap = (r: ReturnType<typeof addClip>): Timeline => {
  if (!r.ok) throw new Error(`beklenmedik hata: ${r.reason}`);
  return r.timeline;
};

describe('Çakışma REDDEDİLİR, sessizce kırpılmaz', () => {
  it('üst üste binen klip eklenemez', () => {
    // Sessiz kırpma, kullanıcının klibinin kısaldığını ancak dışa
    // aktarınca görmesi demektir.
    const t = tl([clip({ startMs: 0, durationMs: 1000 })]);
    const r = addClip(t, 't1', clip({ clipId: 'c2', startMs: 500, durationMs: 1000 }));

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('overlap');
  });

  it('bitişik klip (sınırda) KABUL EDİLİR', () => {
    const t = tl([clip({ startMs: 0, durationMs: 1000 })]);
    const r = addClip(t, 't1', clip({ clipId: 'c2', startMs: 1000, durationMs: 500 }));

    expect(r.ok).toBe(true);
  });

  it('overlaps sınırda false döner', () => {
    const a = clip({ startMs: 0, durationMs: 1000 });
    const b = clip({ clipId: 'c2', startMs: 1000, durationMs: 500 });
    expect(overlaps(a, b)).toBe(false);
  });

  it('taşıma çakışmaya yol açıyorsa reddedilir', () => {
    const t = tl([
      clip({ clipId: 'a', startMs: 0, durationMs: 1000 }),
      clip({ clipId: 'b', startMs: 2000, durationMs: 1000 }),
    ]);
    const r = moveClip(t, 't1', 'b', 500);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('overlap');
  });
});

describe('Kilitli katman DÜZENLENEMEZ', () => {
  const locked = tl([clip()], { locked: true });

  it.each([
    ['ekleme', () => addClip(locked, 't1', clip({ clipId: 'c2', startMs: 3000 }))],
    ['taşıma', () => moveClip(locked, 't1', 'c1', 500)],
    ['bölme', () => splitClip(locked, 't1', 'c1', 500)],
    ['kırpma', () => trimClip(locked, 't1', 'c1', 'end', 500)],
    ['silme', () => removeClip(locked, 't1', 'c1')],
  ])('%s reddedilir', (_name, run) => {
    const r = run();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('track-locked');
  });
});

describe('Taşıma', () => {
  it('keyframe\'ler klip ile BİRLİKTE kayar', () => {
    // Kaymasalardı animasyon klipten kopar ve kullanıcı klibi
    // taşıdığında efekt yerinde kalırdı.
    const t = tl([
      clip({
        startMs: 0,
        durationMs: 1000,
        keyframes: { opacity: [{ timeMs: 0, value: 0, easing: 'linear' }, { timeMs: 900, value: 1, easing: 'linear' }] },
      }),
    ]);

    const moved = unwrap(moveClip(t, 't1', 'c1', 2000));
    const frames = moved.tracks[0]?.clips[0]?.keyframes.opacity ?? [];

    expect(frames.map((f) => f.timeMs)).toEqual([2000, 2900]);
  });

  it('hedef zaman kareye hizalanır', () => {
    const t = tl([clip()]);
    const moved = unwrap(moveClip(t, 't1', 'c1', 1010));
    // 30 fps → 1010 ms en yakın kare 1000 ms
    expect(moved.tracks[0]?.clips[0]?.startMs).toBe(1000);
  });

  it('negatif zamana taşınamaz', () => {
    const r = moveClip(tl([clip({ startMs: 1000 })]), 't1', 'c1', -500);
    expect(r.ok).toBe(false);
  });
});

describe('Bölme', () => {
  it('klip ikiye ayrılır ve sağ parça kaynağı DOĞRU yerden okur', () => {
    const t = tl([clip({ startMs: 0, durationMs: 1000, sourceInMs: 500 })]);
    const split = unwrap(splitClip(t, 't1', 'c1', 400));
    const clips = split.tracks[0]?.clips ?? [];

    expect(clips).toHaveLength(2);
    expect(clips[0]?.durationMs).toBe(400);
    expect(clips[1]?.startMs).toBe(400);
    expect(clips[1]?.durationMs).toBe(600);
    // Kaynak okuma noktası da 400 ms ilerlemeli.
    expect(clips[1]?.sourceInMs).toBe(900);
  });

  it('kesim noktasında animasyon SIÇRAMAZ', () => {
    // Sınıra o andaki değeri taşıyan keyframe eklenmeseydi, bölünen
    // animasyon kesimde sıçrar ve kullanıcı bölmenin animasyonu
    // bozduğunu görürdü.
    const original = clip({
      startMs: 0,
      durationMs: 1000,
      keyframes: {
        opacity: [
          { timeMs: 0, value: 0, easing: 'linear' },
          { timeMs: 1000, value: 1, easing: 'linear' },
        ],
      },
    });
    const before = valueAt(original, 'opacity', 400);

    const split = unwrap(splitClip(tl([original]), 't1', 'c1', 400));
    const [left, right] = split.tracks[0]?.clips ?? [];

    expect(valueAt(left!, 'opacity', 400)).toBeCloseTo(before, 5);
    expect(valueAt(right!, 'opacity', 400)).toBeCloseTo(before, 5);
  });

  it('klip dışında bölünemez', () => {
    const r = splitClip(tl([clip({ startMs: 0, durationMs: 1000 })]), 't1', 'c1', 5000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('split-outside-clip');
  });

  it('tek kareden kısa parça üretecek bölme reddedilir', () => {
    const r = splitClip(tl([clip({ startMs: 0, durationMs: 1000 })]), 't1', 'c1', 10);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('duration-too-short');
  });
});

describe('Kırpma', () => {
  it('baştan kırpma kaynak okuma noktasını da İLERLETİR', () => {
    // İlerlemeseydi klip kısalır ama aynı kareden başlar ve kullanıcı
    // kırpmanın işe yaramadığını görürdü.
    const t = tl([clip({ startMs: 0, durationMs: 1000, sourceInMs: 0 })]);
    const trimmed = unwrap(trimClip(t, 't1', 'c1', 'start', 300));
    const c = trimmed.tracks[0]?.clips[0];

    expect(c?.startMs).toBe(300);
    expect(c?.durationMs).toBe(700);
    expect(c?.sourceInMs).toBe(300);
  });

  it('sondan kırpma süreyi kısaltır, kaynağa dokunmaz', () => {
    const t = tl([clip({ durationMs: 1000, sourceInMs: 250 })]);
    const trimmed = unwrap(trimClip(t, 't1', 'c1', 'end', 600));
    const c = trimmed.tracks[0]?.clips[0];

    expect(c?.durationMs).toBe(600);
    expect(c?.sourceInMs).toBe(250);
  });

  it('minimum süreden kısaltılamaz', () => {
    const t = tl([clip({ durationMs: 1000 })]);
    const r = trimClip(t, 't1', 'c1', 'end', MIN_CLIP_MS - 10);
    expect(r.ok).toBe(false);
  });

  it('başlangıç bitişi geçemez', () => {
    const r = trimClip(tl([clip({ durationMs: 1000 })]), 't1', 'c1', 'start', 1500);
    expect(r.ok).toBe(false);
  });
});

describe('Keyframe ekleme', () => {
  it('klip DIŞINA keyframe konulamaz', () => {
    // Konulabilseydi kullanıcı ayarladığını sanır, hiçbir zaman
    // görünmeyecek bir animasyon yazardı.
    const r = setKeyframe(tl([clip({ durationMs: 1000 })]), 't1', 'c1', 'opacity', {
      timeMs: 5000,
      value: 1,
      easing: 'linear',
    });
    expect(r.ok).toBe(false);
  });

  it('NaN değer reddedilir', () => {
    const r = setKeyframe(tl([clip()]), 't1', 'c1', 'opacity', {
      timeMs: 500,
      value: Number.NaN,
      easing: 'linear',
    });
    expect(r.ok).toBe(false);
  });

  it('aynı ana ikinci keyframe DEĞİŞTİRİR, çoğaltmaz', () => {
    let t = tl([clip()]);
    t = unwrap(setKeyframe(t, 't1', 'c1', 'opacity', { timeMs: 500, value: 0.2, easing: 'linear' }));
    t = unwrap(setKeyframe(t, 't1', 'c1', 'opacity', { timeMs: 500, value: 0.8, easing: 'linear' }));

    const frames = t.tracks[0]?.clips[0]?.keyframes.opacity ?? [];
    expect(frames).toHaveLength(1);
    expect(frames[0]?.value).toBe(0.8);
  });
});

describe('İşlemler girdiyi DEĞİŞTİRMEZ', () => {
  it('saf: özgün zaman çizelgesi olduğu gibi kalır', () => {
    // Geri alma buna dayanıyor: her işlem bir öncekiyle birlikte durur.
    const original = tl([clip({ startMs: 0, durationMs: 1000 })]);
    const snapshot = JSON.stringify(original);

    moveClip(original, 't1', 'c1', 3000);
    splitClip(original, 't1', 'c1', 400);
    trimClip(original, 't1', 'c1', 'end', 600);
    removeClip(original, 't1', 'c1');

    expect(JSON.stringify(original)).toBe(snapshot);
  });
});

describe('Bulunamayan hedefler', () => {
  it('olmayan katman ve klip açık hata döner', () => {
    const t = tl([clip()]);
    const a = moveClip(t, 'yok', 'c1', 0);
    const b = moveClip(t, 't1', 'yok', 0);

    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.reason).toBe('track-not-found');
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason).toBe('clip-not-found');
  });
});
