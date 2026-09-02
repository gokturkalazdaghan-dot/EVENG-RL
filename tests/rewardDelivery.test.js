/**
 * Ödül teslimatı — UÇTAN UCA, gerçek SQL üzerinde.
 *
 * NEDEN
 * `cron.js` içindeki üç bağımlılık `console.log` yazan yer tutucuydu.
 * Ölçülen sonuçları:
 *   - `recordAward` hiçbir şey yazmıyordu → ödül `reward_awards` tablosuna
 *     girmiyor → `/v1/rewards/pending` HER ZAMAN boş dönüyor → kazanan
 *     kullanıcı ödülünü uygulamada HİÇ göremiyordu. Mağazada kod
 *     üretiliyor, kimseye ulaşmıyordu.
 *   - `loadAccount` herkesi 'APP_STORE' sayıyordu.
 *
 * Ayrıca `storeForUser` şemadaki küçük harfli değerleri BÜYÜK harfle
 * karşılaştırıyordu: doğru kaydedilmiş bir hesap bile eşleşmiyor, tahmine
 * düşüyor ve sonuç her zaman 'play_store' oluyordu — iOS kazananlar
 * kullanamayacakları bir kod alacaktı.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';

const { createSqliteDriver, createRepositories } = require('../persistence');
const { setRepositories, resetRepositories } = require('../persistence/registry');
const { storeForUser } = require('../reward_automation/promoCodes');

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
  app.use('/v1', require('../reward_automation/routes'));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();

  return async function call(path, { method = 'GET', body, user = 'u1' } = {}) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        'x-app-user-id': user,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, json: await response.json().catch(() => null) };
  };
}

// ================================================= mağaza seçimi ====

test('küçük harfli mağaza değeri EŞLEŞİR — şema böyle yazıyor', () => {
  assert.equal(storeForUser({ store: 'app_store' }), 'app_store');
  assert.equal(storeForUser({ store: 'play_store' }), 'play_store');
});

test('büyük harfli değer de eşleşir — normalleştirme var', () => {
  assert.equal(storeForUser({ store: 'APP_STORE' }), 'app_store');
});

test('mağaza bilinmiyorsa TAHMİN EDİLMEZ, reddedilir', () => {
  // Yanlış mağazadan üretilen kod kullanıcının elinde ölüdür ve bunu ancak
  // kullanmayı deneyince anlar; üstelik o kod mağaza kotasından düşer.
  assert.throws(() => storeForUser({ store: null }), /bilinmiyor/);
  assert.throws(() => storeForUser({}), /bilinmiyor/);
  assert.throws(() => storeForUser(null), /bilinmiyor/);
});

test('platform bilgisi varsa mağaza ondan çıkarılır', () => {
  assert.equal(storeForUser({ platform: 'ios' }), 'app_store');
  assert.equal(storeForUser({ platform: 'android' }), 'play_store');
});

// ============================================ ödül kaydı ve teslimat ====

test('kaydedilen ödül /v1/rewards/pending ile kullanıcıya ULAŞIR', async (t) => {
  const repos = freshRepos(t);
  const call = await serve(t);

  await repos.recordAward({
    week: '2026-W35',
    userId: 'u1',
    rank: 3,
    days: 7,
    store: 'app_store',
    offerId: 'even_pro_7d',
    codeFingerprint: 'abc123',
    redemptionUrl: 'https://apps.apple.com/redeem?code=…',
    expiresAtMs: T0 + 30 * DAY,
  });

  const pending = await call('/v1/rewards/pending');

  // ASIL İDDİA: `recordAward` yer tutucuyken bu liste HER ZAMAN boştu.
  assert.equal(pending.status, 200);
  assert.equal(pending.json.rewards.length, 1);
  assert.equal(pending.json.rewards[0].days, 7);
  assert.equal(pending.json.rewards[0].rank, 3);
});

test('kodun KENDİSİ istemciye gitmez — yalnızca kullanım bağlantısı', async (t) => {
  const repos = freshRepos(t);
  const call = await serve(t);

  await repos.recordAward({
    week: '2026-W35', userId: 'u1', rank: 1, days: 7, store: 'app_store',
    offerId: 'even_pro_7d', codeFingerprint: 'gizli-parmak-izi',
    redemptionUrl: 'https://apps.apple.com/redeem?code=GIZLI',
    expiresAtMs: T0 + 30 * DAY,
  });

  const reward = (await call('/v1/rewards/pending')).json.rewards[0];

  assert.equal(reward.code, undefined);
  assert.equal(reward.codeFingerprint, undefined);
  assert.equal(reward.offerId, undefined);
});

test('süresi geçmiş ödül listelenmez', async (t) => {
  const repos = freshRepos(t);
  const call = await serve(t);

  await repos.recordAward({
    week: '2026-W30', userId: 'u1', rank: 5, days: 7, store: 'app_store',
    offerId: 'even_pro_7d', codeFingerprint: 'x',
    redemptionUrl: 'https://x', expiresAtMs: T0 - DAY,
  });

  assert.deepEqual((await call('/v1/rewards/pending')).json.rewards, []);
});

test('başka kullanıcının ödülü GÖRÜNMEZ', async (t) => {
  const repos = freshRepos(t);
  const call = await serve(t);

  await repos.recordAward({
    week: '2026-W35', userId: 'baskasi', rank: 1, days: 7, store: 'app_store',
    offerId: 'even_pro_7d', codeFingerprint: 'x',
    redemptionUrl: 'https://x', expiresAtMs: T0 + 30 * DAY,
  });

  assert.deepEqual((await call('/v1/rewards/pending', { user: 'u1' })).json.rewards, []);
});

test('kullanıldı bildirimi sonrası ödül listeden düşer', async (t) => {
  const repos = freshRepos(t);
  const call = await serve(t);

  await repos.recordAward({
    week: '2026-W35', userId: 'u1', rank: 1, days: 7, store: 'app_store',
    offerId: 'even_pro_7d', codeFingerprint: 'x',
    redemptionUrl: 'https://x', expiresAtMs: T0 + 30 * DAY,
  });

  assert.equal((await call('/v1/rewards/pending')).json.rewards.length, 1);

  const ack = await call('/v1/rewards/acknowledge', {
    method: 'POST',
    body: { week: '2026-W35' },
  });
  assert.equal(ack.status, 200);

  assert.deepEqual((await call('/v1/rewards/pending')).json.rewards, []);
});

test('cron loadAccount gerçek hesabı okur, mağaza UYDURMAZ', async (t) => {
  const repos = freshRepos(t);
  await repos.upsertAccount({ appUserId: 'u1', tier: 'adult', store: 'play_store' }, T0);

  const { loadAccount } = require('../reward_automation/cron');

  const known = await loadAccount('u1');
  assert.equal(known.store, 'play_store');
  assert.equal(storeForUser(known), 'play_store');

  // Bilinmeyen hesap için mağaza uydurulmaz; `storeForUser` reddeder ve
  // işçi o kullanıcıyı atlar (diğerlerini engellemez).
  const unknown = await loadAccount('yok');
  assert.equal(unknown.store, null);
  assert.throws(() => storeForUser(unknown), /bilinmiyor/);
});
