/**
 * İstemci ile sunucu arasındaki UÇ SÖZLEŞMESİ.
 *
 * NEDEN
 * İstemci `pinnedRequest({ path: '/v1/feed/like' })` çağırıyordu; sunucuda
 * öyle bir uç YOKTU. Sonuç 404'tü ve istemci onu "ağ hatası" olarak
 * gösteriyordu — yani özellik hiç çalışmıyordu ama hata mesajı yanlış yeri
 * işaret ediyordu. Bu sınıf hatayı ne TypeScript ne de sunucu testleri
 * görebilir: iki taraf birbirinden habersiz derlenir ve ikisi de geçer.
 *
 * YÖNTEM
 * Uç listeleri ELLE YAZILMIYOR. İstemci kaynağından `path:` dizgeleri,
 * sunucu kaynağından `router.<method>('<yol>')` çağrıları OKUNUYOR. Elle
 * yazılmış bir liste, tam da koruması gereken anda (yeni uç eklendiğinde)
 * güncellenmeyi unutur.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { readFileSync, readdirSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');

function walk(dir, filter) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, filter));
    else if (filter(entry.name)) out.push(full);
  }
  return out;
}

/**
 * `${...}` yerine `:p` koyar — parametreli yollar karşılaştırılabilsin.
 *
 * İki aşama gerekiyor: önce TAM `${...}` yer değiştirmeleri (yol
 * segmentleri), sonra kalan yarım `${` parçası atılıyor. İkincisi, iç içe
 * şablon dizgesi içeren yollar için: `/v1/feed${cursor ? `?c=..` : ''}`
 * dizgesi ilk backtick'te kesildiği için geriye `${cursor ?` kalıyor.
 * Tek aşamada temizlemek, `/v1/creators/${id}/offer` yolundaki `/offer`
 * ekini de silerdi.
 */
function normalize(path) {
  return path
    .replace(/\$\{[^{}]*\}/g, ':p')
    .replace(/\$\{.*$/, '')
    .replace(/:[A-Za-z0-9_]+/g, ':p')
    .replace(/\?.*$/, '')
    .replace(/\/$/, '');
}

/** İstemcinin çağırdığı `/v1/...` yolları. */
function clientPaths() {
  const files = walk(
    join(root, 'client_mobile/src'),
    (name) => name.endsWith('.ts') || name.endsWith('.tsx'),
  );
  const paths = new Map();
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/path:\s*[`'"]([^`'"]*)[`'"]/g)) {
      const raw = match[1];
      if (!raw.startsWith('/v1/')) continue;
      paths.set(normalize(raw), file.slice(root.length + 1));
    }
  }
  return paths;
}

/** Sunucunun tanımladığı `/v1/...` yolları. */
function serverPaths() {
  const files = walk(root, (name) => name.endsWith('.js')).filter(
    (f) => !f.includes('/tests/') && !f.includes('/client_mobile/') && !f.includes('/tools/'),
  );
  const paths = new Set();
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(
      /router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g,
    )) {
      // Bütün yönlendiriciler `/v1` altına bağlanıyor (server.js), tek
      // istisna moderasyon paneli (`/internal`).
      const prefix = file.includes('core_gateway/moderation') ? '/internal' : '/v1';
      paths.add(normalize(prefix + match[2]));
    }
  }
  return paths;
}

test('istemcinin çağırdığı her uç sunucuda TANIMLI', () => {
  const client = clientPaths();
  const server = serverPaths();

  const missing = [...client.entries()]
    .filter(([path]) => !server.has(path))
    .map(([path, file]) => `${path}  (${file})`);

  assert.deepStrictEqual(
    missing,
    [],
    'İstemci var olmayan uçları çağırıyor — kullanıcı 404 alır, özellik hiç ' +
      'çalışmaz:\n  ' + missing.join('\n  '),
  );
});

test('sözleşme testinin kendisi çalışıyor — iki taraf da boş değil', () => {
  // Regex bozulursa iki liste de boşalır ve yukarıdaki test SESSİZCE geçer.
  // Bir kontrolün en tehlikeli hali, hiçbir şey ölçmeden yeşil olmasıdır.
  assert.ok(clientPaths().size >= 15, `istemci yolu sayısı beklenenden az: ${clientPaths().size}`);
  assert.ok(serverPaths().size >= 20, `sunucu yolu sayısı beklenenden az: ${serverPaths().size}`);
});

test('yol normalleştirme parametreleri eşitler', () => {
  assert.strictEqual(normalize('/v1/entitlements/${encodeURIComponent(x)}'), '/v1/entitlements/:p');
  assert.strictEqual(normalize('/v1/entitlements/:appUserId'), '/v1/entitlements/:p');
  assert.strictEqual(normalize('/v1/templates?${params}'), '/v1/templates');
  assert.strictEqual(normalize('/v1/creators/:creatorId/offer'), '/v1/creators/:p/offer');
  // İç içe şablon dizgesi: yarım kalan `${` parçası atılır, yol korunur.
  assert.strictEqual(normalize('/v1/feed${cursor ? '), '/v1/feed');
});

test('creator kademeleri istemci ile sunucuda AYNI', () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';
  const social = require('../social_gamification/social');

  const source = readFileSync(
    join(root, 'client_mobile/src/billing/CreatorSubscriptions.ts'),
    'utf8',
  );

  // İstemci kaynağından OKUNUYOR, kopyalanmıyor: kopyalanmış bir liste
  // istemci değiştiğinde sessizce bayatlar.
  const block = source.slice(source.indexOf('CREATOR_TIERS'), source.indexOf('export interface'));
  const clientTiers = [...block.matchAll(/(tier[0-9]):\s*\{\s*productId:\s*'([^']+)'/g)];

  assert.ok(clientTiers.length > 0, 'istemci kademeleri okunamadı');

  for (const [, tier, productId] of clientTiers) {
    assert.ok(social.CREATOR_TIERS.has(tier), `sunucu ${tier} kademesini tanımıyor`);
    assert.strictEqual(
      social.creatorProductId(tier),
      productId,
      `${tier} ürün kimliği ayrışmış — ödeme yapan kullanıcı purchase_not_confirmed görür`,
    );
  }

  assert.strictEqual(
    social.CREATOR_TIERS.size,
    clientTiers.length,
    'sunucu, istemcide olmayan bir kademe tanımlıyor',
  );
});
