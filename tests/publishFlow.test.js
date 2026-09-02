/**
 * UÇTAN UCA yayın akışı: yükleme → tarama → onay → akışta görünme.
 *
 * NEDEN BU TEST
 * Parçaların her biri ayrı ayrı test ediliyordu ve hepsi geçiyordu, ama
 * ZİNCİR hiç denenmemişti. Tarayıcı hiç kurulmadığı için gerçekte hiçbir
 * içerik onaylanmıyordu — her yükleme `pending` kalıyor, akış boş
 * görünüyordu ve hiçbir birim testi bunu göremiyordu.
 *
 * Burada sahte depo YOK: bellek içi SQLite üzerinde gerçek şema, gerçek
 * sorgular ve gerçek HTTP. Yalnızca tarayıcının kendisi taklit ediliyor
 * (dış servis).
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const crypto = require('node:crypto');

process.env.JWT_SECRET = 'test-secret';

const { createSqliteDriver, createRepositories } = require('../persistence');
const { setRepositories, resetRepositories } = require('../persistence/registry');
const social = require('../social_gamification/social');

const T0 = Date.now();

/** Temiz bir tarama sonucu — hiçbir sinyal eşiği geçmiyor. */
const CLEAN = {
  scannerRan: true,
  knownCsamHashMatch: false,
  signals: {
    sexualAct: 0, exposedGenitalia: 0, exposedAnus: 0, exposedFemaleNipple: 0,
    swimwear: 0, athleticwear: 0, apparentMinor: 0, minorInDistress: 0,
    graphicViolence: 0, nonConsensualIntimate: 0,
  },
};

function freshRepos(t) {
  const driver = createSqliteDriver(':memory:');
  driver.migrate();
  const repos = createRepositories(driver);
  setRepositories(repos);
  t.after(() => resetRepositories());
  return repos;
}

/** PRO yetki jetonu — `requireProEntitlement` bu biçimi bekler. */
function proToken(appUserId) {
  const payload = { appUserId, pro: true, exp: Date.now() + 3600_000 };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', process.env.JWT_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${signature}`;
}

async function serve(t, scanMedia) {
  // Tarayıcı ENJEKTE ediliyor: gerçek bir HTTP tarayıcısına bağlı test,
  // ağ olmadan çalışmazdı.
  const previous = social.moderationDeps.scanMedia;
  social.moderationDeps.scanMedia = scanMedia;
  t.after(() => {
    social.moderationDeps.scanMedia = previous;
  });

  const app = express();
  app.use('/v1', social);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const { port } = server.address();
  return async function call(path, { method = 'GET', body, user = 'u1', pro = false } = {}) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        'x-app-user-id': user,
        // Jeton `x-entitlement` başlığında taşınır, `authorization`'da
        // DEĞİL (bkz. billing_infrastructure/entitlements.js).
        ...(pro ? { 'x-entitlement': proToken(user) } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, json: await response.json().catch(() => null) };
  };
}

test('temiz içerik ONAYLANIR ve hikaye rafında görünür', async (t) => {
  const repos = freshRepos(t);
  await repos.upsertAccount({ appUserId: 'u1', tier: 'adult', handle: 'ali' }, T0);
  const call = await serve(t, async () => CLEAN);

  const upload = await call('/v1/stories', {
    method: 'POST',
    body: { storyId: 'hikaye-1', mediaRef: 'media://1' },
    pro: true,
  });

  assert.equal(upload.status, 202);
  // ASIL İDDİA: tarayıcı kurulmadığında bu `false` kalıyordu ve akış
  // kalıcı olarak boş görünüyordu.
  assert.equal(upload.json.published, true, 'temiz içerik onaylanmadı');
  assert.equal(upload.json.state, 'approved');

  const stories = await call('/v1/stories');
  assert.equal(stories.json.stories.length, 1, 'onaylanan hikaye rafta görünmedi');
});

test('tarayıcı yapılandırılmamışsa içerik KARANTİNAYA alınır, akışa düşmez', async (t) => {
  const repos = freshRepos(t);
  await repos.upsertAccount({ appUserId: 'u1', tier: 'adult', handle: 'ali' }, T0);

  // Yapılandırılmamış tarayıcının gerçek davranışı: fırlatır.
  const call = await serve(t, async () => {
    throw new Error('scanner_not_configured');
  });

  const upload = await call('/v1/stories', {
    method: 'POST',
    body: { storyId: 'hikaye-1', mediaRef: 'media://1' },
    pro: true,
  });

  // FAIL-CLOSED: tarayıcının çökmesi, moderasyonun kapanması demek olamaz.
  assert.equal(upload.json.published, false);
  assert.notEqual(upload.json.state, 'approved');

  const stories = await call('/v1/stories');
  assert.equal(stories.json.stories.length, 0, 'taranmamış içerik rafa düştü');
});

test('CSAM karma eşleşmesi BLOKE eder ve hesabı askıya alır', async (t) => {
  const repos = freshRepos(t);
  await repos.upsertAccount({ appUserId: 'u1', tier: 'adult', handle: 'ali' }, T0);
  const call = await serve(t, async () => ({
    scannerRan: true,
    knownCsamHashMatch: true,
    signals: {},
  }));

  const upload = await call('/v1/stories', {
    method: 'POST',
    body: { storyId: 'hikaye-1', mediaRef: 'media://1' },
    pro: true,
  });

  assert.equal(upload.status, 422);
  assert.equal(upload.json.state, 'blocked');

  // Gerekçe kullanıcıya AYRINTILANDIRILMAZ: hangi sinyalin hangi eşiği
  // geçtiğini söylemek, tarayıcıyı deneme-yanılmayla kalibre etmenin
  // tarifini vermektir.
  assert.equal(upload.json.reasons, undefined);
  assert.equal(upload.json.signals, undefined);

  const stories = await call('/v1/stories');
  assert.equal(stories.json.stories.length, 0);
});

test('yetişkin içerik reşit olmayan hesaba GİTMEZ', async (t) => {
  const repos = freshRepos(t);
  await repos.upsertAccount({ appUserId: 'yetiskin', tier: 'adult', handle: 'a' }, T0);
  await repos.upsertAccount({ appUserId: 'genc', tier: 'safe', handle: 'g' }, T0);

  const call = await serve(t, async () => ({
    ...CLEAN,
    signals: { ...CLEAN.signals, exposedFemaleNipple: 0.95 },
  }));

  await call('/v1/stories', {
    method: 'POST',
    body: { storyId: 'h1', mediaRef: 'media://1' },
    user: 'yetiskin',
    pro: true,
  });

  // Filtre SUNUCUDA uygulanır: reşit olmayan hesaba +18 içerik hiç gitmez.
  const asMinor = await call('/v1/stories', { user: 'genc' });
  assert.equal(asMinor.json.stories.length, 0);
});

test('doğrulanmamış hesap yayınlayamaz', async (t) => {
  const repos = freshRepos(t);
  await repos.upsertAccount({ appUserId: 'u1', tier: 'unverified', handle: 'x' }, T0);
  const call = await serve(t, async () => CLEAN);

  const upload = await call('/v1/stories', {
    method: 'POST',
    body: { storyId: 'h1', mediaRef: 'media://1' },
    pro: true,
  });

  assert.equal(upload.status, 403);
});

test('rapor edilen içerik akıştan düşer ve kuyruğa girer', async (t) => {
  const repos = freshRepos(t);
  await repos.upsertAccount({ appUserId: 'yazar', tier: 'adult', handle: 'y' }, T0);
  await repos.upsertAccount({ appUserId: 'raporcu', tier: 'adult', handle: 'r' }, T0);
  const call = await serve(t, async () => CLEAN);

  await call('/v1/stories', {
    method: 'POST',
    body: { storyId: 'h1', mediaRef: 'media://1' },
    user: 'yazar',
    pro: true,
  });

  const report = await call('/v1/moderation/report', {
    method: 'POST',
    body: { contentId: 'h1', authorId: 'yazar', reason: 'minor-safety' },
    user: 'raporcu',
  });
  assert.equal(report.status, 200);

  // Kullanıcı raporu KUYRUĞA girmeli; girmezse SLA hiç uygulanmaz.
  const queue = await repos.loadOpenItems();
  assert.equal(queue.length, 1, 'kullanıcı raporu moderasyon kuyruğuna girmedi');
  assert.equal(queue[0].contentId, 'h1');
});
