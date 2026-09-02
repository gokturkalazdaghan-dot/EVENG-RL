#!/usr/bin/env node
/**
 * Güvenlik yapılandırması tutarlılık denetimi (CI'da zorunlu adım).
 *
 * SSL pin listesi DÖRT yerde tanımlıdır:
 *   1. src/core/config/env.ts                       (JS tarafı)
 *   2. ios/EvenGirl/Security/PinConfiguration.swift  (iOS native)
 *   3. android/.../security/PinnedHttpClient.kt     (Android native)
 *   4. android/.../res/xml/network_security_config.xml (platform katmanı)
 *
 * Bunlardan biri güncellenip diğeri unutulursa sonuç, o platformda sahada
 * kilitlenen bir uygulamadır — ve bu ancak kullanıcılar şikâyet edince
 * anlaşılır. Bu betik farkı build zamanında yakalar.
 *
 * Kontroller:
 *   A. Her host için en az 2 pin (aktif + yedek).
 *   B. Dört kaynaktaki host ve pin kümeleri birebir aynı.
 *   C. Pin formatı geçerli (sha256/ + 44 karakter base64).
 *   D. network_security_config pin-set expiration'ı en az 90 gün ileride.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const fail = (message) => problems.push(message);

const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

/** "sha256/..." biçimindeki tüm pin'leri toplar (tek veya çift tırnak). */
const collectPins = (text) =>
  [...text.matchAll(/['"](sha256\/[A-Za-z0-9+/]+=*)['"]/g)].map((m) => m[1]);

// ------------------------------------------------------------- kaynaklar ----

/** env.ts / PinConfiguration.swift / PinnedHttpClient.kt: host -> pin[] */
function parseHostBlocks(text, hostPattern) {
  const map = new Map();
  for (const match of text.matchAll(hostPattern)) {
    const host = match[1];
    const pins = collectPins(match[2]);
    if (pins.length) map.set(host, pins);
  }
  return map;
}

const sources = {
  js: parseHostBlocks(read('src/core/config/env.ts'), /['"]([a-z0-9.-]+\.[a-z]{2,})['"]:\s*\[([\s\S]*?)\]/g),
  ios: parseHostBlocks(read('ios/EvenGirl/Security/PinConfiguration.swift'), /"([a-z0-9.-]+\.[a-z]{2,})":\s*\[([\s\S]*?)\]/g),
  android: parseHostBlocks(read('android/app/src/main/java/com/evengirl/app/security/PinnedHttpClient.kt'), /"([a-z0-9.-]+\.[a-z]{2,})"\s*to\s*listOf\(([\s\S]*?)\)/g),
};

// network_security_config.xml farklı biçimdedir: pin'ler "sha256/" öneki taşımaz.
const nscXml = read('android/app/src/main/res/xml/network_security_config.xml');
const nsc = new Map();
for (const block of nscXml.matchAll(/<domain-config[\s\S]*?<\/domain-config>/g)) {
  const host = block[0].match(/<domain[^>]*>([^<]+)<\/domain>/)?.[1]?.trim();
  const pins = [...block[0].matchAll(/<pin digest="SHA-256">([^<]+)<\/pin>/g)].map(
    (m) => `sha256/${m[1].trim()}`,
  );
  if (host) nsc.set(host, pins);
}
sources.nsc = nsc;

// --------------------------------------------------------------- A, C ------

const PIN_FORMAT = /^sha256\/[A-Za-z0-9+/]{43}=$/;

for (const [label, map] of Object.entries(sources)) {
  if (map.size === 0) {
    fail(`${label}: hiç pin bulunamadı — ayrıştırma bozulmuş olabilir.`);
    continue;
  }
  for (const [host, pins] of map) {
    if (pins.length < 2) {
      fail(`${label}/${host}: yedek pin yok (${pins.length} pin). Anahtar kaybında uygulama kalıcı kilitlenir.`);
    }
    for (const pin of pins) {
      if (!PIN_FORMAT.test(pin)) fail(`${label}/${host}: geçersiz pin biçimi "${pin}"`);
    }
  }
}

// ------------------------------------------------------------------ B ------

const hostSets = Object.entries(sources).map(([label, map]) => [label, [...map.keys()].sort()]);
const [, referenceHosts] = hostSets[0];

for (const [label, hosts] of hostSets.slice(1)) {
  if (hosts.join('|') !== referenceHosts.join('|')) {
    fail(`Host listeleri uyuşmuyor: js=[${referenceHosts}] ${label}=[${hosts}]`);
  }
}

for (const host of referenceHosts) {
  const perSource = Object.entries(sources).map(([label, map]) => [label, (map.get(host) ?? []).slice().sort()]);
  const [, reference] = perSource[0];
  for (const [label, pins] of perSource.slice(1)) {
    if (pins.join('|') !== reference.join('|')) {
      fail(`${host}: pin listesi js ile ${label} arasında farklı.`);
    }
  }
}

// ------------------------------------------------------------------ D ------

const MIN_DAYS = 90;
for (const match of nscXml.matchAll(/expiration="(\d{4}-\d{2}-\d{2})"/g)) {
  const expiry = new Date(`${match[1]}T00:00:00Z`);
  const daysLeft = Math.floor((expiry.getTime() - Date.now()) / 86_400_000);
  if (daysLeft < MIN_DAYS) {
    // Platform pinning'i expiration sonrası SESSİZCE kapanır (fail-open).
    fail(`network_security_config: pin-set ${match[1]} tarihinde doluyor (${daysLeft} gün kaldı, en az ${MIN_DAYS} olmalı).`);
  }
}

// ------------------------------------------------------------------ E ------
// Model bütünlük özetleri gerçek mi?
//
// İndirilen model dosyası cihazda ÇALIŞAN KODDUR; yer tutucu bir özet,
// bütünlük doğrulamasını sessizce anlamsız kılar (hiçbir dosya eşleşmez ve
// her indirme başarısız olur — ya da daha kötüsü, kontrol gevşetilir).
const registrySource = read('src/ai/engine/ModelRegistry.ts');
const digests = [...registrySource.matchAll(/sha256:\s*'([^']+)'/g)].map((m) => m[1]);

if (digests.length === 0) {
  fail('ModelRegistry: hiç model özeti bulunamadı — ayrıştırma bozulmuş olabilir.');
}

for (const digest of digests) {
  if (!/^[0-9a-f]{64}$/i.test(digest)) {
    fail(`ModelRegistry: geçersiz veya yer tutucu model özeti "${digest.slice(0, 32)}…"`);
  }
}

// ---------------------------------------------------------------- sonuç ----

if (problems.length) {
  console.error('[verify-security-config] BAŞARISIZ\n');
  problems.forEach((p) => console.error(`  • ${p}`));
  process.exit(1);
}

const hostCount = referenceHosts.length;
console.log(
  `[verify-security-config] OK — ${hostCount} host, 4 kaynak tutarlı, ` +
    `${digests.length} model özeti geçerli.`,
);
