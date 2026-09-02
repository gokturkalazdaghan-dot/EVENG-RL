/**
 * Yeni uçların GERÇEK HTTP + GERÇEK SQL üzerinde davranışı.
 *
 * Bu beş uç istemcide çağrılıyor ama sunucuda YOKTU: beğeni, şablon
 * kullanımı ve üç creator abonelik ucu. Hepsi 404 dönüyordu ve istemci
 * bunu "ağ hatası" olarak gösteriyordu — özellik hiç çalışmıyor ama hata
 * mesajı yanlış yeri işaret ediyordu.
 *
 * Sahte depo KULLANILMIYOR: bellek içi SQLite üzerinde gerçek şema ve
 * gerçek sorgular çalışıyor. Sahte depo ile test etmek, tam da bu katmanda
 * hata arayan bir testin hiçbir şey ölçmemesi demektir.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';

const { createSqliteDriver, createRepositories } = require('../persistence');
const { setRepositories, resetRepositories } = require('../persistence/registry');

const T0 = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

/** Temiz veritabanı + kayıtlı depo. Router modül yüklenirken değil, istek
 *  anında `getRepositories()` çağırdığı için bu sıralama çalışır. */
function freshRepos(t) {
  const driver = createSqliteDriver(':memory:');
  driver.migrate();
  const repos = createRepositories(driver);
  setRepositories(repos);
  // Kayıt sızıntısı da iddia hatasında oluyordu: bir sonraki test önceki
  // testin veritabanını görüyor ve sebebi anlaşılmaz biçimde geçiyordu.
  t.after(() => resetRepositories());
  return repos;
}

async function serve(t) {
  const router = require('../social_gamification/social');
  const app = express();
  app.use('/v1', router);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address();

  // TEMİZLİK BURADA KAYDEDİLİYOR, testin sonunda DEĞİL.
  //
  // `await api.close()` testin son satırındayken, araya giren bir iddia
  // hatası sunucuyu açık bırakıyordu: test başarısız olmuyor, node --test
  // açık soket yüzünden ASILI KALIYORDU. Başarısızlığı gizleyen bir test
  // düzeni, testin kendisinden daha zararlıdır.
  t.after(() => new Promise((resolve) => server.close(resolve)));

  return {
    async call(path, { method = 'GET', body, user = 'u1' } = {}) {
      const res = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: {
          'x-app-user-id': user,
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: res.status, json: await res.json().catch(() => null) };
    },
  };
}

/** Yaş kapısı: `unverified` kademesi hiçbir içeriği göremez. */
async function seedViewer(repos, appUserId = 'u1') {
  await repos.upsertAccount({ appUserId, tier: 'adult', handle: 'ali' }, T0);
}

// ============================================================== beğeni ====

test('beğeni yayında olmayan gönderi için 404 döner', async (t) => {
  const repos = freshRepos(t);
  await seedViewer(repos);
  const api = await serve(t);

  const res = await api.call('/v1/feed/like', { method: 'POST', body: { postId: 'yok' } });

  assert.equal(res.status, 404);
});

test('beğeni sayılır ve İKİNCİ beğeni sayıyı ARTIRMAZ', async (t) => {
  const repos = freshRepos(t);
  await seedViewer(repos);
  await repos.createContent({
    contentId: 'p1', authorId: 'u2', kind: 'post', rating: 'general',
    moderationState: 'approved', publishedAtMs: T0,
  });
  const api = await serve(t);

  const first = await api.call('/v1/feed/like', { method: 'POST', body: { postId: 'p1' } });
  const second = await api.call('/v1/feed/like', { method: 'POST', body: { postId: 'p1' } });

  assert.equal(first.status, 200);
  assert.equal(first.json.added, true);
  assert.equal(first.json.likes, 1);

  // Yeniden deneme HATA DEĞİL: kullanıcı hata görmez, sayı da şişmez.
  assert.equal(second.status, 200);
  assert.equal(second.json.added, false);
  assert.equal(second.json.likes, 1);
});

test('iki farklı kullanıcının beğenisi ayrı sayılır', async (t) => {
  const repos = freshRepos(t);
  await seedViewer(repos, 'u1');
  await seedViewer(repos, 'u2');
  await repos.createContent({
    contentId: 'p1', authorId: 'u3', kind: 'post', rating: 'general',
    moderationState: 'approved', publishedAtMs: T0,
  });
  const api = await serve(t);

  await api.call('/v1/feed/like', { method: 'POST', body: { postId: 'p1' }, user: 'u1' });
  const res = await api.call('/v1/feed/like', {
    method: 'POST',
    body: { postId: 'p1' },
    user: 'u2',
  });

  assert.equal(res.json.likes, 2);
});

test('geçersiz postId doğrulanır — sorgu nesnesi anahtar olarak geçmez', async (t) => {
  const repos = freshRepos(t);
  await seedViewer(repos);
  const api = await serve(t);

  for (const postId of [null, '', { $ne: null }, 'x'.repeat(200)]) {
    const res = await api.call('/v1/feed/like', { method: 'POST', body: { postId } });
    assert.equal(res.status, 400, `kabul edilmemeliydi: ${JSON.stringify(postId)}`);
  }
});

// ==================================================== şablon kullanımı ====

test('şablon kullanımı tekil kullanıcı sayar', async (t) => {
  const repos = freshRepos(t);
  await seedViewer(repos, 'u1');
  await seedViewer(repos, 'u2');
  const templateId = await repos.createTemplate(
    { authorId: 'u9', title: 'T', previewUri: 'file://x', steps: [] },
    T0,
  );
  const api = await serve(t);

  const a = await api.call('/v1/templates/use', {
    method: 'POST', body: { templateId }, user: 'u1',
  });
  const again = await api.call('/v1/templates/use', {
    method: 'POST', body: { templateId }, user: 'u1',
  });
  await api.call('/v1/templates/use', { method: 'POST', body: { templateId }, user: 'u2' });

  assert.equal(a.json.counted, true);
  // Aynı kullanıcının ikinci kullanımı gelir payını ŞİŞİRMEZ.
  assert.equal(again.json.counted, false);
  assert.equal(again.status, 200);

  const { templates } = await repos.loadTemplates();
  assert.equal(templates.find((t) => t.templateId === templateId).useCount, 2);
});

test('yayında olmayan şablon için sayaç ARTMAZ', async (t) => {
  const repos = freshRepos(t);
  await seedViewer(repos);
  const api = await serve(t);

  const res = await api.call('/v1/templates/use', {
    method: 'POST',
    body: { templateId: 'olmayan-sablon' },
  });

  assert.equal(res.status, 404);
});

// =================================================== creator abonelik ====

test('teklif yoksa 404, kapalı teklif de YOK sayılır', async (t) => {
  const repos = freshRepos(t);
  await seedViewer(repos);
  await repos.upsertCreatorOffer(
    { creatorId: 'c1', creatorHandle: 'ayse', tier: 'tier2', perks: ['erken'], active: false },
    T0,
  );
  const api = await serve(t);

  assert.equal((await api.call('/v1/creators/yok/offer')).status, 404);
  // Pasif teklif satın alma akışına sokulamamalı.
  assert.equal((await api.call('/v1/creators/c1/offer')).status, 404);
});

test('teklif FİYAT DÖNDÜRMEZ — fiyat mağazadan okunur', async (t) => {
  const repos = freshRepos(t);
  await seedViewer(repos);
  await repos.upsertCreatorOffer(
    { creatorId: 'c1', creatorHandle: 'ayse', tier: 'tier2', perks: ['erken erişim'] },
    T0,
  );
  const api = await serve(t);

  const res = await api.call('/v1/creators/c1/offer');

  assert.equal(res.status, 200);
  assert.equal(res.json.tier, 'tier2');
  assert.deepEqual(res.json.perks, ['erken erişim']);
  // Sunucudan fiyat göstermek, gösterilen ile tahsil edilenin ayrışması
  // ve Guideline 3.1.2 ihlali demektir.
  assert.equal(res.json.price, undefined);
  assert.equal(res.json.priceUsd, undefined);
  assert.equal(res.json.referenceUsd, undefined);
});

test('satın alma doğrulanmadan abonelik BAĞLANMAZ', async (t) => {
  const repos = freshRepos(t);
  await seedViewer(repos);
  await repos.upsertCreatorOffer(
    { creatorId: 'c1', creatorHandle: 'ayse', tier: 'tier2', perks: [] },
    T0,
  );
  const api = await serve(t);

  const res = await api.call('/v1/creators/link-subscription', {
    method: 'POST',
    body: { creatorId: 'c1', appUserId: 'u1' },
  });

  assert.equal(res.status, 409);
});

test('PRO yetkisi creator erişimi VERMEZ — ayrı ürün, ayrı ödeme', async (t) => {
  const repos = freshRepos(t);
  await seedViewer(repos);
  await repos.upsertCreatorOffer(
    { creatorId: 'c1', creatorHandle: 'ayse', tier: 'tier2', perks: [] },
    T0,
  );
  // Kullanıcı PRO abone — ama creator ürününü SATIN ALMADI.
  await repos.grantEntitlement(
    { appUserId: 'u1', productId: 'com.evengirl.app.pro.monthly', expiresAtMs: T0 + 30 * DAY },
    T0,
  );
  await repos.recordPurchase(
    { appUserId: 'u1', productId: 'com.evengirl.app.pro.monthly', expiresAtMs: T0 + 30 * DAY },
    T0,
  );
  const api = await serve(t);

  const res = await api.call('/v1/creators/link-subscription', {
    method: 'POST',
    body: { creatorId: 'c1', appUserId: 'u1' },
  });

  assert.equal(res.status, 409, 'PRO satırı creator aboneliğine dönüştürülmemeli');
});

test('doğru kademe ürünü satın alınmışsa abonelik bağlanır', async (t) => {
  const repos = freshRepos(t);
  await seedViewer(repos);
  await repos.upsertCreatorOffer(
    { creatorId: 'c1', creatorHandle: 'ayse', tier: 'tier2', perks: [] },
    T0,
  );
  await repos.recordPurchase(
    {
      appUserId: 'u1',
      productId: 'com.evengirl.app.creator.tier2',
      expiresAtMs: Date.now() + 30 * DAY,
    },
  );
  const api = await serve(t);

  const res = await api.call('/v1/creators/link-subscription', {
    method: 'POST',
    body: { creatorId: 'c1', appUserId: 'u1' },
  });

  assert.equal(res.status, 200);
  assert.equal(res.json.creatorId, 'c1');
  assert.equal(res.json.active, true);

  const list = await api.call('/v1/creators/subscriptions');
  assert.equal(list.json.subscriptions.length, 1);
  assert.equal(list.json.subscriptions[0].active, true);
});

test('başkasının kimliğiyle abonelik bağlanamaz', async (t) => {
  const repos = freshRepos(t);
  await seedViewer(repos, 'u1');
  await repos.upsertCreatorOffer(
    { creatorId: 'c1', creatorHandle: 'ayse', tier: 'tier1', perks: [] },
    T0,
  );
  const api = await serve(t);

  const res = await api.call('/v1/creators/link-subscription', {
    method: 'POST',
    body: { creatorId: 'c1', appUserId: 'baskasi' },
    user: 'u1',
  });

  assert.equal(res.status, 403);
});

test('süresi geçmiş abonelik listede active:false döner, SİLİNMEZ', async (t) => {
  const repos = freshRepos(t);
  await seedViewer(repos);
  await repos.linkCreatorSubscription(
    { creatorId: 'c1', appUserId: 'u1', expiresAtMs: T0 - DAY, willRenew: false },
    T0,
  );
  const api = await serve(t);

  const res = await api.call('/v1/creators/subscriptions');

  assert.equal(res.json.subscriptions.length, 1, 'geçmiş kayıt silinmemeli');
  assert.equal(res.json.subscriptions[0].active, false);
});

test('bitiş anı bilinmeyen abonelik AKTİF SAYILMAZ', async (t) => {
  const repos = freshRepos(t);
  // Süresi bilinmeyeni süresiz saymak, iptal edilmiş aboneliğe kalıcı
  // erişim vermek demektir.
  await repos.linkCreatorSubscription(
    { creatorId: 'c1', appUserId: 'u1', expiresAtMs: null, willRenew: true },
    T0,
  );

  const subs = await repos.listCreatorSubscriptions('u1', T0);
  assert.equal(subs[0].active, false);
});
