/**
 * set-ssl-pins.mjs
 *
 * Canlı sunucudan SPKI SHA-256 pin'ini alır ve DÖRT KAYNAĞA BİRDEN yazar.
 *
 * NEDEN ARAÇ GEREKLİ
 * Pin dört ayrı dosyada yaşıyor (TypeScript, Kotlin, XML, Swift). Elle
 * yazıldığında birinin atlanması kaçınılmaz; `verify-security-config`
 * bunu yakalar ama insan yine de dört kez openssl komutu çalıştırmak
 * zorunda kalır ve bir tanesini yanlış kopyalar.
 *
 * YEDEK PİN ZORUNLUDUR
 * Tek pinle sertifika yenilendiğinde uygulama SAHADA KİLİTLENİR: yeni
 * sertifikanın anahtarı pinlenmediği için her istek reddedilir ve
 * düzeltmek yeni bir sürüm yayınlamayı gerektirir. Bu araç yedek pin
 * verilmeden yazmayı REDDEDER.
 *
 * KULLANIM
 *   node tools/set-ssl-pins.mjs api.armanalabs.com --backup <yedek-pin-base64>
 *   node tools/set-ssl-pins.mjs api.armanalabs.com --print   (yalnızca göster)
 *
 * Yedek pin genellikle bir SONRAKİ sertifikanın anahtarından veya ara
 * CA'nın anahtarından alınır; ikisi de sunucudan okunamaz, elde olmalıdır.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const label = '[set-ssl-pins]';

const args = process.argv.slice(2);
const host = args.find((a) => !a.startsWith('--'));
const printOnly = args.includes('--print');
const backupIndex = args.indexOf('--backup');
const backupPin = backupIndex !== -1 ? args[backupIndex + 1] : null;

if (!host) {
  console.error(`${label} Host gerekli.`);
  console.error('  node tools/set-ssl-pins.mjs api.armanalabs.com --backup <pin>');
  console.error('  node tools/set-ssl-pins.mjs api.armanalabs.com --print');
  process.exit(1);
}

/** Canlı sunucudan SPKI SHA-256 pin'i (base64). */
function fetchPin(hostname) {
  // Zincirdeki HER adımın stderr'i bastırılır. Aksi hâlde openssl'in ham
  // hatası ("Unable to load certificate") kullanıcıya gösterilir ve bizim
  // anlaşılır mesajımız hiç görünmez.
  const chain = 'openssl s_client -servername HOST -connect HOST:443 </dev/null 2>/dev/null | ' +
    'openssl x509 -pubkey -noout 2>/dev/null | openssl pkey -pubin -outform der 2>/dev/null | ' +
    'openssl dgst -sha256 -binary 2>/dev/null | openssl enc -base64 2>/dev/null';

  let out = '';
  try {
    out = execFileSync('sh', ['-c', chain.replaceAll('HOST', hostname)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    out = '';
  }

  if (!/^[A-Za-z0-9+\/]{43}=$/.test(out)) {
    throw new Error(
      `Geçerli bir SPKI pin'i alınamadı (${hostname}). ` +
        'Alan adı yayında ve TLS sertifikası kurulu mu?',
    );
  }

  // BOŞ GİRDİNİN ÖZETİ GEÇERLİ BİR PİN GİBİ GÖRÜNÜR.
  //
  // Sunucuya ulaşılamadığında boru hattı boş üretir ve `openssl dgst`
  // hiçliğin özetini döndürür: 47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=
  // Bu değer biçim denetimini GEÇER (43 karakter + '='), yani ulaşılamayan
  // bir alan adına karşı çalıştırıldığında dört kaynağa da yazılırdı ve
  // uygulama sahada HER BAĞLANTIYI reddederdi. Düzeltmek yeni sürüm
  // yayınlamayı gerektirirdi.
  const EMPTY_SHA256 = '47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=';
  if (out === EMPTY_SHA256) {
    throw new Error(
      `${hostname} adresinden sertifika alınamadı — boş yanıtın özeti döndü. ` +
        'Alan adı yayında ve TLS sertifikası kurulu mu?',
    );
  }

  return out;
}

let activePin;
try {
  activePin = fetchPin(host);
} catch (err) {
  console.error(`${label} ${err.message}`);
  process.exit(1);
}

console.log(`${label} ${host} aktif pin: sha256/${activePin}`);

if (printOnly) process.exit(0);

if (!backupPin) {
  console.error(`\n${label} YEDEK PİN ZORUNLU — yazma reddedildi.`);
  console.error('  Tek pinle sertifika yenilendiğinde uygulama SAHADA KİLİTLENİR:');
  console.error('  yeni anahtar pinlenmediği için her istek reddedilir ve');
  console.error('  düzeltmek yeni bir sürüm yayınlamayı gerektirir.');
  console.error('\n  --backup <pin> ile bir sonraki sertifikanın veya ara CA\'nın');
  console.error('  anahtar pin\'ini verin.');
  process.exit(1);
}

if (!/^[A-Za-z0-9+/]{43}=$/.test(backupPin)) {
  console.error(`${label} Yedek pin biçimi geçersiz: ${backupPin}`);
  process.exit(1);
}

if (backupPin === activePin) {
  console.error(`${label} Yedek pin aktif pinle AYNI — yedek değildir.`);
  console.error('  Aynı anahtar iki kez pinlenirse, o anahtar değiştiğinde ikisi de düşer.');
  process.exit(1);
}

/** Dört kaynakta eski pin çiftini yenisiyle değiştirir. */
const TARGETS = [
  ['client_mobile/src/core/config/env.ts', (p) => `sha256/${p}`],
  ['client_mobile/android/app/src/main/java/com/evengirl/app/security/PinnedHttpClient.kt', (p) => `sha256/${p}`],
  ['client_mobile/android/app/src/main/res/xml/network_security_config.xml', (p) => p],
  ['client_mobile/ios/EvenGirl/Security/PinConfiguration.swift', (p) => p],
];

/**
 * Hangi pin yuvasına yazılacağı, host adının ÖN EKİNDEN TAHMİN EDİLMEZ.
 *
 * Önceden `host.startsWith('api.')` ile karar veriliyordu: tanımlı olmayan
 * herhangi bir host sessizce "crash" yuvasına yazılırdı — yanlış hostun
 * pin'i yanlış uca konur ve o uç sahada her bağlantıyı reddederdi.
 *
 * Artık host, `env.ts` içindeki `pinnedHosts` anahtarlarıyla eşleştirilir
 * ve tanınmayan host REDDEDİLİR.
 */
const envSource = readFileSync(join(root, 'client_mobile/src/core/config/env.ts'), 'utf8');
// `lastIndexOf`: `pinnedHosts` hem arayüz tanımında hem ENV nesnesinde
// geçiyor. İlk geçiş arayüzdür ve host adı İÇERMEZ — oradan okumak boş
// liste üretir ve araç her hostu reddederdi.
const pinnedBlock = envSource.slice(
  envSource.lastIndexOf('pinnedHosts:'),
  envSource.lastIndexOf('crashIngestUrl:'),
);
const pinnedHosts = [...pinnedBlock.matchAll(/'([a-z0-9.-]+\.[a-z]{2,})':/g)].map((m) => m[1]);

if (!pinnedHosts.includes(host)) {
  console.error(`\n${label} "${host}" pinlenen hostlar arasında DEĞİL.`);
  console.error(`  Tanımlı hostlar: ${pinnedHosts.join(', ')}`);
  console.error('  Ön ekten tahmin YAPILMAZ: yanlış hostun pin\'i yanlış uca');
  console.error('  yazılırsa o uç sahada her bağlantıyı reddeder.');
  process.exit(1);
}

// Yer tutucu harfleri host sırasına göre: 1. host A/B, 2. host C/D, …
const slot = pinnedHosts.indexOf(host);
const letters = [['A', 'B'], ['C', 'D'], ['E', 'F'], ['G', 'H']][slot];
if (!letters) {
  console.error(`${label} ${slot + 1}. host için yer tutucu harfi tanımlı değil.`);
  process.exit(1);
}
const [oldActive, oldBackup] = [letters[0].repeat(43), letters[1].repeat(43)];

let written = 0;
for (const [relativePath, format] of TARGETS) {
  const full = join(root, relativePath);
  const source = readFileSync(full, 'utf8');

  const next = source
    .replaceAll(format(`${oldActive}=`), format(activePin))
    .replaceAll(format(`${oldBackup}=`), format(backupPin));

  if (next !== source) {
    writeFileSync(full, next);
    written += 1;
    console.log(`  ✓ ${relativePath}`);
  } else {
    console.log(`  · ${relativePath} (yer tutucu bulunamadı — zaten yazılmış olabilir)`);
  }
}

console.log(`\n${label} ${written}/4 kaynak güncellendi.`);
console.log('  Şimdi çalıştırın: cd client_mobile && npm run verify:security');
