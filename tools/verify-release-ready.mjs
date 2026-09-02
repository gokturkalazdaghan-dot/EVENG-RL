/**
 * verify-release-ready.mjs
 *
 * Üretim yer tutucularının hiçbirinin sahaya çıkmadığını doğrular.
 *
 * NEDEN AYRI BİR KAPI
 * `npm run verify` geliştirme sırasında da çalışır ve yer tutucular o
 * aşamada NORMALDİR — yer tutucu yüzünden her testi kırmak, kapıyı
 * kullanılmaz yapardı. Bu kontrol yalnızca RELEASE build'inde çalışır.
 *
 * NEDEN BELGE DEĞİL KOD
 * "Sürüm öncesi kontrol listesi" bir markdown tablosuydu ve kimse onu
 * okumadan da build alabiliyordu. Liste koda bağlandığında unutulamaz:
 * yer tutucu kalmışsa release build ÇIKMAZ.
 *
 * KULLANIM
 *   node tools/verify-release-ready.mjs
 *   node tools/verify-release-ready.mjs --list   # yalnızca listele, kırma
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const listOnly = process.argv.includes('--list');

/**
 * Denetlenen yer tutucular.
 *
 * `pattern` bulunursa ihlal sayılır. `fix` alanı, sorunu bulan kişiye ne
 * yapacağını söyler — "yer tutucu var" demek yetmez, nereden alınacağı da
 * yazmalı.
 */
const CHECKS = [
  {
    id: 'ssl-pins',
    file: 'client_mobile/src/core/config/env.ts',
    pattern: /sha256\/(A{10,}|B{10,}|C{10,}|D{10,})/,
    what: 'SSL pin yer tutucuları (AAAA/BBBB/CCCC/DDDD)',
    fix:
      'openssl s_client -servername <host> -connect <host>:443 </dev/null |\n' +
      '      openssl x509 -pubkey -noout | openssl pkey -pubin -outform der |\n' +
      '      openssl dgst -sha256 -binary | openssl enc -base64\n' +
      '      Sonucu DÖRT kaynağa birden yazın (env.ts, PinnedHttpClient.kt,\n' +
      '      network_security_config.xml, PinConfiguration.swift).\n' +
      '      YEDEK PİN ZORUNLU: tek pinle sertifika yenilemesi uygulamayı sahada kilitler.',
  },
  {
    id: 'ssl-pins-android',
    file: 'client_mobile/android/app/src/main/java/com/evengirl/app/security/PinnedHttpClient.kt',
    pattern: /sha256\/(A{10,}|B{10,}|C{10,}|D{10,})/,
    what: 'SSL pin yer tutucuları (Android OkHttp)',
    fix: 'Bkz. ssl-pins.',
  },
  {
    id: 'ssl-pins-nsc',
    file: 'client_mobile/android/app/src/main/res/xml/network_security_config.xml',
    pattern: /(A{10,}|B{10,}|C{10,}|D{10,})=/,
    what: 'SSL pin yer tutucuları (network_security_config)',
    fix: 'Bkz. ssl-pins.',
  },
  {
    id: 'ssl-pins-ios',
    file: 'client_mobile/ios/EvenGirl/Security/PinConfiguration.swift',
    pattern: /(A{10,}|B{10,}|C{10,}|D{10,})=/,
    what: 'SSL pin yer tutucuları (iOS)',
    fix: 'Bkz. ssl-pins.',
  },
  {
    id: 'revenuecat-keys',
    file: 'client_mobile/src/core/config/env.ts',
    pattern: /(appl|goog)_PUBLIC_SDK_KEY_PLACEHOLDER/,
    what: 'RevenueCat public SDK anahtarları',
    fix:
      'RevenueCat panosu → Project Settings → API Keys.\n' +
      '      Public SDK anahtarıdır, gizli değildir; istemciye gömülmesi tasarım gereğidir.\n' +
      '      SECRET anahtarı BURAYA KOYMAYIN — o yalnızca backend .env dosyasına aittir.',
  },
  {
    id: 'facebook-app-id',
    file: 'client_mobile/src/share/CrossShare.ts',
    pattern: /REPLACE_WITH_FACEBOOK_APP_ID/,
    what: 'Facebook App ID',
    fix:
      'developers.facebook.com → uygulamanız → App ID.\n' +
      '      Instagram Hikaye aktarımı bu olmadan SESSİZCE çalışmaz.',
  },
  {
    id: 'android-signing-cert',
    file: 'client_mobile/android/app/src/main/java/com/evengirl/app/security/SignatureVerifier.kt',
    pattern: /"REPLACE_WITH_RELEASE_SIGNING_CERT_SHA256_BASE64"/,
    what: 'Android release imza sertifikası SHA-256',
    fix:
      'keytool -list -v -keystore <release.keystore> -alias <alias> |\n' +
      '      grep "SHA256:" ile alınan değeri base64\'e çevirin.\n' +
      '      Bu olmadan repackaging tespiti çalışmaz.',
  },
  {
    id: 'apple-app-id',
    file: 'reward_automation/promoCodes.js',
    pattern: /'APPLE_APP_ID'/,
    what: 'Apple sayısal uygulama kimliği (ödül kodu kullanım URL\'i)',
    fix:
      'App Store Connect → uygulamanız → App Information → Apple ID.\n' +
      '      Üretimde APPLE_APP_ID ortam değişkeni olarak verilir; koddaki\n' +
      '      yedek değer yalnızca geliştirme içindir.',
  },
];

/** Backend sırları koda GİRMEZ; yalnızca hatırlatma olarak listelenir. */
const ENV_REMINDERS = [
  ['MODERATION_STAFF_SECRET', 'Tanımsızsa moderasyon uçları 503 döner — ban-hammer çalışmaz.'],
  ['JWT_SECRET', 'Yetki token\'larını imzalar. Zayıfsa PRO yetkisi taklit edilebilir.'],
  ['REVENUECAT_WEBHOOK_AUTH_HEADER', 'Doğrulanmayan webhook, sahte abonelik yazımı demektir.'],
  ['APPSTORE_ISSUER_ID / _KEY_ID / _PRIVATE_KEY', 'Ödül teklif kodları üretilemez.'],
  ['PLAY_ACCESS_TOKEN', 'Play tarafı ödül kodları üretilemez.'],
  ['REDIS_URL', 'Haftalık sıralama puanlaması çalışmaz.'],
];

/** Otomatik doğrulanamayan, insan gözü gereken maddeler. */
const MANUAL_ITEMS = [
  'Model SHA-256 özetleri GERÇEK model dosyalarından üretildi mi (ModelRegistry).',
  'Kısıtlı kimlik kaydı bağlandı ve matchKey biçiminde indekslendi (deepfake kapısı).',
  'faceDeps.screenFaces ve moderationDeps.scanMedia gerçek sağlayıcıyla kuruldu.',
  'lookupRestrictedNames DB hatasında boş dizi DEĞİL, hata fırlatıyor.',
  'Bilinen CSAM karma listesi (NCMEC / IWF) erişimi sağlandı.',
  'Moderasyon kuyruğu için 24 saat SLA\'sı olan bir ekip/süreç var.',
];

const violations = [];

for (const check of CHECKS) {
  const path = join(root, check.file);

  if (!existsSync(path)) {
    // Dosyanın kaybolması da bir ihlaldir: kontrol sessizce atlanırsa,
    // taşınan bir dosya yüzünden kapı kendini kapatmış olur.
    violations.push({ ...check, missing: true });
    continue;
  }

  const source = readFileSync(path, 'utf8');
  if (check.pattern.test(source)) {
    violations.push({ ...check, missing: false });
  }
}

/**
 * DERLENEBİLİRLİK — kod değil, PROJE dosyası eksikleri.
 *
 * Bunlar yer tutucu değil, hiç var olmayan dosyalar. Ayrı listeleniyor
 * çünkü çözümleri farklı: yer tutucular bir değer bekliyor, bunlar bir
 * ARAÇ çalıştırmayı bekliyor (Xcode / react-native CLI).
 */
const BUILD_BLOCKERS = [
  {
    path: 'client_mobile/ios/EvenGirl.xcodeproj/project.pbxproj',
    what: 'iOS Xcode projesi',
    why:
      'Yazılan 35 Swift/ObjC dosyasının hiçbiri bir derleme hedefine bağlı\n' +
      '      değil; `pod install` da çalışamaz. iOS derlemesi MÜMKÜN DEĞİL.',
    fix:
      'Mac üzerinde:\n' +
      '        npx @react-native-community/cli init EvenGirlTemp --version 0.76.5\n' +
      '        cp -R EvenGirlTemp/ios/EvenGirl.xcodeproj client_mobile/ios/\n' +
      '      Sonra Xcode\'de ios/EvenGirl altındaki kaynak klasörlerini hedefe ekleyin\n' +
      '      ve paket kimliğini com.evengirl.app yapın. Ardından `pod install`.\n' +
      '      Bu adım bu depodan üretilemez: pbxproj derlenmeden doğrulanamaz ve\n' +
      '      elle yazılmış, test edilmemiş bir proje dosyası vermek doğru olmaz.',
  },
];

const buildBlockers = BUILD_BLOCKERS.filter(
  (blocker) => !existsSync(join(root, blocker.path)),
);

const label = '[verify-release-ready]';

if (violations.length === 0) {
  console.log(`${label} ${CHECKS.length} yer tutucu kontrolü temiz.`);
} else {
  console.error(`${label} ${violations.length} yer tutucu hâlâ yerinde:\n`);
  for (const violation of violations) {
    if (violation.missing) {
      console.error(`  ✗ ${violation.id}: DOSYA BULUNAMADI — ${violation.file}`);
      console.error('      Kontrol sessizce atlanmasın diye bu da ihlal sayılır.\n');
      continue;
    }
    console.error(`  ✗ ${violation.what}`);
    console.error(`      ${relative(root, join(root, violation.file))}`);
    console.error(`      ${violation.fix}\n`);
  }
}

if (buildBlockers.length > 0) {
  console.error(`\n${label} ${buildBlockers.length} DERLEME ENGELİ:\n`);
  for (const blocker of buildBlockers) {
    console.error(`  ✗ ${blocker.what} YOK — ${blocker.path}`);
    console.error(`      ${blocker.why}`);
    console.error(`      ${blocker.fix}\n`);
  }
}

console.log('\nOrtam değişkenleri (üretim sunucusunda ayarlı olmalı — kodda denetlenemez):');
for (const [name, why] of ENV_REMINDERS) {
  console.log(`  · ${name}\n      ${why}`);
}

console.log('\nElle doğrulanacaklar:');
for (const item of MANUAL_ITEMS) {
  console.log(`  · ${item}`);
}

if ((violations.length > 0 || buildBlockers.length > 0) && !listOnly) {
  console.error(`\n${label} Release build DURDURULDU.`);
  process.exit(1);
}
