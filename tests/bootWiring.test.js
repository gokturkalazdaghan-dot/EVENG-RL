/**
 * AÇILIŞ KABLOLAMASI: yapılandırılabilir her modül gerçekten kuruluyor mu.
 *
 * NEDEN BU TEST VAR
 * Bu depoda AYNI hatanın üç örneği bulundu — moderasyon tarayıcısı, ödül
 * motorunun depo bağımlılıkları ve Even Girl Generate'in yüz tarayıcı +
 * üreteci. Üçünde de desen aynıydı:
 *
 *   1. Modül, kalıcı olarak fırlatan (ya da yalnızca log yazan) bir yer
 *      tutucu bağımlılıkla yazılmıştı.
 *   2. Yer tutucu fail-closed davrandığı için hiçbir GÜVENLİK kuralı
 *      ihlal edilmiyordu.
 *   3. Ama özellik HİÇ ÇALIŞMIYORDU ve hiçbir test bunu göremiyordu.
 *
 * "Doğru davranış" ile "çalışan ürün" aynı şey değildir. Bu test ikincisini
 * ölçer: bir `configure*` fonksiyonu varsa, `server.js` onu ÇAĞIRMALIDIR.
 * Aksi halde modül üretimde yer tutucuyla kalır ve bunu kimse fark etmez.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readdirSync, readFileSync, statSync } = require('node:fs');
const { basename, join } = require('node:path');

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

const modules = walk(root);
const serverSource = readFileSync(join(root, 'server.js'), 'utf8');

/**
 * Yalnızca CLI giriş noktalarından kurulan yapılandırıcılar — gerekçesiyle.
 * `server.js` bunları çağırmaz çünkü HTTP sunucusu bu işi yapmaz.
 */
const CLI_CONFIGURERS = new Map([
  ['createPushSenderFromEnv', 'reward_automation/cron.js — haftalık ödül işi'],
]);

test('dışa aktarılan her configure* fonksiyonu açılışta ÇAĞRILIR', () => {
  const missing = [];

  for (const file of modules) {
    if (basename(file) === 'server.js') continue;
    const source = readFileSync(file, 'utf8');

    for (const match of source.matchAll(
      /module\.exports\.(configure[A-Za-z0-9_]*)\s*=/g,
    )) {
      const name = match[1];
      if (CLI_CONFIGURERS.has(name)) continue;
      if (!new RegExp(`\\b${name}\\s*\\(`).test(serverSource)) {
        missing.push(`${name} — ${file.slice(root.length + 1)}`);
      }
    }
  }

  assert.deepEqual(
    missing,
    [],
    'Bu yapılandırıcılar server.js tarafından çağrılmıyor; modüller üretimde\n' +
      'yer tutucuyla kalır ve özellik sessizce çalışmaz:\n  ' + missing.join('\n  '),
  );
});

test('CLI istisnaları BAYAT değil', () => {
  // Artık var olmayan bir fonksiyon için istisna tutmak, bir sonraki
  // okuyucuya var olmayan bir kısıtı doğru sandırır.
  const allExports = new Set();
  for (const file of modules) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:module\.exports\.|function\s+)(create[A-Za-z0-9_]*FromEnv|configure[A-Za-z0-9_]*)\b/g)) {
      allExports.add(match[1]);
    }
  }

  const stale = [...CLI_CONFIGURERS.keys()].filter((name) => !allExports.has(name));
  assert.deepEqual(stale, []);
});

test('açılış, eksik yapılandırmayı SESSİZ geçmez', () => {
  // Her `configure*` çağrısının sonucu kullanılmalı: kurulup kurulmadığını
  // söylemeyen bir açılış, boş bir uygulamayla yayına çıkmaktır.
  for (const name of ['configureScanner', 'configureProviders']) {
    const called = new RegExp(`(?:const|let)\\s+\\w+\\s*=\\s*${name}\\s*\\(`).test(serverSource);
    assert.ok(called, `${name} sonucu okunmadan çağrılıyor — durum bildirilmiyor`);
  }

  // Ve bildirilen durum konsola yazılmalı.
  assert.match(serverSource, /Moderasyon tarayıcısı/);
  assert.match(serverSource, /Even Girl Generate/);
});

test('taramanın kendisi çalışıyor', () => {
  // Yürüyüş bozulursa listeler boşalır ve testler SESSİZCE geçer.
  assert.ok(modules.length > 15, `taranan modül sayısı beklenenden az: ${modules.length}`);
  assert.ok(serverSource.length > 500, 'server.js okunamadı');
});
