/**
 * ULAŞILABİLİRLİK: yazılmış her sunucu modülü gerçekten ÇAĞRILIYOR mu.
 *
 * NEDEN
 * `scannerClient.js` yazılmış, testleri geçmiş ve HİÇBİR YERDEN
 * çağrılmamıştı. Sonucu şuydu: moderasyon kapısı fail-closed doğru
 * çalışıyor ama hiçbir içerik onaylanmıyor — her yükleme `pending` kalıyor
 * ve akış kalıcı olarak boş görünüyordu. Öksüz bir modül çalıştırılır,
 * testten geçer, incelemede doğru görünür; onu yakalayan tek soru "kim
 * require ediyor" sorusudur.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readdirSync, readFileSync, statSync } = require('node:fs');
const { basename, join } = require('node:path');

const root = join(__dirname, '..');

/** Öksüz olması BEKLENEN dosyalar — sebebiyle birlikte. */
const EXPECTED_ORPHANS = new Map([
  ['server.js', 'HTTP giriş noktası; `node server.js` ile çalıştırılır'],
  ['migrate.js', 'CLI giriş noktası; `node persistence/migrate.js`'],
  // `cron.js` ARTIK İSTİSNA DEĞİL: tests/rewardDelivery.test.js `loadAccount`
  // fonksiyonunu doğrudan çağırıyor. Bayatlık kontrolü bunu yakaladı — bir
  // sonraki okuyucuya var olmayan bir kısıtı doğru sandırmamak için silindi.
]);

/** Taranmayan dizinler — kod değil ya da ayrı bir proje. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'client_mobile', 'tools', 'tests', 'docs']);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

const modules = walk(root);

/** Kaynak VE test ağacındaki tüm require satırları. */
const sources = [...modules, ...walk(join(root, 'tests')).filter(Boolean)].concat(
  readdirSync(join(root, 'tests'))
    .filter((name) => name.endsWith('.js'))
    .map((name) => join(root, 'tests', name)),
);

const texts = [...new Set(sources)].map((file) => ({
  file,
  text: readFileSync(file, 'utf8'),
}));

function isRequiredSomewhere(file) {
  const name = basename(file, '.js');
  const pattern = new RegExp(`require\\(['"][^'"]*${name}['"]\\)`);
  return texts.some((entry) => entry.file !== file && pattern.test(entry.text));
}

test('beklenmeyen öksüz sunucu modülü yok', () => {
  const orphans = modules
    .filter((file) => basename(file) !== 'index.js')
    .filter((file) => !isRequiredSomewhere(file))
    .map((file) => file.slice(root.length + 1));

  const unexpected = orphans.filter((file) => !EXPECTED_ORPHANS.has(basename(file)));

  assert.deepEqual(
    unexpected,
    [],
    'Bu modüller yazılmış ama hiçbir yerden çağrılmıyor:\n  ' + unexpected.join('\n  '),
  );
});

test('istisna listesi BAYAT değil', () => {
  const orphanNames = new Set(
    modules
      .filter((file) => basename(file) !== 'index.js')
      .filter((file) => !isRequiredSomewhere(file))
      .map((file) => basename(file)),
  );

  // Artık öksüz olmayan bir dosya için istisna tutmak, bir sonraki
  // okuyucuya var olmayan bir kısıtı doğru sanmasına yol açar.
  const stale = [...EXPECTED_ORPHANS.keys()].filter((name) => !orphanNames.has(name));
  assert.deepEqual(stale, []);
});

test('tarama gerçekten çalışıyor', () => {
  // Yürüyüş bozulursa liste boşalır ve yukarıdaki testler SESSİZCE geçer.
  assert.ok(modules.length > 15, `taranan modül sayısı beklenenden az: ${modules.length}`);
});
