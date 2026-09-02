/**
 * Sunucu tarafı render ucu — UYDURULMUŞ BAŞARI YOK.
 *
 * NEDEN
 * `renderFullResolution` hiçbir render yapmadan
 * `https://cdn.evengirl.app/renders/<id>.jpg` döndürüyordu: var olmayan bir
 * dosyaya işaret eden bir adres. İstemci 200 alıp "dışa aktarma başarılı"
 * sanacak, sonra kırık bir görsel gösterecekti.
 *
 * Uydurulmuş bir başarı, açık bir hatadan daha zararlıdır: hata yeniden
 * denenebilir, yalan denenemez.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';

const { renderFullResolution } = require('../export_gate/quota');

const originalFetch = global.fetch;

test.afterEach?.(() => {
  global.fetch = originalFetch;
  delete process.env.RENDER_SERVICE_URL;
  delete process.env.RENDER_SERVICE_KEY;
});

test('yapılandırılmamışsa URL UYDURMAZ, açıkça reddeder', async () => {
  delete process.env.RENDER_SERVICE_URL;

  await assert.rejects(
    () => renderFullResolution('proje-1', 4096),
    (err) => err.code === 'render_not_configured',
  );
});

test('yapılandırılmışsa servisin döndürdüğü adres kullanılır', async () => {
  process.env.RENDER_SERVICE_URL = 'https://render.example';
  let seen = null;
  global.fetch = async (url, init) => {
    seen = { url, body: JSON.parse(init.body) };
    return { ok: true, json: async () => ({ url: 'https://cdn.example/a.jpg' }) };
  };

  const url = await renderFullResolution('proje-1', 4096);

  assert.equal(url, 'https://cdn.example/a.jpg');
  assert.equal(seen.url, 'https://render.example/render');
  assert.equal(seen.body.projectId, 'proje-1');
  assert.equal(seen.body.maxEdgePx, 4096);

  global.fetch = originalFetch;
  delete process.env.RENDER_SERVICE_URL;
});

test('sondaki eğik çizgi çift eğik çizgi ÜRETMEZ', async () => {
  process.env.RENDER_SERVICE_URL = 'https://render.example/';
  let seen = null;
  global.fetch = async (url) => {
    seen = url;
    return { ok: true, json: async () => ({ url: 'https://cdn.example/a.jpg' }) };
  };

  await renderFullResolution('p', 1024);
  assert.equal(seen, 'https://render.example/render');

  global.fetch = originalFetch;
  delete process.env.RENDER_SERVICE_URL;
});

test('https olmayan adres REDDEDİLİR', async () => {
  // Boş ya da şifresiz bir yanıtı istemciye geçirmek, uydurmakla aynı
  // sonucu verir.
  process.env.RENDER_SERVICE_URL = 'https://render.example';
  global.fetch = async () => ({ ok: true, json: async () => ({ url: 'http://cdn/a.jpg' }) });

  await assert.rejects(() => renderFullResolution('p', 1024), /render_bad_url/);

  global.fetch = originalFetch;
  delete process.env.RENDER_SERVICE_URL;
});

test('boş adres REDDEDİLİR', async () => {
  process.env.RENDER_SERVICE_URL = 'https://render.example';
  global.fetch = async () => ({ ok: true, json: async () => ({}) });

  await assert.rejects(() => renderFullResolution('p', 1024), /render_bad_url/);

  global.fetch = originalFetch;
  delete process.env.RENDER_SERVICE_URL;
});

test('servis hatası YUTULMAZ', async () => {
  process.env.RENDER_SERVICE_URL = 'https://render.example';
  global.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });

  await assert.rejects(() => renderFullResolution('p', 1024), /render_http_500/);

  global.fetch = originalFetch;
  delete process.env.RENDER_SERVICE_URL;
});

test('anahtar yoksa authorization başlığı HİÇ gönderilmez', async () => {
  process.env.RENDER_SERVICE_URL = 'https://render.example';
  delete process.env.RENDER_SERVICE_KEY;
  let headers = null;
  global.fetch = async (_url, init) => {
    headers = init.headers;
    return { ok: true, json: async () => ({ url: 'https://cdn.example/a.jpg' }) };
  };

  await renderFullResolution('p', 1024);
  assert.equal('authorization' in headers, false);

  global.fetch = originalFetch;
  delete process.env.RENDER_SERVICE_URL;
});
