/**
 * reward_automation/scoring.js
 *
 * Redis ZSET tabanlı haftalık etkileşim puanlama.
 *
 * NEDEN ZSET: Sıralı küme, puan güncellemesini O(log N) ve ilk N sorgusunu
 * O(log N + N) yapar. Haftalık sıralamayı her istekte SQL ile hesaplamak,
 * kullanıcı sayısı arttıkça doğrusal olarak pahalılaşır ve akış gecikmesine
 * yansır.
 *
 * ANAHTAR ŞEMASI
 *   evengirl:lb:{YYYY-WW}          ZSET  userId -> puan
 *   evengirl:lb:{YYYY-WW}:at       HASH  userId -> puana ilk ulaşma zamanı (ms)
 *   evengirl:lb:rewarded:{YYYY-WW} SET   ödül dağıtılmış hafta işareti
 *
 * Hafta anahtarı UTC ISO haftasıdır: yerel saatle hesaplamak, sıralamanın
 * kullanıcının saat dilimine göre farklı anlarda dönmesine yol açar.
 */

/** Etkileşim türlerinin puan ağırlıkları. */
const SCORE_WEIGHTS = Object.freeze({
  post_created: 5,
  post_liked: 1,
  story_viewed: 0.2,
  template_used: 3,
  follower_gained: 2,
  creator_subscribed: 25,
});

/** ISO hafta anahtarı (UTC): "2026-W25". */
function weekKey(nowMs = Date.now()) {
  const date = new Date(nowMs);
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

  // ISO 8601: haftanın Perşembesi hangi yıldaysa hafta o yıla aittir.
  const dayNumber = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);

  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);

  const week = 1 + Math.round((target - firstThursday) / (7 * 24 * 60 * 60 * 1000));
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const zsetKey = (week) => `evengirl:lb:${week}`;
const reachedAtKey = (week) => `evengirl:lb:${week}:at`;
const rewardedKey = (week) => `evengirl:lb:rewarded:${week}`;

/**
 * Etkileşimi puana çevirip ZSET'e ekler.
 *
 * `HSETNX` ile ilk puanlama zamanı YALNIZCA BİR KEZ yazılır: eşit puandaki
 * kullanıcılarda önce ulaşanın üstte olması bu değere dayanır.
 */
async function recordInteraction(redis, { userId, kind, nowMs = Date.now() }) {
  const weight = SCORE_WEIGHTS[kind];
  if (weight === undefined) throw new Error(`Bilinmeyen etkileşim: ${kind}`);

  const week = weekKey(nowMs);

  await redis
    .multi()
    .zincrby(zsetKey(week), weight, userId)
    .hsetnx(reachedAtKey(week), userId, String(nowMs))
    // Anahtarlar 5 hafta sonra düşer: geçmiş sıralamaları sonsuza kadar
    // tutmak bellek maliyetidir ve ürün gereksinimi değildir.
    .expire(zsetKey(week), 35 * 24 * 60 * 60)
    .expire(reachedAtKey(week), 35 * 24 * 60 * 60)
    .exec();

  return week;
}

/** İlk N kullanıcı, puanı azalan sırada. */
async function topN(redis, { limit = 100, nowMs = Date.now() } = {}) {
  const week = weekKey(nowMs);
  const raw = await redis.zrevrange(zsetKey(week), 0, limit - 1, 'WITHSCORES');
  const reachedAt = await redis.hgetall(reachedAtKey(week));

  const entries = [];
  for (let i = 0; i < raw.length; i += 2) {
    entries.push({
      userId: raw[i],
      weeklyScore: Number(raw[i + 1]),
      scoreReachedAtMs: Number(reachedAt[raw[i]] ?? 0),
    });
  }

  // Redis eşit puanları sözlük sırasına göre döndürür; ürün kuralı "önce
  // ulaşan üstte" olduğu için yeniden sıralıyoruz.
  entries.sort((a, b) => {
    if (b.weeklyScore !== a.weeklyScore) return b.weeklyScore - a.weeklyScore;
    if (a.scoreReachedAtMs !== b.scoreReachedAtMs) return a.scoreReachedAtMs - b.scoreReachedAtMs;
    return a.userId.localeCompare(b.userId);
  });

  return entries.map((entry, index) => ({ ...entry, rank: index + 1 }));
}

module.exports = {
  SCORE_WEIGHTS,
  weekKey,
  zsetKey,
  reachedAtKey,
  rewardedKey,
  recordInteraction,
  topN,
};
