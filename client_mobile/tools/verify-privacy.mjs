#!/usr/bin/env node
/**
 * "Sıfır kişisel veri toplama" ilkesinin denetimi (CI'da zorunlu adım).
 *
 * NEDEN GEREKLİ: Bu ilke bir gizlilik politikası cümlesi olarak kalırsa,
 * altı ay sonra eklenen bir analitik SDK'sı veya "sadece bir kerelik" bir
 * cihaz kimliği çağrısı kimsenin dikkatini çekmeden geçer. Politikayı
 * derleme kapısına bağlamak, tek güvenilir uygulama biçimidir.
 *
 * Kontroller:
 *   A. Yasaklı kimlik/izleme API'leri kaynak kodda kullanılmıyor.
 *   B. Yasaklı analitik/reklam paketleri bağımlılıklarda yok.
 *   C. Android manifest'inde izleme izinleri yok.
 *   D. Çökme raporu şeması cihaz kimliği alanı taşımıyor.
 *
 * İSTİSNA: Kural adının geçtiği yorum satırları ve bu betiğin kendisi
 * taranmaz — "IDFA kullanmıyoruz" yazan bir yorum ihlal değildir.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const fail = (message) => problems.push(message);

/** Kaynak kodda bulunmaması gereken kimlik/izleme API'leri. */
const FORBIDDEN_APIS = [
  { pattern: /\bgetUniqueId\s*\(/, why: 'cihaz kimliği (react-native-device-info)' },
  { pattern: /\bgetAndroidId\s*\(/, why: 'ANDROID_ID — kalıcı cihaz kimliği' },
  { pattern: /\bidentifierForVendor\b/, why: 'IDFV — kalıcı cihaz kimliği' },
  { pattern: /\badvertisingIdentifier\b/, why: 'IDFA — reklam kimliği' },
  { pattern: /\bAdvertisingIdClient\b/, why: 'GAID — reklam kimliği' },
  { pattern: /\bATTrackingManager\b/, why: 'izleme izni — uygulamada reklam yok' },
  { pattern: /\bgetMacAddress\s*\(/, why: 'MAC adresi' },
  { pattern: /\bgetImei\s*\(|\bgetDeviceId\s*\(/, why: 'IMEI / telefon kimliği' },
  { pattern: /\bContacts\b.*\brequestPermission\b/, why: 'rehber erişimi' },
  { pattern: /\bgetCurrentPosition\s*\(|\bCLLocationManager\b/, why: 'konum' },
];

/** Bağımlılıklarda bulunmaması gereken paketler. */
const FORBIDDEN_PACKAGES = [
  'react-native-device-info',
  '@react-native-firebase/analytics',
  '@react-native-firebase/crashlytics',
  '@sentry/react-native',
  'react-native-google-mobile-ads',
  'appsflyer-react-native-plugin',
  'react-native-fbsdk-next',
  'amplitude-js',
  'mixpanel-react-native',
  '@segment/analytics-react-native',
];

/** Android manifest'inde bulunmaması gereken izinler. */
const FORBIDDEN_PERMISSIONS = [
  'com.google.android.gms.permission.AD_ID',
  'android.permission.READ_CONTACTS',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.READ_PHONE_STATE',
  'android.permission.GET_ACCOUNTS',
  // Medya seçimi sistem Fotoğraf Seçicisi ile yapılıyor; bu izinlere GEREK
  // YOK. Bir bağımlılık manifest birleştirmesiyle geri getirirse ya da biri
  // "kolay olsun" diye elle eklerse, uygulama kullanıcıdan tüm galeriye
  // erişim istemeye başlar ve kimse fark etmez.
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_EXTERNAL_STORAGE',
];

const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.swift', '.kt', '.java', '.m']);
const SKIP_DIRECTORIES = new Set(['node_modules', 'build', 'Pods', '.git', 'tools']);

function* walk(directory) {
  for (const name of readdirSync(directory)) {
    if (SKIP_DIRECTORIES.has(name)) continue;
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      yield* walk(path);
    } else if (SCAN_EXTENSIONS.has(extname(name))) {
      yield path;
    }
  }
}

/**
 * Yorum satırlarını atar.
 *
 * "// IDFA hiç okunmaz" yazan bir yorum ihlal değil, tam tersine belgelemedir.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|#|\*)/.test(line))
    .join('\n');
}

// --- A: kaynak kod taraması
for (const file of walk(root)) {
  const code = stripComments(readFileSync(file, 'utf8'));
  for (const { pattern, why } of FORBIDDEN_APIS) {
    if (pattern.test(code)) {
      fail(`${relative(root, file)}: yasaklı API — ${why}`);
    }
  }
}

// --- B: bağımlılıklar
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const dependencies = {
  ...(manifest.dependencies ?? {}),
  ...(manifest.devDependencies ?? {}),
};
for (const name of FORBIDDEN_PACKAGES) {
  if (name in dependencies) {
    fail(`package.json: yasaklı paket "${name}" — analitik/reklam/kimlik toplar`);
  }
}

// --- C: Android izinleri
const manifestPath = join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const androidManifest = readFileSync(manifestPath, 'utf8');
for (const permission of FORBIDDEN_PERMISSIONS) {
  // tools:node="remove" ile KALDIRILAN izin ihlal değildir, tam tersi.
  const declared = new RegExp(
    `<uses-permission[^>]*android:name="${permission.replace(/\./g, '\\.')}"(?![^>]*tools:node="remove")`,
  );
  if (declared.test(androidManifest)) {
    fail(`AndroidManifest.xml: yasaklı izin "${permission}"`);
  }
}

// --- C2: iOS gizlilik anahtarları
//
// Info.plist'te tanımlı her Usage Description, gizlilik etiketine ve App
// Store incelemesine giren bir YETKİ BEYANIDIR. Kullanılmayan bir anahtarı
// bırakmak, kullanıcıya sormadığımız bir izni beyan etmek demektir.
const FORBIDDEN_PLIST_KEYS = [
  [
    'NSPhotoLibraryUsageDescription',
    'medya seçimi PHPicker ile yapılıyor, TAM OKUMA izni gerekmiyor',
  ],
  ['NSUserTrackingUsageDescription', 'izleme yok — ATT istemi hiç çıkmamalı'],
  ['NSLocationWhenInUseUsageDescription', 'konum toplanmıyor'],
  ['NSLocationAlwaysAndWhenInUseUsageDescription', 'konum toplanmıyor'],
  ['NSContactsUsageDescription', 'rehber okunmuyor'],
  ['NSCalendarsUsageDescription', 'takvim okunmuyor'],
];

const plistPath = join(root, 'ios', 'EvenGirl', 'Info.plist');
if (existsSync(plistPath)) {
  const plist = readFileSync(plistPath, 'utf8');
  for (const [key, why] of FORBIDDEN_PLIST_KEYS) {
    // `<key>` etiketiyle aranıyor, düz metinle DEĞİL: açıklama yorumları bu
    // adları anlatmak için içeriyor ve düz arama yorumu ihlal sanardı.
    if (plist.includes(`<key>${key}</key>`)) {
      fail(`Info.plist: yasaklı anahtar "${key}" — ${why}`);
    }
  }
}

// --- D: çökme raporu şeması
const reporterSource = readFileSync(join(root, 'src', 'telemetry', 'AnonymousCrashReporter.ts'), 'utf8');
const FORBIDDEN_REPORT_FIELDS = ['deviceId', 'installId', 'userId', 'ipAddress', 'advertisingId'];
for (const field of FORBIDDEN_REPORT_FIELDS) {
  if (new RegExp(`readonly\\s+${field}\\b`).test(reporterSource)) {
    fail(`AnonymousCrashReporter: rapor şemasında "${field}" alanı var — kimlik oluşturur`);
  }
}

if (problems.length) {
  console.error('[verify-privacy] BAŞARISIZ\n');
  problems.forEach((p) => console.error(`  • ${p}`));
  console.error(
    '\nBu kurallar docs/PRIVACY.md ile bağlayıcıdır. Gerçekten gerekliyse önce\n' +
      'gizlilik politikası ve mağaza veri beyanları güncellenmeli, sonra bu liste.',
  );
  process.exit(1);
}

console.log(
  `[verify-privacy] OK — ${FORBIDDEN_APIS.length} API, ${FORBIDDEN_PACKAGES.length} paket, ` +
    `${FORBIDDEN_PERMISSIONS.length} izin, ${FORBIDDEN_PLIST_KEYS.length} plist anahtarı denetlendi.`,
);
