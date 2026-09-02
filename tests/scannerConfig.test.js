/**
 * Tarayıcı yapılandırması testleri.
 *
 * NEDEN
 * `moderationDeps.scanMedia` kalıcı olarak fırlatan bir yer tutucuydu ve
 * `scannerClient.js` hiçbir yerden çağrılmıyordu. Fail-closed doğru
 * çalışıyordu ama HİÇBİR İÇERİK ONAYLANMIYORDU: her yükleme `pending`
 * kalıyor, akış kalıcı olarak boş görünüyordu. Doğru davranış ile çalışan
 * ürün aynı şey değildir ve hiçbir test ikisini ayırt etmiyordu.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';

const { createScannerFromEnv, httpProvider } = require('../social_gamification/scannerConfig');

test('adres yoksa yapılandırılmamış sayılır ve tarayıcı FIRLATIR', async () => {
  const scanner = createScannerFromEnv({});

  assert.equal(scanner.configured, false);
  // Sessizce `undefined` dönmek fail-closed yoluna sokardı ama SEBEBİ
  // görünmez olurdu; fırlatmak sebebi log'a yazar.
  await assert.rejects(() => scanner.scanMedia({ mediaRef: 'x', kind: 'post' }), /not_configured/);
});

test('düz HTTP adresi REDDEDİLİR', () => {
  // Moderasyon kararlarını ve medya referanslarını şifresiz taşımak,
  // onları ağdaki herkese açar. Sessizce kabul etmek en kötüsü.
  assert.throws(
    () => createScannerFromEnv({ MODERATION_SCANNER_URL: 'http://tarayici.example' }),
    /https/,
  );
});

test('https adresi yapılandırılmış sayılır', () => {
  const scanner = createScannerFromEnv({ MODERATION_SCANNER_URL: 'https://tarayici.example' });
  assert.equal(scanner.configured, true);
  assert.equal(typeof scanner.scanMedia, 'function');
});

test('sondaki eğik çizgi çift eğik çizgi ÜRETMEZ', async () => {
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    return { ok: true, json: async () => ({ hash: 'abc' }) };
  };

  const provider = httpProvider({ baseUrl: 'https://t.example', apiKey: null });
  await provider.perceptualHash('media-1');

  assert.equal(calls[0], 'https://t.example/hash');
});

test('HTTP hatası YUTULMAZ — karantinaya giden yol açık kalır', async () => {
  global.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });

  const provider = httpProvider({ baseUrl: 'https://t.example', apiKey: null });
  // `null` döndürmek, hatayı "temiz" sanmaya bir adım yaklaştırırdı.
  await assert.rejects(() => provider.perceptualHash('m'), /scanner_http_503/);
});

test('boş karma REDDEDİLİR', async () => {
  global.fetch = async () => ({ ok: true, json: async () => ({ hash: '' }) });

  const provider = httpProvider({ baseUrl: 'https://t.example', apiKey: null });
  await assert.rejects(() => provider.perceptualHash('m'), /bad_hash/);
});

test('kesin olmayan karma eşleşmesi REDDEDİLİR', async () => {
  // `undefined`'ı "eşleşme yok" saymak, bilinen CSAM'in eşleşmemiş gibi
  // geçmesi demektir.
  global.fetch = async () => ({ ok: true, json: async () => ({}) });

  const provider = httpProvider({ baseUrl: 'https://t.example', apiKey: null });
  await assert.rejects(() => provider.hashLookup('abc'), /bad_lookup/);
});

test('eşleşme false ise sınıflandırıcıya geçilir', async () => {
  global.fetch = async () => ({ ok: true, json: async () => ({ match: false }) });

  const provider = httpProvider({ baseUrl: 'https://t.example', apiKey: null });
  assert.deepEqual(await provider.hashLookup('abc'), { match: false });
});

test('API anahtarı varsa authorization başlığı gider', async () => {
  let headers = null;
  global.fetch = async (_url, init) => {
    headers = init.headers;
    return { ok: true, json: async () => ({ hash: 'h' }) };
  };

  const provider = httpProvider({ baseUrl: 'https://t.example', apiKey: 'gizli' });
  await provider.perceptualHash('m');

  assert.equal(headers.authorization, 'Bearer gizli');
});

test('anahtar yoksa authorization başlığı HİÇ gönderilmez', async () => {
  let headers = null;
  global.fetch = async (_url, init) => {
    headers = init.headers;
    return { ok: true, json: async () => ({ hash: 'h' }) };
  };

  const provider = httpProvider({ baseUrl: 'https://t.example', apiKey: null });
  await provider.perceptualHash('m');

  // Boş bir `Bearer ` başlığı göndermek, bazı ağ geçitlerinde 401 yerine
  // sessiz bir kimliksiz istek üretir.
  assert.equal('authorization' in headers, false);
});

test('configureScanner moderationDeps.scanMedia alanını DEĞİŞTİRİR', () => {
  const social = require('../social_gamification/social');
  const before = social.moderationDeps.scanMedia;

  const configured = social.configureScanner({ MODERATION_SCANNER_URL: 'https://t.example' });

  assert.equal(configured, true);
  // Kapı, kurulan tarayıcıyı gerçekten kullanmalı; ayrı bir nesneye yazmak
  // yapılandırmayı hiç uygulamamakla aynı şey olurdu.
  assert.notEqual(social.moderationDeps.scanMedia, before);

  // Diğer testleri etkilememesi için yer tutucuya geri alınıyor.
  social.configureScanner({});
});
