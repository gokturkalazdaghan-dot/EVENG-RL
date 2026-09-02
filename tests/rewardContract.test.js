/**
 * Ödül sözleşmesi testleri.
 *
 * Ödül zinciri ÜÇ ayrı yerde tanımlı bilgiye dayanır:
 *
 *   1. Kademe tablosu   — istemci `LeaderboardPolicy.ts` (kullanıcıya
 *                          "ilk 10'a girersen 7 gün" diyen yer)
 *   2. Kademe tablosu   — `rewardWorker.js` (kodu gerçekten dağıtan yer)
 *   3. Teklif kimlikleri— `promoCodes.OFFER_IDS`, GÜN SAYISINA göre anahtarlı
 *
 * 1 ve 2 birebir kopyadır. Ayrıştıklarında kullanıcıya söylenen ile
 * dağıtılan farklı olur. 3 ayrıştığında `offerIdFor` fırlatır — sessiz
 * değil ama hata ancak PAZARTESİ 00:00 cron'unda, üretimde görülür.
 *
 * Bu dosya üçünü de aynı anda doğrular.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const { REWARD_TIERS, MAX_REWARD_RANK } = require('../reward_automation/rewardWorker');
const promoCodes = require('../reward_automation/promoCodes');

const POLICY = join(
  __dirname, '..', 'client_mobile', 'src', 'social', 'LeaderboardPolicy.ts',
);

/** İstemcinin kademe tablosunu kaynak dosyadan çıkarır. */
function clientTiers() {
  const source = readFileSync(POLICY, 'utf8');
  const start = source.indexOf('export const REWARD_TIERS');
  assert.notEqual(start, -1, 'REWARD_TIERS bulunamadı — dosya taşınmış olabilir');

  const end = source.indexOf('];', start);
  assert.notEqual(end, -1, 'REWARD_TIERS sonu bulunamadı');

  const block = source.slice(start, end);
  const tiers = [...block.matchAll(
    /minRank:\s*(\d+),\s*maxRank:\s*(\d+),\s*freeProDays:\s*(\d+)/g,
  )].map((m) => ({
    minRank: Number(m[1]),
    maxRank: Number(m[2]),
    freeProDays: Number(m[3]),
  }));

  assert.ok(tiers.length > 0, 'hiç kademe ayrıştırılamadı — ayrıştırıcı bozuk');
  return tiers;
}

test('worker ile istemci kademe tabloları AYNI', () => {
  // Ayrıştıklarında kullanıcıya söylenen ile dağıtılan farklı olur —
  // ve kullanıcı bunu ancak ödülü alamayınca anlar.
  assert.deepEqual(
    REWARD_TIERS.map((t) => ({ ...t })),
    clientTiers(),
  );
});

test('her kademe süresi için İKİ mağazada da teklif kimliği tanımlı', () => {
  // Eksik olduğunda offerIdFor fırlatır ve o kullanıcı ödülünü alamaz;
  // hata Pazartesi 00:00 cron'unda üretimde görülür.
  for (const tier of REWARD_TIERS) {
    for (const store of ['app_store', 'play_store']) {
      assert.doesNotThrow(
        () => promoCodes.offerIdFor(tier.freeProDays, store),
        `${tier.freeProDays} gün / ${store} için teklif kimliği YOK`,
      );
    }
  }
});

test('teklif kimliği olmayan süre sessizce geçmez', () => {
  // Kapının yönü: tanımsız süre kabul edilmemeli.
  assert.throws(() => promoCodes.offerIdFor(14, 'app_store'), /14/);
  assert.throws(() => promoCodes.offerIdFor(0, 'app_store'), /0/);
});

test('bilinmeyen mağaza reddedilir', () => {
  assert.throws(() => promoCodes.offerIdFor(7, 'amazon_appstore'));
});

test('kademeler çakışmaz ve boşluk bırakmaz', () => {
  const sirali = [...REWARD_TIERS].sort((a, b) => a.minRank - b.minRank);

  assert.equal(sirali[0].minRank, 1, 'ilk kademe 1. sıradan başlamalı');

  for (let i = 1; i < sirali.length; i += 1) {
    assert.equal(
      sirali[i].minRank,
      sirali[i - 1].maxRank + 1,
      `${sirali[i - 1].maxRank}. ve ${sirali[i].minRank}. sıralar arasında boşluk/çakışma var`,
    );
  }
});

test('üst kademe daha uzun ödül verir', () => {
  const sirali = [...REWARD_TIERS].sort((a, b) => a.minRank - b.minRank);
  for (let i = 1; i < sirali.length; i += 1) {
    assert.ok(
      sirali[i].freeProDays < sirali[i - 1].freeProDays,
      'daha düşük sıra daha uzun ödül alıyor',
    );
  }
});

test('worker sorgu limiti en düşük kademeyi kapsar', () => {
  // Limit küçük kalırsa son kademedeki kullanıcılar hiç sorgulanmaz ve
  // ödüllerini sessizce alamaz.
  const enDusukSira = Math.max(...REWARD_TIERS.map((t) => t.maxRank));
  assert.equal(MAX_REWARD_RANK, enDusukSira);
});

// ------------------------------------------------------- push anahtarları ----

const DILLER = ['tr', 'en', 'de', 'es', 'fr', 'pt', 'ja', 'ar'];

function flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, key));
    else out[key] = v;
  }
  return out;
}

test('worker\'ın gönderdiği i18n anahtarları SEKİZ dilde de var', () => {
  // Push yükü kod DEĞİL çeviri anahtarı taşır; anahtar eksikse kullanıcı
  // bildirimde ham anahtar adını görür veya boş bir bildirim alır.
  const source = readFileSync(
    join(__dirname, '..', 'reward_automation', 'rewardWorker.js'), 'utf8',
  );
  const keys = [...new Set(
    [...source.matchAll(/(?:titleKey|bodyKey):\s*'([a-zA-Z.]+)'/g)].map((m) => m[1]),
  )];

  assert.ok(keys.length > 0, 'worker\'da hiç i18n anahtarı bulunamadı — ayrıştırıcı bozuk');

  for (const lang of DILLER) {
    const dict = flatten(JSON.parse(readFileSync(
      join(__dirname, '..', 'client_mobile', 'src', 'i18n', 'locales', `${lang}.json`), 'utf8',
    )));
    for (const key of keys) {
      assert.ok(
        typeof dict[key] === 'string' && dict[key].length > 0,
        `${lang} dilinde "${key}" yok`,
      );
    }
  }
});

test('push yükü kodun kendisini TAŞIMAZ', () => {
  // Push yükleri hem OS bildirim merkezinde hem sağlayıcı loglarında
  // birikir; tek kullanımlık bir kod taşıyıcısına değer taşır.
  const source = readFileSync(
    join(__dirname, '..', 'reward_automation', 'rewardWorker.js'), 'utf8',
  );
  const pushBlock = source.slice(source.indexOf('sendPush'));

  assert.equal(
    /code:\s*(issued\.)?code\b/.test(pushBlock),
    false,
    'push yükünde ham kod alanı var',
  );
});
