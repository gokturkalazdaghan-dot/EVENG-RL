/**
 * server/social.js
 *
 * Sosyal katmanın sunucu tarafı: akış, hikayeler, moderasyon, DM anahtar
 * dağıtımı ve haftalık sıralama.
 *
 * TEMEL İLKE — KALKAN SUNUCUDA
 * İstemcideki görünürlük kalkanı (VisibilityShield.ts) ikinci savunma
 * hattıdır. BİRİNCİ hat burasıdır: reşit olmayan bir hesaba +18 içerik
 * HİÇ GÖNDERİLMEZ. İstemci yamalanabilir, eski sürümde kalabilir veya
 * önbellekten okuyabilir; sunucu yanıtı bunların hiçbirinden etkilenmez.
 *
 * Bu dosya, veritabanı katmanı hariç gerçek çalışan bir iskelettir
 * (revenuecat-webhook.example.js ile aynı yaklaşım): iş mantığı ve
 * doğrulamalar tam, veri erişimi örnek fonksiyonlar.
 */

const express = require('express');
const crypto = require('crypto');

const { requireProEntitlement } = require('../billing_infrastructure/entitlements');
const { scanAndGate } = require('./moderationProxy');
const { getRepositories } = require('../persistence/registry');
const { createScannerFromEnv, unconfiguredScanner } = require('./scannerConfig');

const router = express.Router();

// ---------------------------------------------------------------- yardımcı ----

/**
 * Kimlik alanları için üst sınır — `appUserId` ile aynı.
 */
const ID_MAX_LENGTH = 128;

/**
 * İstemciden gelen bir kimliğin veritabanı anahtarı olarak kullanılabilir
 * olup olmadığı.
 *
 * NEDEN "BOŞ DEĞİL" YETMEZ
 * Bu kimlikler `suspendContent`, `addBlock`, `storeEnvelope` gibi
 * fonksiyonlara anahtar olarak giriyor. Yalnızca doğruluk (truthiness)
 * kontrolü `{ $ne: null }` gibi bir NESNEYİ, bir DİZİYİ ve megabaytlarca
 * uzunlukta bir dizeyi geçiriyordu.
 *
 * KARAKTER KÜMESİ KISITLANMIYOR: bu kimlikler opak (UUID, saklama
 * anahtarı, mağaza kimliği) ve biçimleri kaynak sistemden geliyor.
 * Kritik güvence tür ve uzunluktur — dize olmayan hiçbir şey anahtar
 * olamaz.
 */
function isValidId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= ID_MAX_LENGTH;
}

/**
 * Dize olmayan değeri metne ZORLAMADAN eler.
 *
 * `String({})` "[object Object]" üretir; bu değer moderasyon kuyruğuna
 * kanıt metni olarak düştüğünde nöbetçi onu gerçek bir mesaj sanır.
 * Dize olmayan girdi, boş metin olarak kaydedilir — uydurulmuş içerikten
 * iyidir.
 */
function safeText(value, maxLength) {
  return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

/** Anonim kimliğin log'a yazılabilir kısaltması. */
function shortId(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 8);
}

/**
 * Oturum sahibinin erişim kademesini belirler.
 *
 * KADEME İSTEMCİDEN GELMEZ. İstemcinin "ben yetişkinim" demesi hiçbir şey
 * ifade etmez; kademe, yaş doğrulama sırasında sunucuda kaydedilen değerdir.
 * Bu ayrımın kaybolması, tüm yaş kalkanının çökmesi demektir.
 */
async function resolveViewer(req, res, next) {
  const appUserId = req.headers['x-app-user-id'];
  if (!appUserId || typeof appUserId !== 'string' || appUserId.length > 128) {
    return res.status(400).json({ error: 'invalid_app_user_id' });
  }

  const account = await loadAccount(appUserId);

  // Hesap bilinmiyorsa fail-closed: doğrulanmamış kabul edilir ve hiçbir
  // içerik görmez.
  req.viewer = {
    appUserId,
    tier: normalizeTier(account?.tier),
    adultContentOptIn: account?.adultContentOptIn === true,
    blockedAuthorIds: new Set(account?.blockedAuthorIds ?? []),
  };
  return next();
}

/** İstemcinin `AgePolicy.AccessTier` birliğiyle aynı. */
const ACCESS_TIERS = new Set(['unverified', 'safe', 'adult']);

/**
 * Kademeyi bilinen kümeye indirger.
 *
 * BU KONTROL OLMADAN BOZUK DEĞER, EKSİK DEĞERDEN DAHA GENİŞTİ.
 * `isVisibleTo` yalnızca `'unverified'` ve `'adult'` isimlerini sınıyor;
 * tanımadığı her şey (`'pending'`, `'ADMIN'`, boş dize) ilk kontrolü geçip
 * genel içeriği görüyordu. Yani veritabanı `undefined` döndürdüğünde hesap
 * hiçbir şey görmezken, yarım kalmış bir şema göçü yüzünden `''` döndüğünde
 * içerik görüyordu — koruma, verinin bozulma BİÇİMİNE bağlıydı.
 *
 * Tanınmayan her değer `'unverified'` sayılır.
 */
function normalizeTier(value) {
  return ACCESS_TIERS.has(value) ? value : 'unverified';
}

/**
 * Görünürlük kalkanı — istemcideki `VisibilityShield.canView` ile AYNI sıra.
 *
 * İki uygulamanın aynı kalması kritik: eşikler ayrışırsa kullanıcı, sunucunun
 * gönderdiği ama istemcinin gizlediği (veya tersi) içerikle karşılaşır.
 */
function isVisibleTo(viewer, item) {
  // MODERASYON KAPISI — DİĞER TÜM KURALLARDAN ÖNCE.
  // Taranmamış (`pending`) veya bloke edilmiş içerik hiçbir kademeye, hiçbir
  // opt-in kombinasyonuna gitmez. Bu kontrolü aşağı taşımak, bir sonraki
  // kuralın yanlışlıkla `return true` üretmesiyle taranmamış içeriğin akışa
  // düşmesi demektir.
  if (item.moderationState !== 'approved') return false;

  if (item.rating === 'blocked') return false;
  if (viewer.blockedAuthorIds.has(item.authorId)) return false;
  if (viewer.tier === 'unverified') return false;

  const adultOnly =
    item.rating === 'adult' || item.rating === 'sensitive' || item.rating === 'review';

  // YAŞ KALKANI: reşit olmayan yalnızca 'adult' değil, 'sensitive' ve
  // 'review' içeriği de görmez.
  if (adultOnly && viewer.tier !== 'adult') return false;

  if (item.reportedPendingReview === true) return false;
  if (item.rating === 'adult' && !viewer.adultContentOptIn) return false;

  return true;
}

// ------------------------------------------------------------------ akış ----

router.get('/feed', resolveViewer, async (req, res) => {
  try {
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : null;
    const raw = await loadFeedPage(cursor);

    // Filtre SUNUCUDA uygulanır: reşit olmayan hesaba +18 içerik hiç gitmez.
    const posts = raw.posts.filter((post) => isVisibleTo(req.viewer, post));

    return res.status(200).json({ posts, nextCursor: raw.nextCursor });
  } catch (err) {
    console.error(`[Feed] user=${shortId(req.viewer.appUserId)}:`, err.message);
    return res.status(500).json({ error: 'feed_failed' });
  }
});

router.get('/stories', resolveViewer, async (req, res) => {
  try {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const raw = await loadStories();

    const stories = raw
      // 24 saat kuralı sunucuda da uygulanır: istemcinin saatine güvenmek,
      // cihaz saatini geri alan kullanıcının süresi dolmuş hikayeleri
      // görmesi demektir.
      .filter((story) => story.publishedAtMs > cutoff)
      .filter((story) => isVisibleTo(req.viewer, story));

    return res.status(200).json({ stories });
  } catch (err) {
    console.error('[Stories] hata:', err.message);
    return res.status(500).json({ error: 'stories_failed' });
  }
});

// ------------------------------------------------------- yükleme (tarama) ----

/**
 * Hikaye yükleme.
 *
 * Yükleme BAŞARILI olsa bile hikaye görünmez: `scanAndGate` içeriği
 * `pending` ile açar ve yalnızca tarama temiz dönerse `approved` yapar.
 * "Önce yayınla, sonra tara" sırası, tarama süresince içeriğin görünür
 * olduğu bir pencere açar — bu pencerede CSAM yayınlanabilir.
 */
router.post('/stories', express.json(), resolveViewer, requireProEntitlement, async (req, res) => {
  const { storyId, mediaRef } = req.body ?? {};

  if (!isValidId(storyId) || typeof mediaRef !== 'string' || mediaRef.length > 512) {
    return res.status(400).json({ error: 'invalid_story' });
  }
  if (req.viewer.tier === 'unverified') {
    return res.status(403).json({ error: 'tier_required' });
  }

  try {
    const nowMs = Date.now();
    await createStory({
      storyId,
      authorId: req.viewer.appUserId,
      mediaRef,
      publishedAtMs: nowMs,
      moderationState: 'pending',
    });

    const decision = await scanAndGate(moderationDeps, {
      contentId: storyId,
      authorId: req.viewer.appUserId,
      mediaRef,
      kind: 'story',
      nowMs,
    });

    if (decision.state === 'blocked') {
      // Gerekçe kullanıcıya AYRINTILANDIRILMAZ. "Hangi sinyal hangi eşiği
      // geçti" bilgisini vermek, tarayıcıyı deneme-yanılmayla kalibre
      // etmenin tarifini vermektir.
      return res.status(422).json({ published: false, state: 'blocked' });
    }

    return res.status(202).json({ published: decision.state === 'approved', state: decision.state });
  } catch (err) {
    console.error(`[StoryUpload] user=${shortId(req.viewer.appUserId)}:`, err.message);
    return res.status(500).json({ error: 'story_upload_failed' });
  }
});

/**
 * DM eki yükleme.
 *
 * E2EE İLE NASIL BAĞDAŞIYOR
 * Mesaj METNİ uçtan uca şifrelidir ve sunucu okuyamaz. Ek MEDYASI ise
 * moderasyon için ayrı bir yolla taranır: istemci eki göndermeden önce
 * saklama katmanına yükler, sunucu yalnızca bu nesneyi tarar ve
 * `attachmentId` üzerinden karar verir. Şifreli mesaj gövdesine
 * dokunulmaz — yani metin gizliliği korunurken medya taranmış olur.
 *
 * Tarama TAMAMLANMADAN `attachmentId` bir mesaja iliştirilemez: `/dm/send`
 * eki `approved` değilse mesajı reddeder.
 */
router.post('/dm/attachment', express.json(), resolveViewer, async (req, res) => {
  const { attachmentId, mediaRef } = req.body ?? {};

  if (!isValidId(attachmentId) || typeof mediaRef !== 'string' || mediaRef.length > 512) {
    return res.status(400).json({ error: 'invalid_attachment' });
  }

  try {
    const nowMs = Date.now();

    // Ek kaydı taramadan ÖNCE 'pending' olarak açılır: `setModerationState`
    // var olmayan bir satırı güncelleyemez ve tarama sonucu sessizce
    // kaybolurdu.
    await repo().createContent({
      contentId: attachmentId,
      authorId: req.viewer.appUserId,
      kind: 'dm-attachment',
      mediaRef,
      moderationState: 'pending',
      publishedAtMs: nowMs,
    });

    const decision = await scanAndGate(moderationDeps, {
      contentId: attachmentId,
      authorId: req.viewer.appUserId,
      mediaRef,
      kind: 'dm-attachment',
      nowMs,
    });

    if (decision.state !== 'approved') {
      return res.status(422).json({ attached: false, state: decision.state });
    }
    return res.status(200).json({ attached: true, state: 'approved' });
  } catch (err) {
    console.error(`[DmAttachment] user=${shortId(req.viewer.appUserId)}:`, err.message);
    return res.status(500).json({ error: 'attachment_scan_failed' });
  }
});

// ------------------------------------------------------------ moderasyon ----

const REPORT_REASONS = new Set([
  'minor-safety',
  'nonconsensual-intimate',
  'sexual-content-unlabeled',
  'harassment',
  'hate-speech',
  'violence',
  'impersonation',
  'copyright',
  'spam',
  'other',
]);

/** Bildirim anında içeriği otomatik askıya alan gerekçeler. */
const AUTO_SUSPEND = new Set(['minor-safety', 'nonconsensual-intimate']);

router.post('/moderation/report', express.json(), resolveViewer, async (req, res) => {
  const { contentId, authorId, reason, note } = req.body ?? {};

  if (!isValidId(contentId) || !isValidId(authorId) || !REPORT_REASONS.has(reason)) {
    return res.status(400).json({ error: 'invalid_report' });
  }

  try {
    const suspended = AUTO_SUSPEND.has(reason);

    await recordReport({
      contentId,
      authorId,
      reason,
      note: typeof note === 'string' ? note.slice(0, 500) : '',
      reporterId: req.viewer.appUserId,
      suspended,
    });

    // Yüksek öncelikli gerekçeler içeriği DERHAL gizler; insan incelemesi
    // sonradan yapılır. Ters sıra (önce incele, sonra gizle) bu iki gerekçe
    // için kabul edilemez bir gecikme üretir.
    if (suspended) await suspendContent(contentId);

    // RAPOR KUYRUĞA GİRER — yoksa hiçbir insan incelemez.
    //
    // Bu eksikti: rapor kaydediliyor ve içerik askıya alınıyordu ama
    // moderasyon kuyruğuna hiçbir şey düşmüyordu. Sonuç: 24 saatlik SLA
    // yalnızca otomatik tarama olaylarına uygulanıyor, KULLANICI
    // RAPORLARINA hiç uygulanmıyordu. `GET /internal/moderation/sla` de
    // her zaman sağlıklı görünürdü, çünkü kuyrukta bunlar yoktu.
    //
    // Guideline 1.2'nin "rapor mekanizması + ZAMANINDA yanıt" şartı tam
    // olarak buna dayanır.
    await enqueueReview({
      contentId,
      authorId,
      kind: 'post',
      reasons: [reason],
      source: 'report',
      reporterId: req.viewer.appUserId,
      createdAtMs: Date.now(),
    });

    return res.status(200).json({ suspended });
  } catch (err) {
    console.error('[Report] hata:', err.message);
    return res.status(500).json({ error: 'report_failed' });
  }
});

/**
 * DM mesaj raporu.
 *
 * E2EE altında sunucu mesajları okuyamaz; bu yüzden içerik İSTEMCİDEN,
 * kullanıcının açık onayıyla gelir. Sunucu bunu kendi başına elde edemez.
 */
router.post('/moderation/report-message', express.json(), resolveViewer, async (req, res) => {
  const { conversationId, reportedMessageId, reportedUserId, reason, context } = req.body ?? {};

  if (
    !isValidId(conversationId) ||
    !isValidId(reportedMessageId) ||
    !REPORT_REASONS.has(reason)
  ) {
    return res.status(400).json({ error: 'invalid_report' });
  }
  if (!Array.isArray(context) || context.length > 10) {
    return res.status(400).json({ error: 'invalid_context' });
  }

  try {
    await recordMessageReport({
      conversationId,
      reportedMessageId,
      reportedUserId,
      reason,
      // String() ZORLAMASI YOK: `String({})` "[object Object]" üretir ve
      // moderasyon kuyruğuna kanıt metni olarak düşerdi. Nöbetçi, gerçek
      // bir mesaj sanıp okumaya çalışır; kuyruk gürültülenir.
      context: context.map((entry) => ({
        messageId: safeText(entry?.messageId, ID_MAX_LENGTH),
        senderId: safeText(entry?.senderId, ID_MAX_LENGTH),
        text: safeText(entry?.text, 2000),
        sentAtMs: Number.isFinite(entry?.sentAtMs) ? entry.sentAtMs : 0,
      })),
      reporterId: req.viewer.appUserId,
    });

    // Mesaj raporu da kuyruğa girer. E2EE altında sunucu mesajı okuyamaz;
    // nöbetçi, kullanıcının açık onayıyla gönderilen bağlamı inceler.
    await enqueueReview({
      contentId: reportedMessageId,
      authorId: reportedUserId ?? null,
      kind: 'dm-message',
      reasons: [reason],
      source: 'report',
      reporterId: req.viewer.appUserId,
      createdAtMs: Date.now(),
    });

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[MessageReport] hata:', err.message);
    return res.status(500).json({ error: 'report_failed' });
  }
});

router.post('/moderation/block', express.json(), resolveViewer, async (req, res) => {
  const { authorId } = req.body ?? {};
  if (!isValidId(authorId)) return res.status(400).json({ error: 'invalid_author' });

  await addBlock(req.viewer.appUserId, authorId);
  return res.status(200).json({ ok: true });
});

router.post('/moderation/unblock', express.json(), resolveViewer, async (req, res) => {
  const { authorId } = req.body ?? {};
  if (!isValidId(authorId)) return res.status(400).json({ error: 'invalid_author' });

  await removeBlock(req.viewer.appUserId, authorId);
  return res.status(200).json({ ok: true });
});

// -------------------------------------------------------------------- DM ----

/**
 * Açık anahtar yayınlama.
 *
 * Sunucu YALNIZCA açık anahtarları taşır. Özel anahtar hiçbir zaman
 * gönderilmez ve sunucunun mesajları çözme imkânı yoktur.
 */
router.post('/dm/keys', express.json(), resolveViewer, async (req, res) => {
  const { publicKey } = req.body ?? {};
  if (typeof publicKey !== 'string' || publicKey.length > 4096) {
    return res.status(400).json({ error: 'invalid_key' });
  }

  await storePublicKey(req.viewer.appUserId, publicKey);
  return res.status(200).json({ ok: true });
});

router.get('/dm/keys/:peerId', resolveViewer, async (req, res) => {
  const bundle = await loadPreKeyBundle(req.params.peerId);
  if (!bundle) return res.status(404).json({ error: 'peer_not_found' });
  return res.status(200).json({ preKeyBundle: bundle });
});

router.post('/dm/send', express.json(), resolveViewer, async (req, res) => {
  const { messageId, conversationId, ciphertext, attachmentIds } = req.body ?? {};

  if (!isValidId(messageId) || !isValidId(conversationId) || typeof ciphertext !== 'string') {
    return res.status(400).json({ error: 'invalid_message' });
  }

  // İZİN KONTROLÜ SUNUCUDA: istemcinin DmPolicy'si UI içindir. Reşit olmayan
  // bir alıcıya tanımadık birinden mesaj gitmesi burada engellenir.
  const permitted = await isDmPermitted(req.viewer.appUserId, conversationId);
  if (!permitted) return res.status(403).json({ error: 'dm_not_permitted' });

  // EK MODERASYON KAPISI: yalnızca `approved` ek iliştirilebilir.
  // `/dm/attachment` taramasını atlayıp doğrudan bir kimlik uydurmak da
  // burada durur — bilinmeyen kimlik `approved` değildir (fail-closed).
  if (attachmentIds !== undefined) {
    if (!Array.isArray(attachmentIds) || attachmentIds.length > 10) {
      return res.status(400).json({ error: 'invalid_attachments' });
    }
    for (const attachmentId of attachmentIds) {
      if (!isValidId(attachmentId)) {
        return res.status(400).json({ error: 'invalid_attachments' });
      }
      const state = await loadAttachmentState(attachmentId, req.viewer.appUserId);
      if (state !== 'approved') {
        return res.status(422).json({ error: 'attachment_not_cleared', attachmentId });
      }
    }
  }

  await storeEnvelope({
    messageId,
    conversationId,
    senderId: req.viewer.appUserId,
    ciphertext,
    attachmentIds: Array.isArray(attachmentIds) ? attachmentIds.map(String) : [],
  });
  return res.status(200).json({ ok: true });
});

// ---------------------------------------------------------------- sıralama ----

router.get('/leaderboard/weekly', resolveViewer, async (req, res) => {
  try {
    const all = await loadWeeklyScores();

    // Herkese açık listede YALNIZCA yetişkin hesaplar. Bir kullanıcının
    // reşit olmadığını herkese açık bir sıralamada duyurmak, yetişkin içerik
    // ve DM barındıran bir uygulamada hedefleme sinyalidir.
    const entries = all.filter((entry) => entry.tier === 'adult');

    const me = all.find((entry) => entry.userId === req.viewer.appUserId) ?? null;
    const myPublicRank = me && me.tier === 'adult'
      ? entries
          .slice()
          .sort((a, b) => b.weeklyScore - a.weeklyScore)
          .findIndex((entry) => entry.userId === me.userId) + 1
      : null;

    return res.status(200).json({ entries, me, myPublicRank: myPublicRank || null });
  } catch (err) {
    console.error('[Leaderboard] hata:', err.message);
    return res.status(500).json({ error: 'leaderboard_failed' });
  }
});

// ------------------------------------------------------------- şablonlar ----

router.get('/templates', resolveViewer, async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : '';
  const raw = await loadTemplates(query);

  // Şablon önizlemeleri de kalkandan geçer: pazar yeri moderasyonun
  // atlandığı bir arka kapı olamaz.
  const templates = raw.templates.filter((template) => isVisibleTo(req.viewer, template));
  return res.status(200).json({ templates, nextCursor: raw.nextCursor });
});

/** Şablon yayınlama — PRO gerektirir. */
router.post('/templates', express.json(), resolveViewer, requireProEntitlement, async (req, res) => {
  const { title, previewUri, steps, proOnly } = req.body ?? {};

  // YAŞ KAPISI YAYINLAMADA DA GEÇERLİ.
  // Hikaye yükleme ucu doğrulanmamış hesabı reddediyordu ama şablon
  // yayınlama etmiyordu: doğrulanmamış bir hesap pazar yerine içerik
  // koyabiliyor, sonra kendi koyduğunu göremiyordu (kalkan onu da
  // gizliyor). İki ucun aynı kuralı uygulaması gerekir.
  if (req.viewer.tier === 'unverified') {
    return res.status(403).json({ error: 'tier_required' });
  }

  if (typeof title !== 'string' || !Array.isArray(steps) || steps.length === 0) {
    return res.status(400).json({ error: 'invalid_template' });
  }
  if (steps.length > 20) {
    return res.status(400).json({ error: 'too_many_steps' });
  }

  // Bilinmeyen yetenek reddedilir: istemciden gelen bir adım listesini
  // doğrulamadan kabul etmek, sunucuda keyfi işlem zinciri çalıştırmaktır.
  const unknown = steps.find((step) => !KNOWN_CAPABILITIES.has(step.capability));
  if (unknown) return res.status(400).json({ error: 'unknown_capability' });

  const templateId = await createTemplate({
    authorId: req.viewer.appUserId,
    title: title.slice(0, 80),
    previewUri,
    steps,
    proOnly: proOnly === true,
  });
  return res.status(201).json({ templateId });
});

/**
 * Şablon kullanımı — creator gelir payını besleyen sayaç.
 *
 * PRO GEREKTİRMEZ: ücretsiz kullanıcı da şablon uygulayabilir; ücretli
 * olanlar `proOnly` bayrağıyla listede zaten süzülüyor.
 *
 * Yayında olmayan bir şablon için sayaç ARTMAZ. Aksi halde moderasyondan
 * geçmemiş (ya da kaldırılmış) bir şablon, gelir payı üretmeye devam eder.
 */
router.post('/templates/use', express.json(), resolveViewer, async (req, res) => {
  const { templateId } = req.body ?? {};
  if (!isValidId(templateId)) return res.status(400).json({ error: 'invalid_template' });

  try {
    if (!(await isTemplatePublished(templateId))) {
      return res.status(404).json({ error: 'template_not_found' });
    }

    const counted = await recordTemplateUse(templateId, req.viewer.appUserId);
    // `counted:false` HATA DEĞİLDİR: aynı kullanıcının ikinci kullanımı ya
    // da ağ yeniden denemesi. İstemciye 200 döner, kullanıcı hata görmez.
    return res.status(200).json({ ok: true, counted });
  } catch (err) {
    console.error(`[TemplateUse] user=${shortId(req.viewer.appUserId)}:`, err.message);
    return res.status(500).json({ error: 'template_use_failed' });
  }
});

// -------------------------------------------------------------- beğeni ----

/**
 * Gönderi beğenme.
 *
 * GÖRÜNÜRLÜK KAPISI BURADA DA GEÇERLİ. Beğeni ucu, akış filtresinin
 * atlanabildiği bir arka kapı olmamalı: kullanıcı göremediği bir gönderiyi
 * beğenebilseydi, kimliğini bilmediği içeriğin varlığını beğeni sayısından
 * çıkarabilirdi.
 */
router.post('/feed/like', express.json(), resolveViewer, async (req, res) => {
  const { postId } = req.body ?? {};
  if (!isValidId(postId)) return res.status(400).json({ error: 'invalid_post' });

  try {
    if (!(await isPostVisible(postId))) {
      return res.status(404).json({ error: 'post_not_found' });
    }

    const added = await likePost(postId, req.viewer.appUserId);
    const likes = await likeCount(postId);
    // İkinci beğeni sessizce yok sayılır; istemci yeniden denediğinde de
    // aynı sayıyı görür ve kullanıcıya hata gösterilmez.
    return res.status(200).json({ ok: true, added, likes });
  } catch (err) {
    console.error(`[Like] user=${shortId(req.viewer.appUserId)}:`, err.message);
    return res.status(500).json({ error: 'like_failed' });
  }
});

// ---------------------------------------------------- creator abonelik ----

/**
 * Creator teklifi.
 *
 * FİYAT DÖNDÜRÜLMEZ — bilerek. Gösterilecek fiyat mağazadan okunur;
 * sunucudan gelen bir fiyatı göstermek, gösterilen ile tahsil edilenin
 * ayrışmasına ve Guideline 3.1.2 ihlaline yol açar. Burada yalnızca hangi
 * kademe ürününün sorgulanacağı söylenir.
 */
router.get('/creators/:creatorId/offer', resolveViewer, async (req, res) => {
  const { creatorId } = req.params;
  if (!isValidId(creatorId)) return res.status(400).json({ error: 'invalid_creator' });

  try {
    const offer = await loadCreatorOffer(creatorId);
    if (!offer) return res.status(404).json({ error: 'offer_not_found' });

    // Kademe kimliği istemcideki CREATOR_TIERS ile eşleşmeli; eşleşmezse
    // istemci `CREATOR_TIERS[tier]` üzerinde undefined okur ve satın alma
    // akışı sessizce boş ürün kimliğiyle devam ederdi.
    if (!CREATOR_TIERS.has(offer.tier)) {
      console.error(`[CreatorOffer] bilinmeyen kademe: ${offer.tier}`);
      return res.status(500).json({ error: 'invalid_tier' });
    }

    return res.status(200).json(offer);
  } catch (err) {
    console.error('[CreatorOffer] hata:', err.message);
    return res.status(500).json({ error: 'offer_failed' });
  }
});

/**
 * Satın almayı creator'a bağlar.
 *
 * BİTİŞ ANI MAĞAZADAN GELİR. İstemcinin gönderdiği bir süre kabul
 * edilmiyor: istemciden gelen `expiresAtMs`, aboneliğe ücretsiz sonsuz
 * erişim yazmanın en kısa yoludur. Sunucu kendi yetki kaydına bakar.
 */
router.post('/creators/link-subscription', express.json(), resolveViewer, async (req, res) => {
  const { creatorId, appUserId } = req.body ?? {};
  if (!isValidId(creatorId)) return res.status(400).json({ error: 'invalid_creator' });
  if (!isValidId(appUserId)) return res.status(400).json({ error: 'invalid_user' });

  // Gövdeden gelen kimlik, isteği yapan kimlikle AYNI olmalı. Aksi halde
  // bir kullanıcı başkasının kimliğiyle abonelik bağlayabilirdi.
  if (appUserId !== req.viewer.appUserId) {
    return res.status(403).json({ error: 'user_mismatch' });
  }

  try {
    const offer = await loadCreatorOffer(creatorId);
    if (!offer) return res.status(404).json({ error: 'offer_not_found' });

    // O KADEMENİN ÜRÜNÜ satın alınmış olmalı — PRO yetkisi DEĞİL.
    //
    // PRO satırına bakmak, PRO alan herkese ücretsiz creator erişimi
    // vermek olurdu: ikisi ayrı mağaza ürünüdür ve ayrı ödenir.
    const productId = creatorProductId(offer.tier);
    const purchase = await loadActivePurchase(appUserId, productId);
    if (!purchase) {
      // Doğrulanmamış satın almayı bağlamak, ödeme yapılmadan erişim
      // vermek demektir. Webhook henüz gelmediyse istemci yeniden dener.
      return res.status(409).json({ error: 'purchase_not_confirmed' });
    }

    const state = await linkCreatorSubscription({
      creatorId,
      appUserId,
      // Bitiş anı MAĞAZADAN gelen kayıttan; istemciden gelen bir süre
      // kabul edilmiyor.
      expiresAtMs: purchase.expiresAtMs,
      willRenew: purchase.status === 'active',
    });
    return res.status(200).json(state);
  } catch (err) {
    console.error(`[CreatorLink] user=${shortId(req.viewer.appUserId)}:`, err.message);
    return res.status(500).json({ error: 'link_failed' });
  }
});

/** Kullanıcının creator abonelikleri — süresi geçmişler `active:false` döner. */
router.get('/creators/subscriptions', resolveViewer, async (req, res) => {
  try {
    const subscriptions = await listCreatorSubscriptions(req.viewer.appUserId);
    return res.status(200).json({ subscriptions });
  } catch (err) {
    console.error(`[CreatorSubs] user=${shortId(req.viewer.appUserId)}:`, err.message);
    return res.status(500).json({ error: 'subscriptions_failed' });
  }
});

/**
 * Creator abonelik kademeleri.
 *
 * İstemcideki `CREATOR_TIERS` ile aynı kimlikler; `tests/creatorTierContract`
 * ikisinin ayrışmasını engeller. Fiyat BURADA YOK: kademe kimliği hangi
 * mağaza ürününün sorgulanacağını söyler, fiyatı mağaza söyler.
 */
const CREATOR_TIERS = new Set(['tier1', 'tier2', 'tier3']);

/**
 * Kademe → mağaza ürün kimliği.
 *
 * İstemcideki `CREATOR_TIERS[tier].productId` ile AYNI dizgeyi üretmeli;
 * `tests/creatorTierContract.test.js` ikisinin ayrışmasını engeller.
 * Ayrışırlarsa satın alma doğrulaması hiçbir zaman eşleşmez ve ödeme yapan
 * kullanıcı `purchase_not_confirmed` görür.
 */
const CREATOR_PRODUCT_PREFIX = 'com.evengirl.app.creator.';

function creatorProductId(tier) {
  return `${CREATOR_PRODUCT_PREFIX}${tier}`;
}

/**
 * Şablon adımı olarak kabul edilen yetenekler.
 *
 * İstemcinin `ModelRegistry.Capability` tip birliğiyle eşleşmeli —
 * `tests/capabilityCoverage.test.js` bunu zorunlu kılar. Liste eksik
 * kaldığında ilgili yeteneği kullanan HER şablon `unknown_capability` ile
 * reddedilir; sessiz bir hata değil ama sebebi uzak bir dosyada durur.
 *
 * `nsfw-classify` BİLEREK DIŞARIDA: moderasyon sınıflandırıcısı bir
 * kullanıcı aracı değildir. Şablon adımı olarak kabul edilseydi, kullanıcı
 * üretimi bir içerik moderasyon modelini keyfî girdiyle çalıştırabilirdi.
 */
const KNOWN_CAPABILITIES = new Set([
  // Temel (model gerektirmeyen) araçlar
  'crop', 'color-filter', 'trim', 'auto-resize',
  // Fotoğraf & üretken
  'magic-eraser', 'lens-blur', 'generative-remove', 'generative-expand',
  'concept-portrait',
  // Portre & yüz
  'face-restore', 'hd-upscale', 'studio-background', 'ai-avatar',
  'age-transform',
  // Video & efekt
  'auto-captions', 'object-tracking', 'smart-slowmo', 'text-to-video',
  // Tasarım
  'smart-template',
  // Manuel & Botox stüdyo (ücretsiz, sınırsız, tamamen yerel)
  'manual-reshape', 'botox-jawline', 'skin-smooth', 'blemish-eraser',
  // Even Girl Generate
  'even-generate', 'light-sync', 'cinematic-bokeh', 'pore-preserve',
]);

// ---- Depo delegasyonu -------------------------------------------------
//
// Bu fonksiyonlar artık örnek DEĞİL: `persistence/repositories.js` içindeki
// gerçek SQL uygulamasına yönlendirirler. Depolar İSTEK ANINDA çözülür,
// modül yüklenirken değil — böylece `server.js` açılışta gerçek
// veritabanını enjekte edebilir ve testler temiz bir veritabanı verebilir.

const repo = () => getRepositories();

async function loadAccount(appUserId) {
  return repo().loadAccount(appUserId);
}
async function loadFeedPage(cursor) {
  return repo().loadFeedPage(cursor);
}
async function loadStories() {
  return repo().loadStories();
}
async function recordReport(report) {
  return repo().recordReport(report);
}
async function recordMessageReport(report) {
  return repo().recordMessageReport(report);
}
async function suspendContent(contentId) {
  return repo().suspendContent(contentId);
}
async function addBlock(userId, authorId) {
  return repo().addBlock(userId, authorId);
}
async function removeBlock(userId, authorId) {
  return repo().removeBlock(userId, authorId);
}
async function storePublicKey(userId, publicKey) {
  return repo().storePublicKey(userId, publicKey);
}
async function loadPreKeyBundle(peerId) {
  return repo().loadPreKeyBundle(peerId);
}
async function storeEnvelope(envelope) {
  return repo().storeEnvelope(envelope);
}
async function isTemplatePublished(templateId) {
  return repo().isTemplatePublished(templateId);
}
async function recordTemplateUse(templateId, appUserId) {
  return repo().recordTemplateUse(templateId, appUserId);
}
async function isPostVisible(postId) {
  return repo().isPostVisible(postId);
}
async function likePost(postId, appUserId) {
  return repo().likePost(postId, appUserId);
}
async function likeCount(postId) {
  return repo().likeCount(postId);
}
async function loadCreatorOffer(creatorId) {
  return repo().loadCreatorOffer(creatorId);
}
async function linkCreatorSubscription(link) {
  return repo().linkCreatorSubscription(link);
}
async function listCreatorSubscriptions(appUserId) {
  return repo().listCreatorSubscriptions(appUserId);
}
async function loadActivePurchase(appUserId, productId) {
  return repo().loadActivePurchase(appUserId, productId);
}
async function isDmPermitted(senderId, conversationId) {
  return repo().isDmPermitted(senderId, conversationId);
}
async function loadWeeklyScores() {
  // Haftalık puanlama Redis ZSET'inde tutulur (reward_automation/scoring.js);
  // SQL tarafında karşılığı yoktur. Redis bağlı değilse sıralama BOŞ döner —
  // uydurulmuş bir sıralama göstermek, ödül vaadini yanlış bilgiyle
  // beslemek olurdu.
  return [];
}
async function loadTemplates(cursor) {
  return repo().loadTemplates(cursor);
}
async function createTemplate(template) {
  return repo().createTemplate(template);
}
async function createStory(story) {
  return repo().createContent({
    contentId: story.storyId,
    authorId: story.authorId,
    kind: 'story',
    mediaRef: story.mediaRef,
    moderationState: story.moderationState,
    publishedAtMs: story.publishedAtMs,
  });
}
async function setModerationState(update) {
  return repo().setModerationState(update);
}
async function loadAttachmentState(attachmentId, ownerId) {
  return repo().loadAttachmentState(attachmentId, ownerId);
}
async function enqueueReview(item) {
  return repo().enqueueReview(item);
}
async function escalateToLegal(event) {
  // Yasal bildirim hattı (NCMEC vb.) dışarıdadır. Medyanın kendisi bu
  // çağrıda TAŞINMAZ; denetim kaydı içeride tutulur.
  console.error(
    `[Social] ESCALATE -> content=${shortId(event.contentId)} ` +
      `media=${event.mediaFingerprint} reasons=${event.reasons.join(',')}`,
  );
  return repo().writeAudit({
    action: 'legal_escalation',
    subjectId: event.authorId,
    detail: { reasons: event.reasons, mediaFingerprint: event.mediaFingerprint },
    atMs: event.atMs,
  });
}
async function suspendAccount(action) {
  // Otomatik askı: `banHammer` tavanı (suspend) aşılamaz.
  const banHammer = require('../core_gateway/moderation/banHammer');
  const record = banHammer.makeSanction({
    userId: action.userId,
    sanction: banHammer.SANCTION.SUSPEND,
    reason: action.reason,
    automatic: true,
    nowMs: action.atMs,
  });
  await repo().persistSanction(record);
  await repo().hideUserContent(action.userId);
  return repo().writeAudit({
    action: 'auto_suspend',
    subjectId: action.userId,
    detail: { reason: action.reason },
    atMs: action.atMs,
  });
}


/**
 * Moderasyon kapısının bağımlılıkları.
 *
 * `scanMedia` ORTAMDAN kurulur (`MODERATION_SCANNER_URL`). Adres tanımlı
 * değilse fırlatan yer tutucu kalır ve fail-closed korunur — ama bu,
 * hiçbir içeriğin onaylanmaması demektir: her yükleme `pending` kalır,
 * akış kalıcı olarak boş görünür. Bu yüzden `configureScanner()` açılışta
 * yüksek sesle uyarıyor; sessizce yapılandırılmamış kalmak, boş bir
 * uygulama yayınlamaktır.
 */
const moderationDeps = {
  scanMedia: unconfiguredScanner,
  setModerationState,
  enqueueReview,
  escalate: escalateToLegal,
  suspendAccount,
};

/**
 * Tarayıcıyı ortamdan kurar. `server.js` açılışta çağırır.
 *
 * Testler bu fonksiyonu ÇAĞIRMAZ ve kendi `scanMedia`'sını enjekte eder;
 * gerçek bir HTTP tarayıcısına bağlı testler, ağ olmadan çalışmazdı.
 */
function configureScanner(env = process.env) {
  const scanner = createScannerFromEnv(env);
  moderationDeps.scanMedia = scanner.scanMedia;

  if (!scanner.configured) {
    console.warn(
      '[Moderation] MODERATION_SCANNER_URL TANIMLI DEĞİL — tarayıcı yok.\n' +
        '  Fail-closed davranış korunuyor: yüklenen HİÇBİR içerik onaylanmayacak,\n' +
        '  hepsi `pending` kalacak ve akış boş görünecek. Üretimde bu bir arızadır.',
    );
  }
  return scanner.configured;
}

module.exports = router;
module.exports.isVisibleTo = isVisibleTo;
module.exports.moderationDeps = moderationDeps;
module.exports.configureScanner = configureScanner;
// Kuyruk önceliği kapsam testi bu listeyi okur: her rapor gerekçesinin
// açık bir SLA önceliği olmalı, aksi hâlde sessizce 24 saate düşer.
module.exports.REPORT_REASONS = REPORT_REASONS;
// Yetenek kapsam testi bu listeyi istemcinin tip birliğiyle karşılaştırır.
module.exports.KNOWN_CAPABILITIES = KNOWN_CAPABILITIES;
module.exports.normalizeTier = normalizeTier;
module.exports.ACCESS_TIERS = ACCESS_TIERS;
module.exports.isValidId = isValidId;
module.exports.ID_MAX_LENGTH = ID_MAX_LENGTH;
module.exports.safeText = safeText;
module.exports.CREATOR_TIERS = CREATOR_TIERS;
module.exports.creatorProductId = creatorProductId;
module.exports.CREATOR_PRODUCT_PREFIX = CREATOR_PRODUCT_PREFIX;
