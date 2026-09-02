/**
 * Zaman çizelgesi düzenleme işlemleri.
 *
 * HEPSİ SAF: girdi zaman çizelgesini DEĞİŞTİRMEZ, yenisini döndürür.
 * Bunun pratik faydası geri alma: her işlem bir öncekiyle birlikte
 * durur, "geri al" bir işaretçi hareketidir (bkz. projects/ProjectModel).
 *
 * ÇAKIŞMA
 * Aynı katmanda iki klip üst üste binemez. Binerse hangisinin çizileceği
 * belirsizleşir ve dışa aktarım ile önizleme farklı sonuç verebilir. Bu
 * yüzden taşıma ve ekleme işlemleri çakışmayı REDDEDER — sessizce
 * kırpmaz. Sessiz kırpma, kullanıcının bir klibinin kısaldığını ancak
 * dışa aktarınca görmesi demektir.
 */
import {
  isActiveAt,
  normalizeKeyframes,
  snapToFrame,
  valueAt,
  type AnimatableProperty,
  type Clip,
  type Easing,
  type Keyframe,
  type Timeline,
  type Track,
} from '@/editor/timeline/Timeline';

export type EditError =
  | 'track-not-found'
  | 'clip-not-found'
  | 'track-locked'
  | 'overlap'
  | 'invalid-time'
  | 'split-outside-clip'
  | 'duration-too-short';

export type EditResult =
  | { readonly ok: true; readonly timeline: Timeline }
  | { readonly ok: false; readonly reason: EditError };

/** Bir klibin altına düşemeyeceği süre (ms). Tek kareden kısa klip anlamsız. */
export const MIN_CLIP_MS = 40;

const fail = (reason: EditError): EditResult => ({ ok: false, reason });
const done = (timeline: Timeline): EditResult => ({ ok: true, timeline });

function findTrack(timeline: Timeline, trackId: string): Track | undefined {
  return timeline.tracks.find((t) => t.trackId === trackId);
}

function replaceTrack(timeline: Timeline, next: Track): Timeline {
  return {
    ...timeline,
    tracks: timeline.tracks.map((t) => (t.trackId === next.trackId ? next : t)),
  };
}

/** İki klip zaman aralığı olarak kesişiyor mu. */
export function overlaps(a: Clip, b: Clip): boolean {
  return a.startMs < b.startMs + b.durationMs && b.startMs < a.startMs + a.durationMs;
}

/** Klip, katmandaki diğerleriyle çakışıyor mu (kendisi hariç). */
function collides(track: Track, candidate: Clip): boolean {
  return track.clips.some(
    (clip) => clip.clipId !== candidate.clipId && overlaps(clip, candidate),
  );
}

/** Klipleri başlangıç zamanına göre sıralı tutar — arama ve çizim buna güvenir. */
function sortClips(clips: readonly Clip[]): readonly Clip[] {
  return [...clips].sort((a, b) => a.startMs - b.startMs);
}

// ═══════════════════════════════════════════════════════════ ekleme ══

export function addClip(timeline: Timeline, trackId: string, clip: Clip): EditResult {
  const track = findTrack(timeline, trackId);
  if (!track) return fail('track-not-found');
  if (track.locked) return fail('track-locked');
  if (clip.durationMs < MIN_CLIP_MS) return fail('duration-too-short');
  if (clip.startMs < 0) return fail('invalid-time');
  if (collides(track, clip)) return fail('overlap');

  return done(replaceTrack(timeline, { ...track, clips: sortClips([...track.clips, clip]) }));
}

// ═══════════════════════════════════════════════════════════ taşıma ══

/**
 * Klibi katman içinde kaydırır.
 *
 * Hedef zaman kareye HİZALANIR: kare sınırına oturmayan bir kesim
 * oynatıcıda bir kare titreme üretir ve kullanıcı sebebini anlayamaz.
 */
export function moveClip(
  timeline: Timeline,
  trackId: string,
  clipId: string,
  toStartMs: number,
): EditResult {
  const track = findTrack(timeline, trackId);
  if (!track) return fail('track-not-found');
  if (track.locked) return fail('track-locked');

  const clip = track.clips.find((c) => c.clipId === clipId);
  if (!clip) return fail('clip-not-found');

  const snapped = snapToFrame(toStartMs, timeline.fps);
  if (snapped < 0) return fail('invalid-time');

  const delta = snapped - clip.startMs;
  const moved: Clip = {
    ...clip,
    startMs: snapped,
    // Keyframe'ler ZAMAN ÇİZELGESİNE göre; klip kayınca onlar da kayar.
    // Kaymasalardı animasyon klipten kopar ve kullanıcı klibi taşıdığında
    // efekt yerinde kalırdı.
    keyframes: shiftKeyframes(clip.keyframes, delta),
  };

  if (collides(track, moved)) return fail('overlap');
  return done(
    replaceTrack(timeline, {
      ...track,
      clips: sortClips(track.clips.map((c) => (c.clipId === clipId ? moved : c))),
    }),
  );
}

function shiftKeyframes(
  keyframes: Clip['keyframes'],
  deltaMs: number,
): Clip['keyframes'] {
  if (deltaMs === 0) return keyframes;
  const out: Record<string, readonly Keyframe[]> = {};
  for (const [property, frames] of Object.entries(keyframes)) {
    if (!frames) continue;
    out[property] = frames.map((f) => ({ ...f, timeMs: f.timeMs + deltaMs }));
  }
  return out as Clip['keyframes'];
}

// ═══════════════════════════════════════════════════════════ bölme ══

/**
 * Klibi verilen anda ikiye böler.
 *
 * Keyframe'ler ait oldukları parçaya gider; kesim noktasında her iki
 * parçaya da O ANKİ DEĞERİ taşıyan bir keyframe eklenir. Bu olmadan
 * bölünen bir animasyon kesim noktasında sıçrar — kullanıcı bölme
 * işleminin animasyonu bozduğunu görür.
 */
export function splitClip(
  timeline: Timeline,
  trackId: string,
  clipId: string,
  atMs: number,
): EditResult {
  const track = findTrack(timeline, trackId);
  if (!track) return fail('track-not-found');
  if (track.locked) return fail('track-locked');

  const clip = track.clips.find((c) => c.clipId === clipId);
  if (!clip) return fail('clip-not-found');

  const cut = snapToFrame(atMs, timeline.fps);
  if (!isActiveAt(clip, cut)) return fail('split-outside-clip');

  const leftMs = cut - clip.startMs;
  const rightMs = clip.durationMs - leftMs;
  if (leftMs < MIN_CLIP_MS || rightMs < MIN_CLIP_MS) return fail('duration-too-short');

  const left: Clip = {
    ...clip,
    clipId: `${clip.clipId}-a`,
    durationMs: leftMs,
    keyframes: sliceKeyframes(clip, clip.startMs, cut, 'left'),
  };
  const right: Clip = {
    ...clip,
    clipId: `${clip.clipId}-b`,
    startMs: cut,
    durationMs: rightMs,
    // Sağ parça kaynağın kesim anından itibaren okunur.
    sourceInMs: clip.sourceInMs + leftMs,
    keyframes: sliceKeyframes(clip, cut, clip.startMs + clip.durationMs, 'right'),
  };

  return done(
    replaceTrack(timeline, {
      ...track,
      clips: sortClips([...track.clips.filter((c) => c.clipId !== clipId), left, right]),
    }),
  );
}

/** Keyframe'leri aralığa göre böler ve sınıra o andaki değeri koyar. */
function sliceKeyframes(
  clip: Clip,
  fromMs: number,
  toMs: number,
  side: 'left' | 'right',
): Clip['keyframes'] {
  const out: Record<string, readonly Keyframe[]> = {};
  for (const [property, frames] of Object.entries(clip.keyframes)) {
    if (!frames || frames.length === 0) continue;
    const inside = normalizeKeyframes(frames).filter(
      (f) => f.timeMs >= fromMs && f.timeMs <= toMs,
    );

    const boundaryMs = side === 'left' ? toMs : fromMs;
    const hasBoundary = inside.some((f) => f.timeMs === boundaryMs);

    const kept = hasBoundary
      ? inside
      : [
          ...inside,
          {
            timeMs: boundaryMs,
            value: valueAt(clip, property as AnimatableProperty, boundaryMs),
            easing: 'linear' as Easing,
          },
        ];

    if (kept.length > 0) out[property] = normalizeKeyframes(kept);
  }
  return out as Clip['keyframes'];
}

// ═══════════════════════════════════════════════════════════ kırpma ══

/**
 * Klibin başını veya sonunu kırpar.
 *
 * Baştan kırpma kaynak okuma noktasını da ilerletir — yoksa klip
 * kısalır ama aynı kareden başlar ve kullanıcı kırpmanın işe yaramadığını
 * görür.
 */
export function trimClip(
  timeline: Timeline,
  trackId: string,
  clipId: string,
  edge: 'start' | 'end',
  toMs: number,
): EditResult {
  const track = findTrack(timeline, trackId);
  if (!track) return fail('track-not-found');
  if (track.locked) return fail('track-locked');

  const clip = track.clips.find((c) => c.clipId === clipId);
  if (!clip) return fail('clip-not-found');

  const target = snapToFrame(toMs, timeline.fps);
  const endMs = clip.startMs + clip.durationMs;

  let next: Clip;
  if (edge === 'start') {
    if (target < 0 || target >= endMs) return fail('invalid-time');
    const delta = target - clip.startMs;
    next = {
      ...clip,
      startMs: target,
      durationMs: clip.durationMs - delta,
      sourceInMs: clip.sourceInMs + delta,
    };
  } else {
    if (target <= clip.startMs) return fail('invalid-time');
    next = { ...clip, durationMs: target - clip.startMs };
  }

  if (next.durationMs < MIN_CLIP_MS) return fail('duration-too-short');
  if (collides(track, next)) return fail('overlap');

  return done(
    replaceTrack(timeline, {
      ...track,
      clips: sortClips(track.clips.map((c) => (c.clipId === clipId ? next : c))),
    }),
  );
}

// ══════════════════════════════════════════════════════ keyframe ══

/** Keyframe ekler veya aynı andakini değiştirir. */
export function setKeyframe(
  timeline: Timeline,
  trackId: string,
  clipId: string,
  property: AnimatableProperty,
  frame: Keyframe,
): EditResult {
  const track = findTrack(timeline, trackId);
  if (!track) return fail('track-not-found');
  if (track.locked) return fail('track-locked');

  const clip = track.clips.find((c) => c.clipId === clipId);
  if (!clip) return fail('clip-not-found');
  if (!Number.isFinite(frame.timeMs) || !Number.isFinite(frame.value)) {
    return fail('invalid-time');
  }
  // Klip dışına keyframe koymak, hiçbir zaman görünmeyecek bir animasyon
  // yazmaktır: kullanıcı ayarladığını sanır, hiçbir şey olmaz.
  if (!isActiveAt(clip, frame.timeMs)) return fail('invalid-time');

  const existing = clip.keyframes[property] ?? [];
  const next: Clip = {
    ...clip,
    keyframes: {
      ...clip.keyframes,
      [property]: normalizeKeyframes([...existing, frame]),
    },
  };

  return done(
    replaceTrack(timeline, {
      ...track,
      clips: track.clips.map((c) => (c.clipId === clipId ? next : c)),
    }),
  );
}

/** Klibi siler. Katman kilitliyse reddedilir. */
export function removeClip(timeline: Timeline, trackId: string, clipId: string): EditResult {
  const track = findTrack(timeline, trackId);
  if (!track) return fail('track-not-found');
  if (track.locked) return fail('track-locked');
  if (!track.clips.some((c) => c.clipId === clipId)) return fail('clip-not-found');

  return done(
    replaceTrack(timeline, {
      ...track,
      clips: track.clips.filter((c) => c.clipId !== clipId),
    }),
  );
}
