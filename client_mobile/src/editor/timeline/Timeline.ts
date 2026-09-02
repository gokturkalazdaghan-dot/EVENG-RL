/**
 * Çok katmanlı zaman çizelgesi — düzenleyicinin çekirdek veri modeli.
 *
 * NEDEN SAF
 * Burada React yok, native yok, dosya sistemi yok. Zaman çizelgesi
 * mantığındaki hatalar SESSİZDİR: bir kare yanlış yerde başlar, bir
 * özellik yanlış interpolasyonla geçer, bir klip diğerinin üstüne biner.
 * Kullanıcı bunu ancak dışa aktardıktan sonra görür. Bu yüzden karar
 * mantığı çizimden tamamen ayrı ve baştan sona test edilebilir.
 *
 * ZAMAN BİRİMİ: MİLİSANİYE, TAM SAYI
 * Saniye cinsinden kayan nokta kullanmak, uzun bir zaman çizelgesinde
 * birikimli yuvarlama hatası üretir: 10 dakikalık bir videoda klipler
 * birbirinden birkaç kare kayar. Tam sayı ms, 24 gün uzunluğa kadar
 * güvenli tamsayı aralığında kalır.
 *
 * KATMAN SIRASI
 * `zIndex` büyük olan ÜSTTE çizilir. Eşit `zIndex` için katmanın
 * listedeki sırası belirleyicidir — kararsız sıralama, aynı projenin iki
 * açılışta farklı görünmesi demektir.
 */

export type TrackKind = 'video' | 'audio' | 'text' | 'sticker' | 'overlay';

/** Keyframe'ler arasında değerin nasıl geçtiği. */
export type Easing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'hold';

/** Keyframe'lenebilen özellikler. */
export type AnimatableProperty =
  | 'opacity'
  | 'scale'
  | 'rotation'
  | 'positionX'
  | 'positionY'
  | 'volume'
  | 'blur';

export interface Keyframe {
  /** Klibin BAŞINA göre değil, ZAMAN ÇİZELGESİNE göre. */
  readonly timeMs: number;
  readonly value: number;
  /** Bu keyframe'DEN sonraki geçişin eğrisi. */
  readonly easing: Easing;
}

export interface Clip {
  readonly clipId: string;
  /** Kaynak medyanın URI'si; metin/sticker için boş olabilir. */
  readonly sourceUri: string;
  /** Zaman çizelgesinde nerede başlıyor. */
  readonly startMs: number;
  /** Ne kadar sürüyor (kırpma sonrası). */
  readonly durationMs: number;
  /** Kaynağın hangi anından itibaren okunuyor (kırpma başlangıcı). */
  readonly sourceInMs: number;
  /** Sabit değerler — keyframe yoksa bunlar kullanılır. */
  readonly properties: Readonly<Partial<Record<AnimatableProperty, number>>>;
  /** Özellik başına keyframe listesi. */
  readonly keyframes: Readonly<Partial<Record<AnimatableProperty, readonly Keyframe[]>>>;
}

export interface Track {
  readonly trackId: string;
  readonly kind: TrackKind;
  /** Büyük olan ÜSTTE. Eşitlikte liste sırası belirler. */
  readonly zIndex: number;
  readonly muted: boolean;
  readonly locked: boolean;
  readonly clips: readonly Clip[];
}

export interface Timeline {
  readonly timelineId: string;
  readonly tracks: readonly Track[];
  /** Kare hızı — kare hizalaması ve dışa aktarım için. */
  readonly fps: number;
}

/** Özellik varsayılanları: keyframe de sabit değer de yoksa bunlar. */
export const PROPERTY_DEFAULTS: Readonly<Record<AnimatableProperty, number>> = {
  opacity: 1,
  scale: 1,
  rotation: 0,
  positionX: 0,
  positionY: 0,
  volume: 1,
  blur: 0,
};

// ═══════════════════════════════════════════════════════ interpolasyon ══

/**
 * Eğri uygulaması. `t` her zaman 0..1 aralığında.
 *
 * `hold` bir eğri değil, geçiş YOKLUĞUdur: değer bir sonraki keyframe'e
 * kadar sabit kalır ve orada anında sıçrar. Sticker ve metin görünürlüğü
 * için gerekli — 'linear' ile yapılan bir görünürlük geçişi istenmeyen bir
 * solma üretir.
 */
export function applyEasing(easing: Easing, t: number): number {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  switch (easing) {
    case 'linear':
      return clamped;
    case 'ease-in':
      return clamped * clamped;
    case 'ease-out':
      return clamped * (2 - clamped);
    case 'ease-in-out':
      return clamped < 0.5
        ? 2 * clamped * clamped
        : -1 + (4 - 2 * clamped) * clamped;
    case 'hold':
      return 0;
  }
}

/**
 * Keyframe listesini zamana göre sıralar ve aynı ana düşenleri teker.
 *
 * SIRALAMA ÇAĞRI ANINDA YAPILIR, saklarken değil: kullanıcı bir keyframe'i
 * sürükleyip başka bir keyframe'in önüne geçirdiğinde liste bozulur ve
 * sıralı olduğu varsayılan bir arama yanlış aralık bulur — değer bir anda
 * geriye sıçrar.
 *
 * Aynı ana düşen iki keyframe'de SONUNCUSU kazanır: kullanıcı bir
 * keyframe'i tam olarak var olanın üstüne bıraktığında, yeni değer geçerli
 * olmalı.
 */
export function normalizeKeyframes(keyframes: readonly Keyframe[]): readonly Keyframe[] {
  const byTime = new Map<number, Keyframe>();
  for (const frame of keyframes) {
    if (!Number.isFinite(frame.timeMs) || !Number.isFinite(frame.value)) continue;
    byTime.set(Math.round(frame.timeMs), frame);
  }
  return [...byTime.values()].sort((a, b) => a.timeMs - b.timeMs);
}

/**
 * Bir özelliğin verilen andaki değeri.
 *
 * Keyframe yoksa sabit değer, o da yoksa varsayılan kullanılır — bu sıra
 * önemli: sabit değeri atlayıp varsayılana düşmek, kullanıcının elle
 * ayarladığı opaklığı sessizce 1'e döndürür.
 *
 * İlk keyframe'den ÖNCE ilk değer, son keyframe'den SONRA son değer tutulur
 * (extrapolasyon yok). Extrapolasyon, uzun bir klibin sonunda opaklığın
 * eksiye düşmesi gibi anlamsız değerler üretir.
 */
export function valueAt(
  clip: Clip,
  property: AnimatableProperty,
  timeMs: number,
): number {
  const fallback = clip.properties[property] ?? PROPERTY_DEFAULTS[property];
  const frames = normalizeKeyframes(clip.keyframes[property] ?? []);

  if (frames.length === 0) return fallback;
  const first = frames[0]!;
  if (timeMs <= first.timeMs) return first.value;

  const last = frames[frames.length - 1]!;
  if (timeMs >= last.timeMs) return last.value;

  // İkili arama: 60 fps'te saniyede 60 kez çağrılıyor ve bir klipte
  // yüzlerce keyframe olabilir. Doğrusal tarama burada ölçülebilir.
  let low = 0;
  let high = frames.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (frames[mid]!.timeMs <= timeMs) low = mid;
    else high = mid;
  }

  const a = frames[low]!;
  const b = frames[high]!;
  const span = b.timeMs - a.timeMs;
  // Aynı ana düşen iki keyframe normalizasyonda tekilleşir; yine de
  // sıfıra bölmeye karşı koruma: bir kare NaN, tüm kareyi kaybettirir.
  if (span <= 0) return b.value;

  const progress = applyEasing(a.easing, (timeMs - a.timeMs) / span);
  return a.value + (b.value - a.value) * progress;
}

// ═════════════════════════════════════════════════════════ çözümleme ══

export interface ResolvedClip {
  readonly trackId: string;
  readonly kind: TrackKind;
  readonly zIndex: number;
  readonly clipId: string;
  readonly sourceUri: string;
  /** Kaynağın hangi anı gösterilecek. */
  readonly sourceTimeMs: number;
  readonly properties: Readonly<Record<AnimatableProperty, number>>;
}

/** Klip verilen anda görünür mü. */
export function isActiveAt(clip: Clip, timeMs: number): boolean {
  // Bitiş anı DIŞARIDA: [start, start+duration). İki bitişik klibin
  // sınırında ikisinin birden aktif sayılması, bir karede iki görüntünün
  // üst üste binmesi demektir.
  return timeMs >= clip.startMs && timeMs < clip.startMs + clip.durationMs;
}

const ALL_PROPERTIES = Object.keys(PROPERTY_DEFAULTS) as AnimatableProperty[];

/**
 * Verilen anda çizilecek her şey — ALTTAN ÜSTE sıralı.
 *
 * Sessiz katmanların sesi 0'a çekilir, kilitli katmanlar yine çizilir
 * (kilit düzenlemeyi engeller, görünürlüğü değil).
 */
export function resolveAt(timeline: Timeline, timeMs: number): readonly ResolvedClip[] {
  const out: ResolvedClip[] = [];

  // Kararlı sıralama: eşit zIndex'te LİSTE SIRASI belirler. `sort` kararlı
  // olmasaydı aynı proje iki açılışta farklı görünürdü.
  const ordered = timeline.tracks
    .map((track, index) => ({ track, index }))
    .sort((a, b) => a.track.zIndex - b.track.zIndex || a.index - b.index);

  for (const { track } of ordered) {
    for (const clip of track.clips) {
      if (!isActiveAt(clip, timeMs)) continue;

      const properties = {} as Record<AnimatableProperty, number>;
      for (const property of ALL_PROPERTIES) {
        properties[property] = valueAt(clip, property, timeMs);
      }
      if (track.muted) properties.volume = 0;

      out.push({
        trackId: track.trackId,
        kind: track.kind,
        zIndex: track.zIndex,
        clipId: clip.clipId,
        sourceUri: clip.sourceUri,
        // Kaynak anı: klipteki ilerleme + kırpma başlangıcı.
        sourceTimeMs: clip.sourceInMs + (timeMs - clip.startMs),
        properties,
      });
    }
  }
  return out;
}

/** Zaman çizelgesinin toplam uzunluğu. */
export function durationMs(timeline: Timeline): number {
  let end = 0;
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      const clipEnd = clip.startMs + clip.durationMs;
      if (clipEnd > end) end = clipEnd;
    }
  }
  return end;
}

/**
 * Zamanı en yakın kareye hizalar.
 *
 * Dışa aktarımda kare sınırına oturmayan bir kesim, oynatıcıda bir kare
 * titreme (judder) üretir. Hizalama BURADA yapılır ki hem önizleme hem
 * dışa aktarım aynı kareyi seçsin — ikisi ayrı hesaplarsa önizlemede
 * doğru görünen kesim çıktıda kayar.
 */
export function snapToFrame(timeMs: number, fps: number): number {
  if (!Number.isFinite(fps) || fps <= 0) return Math.round(timeMs);
  const frameMs = 1000 / fps;
  return Math.round(Math.round(timeMs / frameMs) * frameMs);
}
