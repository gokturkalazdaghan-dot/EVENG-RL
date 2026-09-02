/**
 * server/server.js
 *
 * EVEN GIRL RevenueCat webhook için bağımsız (standalone) sunucu giriş
 * noktası. revenuecat-webhook.example.js dosyasındaki router'ı monte eder
 * ve Render (veya benzeri bir platform) tarafından atanan PORT'ta dinler.
 */

const express = require('express');
const webhookRouter = require('./billing_infrastructure/revenuecat-webhook');
const entitlementsRouter = require('./billing_infrastructure/entitlements');
const socialRouter = require('./social_gamification/social');
const exportGateRouter = require('./export_gate/quota');
const rewardsRouter = require('./reward_automation/routes');
const moderationRouter = require('./core_gateway/moderation/routes');
const aiStudioRouter = require('./core_gateway/ai_studio/routes');

const app = express();

app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'even-girl-revenuecat-webhook' });
});

app.use('/v1', webhookRouter);

// Abonelik durumunun okuma tarafı. Yazma tarafı yukarıdaki webhook'tur;
// mobil istemci (src/billing/EntitlementSync.ts) buradan doğrulanmış yetkiyi
// ve ücretli çağrılarda kullanacağı kısa ömürlü token'ı alır.
app.use('/v1', entitlementsRouter);

// Sosyal katman: akış, hikayeler, moderasyon, DM anahtar dağıtımı, sıralama.
// Görünürlük kalkanının BİRİNCİ savunma hattı buradadır — reşit olmayan bir
// hesaba +18 içerik hiç gönderilmez.
app.use('/v1', socialRouter);

// Dışa aktarım kapısı: tek ücretsiz indirme hakkı ve PRO tam çözünürlük.
// İstemci sayacı kullanıcı deneyimi için; gerçek kapı burasıdır.
app.use('/v1', exportGateRouter);

// Ödül uçları: bekleyen promosyon kodları ve kullanım bildirimi.
// Kodun kendisi istemciye gitmez, yalnızca mağaza kullanım bağlantısı.
app.use('/v1', rewardsRouter);

// Even Girl Generate üretim kapısı: deepfake ve telif koruması.
// Kapı sırası: yetki → konsept (enjeksiyon) → isim taraması → yüz taraması
// → negatif liste bütünlüğü → üretim. Ayrıntı: docs/SAFETY.md §11.
app.use('/v1', aiStudioRouter);

// Moderasyon nöbetçisi uçları: 24 saatlik SLA kuyruğu ve ban-hammer.
// Bu uçlar UYGULAMA İSTEMCİSİNE AÇIK DEĞİLDİR; ayrı personel jetonu ister
// ve MODERATION_STAFF_SECRET tanımlı değilse hiç çalışmaz (503).
app.use('/internal', moderationRouter);

const PORT = process.env.PORT || 3000;

/**
 * Açılış sırası: ÖNCE veritabanı, SONRA dinleme.
 *
 * Ters sıra, şema hazır olmadan istek kabul etmek demektir: ilk istekler
 * "table not found" ile 500 döner ve sebebi log'da bir yerde kaybolur.
 * PostgreSQL kurulumu asenkron olduğu için bu bekleme zorunludur.
 */
async function start() {
  const { openDatabase } = require('./persistence');
  const { setRepositories } = require('./persistence/registry');

  const repositories = await openDatabase(process.env.DATABASE_URL);
  setRepositories(repositories);
  console.log(`[Server] Veritabanı hazır (${repositories.driver.dialect}).`);

  // Moderasyon tarayıcısı ORTAMDAN kurulur. Yapılandırılmamışsa fail-closed
  // korunur ama hiçbir içerik onaylanmaz — `configureScanner` bunu açıkça
  // uyarır. Sessizce boş bir akışla yayına çıkmak, çalışan bir uygulama
  // değildir.
  const { configureScanner } = require('./social_gamification/social');
  const scannerReady = configureScanner();
  console.log(
    scannerReady
      ? '[Server] Moderasyon tarayıcısı hazır.'
      : '[Server] Moderasyon tarayıcısı YOK — içerik onaylanmayacak.',
  );

  // Even Girl Generate'in iki dış bağımlılığı (yüz tarayıcı + üreteç) de
  // ortamdan kurulur. İkisi de kalıcı fırlatan yer tutucuydu: fail-closed
  // doğruydu ama özellik HİÇ ÇALIŞMIYORDU.
  const { configureProviders } = require('./core_gateway/ai_studio/routes');
  const studio = configureProviders();
  console.log(
    `[Server] Even Girl Generate — yüz tarayıcı: ${studio.faceScreener ? 'hazır' : 'YOK'}, ` +
      `üreteç: ${studio.generator ? 'hazır' : 'YOK'}.`,
  );

  app.listen(PORT, () => {
    console.log(`[Server] Listening on port ${PORT}`);
  });
}

start().catch((err) => {
  // Veritabanı olmadan başlamak, her isteğin 500 dönmesi demektir.
  // Sessizce ayakta kalmak yerine durmak, sorunu görünür kılar.
  console.error('[Server] Başlatılamadı:', err.message);
  process.exit(1);
});