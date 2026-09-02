/**
 * Dışa aktarım kotası — EŞZAMANLI istekler altında.
 *
 * NEDEN
 * Uç önce sayacı okuyup sonra `used + 1` yazıyordu. İki eşzamanlı istek
 * aynı değeri okuyup aynı değeri yazıyordu: kullanıcı BİR hakla İKİ dışa
 * aktarım yapıyordu. Mobilde bu yarışı tetiklemek kolaydır — çift dokunuş
 * ya da yavaş yanıt sonrası istemcinin yeniden denemesi yeter.
 *
 * DÜRÜST NOT: bu dosyadaki eşzamanlılık testinin YARIŞA KARŞI TEETH'İ YOK.
 * `node:sqlite` sürücüsü senkron çalışır; eşzamanlı HTTP istekleri sıraya
 * girer ve eski "oku, artır, yaz" biçimi bu testi GEÇİYOR (ölçüldü).
 * Yarış, üretimdeki asenkron PostgreSQL sürücüsündedir.
 *
 * Korumanın varlığı bu yüzden `tests/persistence.test.js` içinde
 * KAYNAKTAN doğrulanıyor (sayaç SQL'in içinde artırılmalı). Buradaki
 * testler sayma doğruluğunu ve yetki kapısını ölçer.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';

const { createSqliteDriver, createRepositories } = require('../persistence');
const { setRepositories, resetRepositories } = require('../persistence/registry');

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
  app.use('/v1', require('../export_gate/quota'));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();

  return async function call(path, { method = 'GET', user = 'u1' } = {}) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { 'x-app-user-id': user, 'content-type': 'application/json' },
      ...(method === 'POST' ? { body: '{}' } : {}),
    });
    return { status: response.status, json: await response.json().catch(() => null) };
  };
}

test('eşzamanlı beş commit sayacı BEŞ artırır (sayma doğruluğu)', async (t) => {
  const repos = freshRepos(t);
  const call = await serve(t);

  await Promise.all(
    Array.from({ length: 5 }, () => call('/v1/export/commit', { method: 'POST' })),
  );

  const record = await repos.loadExportRecord('u1');
  assert.equal(record.usedFreeExports, 5, 'sayaç istekleri kaybetti');
});

test('sıralı commit de doğru sayar', async (t) => {
  const repos = freshRepos(t);
  const call = await serve(t);

  await call('/v1/export/commit', { method: 'POST' });
  await call('/v1/export/commit', { method: 'POST' });

  assert.equal((await repos.loadExportRecord('u1')).usedFreeExports, 2);
});

test('farklı kullanıcıların sayaçları BİRBİRİNE karışmaz', async (t) => {
  const repos = freshRepos(t);
  const call = await serve(t);

  await Promise.all([
    call('/v1/export/commit', { method: 'POST', user: 'a' }),
    call('/v1/export/commit', { method: 'POST', user: 'a' }),
    call('/v1/export/commit', { method: 'POST', user: 'b' }),
  ]);

  assert.equal((await repos.loadExportRecord('a')).usedFreeExports, 2);
  assert.equal((await repos.loadExportRecord('b')).usedFreeExports, 1);
});

test('hak tükendiğinde kota ucu allowed:false ve protectScreen:true döner', async (t) => {
  const repos = freshRepos(t);
  const call = await serve(t);
  const { FREE_EXPORT_ALLOWANCE } = require('../export_gate/quota');

  for (let i = 0; i < FREE_EXPORT_ALLOWANCE; i += 1) {
    await call('/v1/export/commit', { method: 'POST' });
  }

  const quota = await call('/v1/export/quota');
  assert.equal(quota.json.allowed, false);
  assert.equal(quota.json.remainingFree, 0);
  // Hak tükendiyse istemci ekran yakalama korumasını açar.
  assert.equal(quota.json.protectScreen, true);

  await repos.loadExportRecord('u1');
});

test('PRO abonesinde sayaç İLERLEMEZ', async (t) => {
  const repos = freshRepos(t);
  await repos.grantEntitlement(
    { appUserId: 'u1', productId: 'com.evengirl.app.pro.monthly', expiresAtMs: Date.now() + 86400000 },
  );
  const call = await serve(t);

  const result = await call('/v1/export/commit', { method: 'POST' });

  assert.equal(result.json.remainingFree, null);
  const record = await repos.loadExportRecord('u1');
  assert.equal(record.usedFreeExports, 0, 'PRO abonesinin ücretsiz hakkı harcandı');
});

test('kimliksiz istek reddedilir ve sayaca DOKUNMAZ', async (t) => {
  freshRepos(t);
  const app = express();
  app.use('/v1', require('../export_gate/quota'));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/v1/export/commit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });

  assert.equal(response.status, 400);
});

test('PRO abonesi SINIRSIZ dışa aktarır — hakkı bitmiş sayılmaz', async (t) => {
  const repos = freshRepos(t);
  const call = await serve(t);
  const { FREE_EXPORT_ALLOWANCE } = require('../export_gate/quota');

  // Önce ücretsiz hakkını tüketiyor…
  for (let i = 0; i < FREE_EXPORT_ALLOWANCE + 2; i += 1) {
    await call('/v1/export/commit', { method: 'POST' });
  }
  assert.equal((await call('/v1/export/quota')).json.allowed, false);

  // …sonra abone oluyor.
  await repos.grantEntitlement({
    appUserId: 'u1',
    productId: 'com.evengirl.app.pro.monthly',
    expiresAtMs: Date.now() + 86400000,
  });

  const quota = await call('/v1/export/quota');
  assert.equal(quota.json.allowed, true, 'ödeme yapan abone paywall görüyor');
  assert.equal(quota.json.remainingFree, null);
  assert.equal(quota.json.protectScreen, false);
});

test('süresi GEÇMİŞ yetki PRO sayılmaz', async (t) => {
  const repos = freshRepos(t);
  const call = await serve(t);

  // `is_pro` bayrağı webhook gecikirse bir süre daha 1 kalabilir; kararı
  // bitiş anı verir.
  await repos.grantEntitlement({
    appUserId: 'u1',
    productId: 'com.evengirl.app.pro.monthly',
    expiresAtMs: Date.now() - 1000,
  });

  const quota = await call('/v1/export/quota');
  assert.equal(quota.json.remainingFree !== null, true, 'süresi geçmiş abonelik sınırsız erişim verdi');
});
