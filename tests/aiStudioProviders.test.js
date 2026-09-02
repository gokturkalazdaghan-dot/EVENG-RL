/**
 * Even Girl Generate'in dış sağlayıcıları.
 *
 * NEDEN
 * `screenFaces` ve `generate` kalıcı olarak fırlatan yer tutucuydu.
 * Fail-closed davranış doğruydu — hiçbir şey üretilmiyordu — ama sonuç,
 * ÖZELLİĞİN HİÇ ÇALIŞMAMASIYDI ve hiçbir test ikisini ayırt etmiyordu.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';

const {
  createProvidersFromEnv,
  faceScreener,
  imageGenerator,
} = require('../core_gateway/ai_studio/providers');

const realFetch = global.fetch;
const stubFetch = (payload, ok = true, status = 200) => {
  global.fetch = async () => ({ ok, status, json: async () => payload });
};

test('yapılandırılmamışsa ikisi de FIRLATIR — sessizce geçmez', async () => {
  const p = createProvidersFromEnv({});

  assert.equal(p.faceScreenerConfigured, false);
  assert.equal(p.generatorConfigured, false);
  // `code` alanına bakılıyor, mesaja değil: mesaj Türkçe ve çevrilebilir,
  // kod ise çağıran tarafın dallandığı SÖZLEŞME.
  await assert.rejects(
    () => p.screenFaces([]),
    (err) => err.code === 'face_screener_not_configured',
  );
  await assert.rejects(() => p.generate({}), (err) => err.code === 'generator_not_configured');
});

test('düz HTTP adresi REDDEDİLİR', () => {
  // Yüz gömmeleri ve üretim istekleri şifresiz taşınamaz.
  assert.throws(() => createProvidersFromEnv({ FACE_SCREENER_URL: 'http://x' }), /https/);
  assert.throws(() => createProvidersFromEnv({ IMAGE_GENERATOR_URL: 'http://x' }), /https/);
});

test('https adresleri yapılandırılmış sayılır', () => {
  const p = createProvidersFromEnv({
    FACE_SCREENER_URL: 'https://face.example',
    IMAGE_GENERATOR_URL: 'https://gen.example',
  });
  assert.equal(p.faceScreenerConfigured, true);
  assert.equal(p.generatorConfigured, true);
});

test('screenerRan KESİN olmalı — undefined "çalıştı" sayılmaz', async () => {
  // `undefined`'ı "çalıştı" saymak, tarayıcı çalışmadığı halde
  // referansların temiz sayılması demektir.
  stubFetch({ faces: [] });
  const screen = faceScreener({ endpoint: 'https://face.example', apiKey: null });

  await assert.rejects(() => screen(['r1']), /bad_response/);
  global.fetch = realFetch;
});

test('faces dizi değilse REDDEDİLİR', async () => {
  stubFetch({ screenerRan: true, faces: null });
  const screen = faceScreener({ endpoint: 'https://face.example', apiKey: null });

  await assert.rejects(() => screen(['r1']), /bad_faces/);
  global.fetch = realFetch;
});

test('geçerli tarama sonucu aynen döner', async () => {
  stubFetch({ screenerRan: true, faces: [{ referenceIndex: 0, similarity: 0.2 }] });
  const screen = faceScreener({ endpoint: 'https://face.example', apiKey: null });

  const result = await screen(['r1']);
  assert.equal(result.screenerRan, true);
  assert.equal(result.faces.length, 1);
  global.fetch = realFetch;
});

test('HTTP hatası YUTULMAZ', async () => {
  stubFetch({}, false, 502);
  const screen = faceScreener({ endpoint: 'https://face.example', apiKey: null });

  // `null` döndürmek, çağıran tarafın onu "tarayıcı çalıştı, eşleşme yok"
  // sanmasına bir adım yaklaştırırdı.
  await assert.rejects(() => screen(['r1']), /http_502/);
  global.fetch = realFetch;
});

test('üreteç çıktısı https DEĞİLSE reddedilir', async () => {
  stubFetch({ outputUri: 'http://cdn/a.jpg' });
  const generate = imageGenerator({ endpoint: 'https://gen.example', apiKey: null });

  await assert.rejects(() => generate({ positive: 'x' }), /bad_output/);
  global.fetch = realFetch;
});

test('üreteç boş çıktı döndürürse reddedilir', async () => {
  stubFetch({});
  const generate = imageGenerator({ endpoint: 'https://gen.example', apiKey: null });

  await assert.rejects(() => generate({ positive: 'x' }), /bad_output/);
  global.fetch = realFetch;
});

test('Even Girl Generate çıktısı HER ZAMAN filigransızdır', async () => {
  // Sağlayıcı ne derse desin: bu ürün kuralı istemcide de yazılı
  // (EvenGenerate.GenerateResult.watermarked: false).
  stubFetch({ outputUri: 'https://cdn.example/a.jpg', watermarked: true, durationMs: 1200 });
  const generate = imageGenerator({ endpoint: 'https://gen.example', apiKey: null });

  const result = await generate({ positive: 'x' });
  assert.equal(result.watermarked, false);
  assert.equal(result.outputUri, 'https://cdn.example/a.jpg');
  assert.equal(result.durationMs, 1200);
  global.fetch = realFetch;
});

test('geçersiz süre 0 olur — NaN istemciye sızmaz', async () => {
  stubFetch({ outputUri: 'https://cdn.example/a.jpg', durationMs: 'çok' });
  const generate = imageGenerator({ endpoint: 'https://gen.example', apiKey: null });

  assert.equal((await generate({ positive: 'x' })).durationMs, 0);
  global.fetch = realFetch;
});

test('configureProviders faceDeps.screenFaces alanını DEĞİŞTİRİR', () => {
  const routes = require('../core_gateway/ai_studio/routes');
  const before = routes.faceDeps.screenFaces;

  const result = routes.configureProviders({
    FACE_SCREENER_URL: 'https://face.example',
    IMAGE_GENERATOR_URL: 'https://gen.example',
  });

  assert.equal(result.faceScreener, true);
  assert.equal(result.generator, true);
  // Ayrı bir nesneye yazmak, yapılandırmayı hiç uygulamamakla aynı olurdu.
  assert.notEqual(routes.faceDeps.screenFaces, before);

  routes.configureProviders({});
});
