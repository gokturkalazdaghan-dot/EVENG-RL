/**
 * Yaş kademesi sözleşmesi.
 *
 * `isVisibleTo` kademeyi İSİMLE sınar: `'unverified'` ise hiçbir şey,
 * `'adult'` değilse +18 yok. Tanımadığı bir değer İLK kontrolü geçiyordu.
 *
 * Sonuç şuydu: veritabanı `undefined` döndürdüğünde hesap hiçbir şey
 * görmezken, yarım kalmış bir şema göçü yüzünden `''` döndüğünde içerik
 * görüyordu. Koruma, verinin BOZULMA BİÇİMİNE bağlıydı — ki bu, korumanın
 * olmaması demektir.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const { normalizeTier, ACCESS_TIERS, isVisibleTo } = require('../social_gamification/social');

const AGE_POLICY = join(__dirname, '..', 'client_mobile', 'src', 'age', 'AgePolicy.ts');

/** İstemcinin `AccessTier` birliğini kaynak dosyadan çıkarır. */
function clientTiers() {
  const source = readFileSync(AGE_POLICY, 'utf8');
  const start = source.indexOf('export type AccessTier =');
  assert.notEqual(start, -1, 'AccessTier bulunamadı — dosya taşınmış olabilir');

  const end = source.indexOf(';', start);
  const values = [...source.slice(start, end).matchAll(/'([a-z]+)'/g)].map((m) => m[1]);

  assert.ok(values.length >= 2, `yalnızca ${values.length} kademe ayrıştırıldı — ayrıştırıcı bozuk`);
  return values;
}

test('sunucu kademe kümesi istemcinin AccessTier birliğiyle AYNI', () => {
  assert.deepEqual([...ACCESS_TIERS].sort(), clientTiers().sort());
});

test('bilinen kademeler olduğu gibi geçer', () => {
  for (const tier of ACCESS_TIERS) {
    assert.equal(normalizeTier(tier), tier);
  }
});

test('tanınmayan HER değer unverified sayılır', () => {
  const bozuk = [
    'pending', 'ADMIN', 'Adult', 'ADULT', '', ' ', 'safe ',
    null, undefined, 0, 1, {}, [], ['adult'], true, NaN,
  ];

  for (const value of bozuk) {
    assert.equal(
      normalizeTier(value),
      'unverified',
      `bozuk kademe geçti: ${JSON.stringify(value) ?? String(value)}`,
    );
  }
});

test('bozuk kademe, eksik kademeden DAHA GENİŞ olamaz', () => {
  // Kusurun tam ifadesi buydu: `undefined` hiçbir şey görmezken `''`
  // içerik görüyordu.
  const post = { rating: 'general', authorId: 'a', moderationState: 'approved' };

  const gorur = (tier) =>
    isVisibleTo(
      { tier: normalizeTier(tier), adultContentOptIn: false, blockedAuthorIds: new Set() },
      post,
    );

  assert.equal(gorur(undefined), false);
  for (const bozuk of ['', 'pending', 'ADMIN', null, 0, {}]) {
    assert.equal(gorur(bozuk), false, `bozuk kademe içerik gördü: ${String(bozuk)}`);
  }
});

test('normalleştirme büyük/küçük harf toleranslı DEĞİL', () => {
  // Tolerans eklemek, veritabanındaki tutarsızlığı gizlerdi. 'ADULT'
  // yazılmışsa bu bir veri hatasıdır ve fail-closed davranmalı.
  assert.equal(normalizeTier('ADULT'), 'unverified');
  assert.equal(normalizeTier('Adult'), 'unverified');
});

test('safe kademesi genel içerik görür ama +18 GÖRMEZ', () => {
  const viewer = { tier: 'safe', adultContentOptIn: true, blockedAuthorIds: new Set() };

  const genel = { rating: 'general', authorId: 'a', moderationState: 'approved' };
  const yetiskin = { rating: 'adult', authorId: 'a', moderationState: 'approved' };
  const hassas = { rating: 'sensitive', authorId: 'a', moderationState: 'approved' };
  const inceleme = { rating: 'review', authorId: 'a', moderationState: 'approved' };

  assert.equal(isVisibleTo(viewer, genel), true);
  // Reşit olmayan, opt-in AÇIK olsa bile +18 göremez: tercih kalkanı
  // devre dışı bırakamaz.
  assert.equal(isVisibleTo(viewer, yetiskin), false);
  assert.equal(isVisibleTo(viewer, hassas), false);
  assert.equal(isVisibleTo(viewer, inceleme), false);
});

test('taranmamış içerik HİÇBİR kademeye gitmez', () => {
  for (const tier of ACCESS_TIERS) {
    const viewer = { tier, adultContentOptIn: true, blockedAuthorIds: new Set() };
    for (const state of ['pending', 'blocked', undefined, 'unknown']) {
      assert.equal(
        isVisibleTo(viewer, { rating: 'general', authorId: 'a', moderationState: state }),
        false,
        `tier=${tier} state=${state} için içerik sızdı`,
      );
    }
  }
});
