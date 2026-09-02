#!/usr/bin/env node
/**
 * Çeviri bütünlüğü denetimi (CI'da zorunlu adım).
 *
 * NEDEN GEREKLİ: Çeviri dosyaları elle veya çeviri ajansı üzerinden güncellenir
 * ve iki hata sessizce geçer:
 *
 *   1. EKSİK ANAHTAR — kullanıcı İngilizce metin görür (kötü ama görünür).
 *   2. KAYIP YER TUTUCU — çevirmen "{{price}}" ifadesini düşürür ve paywall'da
 *      FİYAT HİÇ GÖRÜNMEZ. Bu, App Store Guideline 3.1.2'nin doğrudan ret
 *      sebebidir ve yalnızca o dili konuşan bir hakem fark eder.
 *
 * İkinci hata sınıfı, bu betiğin var olma sebebidir.
 *
 * Kontroller:
 *   A. Tüm diller İngilizce ile aynı anahtar kümesine sahip.
 *   B. Her anahtarın yer tutucuları ({{...}}) tüm dillerde birebir aynı.
 *   C. Hiçbir çeviri boş değil.
 *   D. Yasal açıklama metinleri (disclosure) zorunlu yer tutucuları içeriyor.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const localesDir = join(appRoot, 'src', 'i18n', 'locales');
const REFERENCE = 'en';

const problems = [];
const fail = (message) => problems.push(message);

/**
 * İç içe nesneyi "a.b.c" -> değer düzlemine indirger.
 *
 * DİZİLER: Ay ve gün adları gibi sıralı listeler meşru olarak dizi tutulur.
 * Diziyi tek bir yaprak saymak, uzunluk farkını (ör. bir dilde 11 ay) gizler;
 * bu yüzden her eleman "a.b[0]" biçiminde ayrı bir anahtara açılır. Böylece
 * eksik eleman, eksik anahtar olarak yakalanır.
 */
function flatten(object, prefix = '') {
  const output = {};
  for (const [key, value] of Object.entries(object)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        const itemPath = `${path}[${index}]`;
        if (item !== null && typeof item === 'object') {
          Object.assign(output, flatten(item, itemPath));
        } else {
          output[itemPath] = item;
        }
      });
      continue;
    }

    if (value !== null && typeof value === 'object') {
      Object.assign(output, flatten(value, path));
      continue;
    }

    output[path] = value;
  }
  return output;
}

const placeholdersOf = (text) =>
  [...String(text).matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]).sort();

const files = readdirSync(localesDir).filter((name) => name.endsWith('.json'));
const locales = new Map(
  files.map((name) => [
    name.replace('.json', ''),
    flatten(JSON.parse(readFileSync(join(localesDir, name), 'utf8'))),
  ]),
);

const reference = locales.get(REFERENCE);
if (!reference) {
  console.error(`[verify-i18n] Referans dil bulunamadı: ${REFERENCE}.json`);
  process.exit(1);
}

const referenceKeys = Object.keys(reference).sort();

for (const [language, entries] of locales) {
  if (language === REFERENCE) continue;

  // --- A: anahtar kümesi
  const keys = Object.keys(entries).sort();
  const missing = referenceKeys.filter((key) => !keys.includes(key));
  const extra = keys.filter((key) => !referenceKeys.includes(key));

  missing.forEach((key) => fail(`${language}: eksik anahtar "${key}"`));
  extra.forEach((key) => fail(`${language}: fazladan anahtar "${key}" (en.json'da yok)`));

  for (const key of referenceKeys) {
    const value = entries[key];
    if (value === undefined) continue;

    // --- C: boş çeviri
    if (typeof value !== 'string' || value.trim().length === 0) {
      fail(`${language}: "${key}" boş veya dize değil`);
      continue;
    }

    // --- B: yer tutucu eşleşmesi
    const expected = placeholdersOf(reference[key]);
    const actual = placeholdersOf(value);
    if (expected.join(',') !== actual.join(',')) {
      fail(
        `${language}: "${key}" yer tutucuları uyuşmuyor — beklenen [${expected}], bulunan [${actual}]`,
      );
    }
  }
}

// --- D: yasal açıklama metinlerinin zorunlu içeriği
const REQUIRED_PLACEHOLDERS = {
  'paywall.disclosure.trial': ['price', 'trialDays'],
  'paywall.disclosure.standard': ['price'],
};

for (const [language, entries] of locales) {
  for (const [key, required] of Object.entries(REQUIRED_PLACEHOLDERS)) {
    const value = entries[key];
    if (typeof value !== 'string') {
      fail(`${language}: zorunlu yasal metin eksik "${key}"`);
      continue;
    }
    const present = placeholdersOf(value);
    for (const placeholder of required) {
      if (!present.includes(placeholder)) {
        fail(
          `${language}: "${key}" içinde {{${placeholder}}} yok — ` +
            'fiyat/süre gösterilmeden abonelik satmak Guideline 3.1.2 ihlalidir.',
        );
      }
    }
  }
}

// --- E: kaynakta ANILAN her anahtar gerçekten var mı
//
// NEDEN
// `appError(..., { i18nKey: 'models.meteredConfirmRequired' })` yazmak
// yeterli görünüyor ama anahtar sözlükte yoksa kullanıcı çeviri yerine
// ANAHTAR ADININ KENDİSİNİ görür. Bu hata derlemede yakalanmaz (dize
// serbesttir), testte yakalanmaz (o kod yolu nadiren çalışır) ve ancak
// gerçek kullanıcı hata durumuna düştüğünde ortaya çıkar — yani en kötü
// anda. Ölçüldü: bu kontrol eklendiğinde bir tane eksik anahtar buldu.

/** Kaynak ağacındaki tüm .ts/.tsx dosyaları. */
function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'locales') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const referenced = new Map();
for (const file of sourceFiles(join(appRoot, 'src'))) {
  const text = readFileSync(file, 'utf8');

  // İki biçim aranıyor: `i18nKey: 'x.y'` ve i18n anahtarı döndüren
  // fonksiyonlar (`return 'errors.deviceTooWeak'`).
  for (const match of text.matchAll(/i18nKey:\s*'([a-zA-Z0-9_.]+)'/g)) {
    referenced.set(match[1], file);
  }
  for (const match of text.matchAll(/return '([a-z][a-zA-Z0-9_]*\.[a-zA-Z0-9_.]+)'/g)) {
    referenced.set(match[1], file);
  }
}

// --- E2: şablon dizgesiyle kurulan anahtar ÖNEKLERİ
//
// `t(\`tools.${capability}\`)` biçiminde kurulan anahtarlar yukarıdaki
// taramada GÖRÜNMEZ: sabit bir dize yok. Ölçüldü — bu boşluk yüzünden sekiz
// amiral gemisi aracın adı sözlükte hiç yoktu ve araç çubuğunda ham anahtar
// (`tools.manual-reshape`) görünecekti.
//
// Çözüm: öneki bir TİP BİRLİĞİNDEN türetmek. Önek bir birliğe dayanıyorsa,
// birliğin her üyesi için `önek.üye` anahtarı olmalı.
const TEMPLATE_KEY_UNIONS = [
  {
    prefix: 'tools',
    // Kullanıcıya araç olarak gösterilmeyen yetenekler (bkz.
    // CapabilityDispatcher.NON_TOOL_CAPABILITIES).
    exclude: ['nsfw-classify'],
    source: 'src/ai/engine/ModelRegistry.ts',
    union: 'Capability',
  },
];

for (const { prefix, exclude, source, union } of TEMPLATE_KEY_UNIONS) {
  const text = readFileSync(join(appRoot, source), 'utf8');
  const start = text.indexOf(`export type ${union}`);
  if (start === -1) {
    fail(`${source}: "${union}" tip birliği bulunamadı — şablon anahtar kontrolü çalışamaz`);
    continue;
  }
  const block = text.slice(start, text.indexOf(';', start));
  const members = [...block.matchAll(/\|\s*'([a-z0-9-]+)'/g)].map((m) => m[1]);

  if (members.length < 5) {
    fail(`${source}: "${union}" üyeleri okunamadı (${members.length}) — kontrol sessiz kalırdı`);
  }

  for (const member of members) {
    if (exclude.includes(member)) continue;
    const key = `${prefix}.${member}`;
    referenced.set(key, `${source} — ${union} birliğinden türetildi`);
  }
}

const known = new Set(referenceKeys);
for (const [key, file] of referenced) {
  if (!known.has(key)) {
    fail(
      `kaynakta anılan çeviri anahtarı SÖZLÜKTE YOK: "${key}"\n` +
        `      ${file.slice(appRoot.length + 1)}\n` +
        '      Kullanıcı çeviri yerine anahtarın kendisini görür.',
    );
  }
}

if (referenced.size < 20) {
  // Tarama bozulursa liste boşalır ve kontrol SESSİZCE geçer.
  fail(`kaynak taraması bozuk: yalnızca ${referenced.size} anahtar referansı bulundu`);
}

if (problems.length) {
  console.error('[verify-i18n] BAŞARISIZ\n');
  problems.forEach((p) => console.error(`  • ${p}`));
  process.exit(1);
}

console.log(
  `[verify-i18n] OK — ${locales.size} dil, ${referenceKeys.length} anahtar, ` +
    `${referenced.size} kaynak referansı, yer tutucular tutarlı.`,
);
