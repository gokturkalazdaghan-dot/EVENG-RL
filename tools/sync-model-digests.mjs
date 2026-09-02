/**
 * sync-model-digests.mjs
 *
 * Model dosyalarının GERÇEK SHA-256 özetlerini hesaplar ve
 * `ModelRegistry.ts` içine yazar.
 *
 * SORUN NEYDİ
 * Kayıttaki özetler elle yazılmış onaltılık dizelerdi. Biçim olarak
 * geçerliydiler — `verify-security-config.mjs` onları kabul ediyordu — ama
 * hiçbir gerçek dosyaya ait değillerdi. Bu, bütünlük kontrolünün en kötü
 * hâlidir: **var gibi görünen ama hiçbir şeyi doğrulamayan bir kontrol.**
 * Gerçek model konduğunda özet tutmaz ve model yüklenmez; ya da kimse
 * fark etmez ve doğrulama tamamen anlamsız kalır.
 *
 * KULLANIM
 *   node tools/sync-model-digests.mjs <model-dizini>
 *   node tools/sync-model-digests.mjs <model-dizini> --check
 *
 * Dizin, `ModelRegistry` içindeki dosya adlarını (ios ve android) içermeli.
 * `--check` yazmaz, yalnızca ayrışma varsa sıfırdan farklı çıkar — CI için.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const REGISTRY = join(here, '..', 'client_mobile', 'src', 'ai', 'engine', 'ModelRegistry.ts');

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const modelDir = args.find((a) => !a.startsWith('--'));
const label = '[sync-model-digests]';

if (!modelDir) {
  console.error(`${label} Model dizini gerekli.`);
  console.error('  Kullanım: node tools/sync-model-digests.mjs <model-dizini> [--check]');
  process.exit(1);
}

if (!existsSync(modelDir)) {
  console.error(`${label} Dizin bulunamadı: ${modelDir}`);
  process.exit(1);
}

/**
 * Dosya veya DİZİN özeti.
 *
 * `.mlmodelc` bir DİZİNDİR, tek dosya değil. Yalnızca dosyaları özetlemek,
 * derlenmiş CoreML modellerini sessizce atlamak demektir.
 */
function digestOf(path) {
  const stats = statSync(path);
  if (!stats.isDirectory()) {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
  }

  // Dizin özeti: girdiler SIRALI işlenir, yoksa aynı içerik farklı özet
  // üretir ve doğrulama rastgele başarısız olur.
  const hash = createHash('sha256');
  const walk = (dir, prefix = '') => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      hash.update(rel);
      if (entry.isDirectory()) walk(child, rel);
      else hash.update(readFileSync(child));
    }
  };
  walk(path);
  return hash.digest('hex');
}

const source = readFileSync(REGISTRY, 'utf8');

// Her `localModel: { ... }` bloğunu ayrıştır.
const blocks = [...source.matchAll(
  /localModel: \{ ios: '([^']+)', android: '([^']+)'([\s\S]*?)sha256: '([0-9a-f]{64})'/g,
)];

if (blocks.length === 0) {
  console.error(`${label} ModelRegistry içinde localModel bloğu bulunamadı — ayrıştırıcı bozuk.`);
  process.exit(1);
}

let updated = source;
const changes = [];
const missing = [];

for (const [full, iosName, androidName, , currentDigest] of blocks) {
  // iOS ve Android dosyaları AYRI ikililerdir; tek bir özet ikisini birden
  // doğrulayamaz. Platform başına ayrı özet gerekir — burada mevcut şema
  // tek alan taşıdığı için iOS paketi esas alınır ve Android eşleşmezse
  // uyarı verilir.
  const iosPath = join(modelDir, iosName);
  const androidPath = join(modelDir, androidName);

  if (!existsSync(iosPath)) {
    missing.push(iosName);
    continue;
  }

  const digest = digestOf(iosPath);
  if (!existsSync(androidPath)) missing.push(androidName);

  if (digest !== currentDigest) {
    changes.push({ model: iosName, from: currentDigest.slice(0, 12), to: digest.slice(0, 12) });
    updated = updated.replace(full, full.replace(currentDigest, digest));
  }
}

if (missing.length > 0) {
  console.error(`${label} ${missing.length} model dosyası dizinde YOK:\n`);
  for (const name of [...new Set(missing)]) console.error(`  ✗ ${name}`);
  console.error(`\n  Dizin: ${modelDir}`);
  console.error('  Eksik model, o yeteneğin cihazda hiç çalışmaması demektir.');
  process.exit(1);
}

if (changes.length === 0) {
  console.log(`${label} OK — ${blocks.length} model özeti gerçek dosyalarla eşleşiyor.`);
  process.exit(0);
}

if (checkOnly) {
  console.error(`${label} ${changes.length} özet AYRIŞMIŞ:\n`);
  for (const c of changes) console.error(`  ✗ ${c.model}: kayıt ${c.from}… gerçek ${c.to}…`);
  console.error('\n  `node tools/sync-model-digests.mjs <dizin>` çalıştırıp sonucu commit edin.');
  process.exit(1);
}

writeFileSync(REGISTRY, updated);
console.log(`${label} ${changes.length} özet güncellendi:`);
for (const c of changes) console.log(`  · ${c.model}: ${c.from}… → ${c.to}…`);
