/**
 * server/revenuecat-webhook.example.js
 *
 * AMAÇ: Abonelik doğrulamasını CLIENT'a değil SUNUCUYA yaptırmak.
 * RevenueCat, satın alma/yenileme/iptal/fatura-uyuşmazlığı gibi her olayda
 * bu endpoint'e POST atar. Böylece "isPro" durumu tek doğruluk kaynağı
 * (source of truth) olarak backend veritabanında tutulur — kullanıcı
 * cihazındaki JS state'i asla güvenilir kabul edilmez (cihaz jailbreak/root
 * olsa bile abonelik durumu sahtelenemez).
 *
 * Kurulum: RevenueCat Dashboard > Project > Integrations > Webhooks
 *   URL: https://api.evengirl.app/v1/webhooks/revenuecat
 *   Authorization header: process.env.REVENUECAT_WEBHOOK_AUTH_HEADER ile aynı değer
 *
 * NOT: Bu bir örnek/iskelettir — framework'ünüze (Express burada örnek
 * olarak kullanılmıştır) göre uyarlayın. express.raw() kullanmak önemlidir;
 * express.json() body'yi önceden parse ederse imza/gövde doğrulaması için
 * ham veriye ihtiyaç duyan alternatif doğrulama şemalarını kırar.
 */

const express = require('express');
const router = express.Router();

// Basit ama etkili: RevenueCat, dashboard'da belirlediğiniz paylaşılan
// secret'ı Authorization header'ı olarak gönderir. Bunu sabit zamanlı
// (timing-safe) karşılaştırmayla doğrulayın — timing saldırılarına karşı.
const crypto = require('crypto');

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

router.post(
  '/webhooks/revenuecat',
  express.json(),
  async (req, res) => {
    // 1) Kimlik doğrulama — paylaşılan secret eşleşmiyorsa hemen reddet
    const authHeader = req.headers['authorization'] || '';
    const expected = process.env.REVENUECAT_WEBHOOK_AUTH_HEADER;

    if (!expected || !timingSafeEqual(authHeader, expected)) {
      console.warn('[RevenueCat Webhook] Invalid auth header — rejected');
      return res.status(401).json({ error: 'unauthorized' });
    }

    const event = req.body?.event;
    if (!event) {
      return res.status(400).json({ error: 'missing event payload' });
    }

    const { type, app_user_id: appUserId } = event;

    // Kimliksiz olay İŞLENMEZ.
    //
    // `app_user_id` yoksa depoya `undefined` birincil anahtarla yazma
    // denenir: SQLite bunu NULL'a çevirip kabul edebilir, PostgreSQL
    // reddeder. İki motorda farklı davranan bir hata, üretimde bulunması en
    // zor hatadır. Burada AÇIKÇA reddediliyor.
    if (typeof appUserId !== 'string' || appUserId.length === 0) {
      console.warn('[RevenueCat Webhook] app_user_id yok — olay işlenmedi');
      return res.status(400).json({ error: 'missing_app_user_id' });
    }

    try {
      // HER YARDIMCI TÜM OLAYI ALIR.
      //
      // Daha önce buradan `(appUserId, entitlementIds, expirationAtMs)` gibi
      // konumsal argümanlar geçiliyordu ama yardımcılar `(event)` bekliyordu.
      // Sonuç: `event.app_user_id` bir STRING üzerinde okunuyor, `undefined`
      // dönüyor ve HİÇBİR satın alma yetkiye dönüşmüyordu. Yani ödeme yapan
      // kullanıcı PRO olmuyordu ve hiçbir yerde hata görünmüyordu.
      switch (type) {
        case 'INITIAL_PURCHASE':
        case 'RENEWAL':
        case 'UNCANCELLATION':
        case 'PRODUCT_CHANGE':
          await grantEntitlement(event);
          break;

        case 'CANCELLATION':
          // Kullanıcı iptal etti ama süre dolana kadar erişimi devam eder;
          // burada sadece "will_renew=false" işaretlenir, erişim EXPIRATION'da kesilir.
          await markWillNotRenew(event);
          break;

        case 'EXPIRATION':
          await revokeEntitlement(event);
          break;

        case 'BILLING_ISSUE':
          await flagBillingIssue(event);
          break;

        default:
          console.log(`[RevenueCat Webhook] Unhandled event type: ${type}`);
      }

      // RevenueCat 5 saniye içinde 2xx bekler; aksi halde yeniden dener
      return res.status(200).json({ received: true });
    } catch (err) {
      console.error('[RevenueCat Webhook] Processing failed:', err);
      // 5xx dönerseniz RevenueCat webhook'u tekrar dener — idempotent tasarlayın
      return res.status(500).json({ error: 'processing_failed' });
    }
  }
);

// ---- Depo yazımları -------------------------------------------------
//
// Her fonksiyon OLAYIN TAMAMINI alır. Alan çıkarımı tek yerde yapılır;
// çağrı yerinde konumsal argüman dizmek, sessizce yanlış alanı geçirmenin
// en kolay yoludur (bkz. yukarıdaki yorum).

async function grantEntitlement(event) {
  const { getRepositories } = require('../persistence/registry');
  const repositories = getRepositories();

  const appUserId = event.app_user_id ?? event.appUserId;
  const productId = event.product_id ?? event.productId ?? null;
  const expiresAtMs = event.expiration_at_ms ?? event.expiresAtMs ?? null;

  // `period_type` mağazadan gelir: 'TRIAL' | 'INTRO' | 'NORMAL'.
  // Kaydedilmezse `inTrial` her zaman false döner ve deneme sürümündeki
  // kullanıcıya özel metin hiç gösterilmez.
  const periodType = String(event.period_type ?? event.periodType ?? 'normal').toLowerCase();

  await repositories.grantEntitlement({
    appUserId,
    productId,
    expiresAtMs,
    status: 'active',
    periodType: ['trial', 'intro'].includes(periodType) ? periodType : 'normal',
  });

  // ÜRÜN BAZINDA DA KAYDEDİLİR.
  //
  // `entitlements` kullanıcı başına TEK satırdır ve PRO durumunu özetler.
  // Creator abonelikleri ayrı ürünlerdir; PRO satırına bakarak creator
  // erişimi vermek, PRO alan herkese ÜCRETSİZ creator erişimi vermek olurdu.
  if (productId) {
    await repositories.recordPurchase({ appUserId, productId, expiresAtMs, status: 'active' });
  }
}

async function markWillNotRenew(event) {
  // İPTAL, ERİŞİMİ HEMEN KAPATMAZ: kullanıcı ödediği dönemin sonuna kadar
  // PRO kalır. Anında kapatmak, ödenmiş bir hizmeti geri almaktır.
  const { getRepositories } = require('../persistence/registry');
  await getRepositories().setEntitlementStatus(
    event.app_user_id ?? event.appUserId, 'will_not_renew',
  );
}

async function revokeEntitlement(event) {
  const { getRepositories } = require('../persistence/registry');
  const repositories = getRepositories();
  const appUserId = event.app_user_id ?? event.appUserId;
  const productId = event.product_id ?? event.productId ?? null;

  await repositories.revokeEntitlement(appUserId);

  // Ürün kaydı SİLİNMEZ, süresi dolmuş olarak işaretlenir: satın alma
  // geçmişi kullanıcının kendi kaydıdır ve iade/itiraz durumunda gerekir.
  if (productId) await repositories.expirePurchase(appUserId, productId);
}

async function flagBillingIssue(event) {
  // Kartı reddedilen abone grace period'a düşer; PRO hemen kapanmaz.
  const { getRepositories } = require('../persistence/registry');
  await getRepositories().setEntitlementStatus(
    event.app_user_id ?? event.appUserId, 'billing_issue',
  );
}

module.exports = router;
