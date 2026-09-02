/**
 * reward_automation/rewardWorker.js
 *
 * Haftalık ödül dağıtımı — her Pazartesi 00:00 UTC.
 *
 * ÖDÜL KADEMELERİ
 *   1-10  : 7 gün ücretsiz PRO
 *   11-20 : 3 gün ücretsiz PRO
 *
 * MAĞAZA UYUMLULUĞU — bu dosyanın en önemli kuralı
 * Ödül, veritabanına `pro_expiry_date` yazılarak VERİLMEZ. Backend'in kendi
 * kaydına PRO yazmak, dijital malı mağazanın ödeme sistemi dışında dağıtmak
 * demektir (Apple 3.1.1 / Google Play Payments ihlali) ve kullanıcı o
 * "PRO"yu Ayarlar > Abonelikler altında göremez, iptal edemez, geri
 * yükleyemez.
 *
 * Onun yerine mağazanın kendi promosyon kodu üretilir ve kullanıcıya push
 * ile gönderilir. Abonelik NATIVE ödeme sayfasında, mağazada oluşur.
 *
 * TEK SEFERLİK GARANTİSİ
 * Cron birden fazla örnekte çalışabilir ve yeniden deneme yapabilir.
 * `SET NX` ile hafta başına bir kilit alınır. Ayrıca kod üretimi kullanıcı
 * başına da işaretlenir: kilit alındıktan sonra kısmi bir hata olursa,
 * yeniden çalıştırmada zaten kod almış kullanıcıya ikinci kod çıkmaz.
 */

const { rewardedKey, topN, weekKey } = require('./scoring');
const { issueRewardCode, storeForUser } = require('./promoCodes');

/** Sıra numarasına göre kaç gün ücretsiz PRO verilir. */
const REWARD_TIERS = Object.freeze([
  { minRank: 1, maxRank: 10, freeProDays: 7 },
  { minRank: 11, maxRank: 20, freeProDays: 3 },
]);

/**
 * Ödüle giren en düşük sıra.
 *
 * `Math.max` ile türetilir, "son elemanın maxRank'i" ile DEĞİL: ikincisi
 * dizinin sıralı olduğunu varsayar. Kademeler yeniden sıralandığında limit
 * sessizce küçülür ve alt kademedeki kazananlar hiç sorgulanmadığı için
 * ödüllerini alamazdı — üretimde ancak "ödülüm gelmedi" şikâyetiyle
 * fark edilirdi.
 */
const MAX_REWARD_RANK = Math.max(...REWARD_TIERS.map((tier) => tier.maxRank));

function rewardDaysFor(rank) {
  const tier = REWARD_TIERS.find((candidate) => rank >= candidate.minRank && rank <= candidate.maxRank);
  return tier ? tier.freeProDays : 0;
}

/** En son TAMAMLANMIŞ haftanın anahtarı (cron Pazartesi çalışır). */
function previousWeekKey(nowMs = Date.now()) {
  return weekKey(nowMs - 7 * 24 * 60 * 60 * 1000);
}

/** Kullanıcı başına kod verildi işareti — kısmi hatada tekrarı önler. */
const issuedKey = (week, userId) => `evengirl:lb:issued:${week}:${userId}`;

/**
 * Ödülleri dağıtır.
 *
 * @param redis          Redis istemcisi
 * @param deps.storeClient  Mağaza promosyon API sarmalayıcısı
 * @param deps.loadAccount  userId -> { store, platform, pushToken }
 * @param deps.sendPush     Kullanıcıya kullanım bağlantısını iletir
 * @param deps.recordAward  Denetim kaydı (kodun KENDİSİ saklanmaz)
 */
async function distributeWeeklyRewards(redis, deps, { nowMs = Date.now() } = {}) {
  const { storeClient, loadAccount, sendPush, recordAward } = deps;
  const week = previousWeekKey(nowMs);

  // Kilit: hafta başına bir kez. 7 gün TTL, bir sonraki haftaya sarkmaz.
  const acquired = await redis.set(rewardedKey(week), '1', 'NX', 'EX', 7 * 24 * 60 * 60);
  if (acquired !== 'OK') {
    console.log(`[Rewards] ${week} zaten dağıtılmış — atlanıyor`);
    return { week, issued: 0, skipped: true, failures: 0 };
  }

  const winners = await topN(redis, {
    limit: MAX_REWARD_RANK,
    nowMs: nowMs - 7 * 24 * 60 * 60 * 1000,
  });

  let issued = 0;
  let failures = 0;

  for (const winner of winners) {
    const days = rewardDaysFor(winner.rank);
    if (days === 0) continue;

    // Kullanıcı başına tekrar koruması: kısmi hata sonrası yeniden
    // çalıştırmada bu kullanıcıya ikinci kod çıkmaz.
    const marked = await redis.set(issuedKey(week, winner.userId), '1', 'NX', 'EX', 40 * 24 * 60 * 60);
    if (marked !== 'OK') continue;

    try {
      const account = await loadAccount(winner.userId);
      const store = storeForUser(account);

      const reward = await issueRewardCode(storeClient, {
        userId: winner.userId,
        days,
        store,
        nowMs,
      });

      // Push YALNIZCA kullanım bağlantısını taşır; kodun kendisi bildirim
      // gövdesinde düz metin gitmez (bildirim kilit ekranında görünür).
      await sendPush({
        userId: winner.userId,
        titleKey: 'reward.push.title',
        bodyKey: 'reward.push.body',
        params: { days, rank: winner.rank },
        deepLink: reward.redemptionUrl,
      });

      // Denetim kaydı: kodun KENDİSİ saklanmaz, yalnızca parmak izi.
      await recordAward({
        week,
        userId: winner.userId,
        rank: winner.rank,
        days,
        store: reward.store,
        offerId: reward.offerId,
        codeFingerprint: reward.codeFingerprint,
        expiresAtMs: reward.expiresAtMs,
      });

      issued += 1;
    } catch (err) {
      failures += 1;
      // Tek kullanıcı için hata diğerlerini engellemez. İşaret geri alınır ki
      // bir sonraki çalıştırmada yeniden denensin.
      await redis.del(issuedKey(week, winner.userId));
      console.error(`[Rewards] ${winner.userId} kodu üretilemedi:`, err.message);
    }
  }

  console.log(`[Rewards] ${week} — ${issued} kod dağıtıldı, ${failures} hata`);
  return { week, issued, skipped: false, failures };
}

module.exports = {
  REWARD_TIERS,
  MAX_REWARD_RANK,
  rewardDaysFor,
  previousWeekKey,
  issuedKey,
  distributeWeeklyRewards,
};
