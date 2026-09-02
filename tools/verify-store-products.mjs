/**
 * verify-store-products.mjs
 *
 * `store/products.json` ile UYGULAMANIN BEKLEDİĞİ kimliklerin aynı
 * olduğunu doğrular.
 *
 * NEDEN
 * Mağaza ürünleri App Store Connect ve Play Console'da elle açılır. Kod bir
 * kimliği beklerken mağazada başka bir kimlik varsa **satın alma sessizce
 * başarısız olur**: kullanıcı "Satın Al"a basar, mağaza ürünü bulamaz,
 * hiçbir şey olmaz ve sebebi hiçbir yerde görünmez. Ödül teklif kodlarında
 * daha da sinsidir — hata ancak Pazartesi 00:00 cron'unda ortaya çıkar.
 *
 * Bu kontrol dosyayı KOPYALAMAZ; kaynak dosyaları okur.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const products = JSON.parse(readFileSync(join(root, 'store', 'products.json'), 'utf8'));
const problems = [];

/** Kaynak dosyadan tek tırnaklı değerleri çıkarır. */
function literals(relativePath, from, to) {
  const source = readFileSync(join(root, relativePath), 'utf8');
  const start = source.indexOf(from);
  if (start === -1) {
    problems.push(`${relativePath}: "${from}" bulunamadı — dosya taşınmış olabilir`);
    return [];
  }
  const end = to ? source.indexOf(to, start) : source.length;
  return [...source.slice(start, end).matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

// --- 1. Abonelik ürün kimlikleri (istemci Products.ts) --------------------

const clientProducts = literals(
  'client_mobile/src/billing/Products.ts',
  'export const PLANS',
  'export const PLAN_ORDER',
);

for (const sub of products.subscriptions) {
  if (!clientProducts.includes(sub.productId)) {
    problems.push(
      `Ürün kimliği istemcide YOK: ${sub.productId}\n` +
        '      Bu planı seçen kullanıcı "Satın Al"a basar ve hiçbir şey olmaz.',
    );
  }
}

// Ters yön: istemcinin beklediği ama tanımda olmayan ürün.
const declared = new Set(products.subscriptions.map((s) => s.productId));
for (const literal of clientProducts) {
  if (literal.startsWith('com.evengirl.app.pro.') && !declared.has(literal)) {
    problems.push(`İstemci tanımsız bir ürün bekliyor: ${literal}`);
  }
}

// --- 2. Referans fiyatlar ------------------------------------------------

const priceSource = readFileSync(join(root, 'client_mobile/src/billing/Products.ts'), 'utf8');
for (const sub of products.subscriptions) {
  const match = priceSource.match(
    new RegExp(`id: '${sub.planId}'[\\s\\S]{0,300}?referenceUsd: ([0-9.]+)`),
  );
  if (!match) {
    problems.push(`Referans fiyat okunamadı: ${sub.planId}`);
  } else if (Number(match[1]) !== sub.referenceUsd) {
    problems.push(
      `Referans fiyat ayrışmış (${sub.planId}): ` +
        `tanım ${sub.referenceUsd}, istemci ${match[1]}`,
    );
  }
}

// --- 3. Ödül teklif kimlikleri (reward_automation/promoCodes.js) ---------

const offerSource = readFileSync(join(root, 'reward_automation/promoCodes.js'), 'utf8');

for (const offer of products.offerCodes) {
  for (const [label, id] of [['App Store', offer.appStoreOfferId], ['Play', offer.playOfferId]]) {
    if (!offerSource.includes(`'${id}'`)) {
      problems.push(
        `${offer.days} günlük ödül için ${label} teklif kimliği kodda YOK: ${id}\n` +
          '      Kod üretimi Pazartesi 00:00 cron\'unda başarısız olur.',
      );
    }
  }
}

// --- 4. Paket kimliği ----------------------------------------------------

const infoPlist = readFileSync(join(root, 'client_mobile/ios/EvenGirl/Info.plist'), 'utf8');
if (!infoPlist.includes(`<string>${products.bundleId}</string>`)) {
  problems.push(`iOS CFBundleIdentifier ${products.bundleId} ile eşleşmiyor`);
}

const gradle = readFileSync(join(root, 'client_mobile/android/app/build.gradle'), 'utf8');
if (!gradle.includes(`applicationId "${products.bundleId}"`)) {
  problems.push(`Android applicationId ${products.bundleId} ile eşleşmiyor`);
}

// --- Sonuç ---------------------------------------------------------------

const label = '[verify-store-products]';

if (problems.length === 0) {
  console.log(
    `${label} OK — ${products.subscriptions.length} abonelik, ` +
      `${products.offerCodes.length} teklif kodu, paket kimliği tutarlı.`,
  );
} else {
  console.error(`${label} ${problems.length} tutarsızlık:\n`);
  for (const problem of problems) console.error(`  ✗ ${problem}\n`);
  process.exit(1);
}
