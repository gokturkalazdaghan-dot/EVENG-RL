/**
 * social_gamification/moderationProxy.js
 *
 * ZORUNLU MODERASYON KAPISI — hikaye ve DM eki, TARANMADAN RENDER EDİLMEZ.
 *
 * Bu dosya iki parçadan oluşur:
 *   1. Saf karar çekirdeği (`decideIngest`) — ağ, veritabanı veya sağlayıcı
 *      bağımlılığı yok, birim testi yazılabilir.
 *   2. Kapı (`scanAndGate`) — sağlayıcıyı çağırır, kararı uygular, eskalasyon
 *      ve kuyruk yazımını tetikler.
 *
 * NEDEN AYRI: karar mantığı sağlayıcının içine gömülürse, sağlayıcı
 * değiştiğinde eşikler ve öncelik sırası da sessizce değişir.
 *
 * ÜÇ DEĞİŞMEZ
 *
 * A. FAIL-CLOSED. Tarayıcı hata verir, zaman aşımına uğrar veya anlamsız
 *    yanıt döndürürse içerik "temiz" SAYILMAZ; `quarantine` olur ve hiç
 *    render edilmez. Tarayıcının çökmesi, moderasyonun kapanması demek
 *    olamaz.
 *
 * B. CSAM İSTİSNASIZDIR. Bilinen karma eşleşmesi (hash-match) veya reşit
 *    olmayan + cinsel sinyal birleşimi tek yol izler: içerik anında bloke,
 *    hesap anında askıya, olay en yüksek öncelikle eskalasyon kuyruğuna.
 *    Eşik ayarı, opt-in, yetişkin akışı veya "inceleme sonrası" YOKTUR.
 *    Bu karar hiçbir yapılandırmayla gevşetilemez — eşikler tablosunda bile
 *    yer almaz, çünkü yapılandırılabilir olan gevşetilebilir demektir.
 *
 * C. TARAMA RENDER'DAN ÖNCEDİR. `moderationState` 'approved' olmayan hiçbir
 *    içerik akışa, hikaye rafına veya sohbete düşmez. Yükleme başarılı olsa
 *    bile içerik `pending` durumunda bekler.
 */

'use strict';

const crypto = require('crypto');

// ------------------------------------------------------------------ eşikler ----

/**
 * Kategori eşikleri.
 *
 * CSAM burada YOK — kasıtlı. Bkz. Değişmez B: yapılandırılabilir olan
 * gevşetilebilir. Karma eşleşmesi ve reşit olmayan + cinsel sinyal birleşimi
 * `decideIngest` içinde sabit kodludur.
 */
const THRESHOLDS = Object.freeze({
  /** Bu ve üzeri: yetişkin işaretli, reşit olmayana hiç gönderilmez. */
  adult: 0.85,
  /** Bu ve üzeri: insan incelemesi beklenir, kimseye gösterilmez. */
  review: 0.5,
  /** Grafik şiddet — hikayelerde yetişkin akışında bile gösterilmez. */
  graphicViolence: 0.7,
  /** Reşit olmayanın tehlike/istismar bağlamı — eskalasyon eşiği. */
  minorInDistress: 0.4,
  /** Reşit olmayan görünüm — tek başına ihlal DEĞİL. */
  apparentMinor: 0.35,
  /** Cinsel sinyal — reşit olmayanla birleştiğinde CSAM yoludur. */
  sexualSignal: 0.3,
});

/** Karar sonuçları. */
const OUTCOME = Object.freeze({
  /** Render edilebilir. */
  APPROVE: 'approve',
  /** Render EDİLMEZ; insan incelemesi bekler. */
  QUARANTINE: 'quarantine',
  /** Render EDİLMEZ; içerik kaldırılır, hesap askıya alınır, eskalasyon. */
  BLOCK: 'block',
});

/** Kuyruk öncelikleri — SLA süreleri core_gateway/moderation/queue.js'de. */
const PRIORITY = Object.freeze({
  CRITICAL: 'critical',
  HIGH: 'high',
  NORMAL: 'normal',
});

// ------------------------------------------------------- saf karar çekirdeği ----

/**
 * Skoru 0..1 aralığına sıkıştırır.
 *
 * İKİ FARKLI "YOK" AYRIMI — bu ayrım kaybolursa politika çöker:
 *
 *   YOK (undefined): sağlayıcı bu etiketi hiç döndürmedi → 0.
 *     `scannerClient.toSignals` her etiketi doldurur; eksik etiket, modelin
 *     o kavramı bilmediği anlamına gelir. Bilinmeyen bir etiketi 1 saymak,
 *     her içeriği bloke eder — yani moderasyonu kapatmakla aynı sonucu
 *     (kimse yayınlayamaz) farklı bir yönden üretir.
 *
 *   BOZUK (sayı değil, NaN, Infinity, null): etiket GELDİ ama anlamsız → 1.
 *     Sağlayıcı bozuk yanıt üretiyorsa güvenli taraf en yüksek skordur.
 */
function score(raw) {
  if (raw === undefined) return 0;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 1;
  return Math.min(1, Math.max(0, raw));
}

/**
 * Tarama sonucundan karar üretir.
 *
 * @param {object|null} scan  Sağlayıcı yanıtı; null/eksik ise fail-closed.
 * @param {{ kind: 'story'|'dm-attachment'|'post'|'template' }} ctx
 * @returns {{ outcome: string, rating: string, reasons: string[],
 *             priority: string|null, escalate: boolean, suspendAuthor: boolean }}
 */
function decideIngest(scan, ctx) {
  const reasons = [];
  void ctx;

  // --- Değişmez A: tarayıcı çalışmadıysa içerik temiz değildir --------------
  if (!scan || scan.scannerRan !== true) {
    return {
      outcome: OUTCOME.QUARANTINE,
      rating: 'review',
      reasons: ['scanner_unavailable'],
      priority: PRIORITY.NORMAL,
      escalate: false,
      suspendAuthor: false,
    };
  }

  const s = scan.signals ?? {};
  const apparentMinor = score(s.apparentMinor);
  const sexual = Math.max(
    score(s.sexualAct),
    score(s.exposedGenitalia),
    score(s.exposedAnus),
    score(s.exposedFemaleNipple),
  );

  // --- Değişmez B: CSAM tek yol -------------------------------------------
  // 1) Bilinen karma eşleşmesi: sağlayıcının doğrulanmış listesi. Skor yok,
  //    eşik yok, tartışma yok.
  if (scan.knownCsamHashMatch === true) {
    return {
      outcome: OUTCOME.BLOCK,
      rating: 'blocked',
      reasons: ['csam_hash_match'],
      priority: PRIORITY.CRITICAL,
      escalate: true,
      suspendAuthor: true,
    };
  }

  // 2) Sınıflandırıcı birleşimi: reşit olmayan görünüm + cinsel sinyal.
  //    Eşikler bilerek DÜŞÜK. Bu kapıda yanlış pozitifin bedeli bir insanın
  //    içeriği incelemesidir; yanlış negatifin bedeli bir çocuğun istismar
  //    görüntüsünün yayınlanmasıdır. Bu iki bedel kıyaslanamaz.
  if (apparentMinor >= THRESHOLDS.apparentMinor && sexual >= THRESHOLDS.sexualSignal) {
    return {
      outcome: OUTCOME.BLOCK,
      rating: 'blocked',
      reasons: ['apparent_minor_sexual_content'],
      priority: PRIORITY.CRITICAL,
      escalate: true,
      suspendAuthor: true,
    };
  }

  // 3) Tehlike altındaki reşit olmayan (istismar, şiddet, öz zarar bağlamı).
  //    Cinsel içerik değil — ama insan gözü gerektirir ve beklemez.
  if (
    apparentMinor >= THRESHOLDS.apparentMinor &&
    score(s.minorInDistress) >= THRESHOLDS.minorInDistress
  ) {
    return {
      outcome: OUTCOME.BLOCK,
      rating: 'blocked',
      reasons: ['minor_in_distress'],
      priority: PRIORITY.CRITICAL,
      escalate: true,
      suspendAuthor: false,
    };
  }

  // --- Rızasız mahrem görüntü ---------------------------------------------
  if (score(s.nonConsensualIntimate) >= THRESHOLDS.review) {
    return {
      outcome: OUTCOME.BLOCK,
      rating: 'blocked',
      reasons: ['nonconsensual_intimate'],
      priority: PRIORITY.CRITICAL,
      escalate: true,
      suspendAuthor: true,
    };
  }

  // --- Grafik şiddet -------------------------------------------------------
  if (score(s.graphicViolence) >= THRESHOLDS.graphicViolence) {
    return {
      outcome: OUTCOME.BLOCK,
      rating: 'blocked',
      reasons: ['graphic_violence'],
      priority: PRIORITY.HIGH,
      escalate: false,
      suspendAuthor: false,
    };
  }
  if (score(s.graphicViolence) >= THRESHOLDS.review) {
    reasons.push('violence_review');
  }

  // --- Yetişkin içerik -----------------------------------------------------
  // Mayo, spor taytı ve plaj kıyafeti NSFW DEĞİLDİR. Sağlayıcı bunları ayrı
  // sinyal olarak döndürür; cinsel sinyali bastırırlar (eşik altındayken).
  const clothingContext = Math.max(score(s.swimwear), score(s.athleticwear));
  const suppressed = clothingContext >= 0.6 && sexual < THRESHOLDS.adult;
  const effectiveSexual = suppressed ? 0 : sexual;

  if (effectiveSexual >= THRESHOLDS.adult) {
    // DM eki ve hikaye için yetişkin içerik yalnızca yetişkin alıcıya gider;
    // karar burada 'adult', görünürlük kalkanı gerisini yapar.
    return {
      outcome: OUTCOME.APPROVE,
      rating: 'adult',
      reasons: ['adult_content'],
      priority: null,
      escalate: false,
      suspendAuthor: false,
    };
  }

  if (effectiveSexual >= THRESHOLDS.review || reasons.length > 0) {
    return {
      outcome: OUTCOME.QUARANTINE,
      rating: 'review',
      reasons: reasons.length > 0 ? reasons : ['sexual_content_review'],
      priority: PRIORITY.NORMAL,
      escalate: false,
      suspendAuthor: false,
    };
  }

  // --- Temiz ---------------------------------------------------------------
  // Derece adı İSTEMCİNİN sözlüğünden gelir (`ContentRating.ts`): general,
  // sensitive, adult, review, blocked. Burada 'safe' yazmak iki hata
  // üretiyordu: (1) istemcinin tip birliğinde olmayan bir değer — ileride
  // biri dereceler üzerinde exhaustive switch yazarsa varsayılan dala
  // düşer ve fail-open/fail-closed davranışı kazara belirlenir; (2) 'safe'
  // bu kod tabanında zaten YAŞ KADEMESİ anlamına geliyor (AgePolicy), yani
  // aynı kelime iki farklı kavramı gösteriyordu.
  return {
    outcome: OUTCOME.APPROVE,
    rating: 'general',
    reasons: [],
    priority: null,
    escalate: false,
    suspendAuthor: false,
  };
}

// ------------------------------------------------------------------- kapı ----

/** Medya karmasının log'a yazılabilir kısaltması. */
function fingerprint(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

/**
 * Tarama + karar + yan etki uygulaması.
 *
 * @param {object} deps
 *   - scanMedia(mediaRef)      → sağlayıcı çağrısı
 *   - setModerationState(...)  → içeriğin render durumunu yazar
 *   - enqueueReview(...)       → core_gateway moderasyon kuyruğu
 *   - escalate(...)            → yasal bildirim hattı (CSAM)
 *   - suspendAccount(...)      → anında ban-hammer
 */
async function scanAndGate(deps, { contentId, authorId, mediaRef, kind, nowMs }) {
  let scan = null;
  try {
    scan = await deps.scanMedia({ mediaRef, kind });
  } catch (err) {
    // Sağlayıcı hatası yutulur AMA karar fail-closed kalır. Hatayı fırlatmak
    // yüklemeyi 500'e düşürürdü; kullanıcı tekrar dener ve aynı taranmamış
    // içerik tekrar gelir. Karantina hem güvenli hem ilerletici.
    console.error(`[ModerationProxy] tarayıcı hatası media=${fingerprint(mediaRef)}:`, err.message);
    scan = null;
  }

  const decision = decideIngest(scan, { kind });

  const state =
    decision.outcome === OUTCOME.APPROVE
      ? 'approved'
      : decision.outcome === OUTCOME.BLOCK
        ? 'blocked'
        : 'pending';

  await deps.setModerationState({
    contentId,
    kind,
    state,
    rating: decision.rating,
    reasons: decision.reasons,
    scannedAtMs: nowMs,
  });

  if (decision.suspendAuthor) {
    // Askıya alma İNCELEMEYİ BEKLEMEZ. Ters sıra (önce incele, sonra askıya
    // al), CSAM için kabul edilemez bir gecikme penceresi açar.
    await deps.suspendAccount({
      userId: authorId,
      reason: decision.reasons[0],
      automatic: true,
      atMs: nowMs,
    });
  }

  if (decision.priority) {
    await deps.enqueueReview({
      contentId,
      authorId,
      kind,
      priority: decision.priority,
      reasons: decision.reasons,
      source: 'proxy',
      createdAtMs: nowMs,
    });
  }

  if (decision.escalate) {
    // Yasal bildirim hattı. Medyanın kendisi bu çağrıda TAŞINMAZ; yalnızca
    // saklama referansı ve karma gider.
    await deps.escalate({
      contentId,
      authorId,
      reasons: decision.reasons,
      mediaFingerprint: fingerprint(mediaRef),
      atMs: nowMs,
    });
  }

  return { ...decision, state };
}

module.exports = {
  THRESHOLDS,
  OUTCOME,
  PRIORITY,
  decideIngest,
  scanAndGate,
};
