/**
 * set-release-values.mjs
 *
 * Üretim yer tutucularını tek komutla doldurur.
 *
 * `verify-release-ready.mjs` hangi değerlerin eksik olduğunu SÖYLER; bu araç
 * onları YAZAR. Elle yazıldığında değerler birden fazla dosyaya dağıldığı
 * için biri atlanır ve hata ancak sahada görünür.
 *
 * SSL PİNLERİ BURADA DEĞİL: onlar canlı sunucudan okunmalı ve yedek pin
 * zorunluluğu var — `tools/set-ssl-pins.mjs` o işi yapar.
 *
 * KULLANIM
 *   node tools/set-release-values.mjs \
 *     --revenuecat-ios appl_XXX --revenuecat-android goog_XXX \
 *     --facebook-app-id 1234567890 \
 *     --android-cert <base64-sha256> \
 *     --apple-app-id 6478123456
 *
 * Verilmeyen değer ATLANIR; hepsini bir kerede vermek zorunda değilsiniz.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const label = '[set-release-values]';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : null;
}

/**
 * Her değer: nereye yazılacağı, hangi yer tutucunun yerini alacağı ve
 * geçerlilik kuralı.
 *
 * DOĞRULAMA ZORUNLU: yanlış biçimli bir anahtar sessizce yazılırsa hata
 * ancak mağazada satın alma denendiğinde görünür.
 */
const VALUES = [
  {
    flag: 'revenuecat-ios',
    file: 'client_mobile/src/core/config/env.ts',
    placeholder: 'appl_PUBLIC_SDK_KEY_PLACEHOLDER',
    validate: (v) => v.startsWith('appl_') || 'iOS RevenueCat anahtarı `appl_` ile başlamalı',
    note: 'Public SDK anahtarıdır, gizli değildir. SECRET anahtarı BURAYA KOYMAYIN.',
  },
  {
    flag: 'revenuecat-android',
    file: 'client_mobile/src/core/config/env.ts',
    placeholder: 'goog_PUBLIC_SDK_KEY_PLACEHOLDER',
    validate: (v) => v.startsWith('goog_') || 'Android RevenueCat anahtarı `goog_` ile başlamalı',
  },
  {
    flag: 'facebook-app-id',
    file: 'client_mobile/src/share/CrossShare.ts',
    placeholder: 'REPLACE_WITH_FACEBOOK_APP_ID',
    validate: (v) => /^\d{10,20}$/.test(v) || 'Facebook App ID yalnızca rakamlardan oluşur',
    note: 'Instagram Hikaye aktarımı bu olmadan SESSİZCE çalışmaz.',
  },
  {
    flag: 'android-cert',
    file: 'client_mobile/android/app/src/main/java/com/evengirl/app/security/SignatureVerifier.kt',
    placeholder: 'REPLACE_WITH_RELEASE_SIGNING_CERT_SHA256_BASE64',
    validate: (v) => /^[A-Za-z0-9+/]{43}=$/.test(v) || 'İmza özeti base64 SHA-256 olmalı (43 karakter + =)',
    note: 'Bu olmadan repackaging tespiti çalışmaz.',
  },
  {
    flag: 'apple-app-id',
    file: 'reward_automation/promoCodes.js',
    placeholder: "'APPLE_APP_ID'",
    wrap: (v) => `'${v}'`,
    validate: (v) => /^\d{8,12}$/.test(v) || 'Apple App ID yalnızca rakamlardan oluşur',
    note: 'App Store Connect → App Information → Apple ID.',
  },
];

const problems = [];
const written = [];
const skipped = [];

for (const spec of VALUES) {
  const value = arg(spec.flag);
  if (!value) {
    skipped.push(spec.flag);
    continue;
  }

  const valid = spec.validate(value);
  if (valid !== true) {
    problems.push(`--${spec.flag}: ${valid}`);
    continue;
  }

  const full = join(root, spec.file);
  const source = readFileSync(full, 'utf8');

  if (!source.includes(spec.placeholder)) {
    problems.push(
      `--${spec.flag}: yer tutucu bulunamadı (${spec.file}). Değer zaten yazılmış olabilir.`,
    );
    continue;
  }

  const replacement = spec.wrap ? spec.wrap(value) : value;
  writeFileSync(full, source.replaceAll(spec.placeholder, replacement));
  written.push({ flag: spec.flag, file: spec.file, note: spec.note });
}

if (problems.length > 0) {
  console.error(`${label} ${problems.length} sorun — HİÇBİR ŞEY yazılmadı olabilir:\n`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  if (written.length > 0) {
    console.error('\n  Şunlar yazıldı:');
    for (const w of written) console.error(`    · ${w.flag}`);
  }
  process.exit(1);
}

if (written.length === 0) {
  console.error(`${label} Hiçbir değer verilmedi.`);
  console.error(`  Kullanılabilir: ${VALUES.map((v) => '--' + v.flag).join(', ')}`);
  process.exit(1);
}

console.log(`${label} ${written.length} değer yazıldı:\n`);
for (const w of written) {
  console.log(`  ✓ ${w.flag} → ${w.file}`);
  if (w.note) console.log(`      ${w.note}`);
}
if (skipped.length > 0) console.log(`\n  Atlanan: ${skipped.join(', ')}`);
console.log('\n  Şimdi çalıştırın: npm run verify:release');
