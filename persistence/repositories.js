/**
 * persistence/repositories.js
 *
 * Uçların ihtiyaç duyduğu TÜM veri erişimi — gerçek SQL.
 *
 * Bu dosya, daha önce `console.log` yazıp `null` döndüren örnek
 * fonksiyonların yerini alır. Kararlar (kim ne görür, ne bloke edilir)
 * politika modüllerinde kalır; burada yalnızca okuma ve yazma vardır.
 *
 * HER FONKSİYON ASENKRON
 * SQLite sürücüsü senkron, PostgreSQL asenkron çalışır. Hepsini `await`
 * ile çağırmak, tek bir depo kodunun iki motorda da çalışmasını sağlar —
 * senkron/asenkron ayrımı çağrı yerlerine sızmaz.
 *
 * FAIL-CLOSED OKUMA
 * Bulunamayan kayıt için "izin verilir" anlamına gelen bir varsayılan
 * DÖNDÜRÜLMEZ. `loadAttachmentState` bilinmeyen eki 'unknown' sayar,
 * `loadAccount` bilinmeyen hesabı `null` bırakır ve çağıran taraf onu
 * 'unverified' kademesine indirir.
 */

'use strict';

const crypto = require('node:crypto');

/** Boolean → INTEGER (SQLite'ta boolean tipi yoktur). */
const bit = (value) => (value ? 1 : 0);
/** INTEGER → boolean. */
const bool = (value) => value === 1 || value === true;

const json = {
  read(text, fallback) {
    try {
      return JSON.parse(text ?? '');
    } catch {
      return fallback;
    }
  },
  write(value) {
    return JSON.stringify(value ?? null);
  },
};

function createRepositories(driver) {
  const { run, get, all } = driver;

  return {
    driver,

    // ====================================================== hesaplar ====

    async loadAccount(appUserId) {
      const row = await get(
        `SELECT a.app_user_id, a.tier, a.adult_opt_in, a.store, a.handle, a.gender,
                COALESCE(e.is_pro, 0) AS is_pro
           FROM accounts a
           LEFT JOIN entitlements e ON e.app_user_id = a.app_user_id
          WHERE a.app_user_id = ?`,
        [appUserId],
      );
      if (!row) return null;

      const blocked = await all(
        'SELECT blocked_id FROM blocks WHERE blocker_id = ?',
        [appUserId],
      );

      return {
        appUserId: row.app_user_id,
        tier: row.tier,
        adultContentOptIn: bool(row.adult_opt_in),
        store: row.store ?? null,
        handle: row.handle ?? null,
        gender: row.gender,
        isPro: bool(row.is_pro),
        blockedAuthorIds: blocked.map((r) => r.blocked_id),
      };
    },

    async upsertAccount(account, nowMs = Date.now()) {
      await run(
        `INSERT INTO accounts (app_user_id, tier, adult_opt_in, store, handle, gender,
                               created_at_ms, updated_at_ms)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (app_user_id) DO UPDATE SET
              tier = excluded.tier,
              adult_opt_in = excluded.adult_opt_in,
              store = excluded.store,
              handle = excluded.handle,
              gender = excluded.gender,
              updated_at_ms = excluded.updated_at_ms`,
        [
          account.appUserId,
          account.tier ?? 'unverified',
          bit(account.adultContentOptIn),
          account.store ?? null,
          account.handle ?? null,
          account.gender ?? 'unspecified',
          nowMs,
          nowMs,
        ],
      );
    },

    // ========================================================= yetki ====

    /**
     * Yetki kaydı — TÜREVLERİYLE BİRLİKTE.
     *
     * `willRenew`, `inTrial` ve `billingIssue` alanları EKSİKTİ. Uç
     * `record.willRenew === true` diye bakıyordu ve üçü de her zaman
     * `undefined` olduğu için istemciye HER ZAMAN `false` gidiyordu:
     *
     *   - Ödemesi başarısız olan abone UYARILMIYORDU; erişimini haber
     *     almadan kaybediyordu. Grace period'ın tüm amacı buydu.
     *   - Yenilenmeyecek abonelik yenilenecek gibi görünüyordu.
     *   - Deneme sürümüne özel metin hiç çıkmıyordu.
     *
     * Üçü de `status` ve `period_type` sütunlarından TÜRETİLİR; ayrı ayrı
     * saklanan bayraklar birbirinden ayrışır.
     */
    async loadEntitlement(appUserId) {
      const row = await get(
        `SELECT is_pro, expires_at_ms, product_id, status, period_type
           FROM entitlements WHERE app_user_id = ?`,
        [appUserId],
      );
      if (!row) {
        return {
          pro: false,
          status: 'expired',
          expiresAtMs: null,
          productId: null,
          willRenew: false,
          inTrial: false,
          billingIssue: false,
        };
      }

      const status = row.status;
      return {
        pro: bool(row.is_pro),
        status,
        expiresAtMs: row.expires_at_ms ?? null,
        productId: row.product_id ?? null,
        // 'grace' de yenilenecek sayılır: mağaza hâlâ tahsilatı deniyor.
        willRenew: status === 'active' || status === 'grace',
        inTrial: row.period_type === 'trial',
        // 'grace' ödeme sorununun devamıdır; kullanıcı UYARILMALI.
        billingIssue: status === 'billing_issue' || status === 'grace',
      };
    },

    async grantEntitlement(
      { appUserId, productId, expiresAtMs, status = 'active', periodType = 'normal' },
      nowMs = Date.now(),
    ) {
      await run(
        `INSERT INTO entitlements (app_user_id, is_pro, expires_at_ms, product_id, status,
                                   period_type, updated_at_ms)
              VALUES (?, 1, ?, ?, ?, ?, ?)
         ON CONFLICT (app_user_id) DO UPDATE SET
              is_pro = 1,
              expires_at_ms = excluded.expires_at_ms,
              product_id = excluded.product_id,
              status = excluded.status,
              period_type = excluded.period_type,
              updated_at_ms = excluded.updated_at_ms`,
        [appUserId, expiresAtMs ?? null, productId ?? null, status, periodType, nowMs],
      );
    },

    async revokeEntitlement(appUserId, nowMs = Date.now()) {
      await run(
        `INSERT INTO entitlements (app_user_id, is_pro, status, updated_at_ms)
              VALUES (?, 0, 'expired', ?)
         ON CONFLICT (app_user_id) DO UPDATE SET
              is_pro = 0, status = 'expired', updated_at_ms = excluded.updated_at_ms`,
        [appUserId, nowMs],
      );
    },

    async setEntitlementStatus(appUserId, status, nowMs = Date.now()) {
      // Grace period ve ödeme sorunu PRO'yu HEMEN kapatmaz: kartı reddedilen
      // abone, mağaza yeniden denerken uygulamayı kullanmaya devam eder.
      await run(
        `INSERT INTO entitlements (app_user_id, is_pro, status, updated_at_ms)
              VALUES (?, 1, ?, ?)
         ON CONFLICT (app_user_id) DO UPDATE SET
              status = excluded.status, updated_at_ms = excluded.updated_at_ms`,
        [appUserId, status, nowMs],
      );
    },

    // ================================================ içerik ve akış ====

    async createContent(content) {
      await run(
        `INSERT INTO content (content_id, author_id, kind, media_ref, caption, rating,
                              moderation_state, published_at_ms)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          content.contentId,
          content.authorId,
          content.kind,
          content.mediaRef ?? null,
          content.caption ?? '',
          content.rating ?? 'review',
          content.moderationState ?? 'pending',
          content.publishedAtMs,
        ],
      );
    },

    async setModerationState({ contentId, state, rating, scannedAtMs }) {
      await run(
        `UPDATE content
            SET moderation_state = ?, rating = ?, scanned_at_ms = ?
          WHERE content_id = ?`,
        [state, rating, scannedAtMs ?? Date.now(), contentId],
      );
    },

    /**
     * Akış sayfası.
     *
     * FİLTRE SQL'DE DE VAR: `moderation_state = 'approved'` ve kaldırılmamış
     * olma koşulu sorguya gömülü. `isVisibleTo` ikinci kattır; taranmamış
     * içeriği veritabanından hiç çekmemek, onu yanlışlıkla göndermenin
     * yolunu kapatır.
     */
    async loadFeedPage(cursor = null, limit = 30) {
      const before = cursor ? Number(cursor) : Number.MAX_SAFE_INTEGER;
      const rows = await all(
        `SELECT c.content_id, c.author_id, c.media_ref, c.caption, c.rating,
                c.moderation_state, c.reported_pending, c.published_at_ms,
                a.handle
           FROM content c
           LEFT JOIN accounts a ON a.app_user_id = c.author_id
          WHERE c.kind = 'post'
            AND c.moderation_state = 'approved'
            AND c.removed_at_ms IS NULL
            AND c.published_at_ms < ?
       ORDER BY c.published_at_ms DESC
          LIMIT ?`,
        [before, limit],
      );

      const posts = rows.map((r) => ({
        postId: r.content_id,
        contentId: r.content_id,
        authorId: r.author_id,
        authorHandle: r.handle ?? r.author_id,
        mediaUri: r.media_ref,
        caption: r.caption,
        rating: r.rating,
        moderationState: r.moderation_state,
        reportedPendingReview: bool(r.reported_pending),
        publishedAtMs: r.published_at_ms,
      }));

      const nextCursor = posts.length === limit
        ? String(posts[posts.length - 1].publishedAtMs)
        : null;

      return { posts, nextCursor };
    },

    async loadStories(nowMs = Date.now()) {
      const cutoff = nowMs - 24 * 60 * 60 * 1000;
      const rows = await all(
        `SELECT c.content_id, c.author_id, c.media_ref, c.rating, c.moderation_state,
                c.reported_pending, c.published_at_ms, a.handle
           FROM content c
           LEFT JOIN accounts a ON a.app_user_id = c.author_id
          WHERE c.kind = 'story'
            AND c.moderation_state = 'approved'
            AND c.removed_at_ms IS NULL
            AND c.published_at_ms > ?
       ORDER BY c.published_at_ms DESC`,
        [cutoff],
      );

      return rows.map((r) => ({
        storyId: r.content_id,
        contentId: r.content_id,
        authorId: r.author_id,
        authorHandle: r.handle ?? r.author_id,
        mediaUri: r.media_ref,
        rating: r.rating,
        moderationState: r.moderation_state,
        reportedPendingReview: bool(r.reported_pending),
        publishedAtMs: r.published_at_ms,
      }));
    },

    async suspendContent(contentId) {
      // Askıya alma İNCELEMEYİ BEKLEMEZ; içerik anında görünmez olur.
      await run(
        "UPDATE content SET reported_pending = 1, moderation_state = 'pending' WHERE content_id = ?",
        [contentId],
      );
    },

    async removeContent(contentId, nowMs = Date.now()) {
      await run(
        "UPDATE content SET moderation_state = 'blocked', removed_at_ms = ? WHERE content_id = ?",
        [nowMs, contentId],
      );
    },

    async restoreContent(contentId) {
      // Yanlış pozitif geri alındı: içerik yeniden yayına girer.
      await run(
        `UPDATE content
            SET moderation_state = 'approved', reported_pending = 0, removed_at_ms = NULL
          WHERE content_id = ?`,
        [contentId],
      );
    },

    async loadAttachmentState(attachmentId, ownerId) {
      const row = await get(
        "SELECT moderation_state FROM content WHERE content_id = ? AND author_id = ? AND kind = 'dm-attachment'",
        [attachmentId, ownerId],
      );
      // FAIL-CLOSED: bilinmeyen kimlik 'approved' DEĞİLDİR.
      return row?.moderation_state ?? 'unknown';
    },

    // ===================================================== engelleme ====

    async addBlock(blockerId, blockedId, nowMs = Date.now()) {
      await run(
        `INSERT INTO blocks (blocker_id, blocked_id, created_at_ms) VALUES (?, ?, ?)
         ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
        [blockerId, blockedId, nowMs],
      );
    },

    async removeBlock(blockerId, blockedId) {
      await run('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?', [blockerId, blockedId]);
    },

    // ====================================================== raporlar ====

    async recordReport(report) {
      await run(
        `INSERT INTO reports (report_id, content_id, author_id, reporter_id, reason, note,
                              suspended, created_at_ms)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          report.contentId,
          report.authorId,
          report.reporterId,
          report.reason,
          report.note ?? '',
          bit(report.suspended),
          Date.now(),
        ],
      );
    },

    async recordMessageReport(report) {
      await run(
        `INSERT INTO message_reports (report_id, conversation_id, reported_message_id,
                                      reported_user_id, reporter_id, reason, context_json,
                                      created_at_ms)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          report.conversationId,
          report.reportedMessageId,
          report.reportedUserId ?? null,
          report.reporterId,
          report.reason,
          json.write(report.context ?? []),
          Date.now(),
        ],
      );
    },

    // ============================================ moderasyon kuyruğu ====

    async enqueueReview(item) {
      const { makeItem } = require('../core_gateway/moderation/queue');
      const record = makeItem({
        contentId: item.contentId,
        authorId: item.authorId,
        kind: item.kind,
        reasons: item.reasons,
        source: item.source,
        reporterId: item.reporterId,
        createdAtMs: item.createdAtMs ?? Date.now(),
        priority: item.priority,
      });

      await run(
        `INSERT INTO moderation_queue (item_id, content_id, author_id, kind, reasons_json,
                                       source, reporter_id, priority, created_at_ms,
                                       due_at_ms, state)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
        [
          record.id,
          record.contentId,
          record.authorId ?? null,
          record.kind,
          json.write([...record.reasons]),
          record.source,
          record.reporterId,
          record.priority,
          record.createdAtMs,
          record.dueAtMs,
        ],
      );
      return record;
    },

    async loadOpenItems(limit = 200) {
      const rows = await all(
        "SELECT * FROM moderation_queue WHERE state = 'open' ORDER BY created_at_ms ASC LIMIT ?",
        [limit],
      );
      return rows.map(queueRowToItem);
    },

    async loadItem(itemId) {
      const row = await get('SELECT * FROM moderation_queue WHERE item_id = ?', [itemId]);
      return row ? queueRowToItem(row) : null;
    },

    /**
     * ATOMİK sahiplenme.
     *
     * `claimed_by IS NULL` koşulu UPDATE'in İÇİNDE. Önce okuyup sonra
     * yazmak, iki nöbetçinin aynı olayı sahiplenmesine ve ikinci kararın
     * birinciyi ezmesine izin verirdi.
     */
    async claimItem(itemId, moderatorId) {
      const result = await run(
        "UPDATE moderation_queue SET claimed_by = ? WHERE item_id = ? AND claimed_by IS NULL AND state = 'open'",
        [moderatorId, itemId],
      );
      if (result.changes === 0) return null;
      return this.loadItem(itemId);
    },

    async persistItem(item) {
      await run(
        `UPDATE moderation_queue
            SET state = ?, priority = ?, due_at_ms = ?, decision = ?, decided_by = ?,
                decided_at_ms = ?, within_sla = ?, note = ?
          WHERE item_id = ?`,
        [
          item.state,
          item.priority,
          item.dueAtMs,
          item.decision ?? null,
          item.decidedBy ?? null,
          item.decidedAtMs ?? null,
          item.withinSla === undefined ? null : bit(item.withinSla),
          item.note ?? '',
          item.id,
        ],
      );
    },

    // ==================================================== yaptırımlar ====

    async persistSanction(record) {
      await run(
        `INSERT INTO sanctions (sanction_id, user_id, sanction, reason, evidence_json,
                                moderator_id, automatic, applied_at_ms, expires_at_ms, appealable)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.id,
          record.userId,
          record.sanction,
          record.reason,
          json.write([...record.evidenceIds]),
          record.moderatorId,
          bit(record.automatic),
          record.appliedAtMs,
          record.expiresAtMs,
          bit(record.appealable),
        ],
      );
    },

    async loadSanction(sanctionId) {
      const row = await get('SELECT * FROM sanctions WHERE sanction_id = ?', [sanctionId]);
      return row ? sanctionRowToRecord(row) : null;
    },

    async loadActiveSanctions(userId) {
      const rows = await all(
        'SELECT * FROM sanctions WHERE user_id = ? AND lifted_at_ms IS NULL',
        [userId],
      );
      return rows.map(sanctionRowToRecord);
    },

    async persistLift({ sanctionId, liftedAtMs, moderatorId }) {
      await run(
        'UPDATE sanctions SET lifted_at_ms = ?, lifted_by = ? WHERE sanction_id = ?',
        [liftedAtMs, moderatorId, sanctionId],
      );
    },

    async hideUserContent(userId, nowMs = Date.now()) {
      await run(
        "UPDATE content SET moderation_state = 'blocked' WHERE author_id = ? AND removed_at_ms IS NULL",
        [userId],
      );
      void nowMs;
    },

    async restoreUserContent(userId) {
      if (!userId) return;
      await run(
        "UPDATE content SET moderation_state = 'approved' WHERE author_id = ? AND removed_at_ms IS NULL",
        [userId],
      );
    },

    async purgeUserContent(userId, nowMs = Date.now()) {
      await run(
        "UPDATE content SET moderation_state = 'blocked', removed_at_ms = ?, media_ref = NULL WHERE author_id = ?",
        [nowMs, userId],
      );
    },

    async blockDeviceFingerprints(userId, fingerprints = [], nowMs = Date.now()) {
      for (const fingerprint of fingerprints) {
        await run(
          `INSERT INTO device_blocks (fingerprint, user_id, created_at_ms) VALUES (?, ?, ?)
           ON CONFLICT (fingerprint) DO NOTHING`,
          [fingerprint, userId, nowMs],
        );
      }
    },

    async revokeSessions(userId) {
      // Oturumlar imzalı ve kısa ömürlü token'lardır; iptal, yetkinin
      // yeniden okunmasıyla olur. Kayıt denetim için tutulur.
      await this.writeAudit({ action: 'revoke_sessions', subjectId: userId, atMs: Date.now() });
    },

    async writeAudit(entry) {
      await run(
        `INSERT INTO audit_log (audit_id, action, subject_id, actor_id, detail_json, at_ms)
              VALUES (?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          entry.action,
          entry.subjectId ?? entry.userId ?? entry.itemId ?? null,
          entry.actorId ?? entry.moderatorId ?? null,
          json.write(entry),
          entry.atMs ?? Date.now(),
        ],
      );
    },

    // ============================================================ DM ====

    async storePublicKey(userId, publicKey, nowMs = Date.now()) {
      await run(
        `INSERT INTO dm_keys (app_user_id, public_key, updated_at_ms) VALUES (?, ?, ?)
         ON CONFLICT (app_user_id) DO UPDATE SET
              public_key = excluded.public_key, updated_at_ms = excluded.updated_at_ms`,
        [userId, publicKey, nowMs],
      );
    },

    async loadPreKeyBundle(peerId) {
      const row = await get('SELECT public_key FROM dm_keys WHERE app_user_id = ?', [peerId]);
      return row?.public_key ?? null;
    },

    async storeEnvelope(envelope) {
      await run(
        `INSERT INTO dm_envelopes (message_id, conversation_id, sender_id, ciphertext,
                                   attachment_json, sent_at_ms)
              VALUES (?, ?, ?, ?, ?, ?)`,
        [
          envelope.messageId,
          envelope.conversationId,
          envelope.senderId,
          envelope.ciphertext,
          json.write(envelope.attachmentIds ?? []),
          envelope.sentAtMs ?? Date.now(),
        ],
      );
    },

    /**
     * Gönderen bu konuşmanın üyesi mi.
     *
     * FAIL-CLOSED: üyelik kaydı yoksa izin YOKTUR. İzin kontrolünü
     * istemciye bırakmak, tanımadık birinin herhangi bir konuşma kimliğine
     * mesaj yazabilmesi demektir.
     */
    async isDmPermitted(senderId, conversationId) {
      const row = await get(
        'SELECT 1 AS ok FROM conversations WHERE conversation_id = ? AND member_id = ?',
        [conversationId, senderId],
      );
      return row !== null;
    },

    async addConversationMember(conversationId, memberId) {
      await run(
        `INSERT INTO conversations (conversation_id, member_id) VALUES (?, ?)
         ON CONFLICT (conversation_id, member_id) DO NOTHING`,
        [conversationId, memberId],
      );
    },

    // ===================================================== şablonlar ====

    async loadTemplates(cursor = null, limit = 30) {
      const before = cursor ? Number(cursor) : Number.MAX_SAFE_INTEGER;
      const rows = await all(
        `SELECT t.*, a.handle
           FROM templates t
           LEFT JOIN accounts a ON a.app_user_id = t.author_id
          WHERE t.moderation_state = 'approved' AND t.created_at_ms < ?
       ORDER BY t.created_at_ms DESC
          LIMIT ?`,
        [before, limit],
      );

      const templates = rows.map((r) => ({
        templateId: r.template_id,
        contentId: r.template_id,
        authorId: r.author_id,
        authorHandle: r.handle ?? r.author_id,
        title: r.title,
        previewUri: r.preview_uri,
        steps: json.read(r.steps_json, []),
        proOnly: bool(r.pro_only),
        creatorOnly: bool(r.creator_only),
        useCount: r.use_count,
        rating: r.rating,
        moderationState: r.moderation_state,
      }));

      const nextCursor = templates.length === limit
        ? String(rows[rows.length - 1].created_at_ms)
        : null;

      return { templates, nextCursor };
    },

    async createTemplate(template, nowMs = Date.now()) {
      const templateId = crypto.randomUUID();
      await run(
        `INSERT INTO templates (template_id, author_id, title, preview_uri, steps_json,
                                pro_only, moderation_state, created_at_ms)
              VALUES (?, ?, ?, ?, ?, ?, 'approved', ?)`,
        [
          templateId,
          template.authorId,
          template.title,
          template.previewUri,
          json.write(template.steps ?? []),
          bit(template.proOnly),
          nowMs,
        ],
      );
      return templateId;
    },

    /**
     * Şablon kullanımını KULLANICI BAŞINA BİR KEZ sayar.
     *
     * `use_count` creator gelir payını etkilediği için sayaç doğrudan
     * artırılmıyor: ağ yeniden denemesi ya da aynı kullanıcının şablonu
     * yüzlerce kez uygulaması sayıyı şişirirdi. Ekleme çakışırsa sayaç
     * artırılMAZ.
     *
     * Dönen değer, bu çağrının sayacı artırıp artırmadığıdır.
     */
    async recordTemplateUse(templateId, appUserId, nowMs = Date.now()) {
      const inserted = await run(
        `INSERT INTO template_uses (template_id, app_user_id, used_at_ms)
              VALUES (?, ?, ?)
         ON CONFLICT (template_id, app_user_id) DO NOTHING`,
        [templateId, appUserId, nowMs],
      );
      if (inserted.changes === 0) return false;

      // Sayaç, tekil kullanıcı tablosundan TÜRETİLİR. Bağımsız artırmak,
      // araya giren bir hata durumunda sayacın tablodan sapması demektir.
      await run(
        `UPDATE templates
            SET use_count = (SELECT COUNT(*) FROM template_uses WHERE template_id = ?)
          WHERE template_id = ?`,
        [templateId, templateId],
      );
      return true;
    },

    /** Şablon var mı ve yayında mı — kullanım kaydından önce. */
    async isTemplatePublished(templateId) {
      const row = await get(
        "SELECT 1 AS ok FROM templates WHERE template_id = ? AND moderation_state = 'approved'",
        [templateId],
      );
      return row !== null && row !== undefined;
    },

    // ====================================================== beğeniler ====

    /**
     * Gönderiyi beğenir. İKİNCİ BEĞENİ SESSİZCE YOK SAYILIR.
     *
     * `false` dönmesi hata değildir: istemci isteği yeniden gönderdiğinde
     * de aynı sonucu görür ve kullanıcıya hata gösterilmez.
     */
    async likePost(postId, appUserId, nowMs = Date.now()) {
      const result = await run(
        `INSERT INTO post_likes (post_id, app_user_id, created_at_ms)
              VALUES (?, ?, ?)
         ON CONFLICT (post_id, app_user_id) DO NOTHING`,
        [postId, appUserId, nowMs],
      );
      return result.changes > 0;
    },

    async likeCount(postId) {
      const row = await get('SELECT COUNT(*) AS n FROM post_likes WHERE post_id = ?', [postId]);
      return Number(row?.n ?? 0);
    },

    /** Gönderi yayında mı — beğeni kaydından önce. */
    async isPostVisible(postId) {
      const row = await get(
        `SELECT 1 AS ok FROM content
          WHERE content_id = ? AND moderation_state = 'approved' AND removed_at_ms IS NULL`,
        [postId],
      );
      return row !== null && row !== undefined;
    },

    // ================================================= satın alma kaydı ====

    /**
     * Ürün bazında satın almayı kaydeder (RevenueCat webhook'undan).
     *
     * Yeniden çalıştırılabilir: webhook 5 sn içinde 2xx görmezse aynı olayı
     * tekrar gönderir, bu yüzden ekleme değil upsert.
     */
    async recordPurchase({ appUserId, productId, expiresAtMs, status = 'active' }, nowMs = Date.now()) {
      await run(
        `INSERT INTO store_purchases (app_user_id, product_id, expires_at_ms, status, updated_at_ms)
              VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (app_user_id, product_id) DO UPDATE SET
              expires_at_ms = excluded.expires_at_ms,
              status        = excluded.status,
              updated_at_ms = excluded.updated_at_ms`,
        [appUserId, productId, expiresAtMs ?? null, status, nowMs],
      );
    },

    /** Süresi dolan satın alma SİLİNMEZ, işaretlenir. */
    async expirePurchase(appUserId, productId, nowMs = Date.now()) {
      await run(
        `UPDATE store_purchases SET status = 'expired', updated_at_ms = ?
          WHERE app_user_id = ? AND product_id = ?`,
        [nowMs, appUserId, productId],
      );
    },

    /**
     * Belirli bir ürün için AKTİF satın alma.
     *
     * Bitiş anı yoksa aktif SAYILMAZ: süresi bilinmeyen bir satın almayı
     * süresiz erişim saymak, iptal edilmiş aboneliğe erişim vermektir.
     */
    async loadActivePurchase(appUserId, productId, nowMs = Date.now()) {
      const row = await get(
        `SELECT product_id, expires_at_ms, status FROM store_purchases
          WHERE app_user_id = ? AND product_id = ?`,
        [appUserId, productId],
      );
      if (!row) return null;
      if (row.status !== 'active') return null;
      if (row.expires_at_ms === null || row.expires_at_ms === undefined) return null;
      if (row.expires_at_ms <= nowMs) return null;

      return {
        productId: row.product_id,
        expiresAtMs: row.expires_at_ms,
        status: row.status,
      };
    },

    // ================================================ creator abonelik ====

    async loadCreatorOffer(creatorId) {
      const row = await get(
        `SELECT o.creator_id, o.creator_handle, o.tier, o.perks_json, o.active
           FROM creator_offers o
          WHERE o.creator_id = ?`,
        [creatorId],
      );
      if (!row) return null;
      // Kapatılmış teklif YOK sayılır, "pasif" olarak DÖNDÜRÜLMEZ: istemci
      // pasif bir teklifi de satın alma akışına sokabilirdi.
      if (!bool(row.active)) return null;

      return {
        creatorId: row.creator_id,
        creatorHandle: row.creator_handle,
        tier: row.tier,
        perks: json.read(row.perks_json, []),
      };
    },

    async upsertCreatorOffer(offer, nowMs = Date.now()) {
      await run(
        `INSERT INTO creator_offers (creator_id, creator_handle, tier, perks_json,
                                     active, updated_at_ms)
              VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (creator_id) DO UPDATE SET
              creator_handle = excluded.creator_handle,
              tier           = excluded.tier,
              perks_json     = excluded.perks_json,
              active         = excluded.active,
              updated_at_ms  = excluded.updated_at_ms`,
        [
          offer.creatorId,
          offer.creatorHandle,
          offer.tier,
          json.write(offer.perks ?? []),
          bit(offer.active ?? true),
          nowMs,
        ],
      );
    },

    /**
     * Satın almayı creator'a bağlar.
     *
     * Bitiş anı MAĞAZADAN gelir; burada uydurulmaz. `expiresAtMs`
     * verilmediğinde null kalır ve `isCreatorSubscriptionActive` bunu
     * "aktif değil" sayar — süresi bilinmeyen bir aboneliği süresiz erişim
     * saymak, iptal edilmiş aboneliğe erişim vermek demektir.
     */
    async linkCreatorSubscription(link, nowMs = Date.now()) {
      await run(
        `INSERT INTO creator_subscriptions (creator_id, app_user_id, expires_at_ms,
                                            will_renew, updated_at_ms)
              VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (creator_id, app_user_id) DO UPDATE SET
              expires_at_ms = excluded.expires_at_ms,
              will_renew    = excluded.will_renew,
              updated_at_ms = excluded.updated_at_ms`,
        [
          link.creatorId,
          link.appUserId,
          link.expiresAtMs ?? null,
          bit(link.willRenew),
          nowMs,
        ],
      );
      return this.loadCreatorSubscription(link.creatorId, link.appUserId, nowMs);
    },

    async loadCreatorSubscription(creatorId, appUserId, nowMs = Date.now()) {
      const row = await get(
        `SELECT creator_id, expires_at_ms, will_renew
           FROM creator_subscriptions
          WHERE creator_id = ? AND app_user_id = ?`,
        [creatorId, appUserId],
      );
      if (!row) return null;
      return creatorSubscriptionRow(row, nowMs);
    },

    /**
     * Kullanıcının creator abonelikleri.
     *
     * Süresi geçmiş kayıtlar SİLİNMEZ (kullanıcı geçmişini görebilmeli) ama
     * `active: false` olarak döner.
     */
    async listCreatorSubscriptions(appUserId, nowMs = Date.now()) {
      const rows = await all(
        `SELECT creator_id, expires_at_ms, will_renew
           FROM creator_subscriptions
          WHERE app_user_id = ?
       ORDER BY updated_at_ms DESC`,
        [appUserId],
      );
      return rows.map((row) => creatorSubscriptionRow(row, nowMs));
    },

    // =============================================== dışa aktarım kotası ====

    /**
     * Dışa aktarım kaydı — YETKİ DURUMUYLA BİRLİKTE.
     *
     * `isPro` alanı EKSİKTİ. Kota uçları `record?.isPro === true` diye
     * bakıyordu ve bu koşul HER ZAMAN false'tu: ödeme yapan abone ücretsiz
     * kullanıcı gibi sayılıyor, tek ücretsiz hakkını harcadıktan sonra
     * `allowed: false` alıp paywall'a çarpıyordu. Ödediği şeyi
     * kullanamıyordu.
     *
     * Yetki, `entitlements` tablosundan JOIN ile geliyor: iki ayrı sorgu
     * yapmak, aradaki bir yazma sırasında tutarsız bir karar üretebilirdi.
     */
    async loadExportRecord(appUserId, nowMs = Date.now()) {
      const row = await get(
        `SELECT COALESCE(q.used_free_exports, 0) AS used_free_exports,
                COALESCE(e.is_pro, 0) AS is_pro,
                e.expires_at_ms
           FROM (SELECT ? AS app_user_id) k
           LEFT JOIN export_quota q ON q.app_user_id = k.app_user_id
           LEFT JOIN entitlements e ON e.app_user_id = k.app_user_id`,
        [appUserId],
      );

      // Süresi geçmiş yetki PRO SAYILMAZ: `is_pro` bayrağı webhook
      // gecikirse bir süre daha 1 kalabilir; bitiş anı esas alınır.
      const expiresAtMs = row?.expires_at_ms ?? null;
      const isPro =
        bool(row?.is_pro) && expiresAtMs !== null && expiresAtMs > nowMs;

      return {
        usedFreeExports: Number(row?.used_free_exports ?? 0),
        isPro,
        expiresAtMs,
      };
    },

    /**
     * Dışa aktarım sayacını ATOMİK olarak bir artırır ve yeni değeri döner.
     *
     * NEDEN AYRI BİR FONKSİYON
     * Uç önce okuyup sonra `used + 1` yazıyordu. İki eşzamanlı istek (çift
     * dokunuş ya da yavaş yanıt sonrası yeniden deneme) aynı değeri okuyup
     * aynı değeri yazıyordu: kullanıcı BİR hakla İKİ dışa aktarım yapıyordu.
     * Mobilde bu yarışı tetiklemek kolaydır.
     *
     * Artırma SQL'in içinde yapılıyor; okunan değer üzerinden değil.
     * `RETURNING` yerine ayrı bir SELECT kullanılıyor: şema taşınabilir alt
     * kümede kalsın diye. Araya giren başka bir artış okunan değeri
     * büyütebilir ama sayaç ASLA eksik saymaz — kritik yön budur.
     */
    async incrementExportUsage(appUserId, nowMs = Date.now()) {
      await run(
        `INSERT INTO export_quota (app_user_id, used_free_exports, updated_at_ms)
              VALUES (?, 1, ?)
         ON CONFLICT (app_user_id) DO UPDATE SET
              used_free_exports = export_quota.used_free_exports + 1,
              updated_at_ms = excluded.updated_at_ms`,
        [appUserId, nowMs],
      );

      const row = await get(
        'SELECT used_free_exports FROM export_quota WHERE app_user_id = ?',
        [appUserId],
      );
      return Number(row?.used_free_exports ?? 1);
    },

    async saveExportRecord(appUserId, usedFreeExports, nowMs = Date.now()) {
      await run(
        `INSERT INTO export_quota (app_user_id, used_free_exports, updated_at_ms)
              VALUES (?, ?, ?)
         ON CONFLICT (app_user_id) DO UPDATE SET
              used_free_exports = excluded.used_free_exports,
              updated_at_ms = excluded.updated_at_ms`,
        [appUserId, usedFreeExports, nowMs],
      );
    },

    // ========================================================= ödüller ====

    async recordAward(award) {
      await run(
        `INSERT INTO reward_awards (award_id, week, app_user_id, rank, days, store, offer_id,
                                    code_fingerprint, redemption_url, expires_at_ms, issued_at_ms)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          award.week,
          award.appUserId ?? award.userId,
          award.rank,
          award.days,
          award.store,
          award.offerId,
          award.codeFingerprint,
          award.redemptionUrl,
          award.expiresAtMs,
          award.issuedAtMs ?? Date.now(),
        ],
      );
    },

    async loadPendingAwards(appUserId, nowMs = Date.now()) {
      const rows = await all(
        `SELECT week, rank, days, redemption_url, expires_at_ms
           FROM reward_awards
          WHERE app_user_id = ? AND acknowledged_at_ms IS NULL AND expires_at_ms > ?
       ORDER BY issued_at_ms DESC`,
        [appUserId, nowMs],
      );
      return rows.map((r) => ({
        week: r.week,
        rank: r.rank,
        days: r.days,
        redemptionUrl: r.redemption_url,
        expiresAtMs: r.expires_at_ms,
        acknowledgedAtMs: null,
      }));
    },

    async markAcknowledged(appUserId, week, nowMs = Date.now()) {
      await run(
        'UPDATE reward_awards SET acknowledged_at_ms = ? WHERE app_user_id = ? AND week = ?',
        [nowMs, appUserId, week],
      );
    },

    // ========================================== kısıtlı kimlik kaydı ====

    /**
     * Deepfake ve telif kapısı.
     *
     * HATA FIRLATIR, BOŞ DİZİ DÖNDÜRMEZ: veritabanı hatasında "eşleşme yok"
     * demek, kapıyı sessizce açmaktır. Çağıran taraf 500 döndürür.
     */
    async lookupRestrictedNames(matchKeys) {
      if (!Array.isArray(matchKeys) || matchKeys.length === 0) return [];
      const placeholders = matchKeys.map(() => '?').join(', ');
      const rows = await all(
        `SELECT match_key, canonical, category FROM restricted_identities
          WHERE match_key IN (${placeholders})`,
        matchKeys,
      );
      return rows.map((r) => ({
        name: r.match_key,
        canonical: r.canonical,
        category: r.category,
      }));
    },

    async addRestrictedIdentity({ matchKey, canonical, category }, nowMs = Date.now()) {
      await run(
        `INSERT INTO restricted_identities (match_key, canonical, category, created_at_ms)
              VALUES (?, ?, ?, ?)
         ON CONFLICT (match_key) DO UPDATE SET
              canonical = excluded.canonical, category = excluded.category`,
        [matchKey, canonical, category, nowMs],
      );
    },
  };
}

// ------------------------------------------------------------- eşleyiciler ----

function queueRowToItem(row) {
  return {
    id: row.item_id,
    contentId: row.content_id,
    authorId: row.author_id,
    kind: row.kind,
    reasons: json.read(row.reasons_json, []),
    source: row.source,
    reporterId: row.reporter_id,
    priority: row.priority,
    createdAtMs: row.created_at_ms,
    dueAtMs: row.due_at_ms,
    state: row.state,
    claimedBy: row.claimed_by ?? null,
    decision: row.decision ?? null,
    decidedBy: row.decided_by ?? null,
    decidedAtMs: row.decided_at_ms ?? null,
    withinSla: row.within_sla === null ? undefined : bool(row.within_sla),
    note: row.note ?? '',
  };
}

function sanctionRowToRecord(row) {
  return {
    id: row.sanction_id,
    userId: row.user_id,
    sanction: row.sanction,
    reason: row.reason,
    evidenceIds: json.read(row.evidence_json, []),
    moderatorId: row.moderator_id ?? null,
    automatic: bool(row.automatic),
    appliedAtMs: row.applied_at_ms,
    expiresAtMs: row.expires_at_ms ?? null,
    liftedAtMs: row.lifted_at_ms ?? null,
    appealable: bool(row.appealable),
  };
}

/**
 * Abonelik satırını istemcinin `CreatorSubscriptionState` biçimine çevirir.
 *
 * `expires_at_ms` null ise AKTİF DEĞİLDİR. "Bitiş bilinmiyorsa süresiz"
 * varsaymak, mağazadan bitiş bilgisi gelmemiş (ya da iptal edilmiş) bir
 * aboneliğe kalıcı erişim vermek olurdu.
 */
function creatorSubscriptionRow(row, nowMs) {
  const expiresAtMs = row.expires_at_ms ?? null;
  return {
    creatorId: row.creator_id,
    active: expiresAtMs !== null && expiresAtMs > nowMs,
    expiresAtMs,
    willRenew: bool(row.will_renew),
  };
}

module.exports = { createRepositories };
