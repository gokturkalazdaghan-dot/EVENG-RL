/**
 * ContentRating — içerik derecelendirme kararının SAF mantığı.
 *
 * BU DOSYA MODEL DEĞİL, POLİTİKADIR
 * Sınıflandırıcı (cihazda veya sunucuda) her etiket için bir güven skoru
 * üretir. Bu skorların NE ANLAMA GELDİĞİNE ve içeriğin nereye düşeceğine
 * burası karar verir. Ayrımın pratik faydası: model değiştiğinde politika
 * aynı kalır ve politika testleri model olmadan çalışır.
 *
 * İKİ YÖNLÜ HATA MALİYETİ — ve neden simetrik değil
 *   - YANLIŞ NEGATİF (+18 içeriği güvenli saymak): reşit olmayan bir
 *     kullanıcıya yetişkin içerik gösterilir. Kabul edilemez.
 *   - YANLIŞ POZİTİF (mayolu bir plaj fotoğrafını +18 saymak): masum
 *     kullanıcı haksız yere kısıtlanır, akışı kaybeder, uygulamayı bırakır.
 *
 * İkisi de gerçek zarardır ama birincisi geri alınamaz. Bu yüzden BELİRSİZ
 * durumlar +18 sayılmaz, `review` kuyruğuna düşer: reşit olmayanlara
 * gösterilmez (güvenli taraf) ama kullanıcı da otomatik cezalandırılmaz.
 */

/**
 * Sınıflandırıcının ürettiği ham sinyaller.
 *
 * Her alan 0..1 güven skorudur. İsimler ANATOMİK ve dar tanımlıdır:
 * "çıplaklık" gibi geniş bir etiket, mayo ile örtüşür ve yanlış pozitif
 * üretir. Politikanın ihtiyaç duyduğu ayrım budur.
 */
export interface ClassifierSignals {
  /** Örtüsüz kadın meme ucu / areola. */
  readonly exposedFemaleNipple: number;
  /** Örtüsüz kadın genital bölgesi. */
  readonly exposedFemaleGenitalia: number;
  /** Örtüsüz erkek genital bölgesi. */
  readonly exposedMaleGenitalia: number;
  /** Örtüsüz anüs / rektal bölge. */
  readonly exposedAnus: number;
  /** Cinsel eylem tasviri. */
  readonly sexualAct: number;

  // --- Yanlış pozitif bağlam sinyalleri (aşağı yönlü kanıt) ---
  /** Mayo / bikini giyildiği tespiti. */
  readonly swimwear: number;
  /** Spor kıyafeti (tayt, atlet, şort) tespiti. */
  readonly athleticwear: number;
  /** İç çamaşırı — açık değil ama akışta hassas; ayrı ele alınır. */
  readonly underwear: number;

  // --- Yaş bağlamı ---
  /**
   * Görüntüdeki kişinin reşit olmadığına dair sinyal.
   *
   * Bu sinyal HERHANGİ bir cinsel içerik sinyaliyle birleştiğinde karar
   * `blocked`tır: içerik ne yayınlanır, ne saklanır, ne de derecelendirilir.
   * Eşiği bilinçli olarak DÜŞÜK tutulur — burada yanlış pozitif kabul
   * edilebilir, yanlış negatif değildir.
   */
  readonly apparentMinor: number;
}

export type ContentRating =
  /** Herkese açık. */
  | 'general'
  /** Hassas ama +18 değil (iç çamaşırı, sınırda). Reşit olmayanlara gösterilmez,
   *  yetişkinlerde varsayılan olarak bulanık gösterilir. */
  | 'sensitive'
  /** +18. Yalnızca doğrulanmış yetişkinlere ve yalnızca izin verdiklerinde. */
  | 'adult'
  /** İnsan incelemesi gerekiyor. Bu arada reşit olmayanlara gösterilmez. */
  | 'review'
  /** Hiçbir koşulda yayınlanmaz veya gösterilmez. */
  | 'blocked';

/**
 * Eşikler.
 *
 * +18 eşiği YÜKSEK (0.85): sınıflandırıcının kararlı olduğu durumlar dışında
 * kimseyi +18 damgalamıyoruz.
 *
 * Reşit olmayan sinyali eşiği DÜŞÜK (0.35): burada temkinli olmanın maliyeti
 * bir gönderinin incelemeye düşmesidir; tersinin maliyeti kabul edilemez.
 */
export const THRESHOLDS = {
  adult: 0.85,
  review: 0.5,
  sensitive: 0.45,
  /** Bu değerin üstünde yanlış pozitif bağlamı devreye girer. */
  clothingContext: 0.6,
  apparentMinor: 0.35,
} as const;

export interface RatingDecision {
  readonly rating: ContentRating;
  /** Kararı hangi sinyalin sürüklediği — moderasyon arayüzünde gösterilir. */
  readonly reason: string;
  /** En yüksek yetişkin-içerik skoru; sıralama ve denetim için. */
  readonly adultScore: number;
}

/** Yetişkin içerik sinyallerinin en yükseği. */
function peakAdultSignal(signals: ClassifierSignals): { score: number; label: string } {
  const candidates: readonly (readonly [number, string])[] = [
    [signals.exposedFemaleNipple, 'exposed-female-nipple'],
    [signals.exposedFemaleGenitalia, 'exposed-female-genitalia'],
    [signals.exposedMaleGenitalia, 'exposed-male-genitalia'],
    [signals.exposedAnus, 'exposed-anus'],
    [signals.sexualAct, 'sexual-act'],
  ];

  let best: { score: number; label: string } = { score: 0, label: 'none' };
  for (const [score, label] of candidates) {
    if (score > best.score) best = { score, label };
  }
  return best;
}

/**
 * Yanlış pozitif koruması.
 *
 * Mayo, bikini ve spor kıyafeti KESİNLİKLE +18 değildir. Sınıflandırıcılar
 * bu kıyafetleri düzenli olarak çıplaklıkla karıştırır (ten oranı yüksektir);
 * plaj ve spor fotoğrafları bu kategorideki uygulamaların en yaygın içeriği
 * olduğu için bu, teorik değil pratik bir sorundur.
 *
 * Kural: giyim bağlamı güçlüyse (>0.6) VE yetişkin sinyali kesinlik eşiğinin
 * ALTINDAYSA, yetişkin sinyali bastırılır. Kesin bir açık genital tespiti
 * (>=0.85) giyim bağlamıyla bastırılMAZ — mayo giyen biri de teşhir yapabilir.
 */
export function isClothingContext(signals: ClassifierSignals): boolean {
  return (
    signals.swimwear >= THRESHOLDS.clothingContext ||
    signals.athleticwear >= THRESHOLDS.clothingContext
  );
}

export function rateContent(signals: ClassifierSignals): RatingDecision {
  const peak = peakAdultSignal(signals);

  // --- KURAL 0 (her şeyin önünde): reşit olmayan + cinsel içerik sinyali.
  // Bu içerik derecelendirilmez, engellenir. Eşik düşüktür ve giyim bağlamı
  // bunu BASTIRAMAZ.
  const anySexualSignal = Math.max(peak.score, signals.underwear);
  if (signals.apparentMinor >= THRESHOLDS.apparentMinor && anySexualSignal >= THRESHOLDS.sensitive) {
    return {
      rating: 'blocked',
      reason: 'apparent-minor-with-sexual-signal',
      adultScore: peak.score,
    };
  }

  // --- KURAL 1: yanlış pozitif koruması.
  // Mayo/spor kıyafeti bağlamında, KESİN olmayan yetişkin sinyali bastırılır.
  if (isClothingContext(signals) && peak.score < THRESHOLDS.adult) {
    return {
      rating: 'general',
      reason: signals.swimwear >= signals.athleticwear ? 'swimwear-context' : 'athleticwear-context',
      adultScore: peak.score,
    };
  }

  // --- KURAL 2: kesin yetişkin içerik.
  if (peak.score >= THRESHOLDS.adult) {
    return { rating: 'adult', reason: peak.label, adultScore: peak.score };
  }

  // --- KURAL 3: belirsiz aralık → insan incelemesi.
  // Otomatik +18 damgası vurmuyoruz ama reşit olmayanlara da göstermiyoruz.
  if (peak.score >= THRESHOLDS.review) {
    return { rating: 'review', reason: `uncertain:${peak.label}`, adultScore: peak.score };
  }

  // --- KURAL 4: iç çamaşırı — +18 değil ama hassas.
  if (signals.underwear >= THRESHOLDS.sensitive) {
    return { rating: 'sensitive', reason: 'underwear', adultScore: peak.score };
  }

  // --- KURAL 5: düşük ama sıfır olmayan sinyal → hassas.
  if (peak.score >= THRESHOLDS.sensitive) {
    return { rating: 'sensitive', reason: `low:${peak.label}`, adultScore: peak.score };
  }

  return { rating: 'general', reason: 'clean', adultScore: peak.score };
}

/** Bu derecelendirme yalnızca yetişkinlere mi gösterilir. */
export function isAdultOnly(rating: ContentRating): boolean {
  return rating === 'adult' || rating === 'sensitive' || rating === 'review';
}

/** Bu derecelendirme hiç yayınlanabilir mi. */
export function isPublishable(rating: ContentRating): boolean {
  return rating !== 'blocked';
}
