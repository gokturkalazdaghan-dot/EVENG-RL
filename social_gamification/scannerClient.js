/**
 * social_gamification/scannerClient.js
 *
 * Moderasyon tarayıcısı istemcisi.
 *
 * İKİ HAT, TEK YANIT
 *   1. Karma eşleşmesi (hash-match): yüklenen medyanın PDQ/MD5 karması,
 *      bilinen CSAM karma listesine sorulur. Bu hat SINIFLANDIRICI DEĞİLDİR;
 *      eşleşme kesin bilgidir ve `knownCsamHashMatch: true` döndürür.
 *   2. Sınıflandırıcı: NSFW / şiddet / reşit olmayan sinyalleri.
 *
 * Karma hattı ÖNCE çalışır ve eşleşirse sınıflandırıcı hiç çağrılmaz —
 * bilinen materyali yeniden sınıflandırmak hem gereksiz hem de sınıflandırıcı
 * yanlış negatif verirse eşleşmeyi gölgeleyebilir.
 *
 * ZAMAN AŞIMI FAIL-CLOSED'DIR
 * Tarayıcı zamanında yanıt vermezse `scannerRan: false` döner ve
 * `decideIngest` içeriği karantinaya alır. Yavaş tarayıcı, açık kapı değildir.
 */

'use strict';

const SCAN_TIMEOUT_MS = 8000;

/** Sağlayıcının etiketlerini politika sinyallerine çevirir. */
function toSignals(raw) {
  const read = (key) => {
    const value = raw?.[key];
    return typeof value === 'number' && Number.isFinite(value)
      ? Math.min(1, Math.max(0, value))
      : 0;
  };
  return {
    sexualAct: read('sexual_activity'),
    exposedGenitalia: read('exposed_genitalia'),
    exposedAnus: read('exposed_anus'),
    exposedFemaleNipple: read('exposed_female_nipple'),
    swimwear: read('swimwear'),
    athleticwear: read('athleticwear'),
    apparentMinor: read('apparent_minor'),
    minorInDistress: read('minor_in_distress'),
    graphicViolence: read('graphic_violence'),
    nonConsensualIntimate: read('nonconsensual_intimate'),
  };
}

async function withTimeout(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {object} cfg
 *   - hashLookup(perceptualHash) → { match: boolean }
 *   - classify(mediaRef)         → { labels: Record<string, number> }
 *   - perceptualHash(mediaRef)   → string
 */
function createScanner(cfg) {
  return async function scanMedia({ mediaRef, kind }) {
    // --- Hat 1: bilinen karma -------------------------------------------
    const hash = await withTimeout(cfg.perceptualHash(mediaRef), SCAN_TIMEOUT_MS, 'hash');
    const lookup = await withTimeout(cfg.hashLookup(hash), SCAN_TIMEOUT_MS, 'hash_lookup');

    if (lookup?.match === true) {
      return { scannerRan: true, knownCsamHashMatch: true, signals: {}, perceptualHash: hash };
    }

    // --- Hat 2: sınıflandırıcı ------------------------------------------
    const result = await withTimeout(cfg.classify({ mediaRef, kind }), SCAN_TIMEOUT_MS, 'classify');

    if (!result || typeof result.labels !== 'object' || result.labels === null) {
      // Anlamsız yanıt, yanıtsızlıkla aynıdır.
      return { scannerRan: false, knownCsamHashMatch: false, signals: {} };
    }

    return {
      scannerRan: true,
      knownCsamHashMatch: false,
      signals: toSignals(result.labels),
      perceptualHash: hash,
    };
  };
}

module.exports = { createScanner, toSignals, SCAN_TIMEOUT_MS };
