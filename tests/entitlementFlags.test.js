/**
 * Yetki türevleri: willRenew / inTrial / billingIssue.
 *
 * NEDEN
 * Üçü de depodan HİÇ dönmüyordu. Uç `record.willRenew === true` diye
 * bakıyor, alan `undefined` olduğu için istemciye HER ZAMAN `false`
 * gidiyordu. Ölçülen sonuçlar:
 *
 *   - Ödemesi başarısız olan abone UYARILMIYORDU: erişimini haber almadan
 *     kaybediyordu. Grace period'ın tüm amacı buydu.
 *   - Yenilenmeyecek abonelik yenilenecek gibi görünüyordu.
 *   - Deneme sürümüne özel metin hiç çıkmıyordu.
 *
 * Hiçbir test bunu göremiyordu çünkü hepsi `false` olarak "geçerli" bir
 * değerdi — eksik alan, yanlış alan gibi görünmüyordu.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';

const { createSqliteDriver, createRepositories } = require('../persistence');
const { setRepositories, resetRepositories } = require('../persistence/registry');

const T0 = Date.now();
const DAY = 24 * 60 * 60 * 1000;

function freshRepos(t) {
  const driver = createSqliteDriver(':memory:');
  driver.migrate();
  const repos = createRepositories(driver);
  setRepositories(repos);
  t.after(() => resetRepositories());
  return repos;
}

async function serve(t) {
  const app = express();
  app.use('/v1', require('../billing_infrastructure/entitlements'));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();

  return async (appUserId) => {
    const response = await fetch(`http://127.0.0.1:${port}/v1/entitlements/${appUserId}`);
    return { status: response.status, json: await response.json() };
  };
}

test('aktif abonelik: yenilenecek, deneme değil, ödeme sorunu yok', async (t) => {
  const repos = freshRepos(t);
  await repos.grantEntitlement(
    { appUserId: 'u1', productId: 'pro.monthly', expiresAtMs: T0 + 30 * DAY, status: 'active' },
    T0,
  );

  const record = await repos.loadEntitlement('u1');
  assert.equal(record.willRenew, true);
  assert.equal(record.inTrial, false);
  assert.equal(record.billingIssue, false);
});

test('ödeme sorunu KULLANICIYA bildirilir', async (t) => {
  const repos = freshRepos(t);
  await repos.grantEntitlement(
    { appUserId: 'u1', productId: 'pro.monthly', expiresAtMs: T0 + 30 * DAY },
    T0,
  );
  await repos.setEntitlementStatus('u1', 'billing_issue');

  const record = await repos.loadEntitlement('u1');
  // Bu bayrak hep false'ken abone erişimini haber almadan kaybediyordu.
  assert.equal(record.billingIssue, true);
});

test('grace period da ödeme sorunudur ve yenilenecek sayılır', async (t) => {
  const repos = freshRepos(t);
  await repos.grantEntitlement(
    { appUserId: 'u1', productId: 'pro.monthly', expiresAtMs: T0 + 30 * DAY },
    T0,
  );
  await repos.setEntitlementStatus('u1', 'grace');

  const record = await repos.loadEntitlement('u1');
  // Kullanıcı uyarılmalı…
  assert.equal(record.billingIssue, true);
  // …ama mağaza hâlâ tahsilatı deniyor, "yenilenmeyecek" demek yanlış olur.
  assert.equal(record.willRenew, true);
});

test('iptal edilmiş abonelik YENİLENMEYECEK olarak döner', async (t) => {
  const repos = freshRepos(t);
  await repos.grantEntitlement(
    { appUserId: 'u1', productId: 'pro.monthly', expiresAtMs: T0 + 30 * DAY },
    T0,
  );
  await repos.setEntitlementStatus('u1', 'will_not_renew');

  const record = await repos.loadEntitlement('u1');
  assert.equal(record.willRenew, false);
  // İptal erişimi HEMEN kapatmaz: ödenmiş dönem sürüyor.
  assert.equal(record.pro, true);
});

test('deneme sürümü işaretlenir', async (t) => {
  const repos = freshRepos(t);
  await repos.grantEntitlement(
    {
      appUserId: 'u1',
      productId: 'pro.monthly',
      expiresAtMs: T0 + 7 * DAY,
      periodType: 'trial',
    },
    T0,
  );

  assert.equal((await repos.loadEntitlement('u1')).inTrial, true);
});

test('kayıt yoksa üç bayrak da false ve PRO değil', async (t) => {
  const repos = freshRepos(t);
  const record = await repos.loadEntitlement('yok');

  assert.equal(record.pro, false);
  assert.equal(record.willRenew, false);
  assert.equal(record.inTrial, false);
  assert.equal(record.billingIssue, false);
});

test('uç, türevleri İSTEMCİYE iletir', async (t) => {
  const repos = freshRepos(t);
  const call = await serve(t);

  await repos.grantEntitlement(
    {
      appUserId: 'u1',
      productId: 'pro.monthly',
      expiresAtMs: T0 + 7 * DAY,
      periodType: 'trial',
    },
    T0,
  );
  await repos.setEntitlementStatus('u1', 'billing_issue');

  const result = await call('u1');

  assert.equal(result.status, 200);
  assert.equal(result.json.isPro, true);
  // ASIL İDDİA: bu üçü daha önce HER ZAMAN false gidiyordu.
  assert.equal(result.json.inTrial, true);
  assert.equal(result.json.billingIssue, true);
  assert.equal(result.json.willRenew, false);
});

test('webhook period_type değerini KAYDEDER', async (t) => {
  const repos = freshRepos(t);
  process.env.REVENUECAT_WEBHOOK_AUTH_HEADER = 'test-auth';

  const app = express();
  delete require.cache[require.resolve('../billing_infrastructure/revenuecat-webhook')];
  app.use('/v1', require('../billing_infrastructure/revenuecat-webhook'));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const { port } = server.address();
  await fetch(`http://127.0.0.1:${port}/v1/webhooks/revenuecat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'test-auth' },
    body: JSON.stringify({
      event: {
        type: 'INITIAL_PURCHASE',
        app_user_id: 'u1',
        product_id: 'pro.monthly',
        period_type: 'TRIAL',
        expiration_at_ms: T0 + 7 * DAY,
      },
    }),
  });

  assert.equal((await repos.loadEntitlement('u1')).inTrial, true);
});

test('bilinmeyen period_type "normal" sayılır', async (t) => {
  const repos = freshRepos(t);
  process.env.REVENUECAT_WEBHOOK_AUTH_HEADER = 'test-auth';

  const app = express();
  delete require.cache[require.resolve('../billing_infrastructure/revenuecat-webhook')];
  app.use('/v1', require('../billing_infrastructure/revenuecat-webhook'));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const { port } = server.address();
  await fetch(`http://127.0.0.1:${port}/v1/webhooks/revenuecat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'test-auth' },
    body: JSON.stringify({
      event: {
        type: 'INITIAL_PURCHASE',
        app_user_id: 'u1',
        product_id: 'pro.monthly',
        period_type: 'BEKLENMEYEN',
        expiration_at_ms: T0 + 7 * DAY,
      },
    }),
  });

  // Tanınmayan bir değeri olduğu gibi saklamak, sonraki karşılaştırmaların
  // sessizce yanlış sonuç vermesi demektir.
  assert.equal((await repos.loadEntitlement('u1')).inTrial, false);
});
