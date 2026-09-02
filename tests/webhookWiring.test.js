/**
 * RevenueCat webhook'unun DEPOYA GERÇEKTEN YAZDIĞINI doğrular.
 *
 * NEDEN BU TEST VAR
 * Anahtar (switch) bloğu yardımcılara `(appUserId, entitlementIds,
 * expirationAtMs)` diye KONUMSAL argüman geçiyordu; yardımcılar ise
 * `(event)` bekliyordu. Sonuç: `event.app_user_id` bir STRING üzerinde
 * okunuyor, `undefined` dönüyor ve HİÇBİR satın alma yetkiye
 * dönüşmüyordu. Ödeme yapan kullanıcı PRO olmuyordu ve hiçbir yerde hata
 * görünmüyordu — webhook 200 dönüyor, RevenueCat memnun, kullanıcı değil.
 *
 * Bu hatayı yalnızca uçtan uca bir test yakalar: fonksiyonların kendisi
 * doğru, KABLOLAMA yanlıştı.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

process.env.REVENUECAT_WEBHOOK_AUTH_HEADER = 'test-auth-header';

const { createSqliteDriver, createRepositories } = require('../persistence');
const { setRepositories, resetRepositories } = require('../persistence/registry');

const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;

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
  const router = require('../billing_infrastructure/revenuecat-webhook');
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
    async post(event, { auth = 'test-auth-header' } = {}) {
      const res = await fetch(`http://127.0.0.1:${port}/v1/webhooks/revenuecat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: auth },
        body: JSON.stringify({ event }),
      });
      return { status: res.status, json: await res.json().catch(() => null) };
    },
  };
}

test('satın alma yetkiye DÖNÜŞÜR — 200 dönmesi yeterli değil', async (t) => {
  const repos = freshRepos(t);
  const api = await serve(t);

  const res = await api.post({
    type: 'INITIAL_PURCHASE',
    app_user_id: 'u1',
    product_id: 'com.evengirl.app.pro.monthly',
    expiration_at_ms: NOW + 30 * DAY,
  });

  assert.equal(res.status, 200);

  // ASIL İDDİA: depoda gerçekten yazılmış olmalı.
  const entitlement = await repos.loadEntitlement('u1');
  assert.equal(entitlement.pro, true, 'ödeme yapan kullanıcı PRO olmadı');
  assert.equal(entitlement.status, 'active');
  assert.equal(entitlement.expiresAtMs, NOW + 30 * DAY);
  assert.equal(entitlement.productId, 'com.evengirl.app.pro.monthly');
});

test('ürün bazında satın alma da kaydedilir', async (t) => {
  const repos = freshRepos(t);
  const api = await serve(t);

  await api.post({
    type: 'INITIAL_PURCHASE',
    app_user_id: 'u1',
    product_id: 'com.evengirl.app.creator.tier2',
    expiration_at_ms: NOW + 30 * DAY,
  });

  const purchase = await repos.loadActivePurchase('u1', 'com.evengirl.app.creator.tier2', NOW);
  assert.notEqual(purchase, null, 'creator ürünü kaydedilmedi');
  assert.equal(purchase.expiresAtMs, NOW + 30 * DAY);

  // Başka bir ürün için kayıt YOK — PRO satırı creator erişimi vermez.
  assert.equal(await repos.loadActivePurchase('u1', 'com.evengirl.app.pro.monthly', NOW), null);
});

test('iptal erişimi HEMEN kapatmaz, yalnızca yenilemeyi durdurur', async (t) => {
  const repos = freshRepos(t);
  const api = await serve(t);

  await api.post({
    type: 'INITIAL_PURCHASE',
    app_user_id: 'u1',
    product_id: 'com.evengirl.app.pro.monthly',
    expiration_at_ms: NOW + 30 * DAY,
  });
  await api.post({ type: 'CANCELLATION', app_user_id: 'u1' });

  const entitlement = await repos.loadEntitlement('u1');
  // Ödenmiş dönemi geri almak, satın alınmış bir hizmeti geri almaktır.
  assert.equal(entitlement.pro, true, 'iptal, ödenmiş dönemi geri aldı');
  assert.equal(entitlement.status, 'will_not_renew');
});

test('süre bitimi yetkiyi kapatır, satın alma kaydını SİLMEZ', async (t) => {
  const repos = freshRepos(t);
  const api = await serve(t);

  await api.post({
    type: 'INITIAL_PURCHASE',
    app_user_id: 'u1',
    product_id: 'com.evengirl.app.pro.monthly',
    expiration_at_ms: NOW + 30 * DAY,
  });
  await api.post({
    type: 'EXPIRATION',
    app_user_id: 'u1',
    product_id: 'com.evengirl.app.pro.monthly',
  });

  const entitlement = await repos.loadEntitlement('u1');
  assert.equal(entitlement.pro, false);

  // Satın alma geçmişi kullanıcının kendi kaydıdır; iade/itirazda gerekir.
  assert.equal(await repos.loadActivePurchase('u1', 'com.evengirl.app.pro.monthly', NOW), null);
});

test('ödeme sorunu grace period demektir — PRO hemen kapanmaz', async (t) => {
  const repos = freshRepos(t);
  const api = await serve(t);

  await api.post({
    type: 'INITIAL_PURCHASE',
    app_user_id: 'u1',
    product_id: 'com.evengirl.app.pro.monthly',
    expiration_at_ms: NOW + 30 * DAY,
  });
  await api.post({ type: 'BILLING_ISSUE', app_user_id: 'u1' });

  const entitlement = await repos.loadEntitlement('u1');
  assert.equal(entitlement.status, 'billing_issue');
  assert.equal(entitlement.pro, true, 'kartı reddedilen abone anında kesilmemeli');
});

test('kimliksiz olay 400 ile REDDEDİLİR — undefined anahtarla yazılmaz', async (t) => {
  freshRepos(t);
  const api = await serve(t);

  // SQLite bunu NULL'a çevirip kabul edebilir, PostgreSQL reddeder: iki
  // motorda farklı davranan bir hata, üretimde bulunması en zor hatadır.
  const res = await api.post({
    type: 'INITIAL_PURCHASE',
    product_id: 'com.evengirl.app.pro.monthly',
    expiration_at_ms: NOW + 30 * DAY,
  });

  assert.equal(res.status, 400);
});

test('yanlış auth başlığı 401 döner ve depoya DOKUNMAZ', async (t) => {
  const repos = freshRepos(t);
  const api = await serve(t);

  const res = await api.post(
    { type: 'INITIAL_PURCHASE', app_user_id: 'u1', expiration_at_ms: NOW + DAY },
    { auth: 'yanlis' },
  );

  assert.equal(res.status, 401);
  assert.equal((await repos.loadEntitlement('u1')).pro, false);
});

test('aynı olay iki kez gelirse sonuç DEĞİŞMEZ (webhook yeniden dener)', async (t) => {
  const repos = freshRepos(t);
  const api = await serve(t);

  const event = {
    type: 'RENEWAL',
    app_user_id: 'u1',
    product_id: 'com.evengirl.app.pro.monthly',
    expiration_at_ms: NOW + 30 * DAY,
  };
  await api.post(event);
  await api.post(event);

  const entitlement = await repos.loadEntitlement('u1');
  assert.equal(entitlement.pro, true);
  assert.equal(entitlement.expiresAtMs, NOW + 30 * DAY);
});
