/**
 * Kalıcılık katmanı testleri — GERÇEK SQL.
 *
 * Bu testler bellek içi bir SQLite veritabanı üzerinde çalışır: şema
 * gerçekten uygulanır, sorgular gerçekten çalıştırılır. Sahte bir bellek
 * nesnesi kullanmak, SQL'in kendisini test etmemek olurdu — sözdizimi
 * hatası, eksik indeks veya yanlış JOIN sessizce geçerdi.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createSqliteDriver, createRepositories } = require('../persistence');

const T0 = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Her test kendi temiz veritabanını alır. */
function freshRepos() {
  const driver = createSqliteDriver(':memory:');
  driver.migrate();
  return createRepositories(driver);
}

// ============================================================ hesaplar ====

test('bilinmeyen hesap null döner — uydurulmuş varsayılan YOK', async () => {
  const repos = freshRepos();
  assert.equal(await repos.loadAccount('yok'), null);
});

test('hesap yazılır, okunur ve engel listesi birlikte gelir', async () => {
  const repos = freshRepos();
  await repos.upsertAccount({ appUserId: 'u1', tier: 'adult', handle: 'ali' }, T0);
  await repos.addBlock('u1', 'kotu-1', T0);
  await repos.addBlock('u1', 'kotu-2', T0);

  const account = await repos.loadAccount('u1');
  assert.equal(account.tier, 'adult');
  assert.equal(account.handle, 'ali');
  assert.deepEqual(account.blockedAuthorIds.sort(), ['kotu-1', 'kotu-2']);
  assert.equal(account.isPro, false);
});

test('aynı engel iki kez eklenince çakışma OLMAZ', async () => {
  const repos = freshRepos();
  await repos.upsertAccount({ appUserId: 'u1' }, T0);
  await repos.addBlock('u1', 'x', T0);
  await repos.addBlock('u1', 'x', T0);
  assert.equal((await repos.loadAccount('u1')).blockedAuthorIds.length, 1);
});

test('engel kaldırılır', async () => {
  const repos = freshRepos();
  await repos.upsertAccount({ appUserId: 'u1' }, T0);
  await repos.addBlock('u1', 'x', T0);
  await repos.removeBlock('u1', 'x');
  assert.deepEqual((await repos.loadAccount('u1')).blockedAuthorIds, []);
});

// =============================================================== yetki ====

test('yetkisiz kullanıcı PRO değildir', async () => {
  const repos = freshRepos();
  const e = await repos.loadEntitlement('yok');
  assert.equal(e.pro, false);
  assert.equal(e.status, 'expired');
});

test('yetki verilir, iptal edilir ve hesap okumasına yansır', async () => {
  const repos = freshRepos();
  await repos.upsertAccount({ appUserId: 'u1' }, T0);

  await repos.grantEntitlement(
    { appUserId: 'u1', productId: 'com.evengirl.app.pro.annual', expiresAtMs: T0 + 365 * DAY },
    T0,
  );
  assert.equal((await repos.loadEntitlement('u1')).pro, true);
  assert.equal((await repos.loadAccount('u1')).isPro, true);

  await repos.revokeEntitlement('u1', T0 + DAY);
  assert.equal((await repos.loadEntitlement('u1')).pro, false);
  assert.equal((await repos.loadAccount('u1')).isPro, false);
});

test('ödeme sorunu PRO\'yu HEMEN kapatmaz', async () => {
  // Kartı reddedilen abone, mağaza yeniden denerken uygulamayı kullanmaya
  // devam eder; grace period budur.
  const repos = freshRepos();
  await repos.grantEntitlement({ appUserId: 'u1', productId: 'p' }, T0);
  await repos.setEntitlementStatus('u1', 'billing_issue', T0 + HOUR);

  const e = await repos.loadEntitlement('u1');
  assert.equal(e.status, 'billing_issue');
  assert.equal(e.pro, true);
});

// ====================================================== içerik ve akış ====

test('taranmamış içerik akışa DÜŞMEZ', async () => {
  const repos = freshRepos();
  await repos.createContent({
    contentId: 'c1', authorId: 'u1', kind: 'post', mediaRef: 'm1',
    moderationState: 'pending', publishedAtMs: T0,
  });

  assert.equal((await repos.loadFeedPage()).posts.length, 0);

  await repos.setModerationState({
    contentId: 'c1', state: 'approved', rating: 'general', scannedAtMs: T0,
  });
  assert.equal((await repos.loadFeedPage()).posts.length, 1);
});

test('bloke edilen içerik akıştan düşer', async () => {
  const repos = freshRepos();
  await repos.createContent({
    contentId: 'c1', authorId: 'u1', kind: 'post', moderationState: 'approved',
    rating: 'general', publishedAtMs: T0,
  });
  assert.equal((await repos.loadFeedPage()).posts.length, 1);

  await repos.removeContent('c1', T0 + HOUR);
  assert.equal((await repos.loadFeedPage()).posts.length, 0);
});

test('yanlış pozitif geri alınınca içerik yayına DÖNER', async () => {
  const repos = freshRepos();
  await repos.createContent({
    contentId: 'c1', authorId: 'u1', kind: 'post', moderationState: 'approved',
    rating: 'general', publishedAtMs: T0,
  });
  await repos.removeContent('c1', T0);
  await repos.restoreContent('c1');
  assert.equal((await repos.loadFeedPage()).posts.length, 1);
});

test('rapor içeriği ANINDA gizler', async () => {
  const repos = freshRepos();
  await repos.createContent({
    contentId: 'c1', authorId: 'u1', kind: 'post', moderationState: 'approved',
    rating: 'general', publishedAtMs: T0,
  });
  await repos.suspendContent('c1');
  assert.equal((await repos.loadFeedPage()).posts.length, 0);
});

test('24 saati geçen hikaye dönmez', async () => {
  const repos = freshRepos();
  await repos.createContent({
    contentId: 'yeni', authorId: 'u1', kind: 'story', moderationState: 'approved',
    rating: 'general', publishedAtMs: T0 - HOUR,
  });
  await repos.createContent({
    contentId: 'eski', authorId: 'u1', kind: 'story', moderationState: 'approved',
    rating: 'general', publishedAtMs: T0 - 25 * HOUR,
  });

  const stories = await repos.loadStories(T0);
  assert.deepEqual(stories.map((s) => s.storyId), ['yeni']);
});

test('akış sayfalaması imleçle ilerler ve tekrar etmez', async () => {
  const repos = freshRepos();
  for (let i = 0; i < 5; i += 1) {
    await repos.createContent({
      contentId: `c${i}`, authorId: 'u1', kind: 'post', moderationState: 'approved',
      rating: 'general', publishedAtMs: T0 + i,
    });
  }

  const first = await repos.loadFeedPage(null, 2);
  assert.equal(first.posts.length, 2);
  assert.ok(first.nextCursor);

  const second = await repos.loadFeedPage(first.nextCursor, 2);
  const ilkKimlikler = first.posts.map((p) => p.postId);
  for (const post of second.posts) {
    assert.equal(ilkKimlikler.includes(post.postId), false, 'sayfa tekrar etti');
  }
});

test('bilinmeyen ek "approved" DEĞİLDİR (fail-closed)', async () => {
  const repos = freshRepos();
  assert.equal(await repos.loadAttachmentState('yok', 'u1'), 'unknown');

  // Başkasının eki de kendi eki sayılmaz.
  await repos.createContent({
    contentId: 'ek1', authorId: 'baskasi', kind: 'dm-attachment',
    moderationState: 'approved', publishedAtMs: T0,
  });
  assert.equal(await repos.loadAttachmentState('ek1', 'u1'), 'unknown');
  assert.equal(await repos.loadAttachmentState('ek1', 'baskasi'), 'approved');
});

// ============================================== moderasyon kuyruğu ====

test('kuyruk kaydı SLA vadesiyle birlikte yazılır ve okunur', async () => {
  const repos = freshRepos();
  const item = await repos.enqueueReview({
    contentId: 'c1', authorId: 'u1', kind: 'story',
    reasons: ['csam_hash_match'], source: 'proxy', createdAtMs: T0,
  });

  assert.equal(item.priority, 'critical');
  assert.equal(item.dueAtMs, T0 + HOUR);

  const loaded = await repos.loadItem(item.id);
  assert.equal(loaded.priority, 'critical');
  assert.equal(loaded.dueAtMs, T0 + HOUR);
  assert.deepEqual(loaded.reasons, ['csam_hash_match']);
});

test('İKİ NÖBETÇİ aynı olayı sahiplenemez', async () => {
  // Bu, atomikliğin asıl testi: önce oku sonra yaz olsaydı ikisi de
  // sahiplenir ve ikinci karar birinciyi ezerdi.
  const repos = freshRepos();
  const item = await repos.enqueueReview({
    contentId: 'c1', authorId: 'u1', reasons: ['spam'], source: 'report', createdAtMs: T0,
  });

  const ilk = await repos.claimItem(item.id, 'mod-1');
  const ikinci = await repos.claimItem(item.id, 'mod-2');

  assert.equal(ilk.claimedBy, 'mod-1');
  assert.equal(ikinci, null);
});

test('karar kaydedilir ve SLA uyumu tutulur', async () => {
  const repos = freshRepos();
  const queue = require('../core_gateway/moderation/queue');

  const item = await repos.enqueueReview({
    contentId: 'c1', authorId: 'u1', reasons: ['harassment'], source: 'report', createdAtMs: T0,
  });
  await repos.claimItem(item.id, 'mod-1');

  const loaded = await repos.loadItem(item.id);
  const resolved = queue.applyDecision(loaded, {
    decision: 'uphold', moderatorId: 'mod-1', nowMs: T0 + 2 * HOUR,
  });
  await repos.persistItem(resolved);

  const after = await repos.loadItem(item.id);
  assert.equal(after.state, 'closed');
  assert.equal(after.decision, 'uphold');
  assert.equal(after.withinSla, true);
});

test('kapanan kayıt açık listeden düşer', async () => {
  const repos = freshRepos();
  const item = await repos.enqueueReview({
    contentId: 'c1', authorId: 'u1', reasons: ['spam'], source: 'report', createdAtMs: T0,
  });
  assert.equal((await repos.loadOpenItems()).length, 1);

  await repos.persistItem({ ...(await repos.loadItem(item.id)), state: 'closed' });
  assert.equal((await repos.loadOpenItems()).length, 0);
});

// ========================================================= yaptırımlar ====

test('yaptırım yazılır, okunur ve kaldırılır', async () => {
  const repos = freshRepos();
  const ban = require('../core_gateway/moderation/banHammer');

  const record = ban.makeSanction({
    userId: 'u1', sanction: 'suspend', reason: 'harassment',
    evidenceIds: ['c1'], moderatorId: 'mod-1', automatic: false,
    durationMs: 7 * DAY, nowMs: T0,
  });
  await repos.persistSanction(record);

  const loaded = await repos.loadSanction(record.id);
  assert.equal(loaded.sanction, 'suspend');
  assert.equal(loaded.expiresAtMs, T0 + 7 * DAY);
  assert.deepEqual(loaded.evidenceIds, ['c1']);
  assert.equal(ban.isActive(loaded, T0 + DAY), true);

  await repos.persistLift({ sanctionId: record.id, liftedAtMs: T0 + 2 * DAY, moderatorId: 'lead-1' });
  assert.equal(ban.isActive(await repos.loadSanction(record.id), T0 + 3 * DAY), false);
});

test('etkin yaptırımlar okunur, kaldırılmış olan gelmez', async () => {
  const repos = freshRepos();
  const ban = require('../core_gateway/moderation/banHammer');

  const a = ban.makeSanction({
    userId: 'u1', sanction: 'shadow', reason: 'spam',
    moderatorId: 'm1', automatic: false, nowMs: T0,
  });
  const b = ban.makeSanction({
    userId: 'u1', sanction: 'ban', reason: 'harassment',
    moderatorId: 'm1', automatic: false, nowMs: T0,
  });
  await repos.persistSanction(a);
  await repos.persistSanction(b);
  await repos.persistLift({ sanctionId: a.id, liftedAtMs: T0 + HOUR, moderatorId: 'm1' });

  const active = await repos.loadActiveSanctions('u1');
  assert.deepEqual(active.map((s) => s.sanction), ['ban']);
});

test('yaptırım kullanıcının içeriğini gizler', async () => {
  const repos = freshRepos();
  await repos.createContent({
    contentId: 'c1', authorId: 'u1', kind: 'post', moderationState: 'approved',
    rating: 'general', publishedAtMs: T0,
  });
  await repos.hideUserContent('u1');
  assert.equal((await repos.loadFeedPage()).posts.length, 0);

  await repos.restoreUserContent('u1');
  assert.equal((await repos.loadFeedPage()).posts.length, 1);
});

test('terminate içeriği kaldırır ve medya referansını SİLER', async () => {
  const repos = freshRepos();
  await repos.createContent({
    contentId: 'c1', authorId: 'u1', kind: 'post', mediaRef: 'storage://gizli',
    moderationState: 'approved', rating: 'general', publishedAtMs: T0,
  });
  await repos.purgeUserContent('u1', T0 + HOUR);

  const row = repos.driver.get('SELECT media_ref, removed_at_ms FROM content WHERE content_id = ?', ['c1']);
  assert.equal(row.media_ref, null);
  assert.equal(row.removed_at_ms, T0 + HOUR);
});

test('cihaz engelleri yazılır ve tekrar çakışmaz', async () => {
  const repos = freshRepos();
  await repos.blockDeviceFingerprints('u1', ['fp1', 'fp2'], T0);
  await repos.blockDeviceFingerprints('u1', ['fp1'], T0);
  assert.equal(repos.driver.all('SELECT * FROM device_blocks').length, 2);
});

test('her yaptırım denetim kaydı üretir', async () => {
  const repos = freshRepos();
  await repos.writeAudit({ action: 'sanction', userId: 'u1', moderatorId: 'm1', atMs: T0 });
  const rows = repos.driver.all('SELECT action, subject_id, actor_id FROM audit_log');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].subject_id, 'u1');
  assert.equal(rows[0].actor_id, 'm1');
});

// ================================================================= DM ====

test('sunucu yalnızca AÇIK anahtar taşır', async () => {
  const repos = freshRepos();
  await repos.storePublicKey('u1', 'ACIK-ANAHTAR', T0);
  assert.equal(await repos.loadPreKeyBundle('u1'), 'ACIK-ANAHTAR');
  assert.equal(await repos.loadPreKeyBundle('yok'), null);
});

test('konuşma üyesi olmayan mesaj GÖNDEREMEZ (fail-closed)', async () => {
  const repos = freshRepos();
  assert.equal(await repos.isDmPermitted('u1', 'conv-1'), false);

  await repos.addConversationMember('conv-1', 'u1');
  assert.equal(await repos.isDmPermitted('u1', 'conv-1'), true);
  assert.equal(await repos.isDmPermitted('yabanci', 'conv-1'), false);
});

test('şifreli zarf saklanır — sunucu içeriği çözemez', async () => {
  const repos = freshRepos();
  await repos.storeEnvelope({
    messageId: 'm1', conversationId: 'c1', senderId: 'u1',
    ciphertext: 'SIFRELI', attachmentIds: ['ek1'], sentAtMs: T0,
  });

  const row = repos.driver.get('SELECT * FROM dm_envelopes WHERE message_id = ?', ['m1']);
  assert.equal(row.ciphertext, 'SIFRELI');
  assert.deepEqual(JSON.parse(row.attachment_json), ['ek1']);
});

// ========================================================== şablonlar ====

test('şablon yazılır ve pazar listesinde görünür', async () => {
  const repos = freshRepos();
  await repos.upsertAccount({ appUserId: 'u1', handle: 'ali' }, T0);

  const id = await repos.createTemplate({
    authorId: 'u1', title: 'Botox portre', previewUri: 'storage://p',
    steps: [{ capability: 'botox-jawline', params: {} }], proOnly: true,
  }, T0);

  const { templates } = await repos.loadTemplates();
  assert.equal(templates.length, 1);
  assert.equal(templates[0].templateId, id);
  assert.equal(templates[0].authorHandle, 'ali');
  assert.equal(templates[0].proOnly, true);
  assert.deepEqual(templates[0].steps, [{ capability: 'botox-jawline', params: {} }]);
});

// ================================================= dışa aktarım kotası ====

test('kota kaydı yoksa sıfır kullanılmış sayılır ve PRO değildir', async () => {
  const repos = freshRepos();
  const record = await repos.loadExportRecord('yok');

  assert.equal(record.usedFreeExports, 0);
  // `isPro` alanı EKSİKTİ: kota uçları `record?.isPro === true` diye
  // bakıyordu ve bu koşul her zaman false'tu — ödeme yapan abone ücretsiz
  // kullanıcı gibi sayılıp paywall'a çarpıyordu.
  assert.equal(record.isPro, false);
});

test('kota kalıcıdır — uygulama silinip kurulsa da sunucuda durur', async () => {
  const repos = freshRepos();
  await repos.saveExportRecord('u1', 1, T0);
  assert.equal((await repos.loadExportRecord('u1')).usedFreeExports, 1);

  await repos.saveExportRecord('u1', 2, T0 + HOUR);
  assert.equal((await repos.loadExportRecord('u1')).usedFreeExports, 2);
});

test('kota kaydı yetkiyi JOIN ile getirir', async () => {
  const repos = freshRepos();
  await repos.saveExportRecord('u1', 1, T0);
  await repos.grantEntitlement(
    { appUserId: 'u1', productId: 'pro.monthly', expiresAtMs: T0 + 30 * DAY },
    T0,
  );

  const record = await repos.loadExportRecord('u1', T0);
  assert.equal(record.isPro, true);
  assert.equal(record.usedFreeExports, 1);

  // Süresi geçmiş yetki PRO SAYILMAZ: `is_pro` bayrağı webhook gecikirse
  // bir süre daha 1 kalabilir; kararı bitiş anı verir.
  assert.equal((await repos.loadExportRecord('u1', T0 + 60 * DAY)).isPro, false);
});

test('artırma ATOMİK SQL ile yapılır — okunan değer üzerinden değil', () => {
  // node:sqlite sürücüsü SENKRON çalıştığı için bu yarışı eşzamanlı HTTP
  // istekleriyle üretmek mümkün değil: istekler sıraya girer ve test
  // hatayı göremez (ölçüldü — eski "oku, artır, yaz" biçimi eşzamanlılık
  // testini geçiyordu). Üretimdeki PostgreSQL sürücüsü asenkrondur ve
  // yarış oradadır.
  //
  // Bu yüzden korumanın VARLIĞI kaynaktan doğrulanıyor: sayaç SQL'in
  // içinde artırılmalı. Teeth'i olmayan bir eşzamanlılık testine güvenmek,
  // koruma kaldırıldığında yeşil kalmak demekti.
  const source = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'persistence', 'repositories.js'),
    'utf8',
  );

  assert.match(
    source,
    /used_free_exports = export_quota\.used_free_exports \+ 1/,
    'sayaç SQL içinde artırılmıyor — eşzamanlı istekler hak kaybettirir',
  );
});

// ============================================================= ödüller ====

test('ödül kaydı KODU saklamaz, yalnızca parmak izini', async () => {
  const repos = freshRepos();
  await repos.recordAward({
    week: '2026-W35', appUserId: 'u1', rank: 3, days: 7, store: 'app_store',
    offerId: 'evengirl_pro_7day_free', codeFingerprint: 'abcd1234',
    redemptionUrl: 'https://apps.apple.com/redeem?code=GIZLI',
    expiresAtMs: T0 + 30 * DAY, issuedAtMs: T0,
  });

  const sutunlar = repos.driver.all("SELECT name FROM pragma_table_info('reward_awards')")
    .map((r) => r.name);
  assert.equal(sutunlar.includes('code'), false, 'ham kod sütunu var');
  assert.ok(sutunlar.includes('code_fingerprint'));
});

test('aynı kullanıcıya aynı hafta İKİNCİ kod çıkmaz', async () => {
  const repos = freshRepos();
  const award = {
    week: '2026-W35', appUserId: 'u1', rank: 3, days: 7, store: 'app_store',
    offerId: 'o', codeFingerprint: 'f', redemptionUrl: 'u',
    expiresAtMs: T0 + 30 * DAY, issuedAtMs: T0,
  };
  await repos.recordAward(award);
  await assert.rejects(() => repos.recordAward(award));
});

test('bekleyen ödüller yalnızca kullanılmamış ve süresi dolmamışları döner', async () => {
  const repos = freshRepos();
  const base = {
    appUserId: 'u1', rank: 1, days: 7, store: 'app_store', offerId: 'o',
    codeFingerprint: 'f', redemptionUrl: 'https://x', issuedAtMs: T0,
  };
  await repos.recordAward({ ...base, week: '2026-W35', expiresAtMs: T0 + 30 * DAY });
  await repos.recordAward({ ...base, week: '2026-W34', expiresAtMs: T0 - DAY });
  await repos.recordAward({ ...base, week: '2026-W33', expiresAtMs: T0 + 30 * DAY });
  await repos.markAcknowledged('u1', '2026-W33', T0);

  const pending = await repos.loadPendingAwards('u1', T0);
  assert.deepEqual(pending.map((p) => p.week), ['2026-W35']);
});

// =============================================== kısıtlı kimlik kaydı ====

test('kısıtlı kimlik toplu sorguyla bulunur', async () => {
  const repos = freshRepos();
  const registry = require('../core_gateway/ai_studio/restrictedRegistry');

  await repos.addRestrictedIdentity({
    matchKey: registry.matchKey('Elon Musk'), canonical: 'Elon Musk', category: 'public_figure',
  }, T0);

  const bulunan = await repos.lookupRestrictedNames(
    registry.candidatePhrases('portrait of Elon Musk'),
  );
  assert.equal(bulunan.length, 1);
  assert.equal(bulunan[0].canonical, 'Elon Musk');
  assert.equal(bulunan[0].category, 'public_figure');
});

test('kısıtlı kimlik kaydı gerçek kapıyı besler', async () => {
  const repos = freshRepos();
  const registry = require('../core_gateway/ai_studio/restrictedRegistry');

  await repos.addRestrictedIdentity({
    matchKey: registry.matchKey('Elon Musk'), canonical: 'Elon Musk', category: 'public_figure',
  }, T0);

  const lookup = (keys) => repos.lookupRestrictedNames(keys);

  // Noktalamayla bölünmüş yazım da kayda ULAŞIR.
  for (const konsept of ['portrait of Elon Musk', 'cinematic E.l.o.n M-u-s-k', 'Elon-Musk portre']) {
    const sonuc = await registry.screenConcept(konsept, lookup);
    assert.equal(sonuc.blocked, true, `geçen konsept: ${konsept}`);
  }

  const temiz = await registry.screenConcept('altın saatte portre', lookup);
  assert.equal(temiz.blocked, false);
});

test('boş sorgu veritabanına gitmez', async () => {
  const repos = freshRepos();
  assert.deepEqual(await repos.lookupRestrictedNames([]), []);
});
