/**
 * reward_automation/routes.js
 *
 * Ödül uçları — bekleyen kodları listeler ve kullanım bildirimini alır.
 *
 * KODUN KENDİSİ İSTEMCİYE GÖNDERİLMEZ. Yalnızca mağaza kullanım bağlantısı
 * gider; kod, kullanıcı tarafından NATIVE sayfada girilir. Kodu uygulamaya
 * indirmek, ekran görüntüsü ve pano üzerinden sızma yüzeyi açar.
 */

const express = require('express');

const { getRepositories } = require('../persistence/registry');

const router = express.Router();

/** ISO hafta anahtarı — `scoring.weekKey` ile aynı biçim (ör. 2026-W35). */
const WEEK_KEY_PATTERN = /^\d{4}-W\d{2}$/;

/** Bekleyen (kullanılmamış, süresi dolmamış) ödüller. */
router.get('/rewards/pending', async (req, res) => {
  const appUserId = req.headers['x-app-user-id'];
  if (!appUserId || typeof appUserId !== 'string' || appUserId.length > 128) {
    return res.status(400).json({ error: 'invalid_app_user_id' });
  }

  try {
    const awards = await loadPendingAwards(appUserId);
    const now = Date.now();

    const rewards = awards
      .filter((award) => !award.acknowledgedAtMs && award.expiresAtMs > now)
      .map((award) => ({
        week: award.week,
        rank: award.rank,
        days: award.days,
        // Bağlantı gider, kod gitmez.
        redemptionUrl: award.redemptionUrl,
        expiresAtMs: award.expiresAtMs,
      }));

    return res.status(200).json({ rewards });
  } catch (err) {
    console.error('[Rewards] bekleyenler okunamadı:', err.message);
    return res.status(500).json({ error: 'pending_failed' });
  }
});

/**
 * Kullanım bildirimi.
 *
 * İstemcinin "kullandım" demesi TEK BAŞINA yeterli değildir; kaydı yalnızca
 * "kullanıcıya tekrar gösterme" işareti olarak kullanıyoruz. Aboneliğin
 * gerçekten oluşup oluşmadığına RevenueCat webhook'u karar verir.
 */
router.post('/rewards/acknowledge', express.json(), async (req, res) => {
  const appUserId = req.headers['x-app-user-id'];
  const { week } = req.body ?? {};

  // Hafta anahtarı doğrudan bir veritabanı anahtarına giriyor. `scoring.js`
  // biçimi ISO haftasıdır (2026-W35); "boş değil" kontrolü bir nesne veya
  // dizinin anahtar olarak kullanılmasına izin veriyordu.
  if (!appUserId || typeof week !== 'string' || !WEEK_KEY_PATTERN.test(week)) {
    return res.status(400).json({ error: 'invalid_request' });
  }

  await markAcknowledged(appUserId, week);
  return res.status(200).json({ ok: true });
});

// ---- Örnek repository fonksiyonları ----

const repo = () => getRepositories();

async function loadPendingAwards(appUserId) {
  return repo().loadPendingAwards(appUserId);
}
async function markAcknowledged(appUserId, week) {
  return repo().markAcknowledged(appUserId, week);
}

module.exports = router;
