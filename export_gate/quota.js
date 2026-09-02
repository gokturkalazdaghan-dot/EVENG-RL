/**
 * export_gate/quota.js
 *
 * Ücretsiz indirme hakkının SUNUCU tarafı.
 *
 * NEDEN SUNUCUDA DA TUTULUYOR
 * İstemcideki sayaç (client_mobile/src/export/ExportGate.ts) şifreli depoda
 * durur ve kurcalanması zordur — ama imkânsız değildir. Ayrıca uygulamayı
 * silip yeniden kurmak, cihaz tarafındaki her sayacı sıfırlar.
 *
 * Sunucu sayacı, anonim app_user_id'ye bağlıdır ve yeniden kurulumdan
 * etkilenmez. İstemci sayacı kullanıcı deneyimi için (anında geri bildirim),
 * sunucu sayacı ise gerçek kapı içindir.
 */

const express = require('express');

const { requireProEntitlement } = require('../billing_infrastructure/entitlements');
const { getRepositories } = require('../persistence/registry');

const router = express.Router();

/** Ücretsiz kullanıcıya verilen toplam indirme hakkı. */
const FREE_EXPORT_ALLOWANCE = 1;

/**
 * Dışa aktarım izni sorgusu.
 *
 * İstemci, galeriye kaydetmeden ÖNCE çağırır. Yanıt "izin var" ise
 * indirmenin ardından /export/commit çağrılır.
 */
router.get('/export/quota', async (req, res) => {
  const appUserId = req.headers['x-app-user-id'];
  if (!appUserId || typeof appUserId !== 'string' || appUserId.length > 128) {
    return res.status(400).json({ error: 'invalid_app_user_id' });
  }

  try {
    const record = await loadExportRecord(appUserId);
    const isPro = record?.isPro === true;
    const used = record?.usedFreeExports ?? 0;

    if (isPro) {
      return res.status(200).json({
        allowed: true,
        watermarked: false,
        remainingFree: null,
        protectScreen: false,
      });
    }

    const remaining = Math.max(0, FREE_EXPORT_ALLOWANCE - used);
    return res.status(200).json({
      allowed: remaining > 0,
      watermarked: false,
      remainingFree: remaining,
      // Hak tükendiyse istemci ekran yakalama korumasını açar.
      protectScreen: remaining <= 0,
    });
  } catch (err) {
    console.error('[ExportGate] kota okunamadı:', err.message);
    // Fail-closed: kota bilinmiyorsa indirme açılmaz.
    return res.status(500).json({ error: 'quota_unavailable' });
  }
});

/** Başarılı indirmeden sonra sayacı ilerletir. */
router.post('/export/commit', express.json(), async (req, res) => {
  const appUserId = req.headers['x-app-user-id'];
  if (!appUserId || typeof appUserId !== 'string') {
    return res.status(400).json({ error: 'invalid_app_user_id' });
  }

  try {
    const record = await loadExportRecord(appUserId);
    if (record?.isPro === true) {
      // PRO abonesinde sayaç ilerlemez.
      return res.status(200).json({ remainingFree: null });
    }

    // ATOMİK ARTIRMA. Önce okuyup sonra `used + 1` yazmak, iki eşzamanlı
    // isteğin aynı değeri okuyup aynı değeri yazması demekti: kullanıcı BİR
    // hakla İKİ dışa aktarım yapıyordu (çift dokunuş ya da yavaş yanıt
    // sonrası yeniden deneme ile tetiklenmesi kolay).
    const used = await incrementExportUsage(appUserId);

    return res.status(200).json({
      remainingFree: Math.max(0, FREE_EXPORT_ALLOWANCE - used),
    });
  } catch (err) {
    console.error('[ExportGate] kota yazılamadı:', err.message);
    return res.status(500).json({ error: 'commit_failed' });
  }
});

/**
 * Filigransız tam çözünürlüklü çıktı — PRO gerektirir.
 *
 * Ücretsiz kullanıcının tek hakkı da filigransızdır ama o hak /export/quota
 * üzerinden verilir; bu uç, hak sonrası sınırsız erişim içindir.
 */
/**
 * Proje kimliği biçimi.
 *
 * Kimlik doğrudan bir saklama YOLUNA giriyor. "Boş değil" kontrolü yetmez:
 * `../../` içeren bir değer dizin dışına çıkar, `?` veya `#` içeren bir
 * değer URL'i keser, çok uzun bir değer saklama katmanını zorlar. Beyaz
 * liste (harf, rakam, tire, alt çizgi) bu sınıfın tamamını kapatır.
 */
const PROJECT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Tam çözünürlük render'ın kabul edilen üst sınırı. */
const MAX_RENDER_EDGE_PX = 8192;
const DEFAULT_RENDER_EDGE_PX = 4096;

router.post('/export/render', express.json(), requireProEntitlement, async (req, res) => {
  const { projectId, maxEdgePx } = req.body ?? {};

  if (typeof projectId !== 'string' || !PROJECT_ID_PATTERN.test(projectId)) {
    return res.status(400).json({ error: 'invalid_project' });
  }

  // `Number(x) || 4096` tuzağı: 0 ve NaN varsayılana düşer ama NEGATİF ve
  // devasa değerler geçerdi. Aralık açıkça sınırlanıyor.
  const requested = Number(maxEdgePx);
  const edge = Number.isFinite(requested) && requested > 0
    ? Math.min(Math.floor(requested), MAX_RENDER_EDGE_PX)
    : DEFAULT_RENDER_EDGE_PX;

  try {
    const url = await renderFullResolution(projectId, edge);
    return res.status(200).json({ url, watermarked: false });
  } catch (err) {
    if (err.code === 'render_not_configured') {
      // 503: geçici olarak kullanılamaz. İstemci bunu yeniden denenebilir
      // bir hata olarak gösterir; uydurulmuş bir URL göstermez.
      return res.status(503).json({ error: 'render_unavailable' });
    }
    console.error(`[ExportGate] render hatası project=${projectId}:`, err.message);
    return res.status(502).json({ error: 'render_failed' });
  }
});

// ---- Depo delegasyonu -------------------------------------------------

const repo = () => getRepositories();

/**
 * Sunucu sayacı — GERÇEK kapı budur.
 *
 * İstemcideki sayaç kullanıcı deneyimi içindir; uygulama silinip yeniden
 * kurulduğunda sıfırlanır. Bu kayıt sunucuda kalır.
 */
async function loadExportRecord(appUserId) {
  return repo().loadExportRecord(appUserId);
}
async function saveExportRecord(appUserId, used) {
  return repo().saveExportRecord(appUserId, used);
}
async function incrementExportUsage(appUserId) {
  return repo().incrementExportUsage(appUserId);
}
/**
 * Sunucu tarafı tam çözünürlük render'ı.
 *
 * BU FONKSİYON URL UYDURMAZ.
 *
 * Eskiden `https://cdn.evengirl.app/renders/<id>.jpg` biçiminde bir adres
 * döndürüyordu — hiçbir render yapılmadan, var olmayan bir dosyaya. İstemci
 * 200 alıp "dışa aktarma başarılı" sanacak, sonra kırık bir görsel
 * gösterecekti. Uydurulmuş bir başarı, açık bir hatadan daha zararlıdır:
 * hata yeniden denenebilir, yalan denenemez.
 *
 * NOT: uygulama render'ı CİHAZDA yapıyor (bkz. docs/ARCHITECTURE.md) ve bu
 * ucu ÇAĞIRMIYOR. Uç, sunucu tarafı render'ın gerekli olduğu ileri bir
 * senaryo için duruyor; yapılandırılmadan çalışmaz.
 */
async function renderFullResolution(projectId, edgePx) {
  const endpoint = process.env.RENDER_SERVICE_URL;
  if (!endpoint) {
    const error = new Error('RENDER_SERVICE_URL tanımsız');
    error.code = 'render_not_configured';
    throw error;
  }

  const response = await fetch(`${endpoint.replace(/\/$/, '')}/render`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(process.env.RENDER_SERVICE_KEY
        ? { authorization: `Bearer ${process.env.RENDER_SERVICE_KEY}` }
        : {}),
    },
    body: JSON.stringify({ projectId, maxEdgePx: edgePx }),
  });

  if (!response.ok) throw new Error(`render_http_${response.status}`);

  const result = await response.json();
  // Adres DOĞRULANIR: boş ya da https olmayan bir yanıtı istemciye geçirmek,
  // uydurmakla aynı sonucu verir.
  if (typeof result?.url !== 'string' || !/^https:\/\//.test(result.url)) {
    throw new Error('render_bad_url');
  }
  return result.url;
}

module.exports = router;
module.exports.FREE_EXPORT_ALLOWANCE = FREE_EXPORT_ALLOWANCE;
module.exports.PROJECT_ID_PATTERN = PROJECT_ID_PATTERN;
module.exports.MAX_RENDER_EDGE_PX = MAX_RENDER_EDGE_PX;
module.exports.renderFullResolution = renderFullResolution;
