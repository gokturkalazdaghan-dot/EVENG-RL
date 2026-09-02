/**
 * YANIT SÖZLEŞMESİ: istemcinin beklediği her alan sunucudan gidiyor mu.
 *
 * NEDEN
 * `tests/apiContract.test.js` UÇLARIN varlığını doğruluyor; bu test
 * ALANLARIN varlığını doğruluyor. İkisi farklı hata sınıfı:
 *
 *   - Uç yoksa istemci 404 alır — gürültülü, teşhis edilebilir.
 *   - Alan eksikse istemci `undefined` okur ve `false`/`null`'a düşer.
 *     Hiçbir hata çıkmaz; özellik sessizce yanlış davranır. Sunucu
 *     tarafında bunun iki örneği bulundu (`isPro`, `billingIssue`) ve
 *     ikisi de ödeme yapan kullanıcıyı etkiliyordu.
 *
 * TypeScript bunu YAKALAYAMAZ: yanıt gövdesi `pinnedRequest<T>` ile tip
 * İDDİASI olarak okunur, doğrulama yapılmaz.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readdirSync, readFileSync, statSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');

function walk(dir, filter) {
  const out = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (name.name === 'node_modules') continue;
    const full = join(dir, name.name);
    if (name.isDirectory()) out.push(...walk(full, filter));
    else if (filter(name.name)) out.push(full);
  }
  return out;
}

const normalize = (path) =>
  path.replace(/\$\{[^}]*\}/g, ':p').replace(/:[A-Za-z0-9_]+/g, ':p').split('?')[0].replace(/\/$/, '');

/** İstemcinin her uçtan beklediği alanlar. */
function clientExpectations() {
  const map = new Map();

  for (const file of walk(join(root, 'client_mobile', 'src'), (n) => n.endsWith('.ts'))) {
    const text = readFileSync(file, 'utf8');

    // `pinnedRequest<{ a: X; b: Y }>({ path: '…' })`
    for (const m of text.matchAll(
      /pinnedRequest<\s*\{([^}]*)\}\s*>\s*\(\s*\{\s*path:\s*[`'"]([^`'"]*)/gs,
    )) {
      const fields = new Set([...m[1].matchAll(/(\w+)\s*:/g)].map((f) => f[1]));
      const path = normalize(m[2]);
      map.set(path, new Set([...(map.get(path) ?? []), ...fields]));
    }

    // `pinnedRequest<ArayüzAdı>({ path: '…' })`
    for (const m of text.matchAll(/pinnedRequest<\s*(\w+)\s*>\s*\(\s*\{\s*path:\s*[`'"]([^`'"]*)/g)) {
      const declaration = new RegExp(`interface ${m[1]} \\{(.*?)\\n\\}`, 's').exec(text);
      if (!declaration) continue;
      const fields = new Set([...declaration[1].matchAll(/readonly (\w+)/g)].map((f) => f[1]));
      const path = normalize(m[2]);
      map.set(path, new Set([...(map.get(path) ?? []), ...fields]));
    }
  }
  return map;
}

/** Sunucunun her uçtan gönderdiği alanlar. */
function serverResponses() {
  const map = new Map();
  const SKIP = new Set(['node_modules', '.git', 'client_mobile', 'tools', 'tests', 'docs']);

  const files = [];
  const collect = (dir) => {
    for (const name of readdirSync(dir)) {
      if (SKIP.has(name)) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) collect(full);
      else if (name.endsWith('.js')) files.push(full);
    }
  };
  collect(root);

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const prefix = file.includes('core_gateway/moderation') ? '/internal' : '/v1';

    for (const route of text.matchAll(
      /router\.(?:get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]([\s\S]*?)(?=\nrouter\.|\n\/\/ ----|$)/g,
    )) {
      const path = normalize(prefix + route[1]);
      const fields = new Set();

      // BAŞARI durum kodlarının HEPSİ: yalnızca 200'e bakmak, 201 dönen
      // yayınlama ucunu "alan göndermiyor" sanmaya yol açıyordu (ölçüldü).
      for (const body of route[2].matchAll(/res\.status\((?:200|201|202)\)\.json\(\{([^}]*)\}/gs)) {
        for (const part of body[1].split(',')) {
          const key = part.trim().match(/^(\w+)/);
          if (key) fields.add(key[1]);
        }
      }
      if (fields.size > 0) map.set(path, new Set([...(map.get(path) ?? []), ...fields]));
    }
  }
  return map;
}

const expectations = clientExpectations();
const responses = serverResponses();

test('tarama gerçekten çalışıyor', () => {
  // Regex bozulursa iki harita da boşalır ve aşağıdaki test SESSİZCE geçer.
  assert.ok(expectations.size >= 10, `istemci beklentisi az: ${expectations.size}`);
  assert.ok(responses.size >= 10, `sunucu yanıtı az: ${responses.size}`);

  const matched = [...expectations.keys()].filter((p) => responses.has(p));
  assert.ok(matched.length >= 10, `eşleşen yol az: ${matched.length}`);
});

test('istemcinin beklediği her alan sunucudan GÖNDERİLİYOR', () => {
  const gaps = [];

  for (const [path, expected] of expectations) {
    const sent = responses.get(path);
    // Eşleşmeyen yollar `apiContract` testinin işi; burada yalnızca ALAN
    // karşılaştırması yapılıyor.
    if (!sent) continue;

    for (const field of expected) {
      if (!sent.has(field)) gaps.push(`${path}: "${field}"`);
    }
  }

  assert.deepEqual(
    gaps,
    [],
    'İstemci bu alanları okuyor ama sunucu göndermiyor. Eksik alan\n' +
      '`undefined` okunup `false`/`null`\'a düşer; hiçbir hata çıkmaz:\n  ' + gaps.join('\n  '),
  );
});
