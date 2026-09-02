/**
 * DEPO SÖZLEŞMESİ: çağıran tarafın okuduğu her alan gerçekten dönüyor mu.
 *
 * NEDEN BU TEST VAR
 * Bu tarama iki para etkileyen hatayı buldu ve ikisi de aynı sınıftandı:
 *
 *   - `loadExportRecord` `isPro` döndürmüyordu → uçlar
 *     `record?.isPro === true` diye bakıyor, koşul HER ZAMAN false →
 *     ödeme yapan abone paywall'a çarpıyordu.
 *   - `loadEntitlement` `willRenew` / `inTrial` / `billingIssue`
 *     döndürmüyordu → ödemesi başarısız olan abone UYARILMIYORDU.
 *
 * İkisi de test edilemez görünüyordu çünkü eksik alan `undefined` okunup
 * `false`'a düşüyor ve `false` GEÇERLİ bir değer gibi duruyor. Eksik alan,
 * yanlış alan gibi görünmüyor — sessiz hatanın tanımı.
 *
 * YÖNTEM
 * Depo fonksiyonlarının `return { ... }` nesne anahtarları okunur; çağrı
 * yerlerinde `const x = await fn()` sonrası `x.alan` okumaları toplanır ve
 * karşılaştırılır. Elle yazılmış bir liste değil — kaynağın kendisi.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readdirSync, readFileSync, statSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', 'client_mobile', 'tools', 'tests', 'docs']);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

const repoSource = readFileSync(join(root, 'persistence', 'repositories.js'), 'utf8');

/**
 * Her depo fonksiyonunun döndürebileceği alan adları.
 *
 * Gövdedeki TÜM `return { ... }` blokları taranır — bir fonksiyonun birden
 * çok dönüş yolu olabilir (kayıt yok / kayıt var) ve ikisi de sözleşmenin
 * parçasıdır.
 */
function returnedFields() {
  const map = new Map();
  const fnPattern = /^ {4}async (\w+)\(/gm;

  let match;
  while ((match = fnPattern.exec(repoSource)) !== null) {
    const name = match[1];
    const start = match.index;

    // Gövde, fonksiyonun KENDİ kapanışında biter (`\n    },`). Bir sonraki
    // fonksiyon başlangıcını aramak, son fonksiyonun gövdesini dosya sonuna
    // kadar uzatıyor ve modül düzeyindeki yardımcıların dönüşlerini ona mal
    // ediyordu (ölçüldü: bir fonksiyon 30 alan topladı).
    const end = repoSource.indexOf('\n    },', start);
    const body = repoSource.slice(start, end === -1 ? repoSource.length : end);

    const fields = new Set();
    // Hem `alan: değer` hem KISA YAZIM (`alan,`) eşleşmeli: kısa yazımı
    // atlamak, gerçekten dönen alanları "dönmüyor" saymak demekti — kontrol
    // yanlış alarm verirdi ve ilk kullanımda devre dışı bırakılırdı.
    // Çok satırlı VE tek satırlı dönüşler. `return { posts, nextCursor };`
    // biçimini atlamak, o alanları "dönmüyor" sayıp yanlış alarm üretiyordu.
    for (const objectLiteral of body.matchAll(/return \{([^{}]*?)\};/g)) {
      // Virgülle bölünüp her parçanın BAŞINDAKİ ad alınıyor. `(\w+)[,:]`
      // kalıbı son kısa yazımı (`{ posts, nextCursor }` içindeki
      // `nextCursor`) kaçırıyordu: ardında virgül yok, süslü parantez var.
      for (const part of objectLiteral[1].split(',')) {
        const key = part.trim().match(/^(\w+)/);
        if (key) fields.add(key[1]);
      }
    }
    for (const objectLiteral of body.matchAll(/return \{([\s\S]*?)\n\s*\};/g)) {
      for (const key of objectLiteral[1].matchAll(/^\s*(\w+)\s*[,:]/gm)) fields.add(key[1]);
    }
    // `rows.map((r) => ({ ... }))` biçimindeki liste dönüşleri.
    for (const mapped of body.matchAll(/=> \(\{([\s\S]*?)\}\)\)/g)) {
      for (const key of mapped[1].matchAll(/(\w+)\s*[,:]/g)) fields.add(key[1]);
    }
    if (fields.size > 0) map.set(name, fields);
  }
  return map;
}

const returned = returnedFields();

/** Dizi döndüren fonksiyonlar: `.length`, `.map` gibi okumalar alan değildir. */
const NOT_FIELDS = new Set([
  'length', 'map', 'filter', 'forEach', 'find', 'some', 'every', 'sort',
  'slice', 'includes', 'reduce', 'then', 'catch', 'finally', 'ok', 'value',
  'error', 'json', 'status', 'push', 'toString',
]);

test('depo fonksiyonları okunabildi', () => {
  // Tarama bozulursa harita boşalır ve aşağıdaki test SESSİZCE geçer.
  // Ölçülen değer 10; eşik altına düşmek taramanın bozulduğunu gösterir.
  assert.ok(returned.size >= 10, `okunan depo fonksiyonu sayısı az: ${returned.size}`);
  assert.ok(returned.has('loadEntitlement'), 'loadEntitlement okunamadı');
  assert.ok(returned.has('loadExportRecord'), 'loadExportRecord okunamadı');
});

test('çağıran tarafın okuduğu her alan depo tarafından DÖNDÜRÜLÜYOR', () => {
  const gaps = [];

  for (const file of walk(root)) {
    const source = readFileSync(file, 'utf8');

    for (const assignment of source.matchAll(/const (\w+) = await (\w+)\(/g)) {
      const [, variable, fn] = assignment;
      const fields = returned.get(fn);
      if (!fields) continue;

      // Okumalar ATAMADAN SONRAKİ PENCEREDE aranır, dosyanın tamamında
      // değil. Aynı dosyada `const raw = await loadFeedPage()` ve
      // `const raw = await loadStories()` varsa, tüm dosyayı taramak her
      // iki fonksiyona da diğerinin alanlarını mal ediyordu — kontrol
      // gerçek bir boşluk olmadan kırmızıya dönüyordu.
      const after = source.slice(assignment.index);
      const nextAssignment = after.slice(1).search(/\n\s*const \w+ = await /);
      const scope = after.slice(0, nextAssignment === -1 ? after.length : nextAssignment + 1);

      const reads = new Set(
        [...scope.matchAll(new RegExp(`\\b${variable}\\??\\.(\\w+)`, 'g'))].map((m) => m[1]),
      );

      for (const field of reads) {
        if (NOT_FIELDS.has(field)) continue;
        if (fields.has(field)) continue;
        gaps.push(`${fn}(): "${field}" okunuyor ama döndürülmüyor — ${file.slice(root.length + 1)}`);
      }
    }
  }

  assert.deepEqual(
    [...new Set(gaps)],
    [],
    'Eksik alan `undefined` okunup `false`/`null`\'a düşer ve GEÇERLİ bir\n' +
      'değer gibi görünür. Bu sınıf hata sessizdir:\n  ' + [...new Set(gaps)].join('\n  '),
  );
});
