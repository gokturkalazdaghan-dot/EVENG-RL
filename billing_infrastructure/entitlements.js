/**
 * server/entitlements.js
 *
 * AMAÇ: Abonelik durumunun OKUMA tarafı. Yazma tarafı RevenueCat webhook'udur
 * (revenuecat-webhook.example.js); burası o kaydı istemciye sunar ve ücretli
 * sunucu çağrıları için kısa ömürlü imzalı bir token üretir.
 *
 * TASARIM
 * İstemci "ben Pro'yum" diyemez. İstemcinin söyleyebildiği tek şey anonim
 * app_user_id'sidir; Pro olup olmadığına BURASI karar verir. Cihaz jailbreak
 * edilmiş, uygulama yamalanmış olsa bile bu uç noktanın cevabı değişmez.
 *
 * TOKEN NEDEN VAR
 * Ücretli AI çağrıları (uzak çıkarım) her istekte veritabanına gitmek yerine
 * bu token'ı doğrular — imza kontrolü tek bir HMAC hesabıdır, veritabanı
 * turu değildir. Ömrü kısadır (15 dk): iptal edilen bir abonelik en fazla bu
 * kadar süre erişimini sürdürebilir.
 *
 * GİZLİLİK
 * app_user_id, RevenueCat'in ürettiği anonim kimliktir; e-posta, cihaz
 * kimliği veya reklam kimliği DEĞİLDİR. Loglara ham hâliyle yazılmaz.
 */

const express = require('express');
const crypto = require('crypto');

const router = express.Router();

/** Token ömrü. Kısa tutmanın maliyeti: 15 dakikada bir ek istek. */
const TOKEN_TTL_MS = 15 * 60 * 1000;

/** Anonim kimliğin log'a yazılabilir kısaltması (korelasyon için yeterli). */
function shortId(appUserId) {
  return crypto.createHash('sha256').update(String(appUserId)).digest('hex').slice(0, 8);
}

/**
 * İmzalı entitlement token'ı üretir.
 *
 * Biçim: base64url(payload).base64url(hmac)
 * JWT kütüphanesi kullanmıyoruz: burada ihtiyaç duyulan tek şey HMAC'tir ve
 * JWT'nin `alg: none` sınıfı tuzaklarını taşımaya gerek yok.
 */
function issueToken(appUserId, isPro, expiresAtMs) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET tanımlı değil');

  const payload = {
    sub: appUserId,
    pro: isPro === true,
    // Token süresi, aboneliğin bitişini AŞAMAZ.
    exp: Math.min(Date.now() + TOKEN_TTL_MS, expiresAtMs ?? Number.MAX_SAFE_INTEGER),
  };

  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

/**
 * Token doğrulama — ücretli uçlar (uzak AI çıkarımı) bunu kullanır.
 * Express middleware olarak dışa aktarılır.
 */
function requireProEntitlement(req, res, next) {
  const token = req.headers['x-entitlement'];
  if (!token || typeof token !== 'string') {
    return res.status(401).json({ error: 'entitlement_required' });
  }

  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) {
    return res.status(401).json({ error: 'malformed_token' });
  }

  const secret = process.env.JWT_SECRET;

  // Sır YAPILANDIRILMAMIŞSA uç çalışmaz.
  //
  // Bu kontrol olmadan `createHmac(..., undefined)` middleware'in İÇİNDE
  // fırlıyordu: yanlış yapılandırılmış bir dağıtımda ücretli her uç 500
  // döner, sebep yanıttan anlaşılmaz ve bazı Express kurulumlarında yığın
  // izi gövdeye sızabilirdi. `core_gateway/moderation/routes.js` aynı
  // durumda zaten 503 döndürüyor; iki yerin farklı davranması, birinin
  // yanlış olduğu anlamına geliyordu.
  if (typeof secret !== 'string' || secret.length === 0) {
    console.error('[Entitlements] JWT_SECRET tanımsız — ücretli uçlar kapalı');
    return res.status(503).json({ error: 'entitlement_unavailable' });
  }

  const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');

  // Sabit zamanlı karşılaştırma — imza tahmininde timing sızıntısını önler.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'invalid_signature' });
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return res.status(401).json({ error: 'malformed_payload' });
  }

  if (payload.exp <= Date.now()) {
    return res.status(401).json({ error: 'token_expired' });
  }
  if (payload.pro !== true) {
    return res.status(403).json({ error: 'entitlement_required' });
  }

  req.entitlement = payload;
  return next();
}

/**
 * GET /v1/entitlements/:appUserId
 *
 * İstemci açılışta ve ön plana dönüşte çağırır. Yanıt, istemcinin gösterdiği
 * kilitleri değil, SUNUCUNUN kaydını yansıtır.
 */
router.get('/entitlements/:appUserId', async (req, res) => {
  const { appUserId } = req.params;

  if (!appUserId || appUserId.length > 128) {
    return res.status(400).json({ error: 'invalid_app_user_id' });
  }

  try {
    const record = await loadEntitlement(appUserId);

    // Kayıt yoksa bu bir hata DEĞİLDİR: henüz satın alma yapmamış kullanıcı.
    if (!record) {
      return res.status(200).json({
        isPro: false,
        expiresAtMs: null,
        willRenew: false,
        inTrial: false,
        billingIssue: false,
        entitlementToken: issueToken(appUserId, false, null),
        issuedAtMs: Date.now(),
      });
    }

    // Süresi dolmuş kaydı "Pro" saymıyoruz: webhook gecikmiş olabilir.
    const isPro = record.expiresAtMs === null || record.expiresAtMs > Date.now();

    return res.status(200).json({
      isPro,
      expiresAtMs: record.expiresAtMs,
      willRenew: record.willRenew === true,
      inTrial: record.inTrial === true,
      billingIssue: record.billingIssue === true,
      entitlementToken: issueToken(appUserId, isPro, record.expiresAtMs),
      issuedAtMs: Date.now(),
    });
  } catch (err) {
    console.error(`[Entitlements] Okuma hatası user=${shortId(appUserId)}:`, err.message);
    // Hata detayı istemciye SIZDIRILMAZ.
    return res.status(500).json({ error: 'lookup_failed' });
  }
});

// ---- Örnek repository (kendi DB katmanınızla değiştirin) ----

/**
 * revenuecat-webhook.example.js içindeki grantEntitlement/revokeEntitlement
 * fonksiyonlarının yazdığı kaydı okur.
 *
 * db.entitlements.findUnique({ where: { appUserId } })
 */
async function loadEntitlement(appUserId) {
  const { getRepositories } = require('../persistence/registry');
  return getRepositories().loadEntitlement(appUserId);
}

module.exports = router;
module.exports.requireProEntitlement = requireProEntitlement;
