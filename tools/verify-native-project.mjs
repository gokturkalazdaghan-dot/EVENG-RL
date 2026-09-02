/**
 * verify-native-project.mjs
 *
 * Native proje iskeletinin EKSİKSİZ olduğunu doğrular.
 *
 * NEDEN
 * TypeScript derlenir, testler geçer, CI yeşil olur — ve uygulama yine de
 * DERLENMEZ, çünkü `settings.gradle` yok veya `MainApplication.kt`
 * yazılmamış. Bu dosyalar hiçbir birim testinin göremediği yerdedir.
 *
 * Ayrıca yalnızca varlık değil, DOĞRU İÇERİK denetlenir: bileşen adı
 * `app.json` ile eşleşmezse uygulama BOŞ açılır ve hata mesajı vermez.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const app = join(root, 'client_mobile');
const label = '[verify-native-project]';
const problems = [];

const appJson = JSON.parse(readFileSync(join(app, 'app.json'), 'utf8'));
const componentName = appJson.name;

/** Var olmayan dosya = derlenmeyen proje. */
const REQUIRED = [
  ['android/settings.gradle', 'Gradle projeyi bulamaz'],
  ['android/build.gradle', 'Kök yapılandırma yok'],
  ['android/gradle.properties', 'Bellek ve mimari bayrakları yok — derleme OOM verir'],
  ['android/gradle/wrapper/gradle-wrapper.properties', 'Gradle sürümü sabitlenmemiş'],
  ['android/app/build.gradle', 'Uygulama modülü yapılandırması yok'],
  ['android/app/src/main/AndroidManifest.xml', 'Manifest yok'],
  ['android/app/src/main/java/com/evengirl/app/MainApplication.kt', 'Uygulama sınıfı yok'],
  ['android/app/src/main/java/com/evengirl/app/MainActivity.kt', 'Ana aktivite yok'],
  ['ios/Podfile', 'CocoaPods bağımlılıkları çözülemez'],
  ['ios/EvenGirl/AppDelegate.swift', 'Uygulama delegesi yok'],
  ['ios/EvenGirl/Info.plist', 'Info.plist yok'],
  ['ios/EvenGirl/Base.lproj/LaunchScreen.storyboard', 'Açılış ekranı yok — App Store reddi'],
  ['index.js', 'JS giriş noktası yok'],
];

for (const [relativePath, why] of REQUIRED) {
  if (!existsSync(join(app, relativePath))) {
    problems.push(`${relativePath} YOK — ${why}`);
  }
}

// --- Bileşen adı üç yerde AYNI olmalı ------------------------------------
//
// Ayrışırsa uygulama BOŞ açılır: React Native kayıtlı bileşeni bulamaz ve
// hata vermez, yalnızca boş bir ekran gösterir.

const nameChecks = [
  ['android/app/src/main/java/com/evengirl/app/MainActivity.kt', `"${componentName}"`],
  ['ios/EvenGirl/AppDelegate.swift', `"${componentName}"`],
];

for (const [relativePath, needle] of nameChecks) {
  const full = join(app, relativePath);
  if (!existsSync(full)) continue;
  if (!readFileSync(full, 'utf8').includes(needle)) {
    problems.push(
      `${relativePath}: bileşen adı ${needle} ile eşleşmiyor.\n` +
        '      Ayrıştığında uygulama BOŞ açılır ve hata vermez.',
    );
  }
}

// --- DERLENEBİLİRLİK: dosya var demek, derleniyor demek değildir --------
//
// Bu kapı uzun süre "13 native dosya tutarlı" diyordu — proje İKİ
// PLATFORMDA DA DERLENEMEZKEN. Eksik olanlar kaynak dosyası değil, PROJE
// dosyalarıydı:
//
//   - `android/gradlew` + `gradle-wrapper.jar` yoktu; package.json'daki
//     `cd android && ./gradlew bundleRelease` ilk satırda çöküyordu.
//   - Başlatıcı simgesi yoktu; Play Store simgesiz derlemeyi reddeder.
//   - iOS'ta `.xcodeproj` yoktu; yazılan 35 Swift/ObjC dosyasının hiçbiri
//     bir derleme hedefine bağlı değildi ve `pod install` çalışamazdı.
//
// Kaynak dosyalarını sayıp "tutarlı" demek, tam olarak bu kapının
// engellemesi gereken yanılsamaydı.

const BUILDABLE = [
  ['android/gradlew', 'Gradle sarmalayıcı betiği — ./gradlew çalışmaz'],
  ['android/gradlew.bat', 'Windows sarmalayıcısı — Windows geliştiricide derleme yok'],
  ['android/gradle/wrapper/gradle-wrapper.jar', 'Sarmalayıcı ikilisi — betik Gradle indiremez'],
  ['android/app/src/main/res/mipmap-hdpi/ic_launcher.png', 'Başlatıcı simgesi — Play Store reddi'],
  ['android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', 'Yüksek yoğunluk simgesi'],
  ['android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml', 'Uyarlanabilir simge (API 26+)'],
];

for (const [relativePath, why] of BUILDABLE) {
  if (!existsSync(join(app, relativePath))) {
    problems.push(`${relativePath} YOK — ${why}`);
  }
}

// Sarmalayıcı betiği ÇALIŞTIRILABİLİR olmalı: kopyalanırken izin
// kaybolursa `./gradlew` "permission denied" der ve sebebi görünmez.
const gradlew = join(app, 'android/gradlew');
if (existsSync(gradlew)) {
  // eslint-disable-next-line no-bitwise
  if ((statSync(gradlew).mode & 0o111) === 0) {
    problems.push('android/gradlew çalıştırılabilir değil — chmod +x gerekiyor.');
  }
}

// Sarmalayıcı sürümü, properties dosyasındaki sürümle aynı olmalı.
const wrapperProps = join(app, 'android/gradle/wrapper/gradle-wrapper.properties');
if (existsSync(wrapperProps)) {
  const text = readFileSync(wrapperProps, 'utf8');
  if (!/distributionUrl=.*gradle-\d+\.\d+(\.\d+)?-(bin|all)\.zip/.test(text)) {
    problems.push('gradle-wrapper.properties: distributionUrl biçimi tanınmıyor.');
  }
}

// Açılış zemini tema token'ıyla aynı olmalı. Ayrışırsa uygulama açılışta
// bir kare yanlış renkte yanıp sonra doğru renge atlar.
const colorsPath = join(app, 'android/app/src/main/res/values/colors.xml');
const tokensPath = join(app, 'src/ui/theme/tokens.ts');
if (existsSync(colorsPath) && existsSync(tokensPath)) {
  const splash = readFileSync(colorsPath, 'utf8').match(
    /<color name="window_background">(#[0-9A-Fa-f]{6})<\/color>/,
  )?.[1];
  const lightBlock = readFileSync(tokensPath, 'utf8').split('light:')[1] ?? '';
  const tokenBg = lightBlock.match(/background:\s*'(#[0-9A-Fa-f]{6})'/)?.[1];

  if (splash && tokenBg && splash.toLowerCase() !== tokenBg.toLowerCase()) {
    problems.push(
      `Açılış zemini ${splash}, tema açık zemini ${tokenBg} — ayrışmış.\n` +
        '      Uygulama açılışta bir kare yanlış renkte yanıp sonra atlar.',
    );
  }
}

// --- Yerel native paketler kayıtlı mı ------------------------------------
//
// Autolinking yalnızca npm paketlerini bulur. Bu depoda yazılmış modüller
// elle kaydedilmezse JS tarafında `NativeModules.X` undefined olur ve
// SecurityGate sessizce geçer — bütünlük kontrolü hiç çalışmaz.
//
// Liste ELLE YAZILMIYOR: diskte bulunan her `*Package.kt` aranıyor. Elle
// yazılmış bir liste, yeni paket eklendiğinde güncellenmeyi UNUTUR ve
// kontrol tam da koruması gereken durumda sessiz kalır.

const androidSrc = join(app, 'android/app/src/main/java/com/evengirl/app');
const mainApp = join(androidSrc, 'MainApplication.kt');

/** Bir dizin ağacındaki tüm dosyaları döndürür. */
function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const androidFiles = walk(androidSrc);

if (existsSync(mainApp)) {
  const source = readFileSync(mainApp, 'utf8');
  const packages = androidFiles
    .filter((f) => f.endsWith('Package.kt'))
    .map((f) => basename(f, '.kt'))
    .sort();

  if (packages.length === 0) {
    problems.push('android: hiç *Package.kt bulunamadı — native modüller kaydedilemez.');
  }

  for (const pkg of packages) {
    if (!source.includes(`add(${pkg}())`)) {
      problems.push(
        `MainApplication.kt: ${pkg} KAYITLI DEĞİL.\n` +
          '      JS tarafında ilgili NativeModules girişi undefined olur ve\n' +
          '      ona bağlı kontrol (ör. SecurityGate) sessizce geçer.',
      );
    }
  }
}

// --- Android modül → paket kaydı -----------------------------------------
//
// Bir modül sınıfı yazılıp hiçbir `ReactPackage.createNativeModules()`
// listesine konmazsa, `MainApplication` o paketi kaydetse bile modül JS'te
// GÖRÜNMEZ. Paket kaydını denetlemek yeterli değil: paketin İÇİNDE olup
// olmadığı da denetlenmeli.

const moduleClasses = new Map();
const packageSources = [];

for (const file of androidFiles.filter((f) => f.endsWith('.kt'))) {
  const source = readFileSync(file, 'utf8');

  const nameMatch = source.match(/const val NAME = "([A-Za-z0-9_]+)"/);
  const classMatch = source.match(/class\s+([A-Za-z0-9_]+)/);
  if (nameMatch && classMatch) {
    moduleClasses.set(classMatch[1], { bridgeName: nameMatch[1], file });
  }

  if (source.includes('ReactPackage') && source.includes('createNativeModules')) {
    packageSources.push(source);
  }
}

for (const [className, { bridgeName }] of moduleClasses) {
  const listed = packageSources.some((source) => new RegExp(`\\b${className}\\(`).test(source));
  if (!listed) {
    problems.push(
      `${className} (${bridgeName}) hiçbir ReactPackage listesinde YOK.\n` +
        `      MainApplication paketi kaydetse bile NativeModules.${bridgeName}\n` +
        '      undefined kalır ve modül sessizce yok sayılır.',
    );
  }
}

// --- Kotlin süslü parantez dengesi ---------------------------------------
//
// Kotlin de bu ortamda derlenmiyor. Dengesiz parantez, uzun bir dosyada
// gözle kaçar ve derleyici hatası anlaşılmaz bir satırı gösterir.

for (const file of androidFiles.filter((f) => f.endsWith('.kt'))) {
  const stripped = readFileSync(file, 'utf8')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/\/\/[^\n]*/g, '');
  const open = (stripped.match(/\{/g) ?? []).length;
  const close = (stripped.match(/\}/g) ?? []).length;
  if (open !== close) {
    problems.push(`${basename(file)}: süslü parantez dengesiz (${open} açık, ${close} kapalı).`);
  }
}

// --- Native modül envanteri ----------------------------------------------
//
// JS'in `NativeModules.X` ile istediği HER modülün, olması gereken her
// platformda karşılığı bulunmalı.
//
// NEDEN AYRI BİR KONTROL
// `NativeModules.X` eksikse JS'te `undefined` olur — TypeScript bunu
// yakalayamaz (tip iddiası `as NativeXBridge | undefined` ile yapılır) ve
// hiçbir birim testi native tarafa bakmaz. Sonuç: TensorArena'nın sessizce
// -1 döndürüp bellek ayırdığını sanması gibi hatalar CI'dan geçer.
//
// Platforma özgü modüller İSTİSNA olarak, GEREKÇESİYLE listelenir. Gerekçe
// yazma zorunluluğu, "şimdilik atlayayım" ile "bilerek tek platform" ayrımını
// kod incelemesinde görünür kılar.

/** Modül adı → hangi platformlarda beklenir + neden. */
const NATIVE_EXEMPTIONS = new Map([
  ['I18nManager', { platforms: [], why: 'React Native yerleşiği' }],
  ['SettingsManager', { platforms: [], why: 'React Native yerleşiği (iOS)' }],
  ['EvenGirlPlayBilling', { platforms: ['android'], why: 'Google Play Billing — yalnızca Android' }],
  ['EvenGirlStoreKit', { platforms: ['ios'], why: 'StoreKit 2 — yalnızca iOS' }],
  ['EvenGirlRedemption', { platforms: ['ios'], why: 'Teklif kodu kullandırma sayfası — yalnızca iOS' }],
  [
    'EvenGirlE2EE',
    {
      platforms: [],
      why:
        'libsignal bağımlılığı henüz eklenmedi. Kripto ELLE YAZILMAZ; ' +
        'köprü yokken SecureMessaging.isAvailable false döner ve ChatScreen ' +
        'yazma alanını GÖSTERMEZ (sessiz gönderim yok).',
    },
  ],
]);

const jsFiles = walk(join(app, 'src')).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
const referenced = new Set();
for (const file of jsFiles) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/NativeModules\.([A-Za-z0-9_]+)/g)) {
    referenced.add(match[1]);
  }
}

// iOS: `@objc(X)` Swift'te adı verir ama modülü KAYDETMEZ. Köprü ancak bir
// `.m` dosyasındaki RCT_EXTERN_MODULE ile görünür olur; ikisini birden
// aramak, "Swift yazıldı ama .m unutuldu" durumunu yakalar.
const iosFiles = walk(join(app, 'ios'));
const iosRegistered = new Set();
for (const file of iosFiles.filter((f) => f.endsWith('.m'))) {
  const source = readFileSync(file, 'utf8');
  // Makro adıyla parantez arasında BOŞLUK olabilir (`RCT_EXTERN_MODULE (X, ...)`);
  // önişlemci kabul eder, `MODULE\(` araması etmez. \s* olmadan bu kontrol
  // var olan her köprüyü "yok" sanıyordu.
  for (const match of source.matchAll(/RCT_EXTERN_(?:REMAP_)?MODULE\s*\(\s*([A-Za-z0-9_]+)/g)) {
    iosRegistered.add(match[1]);
  }
}

// Android: modül adı `const val NAME = "X"` içinde durur.
const androidNames = new Set();
for (const file of androidFiles.filter((f) => f.endsWith('.kt'))) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/const val NAME = "([A-Za-z0-9_]+)"/g)) {
    androidNames.add(match[1]);
  }
}

for (const name of [...referenced].sort()) {
  const exemption = NATIVE_EXEMPTIONS.get(name);
  const expected = exemption ? exemption.platforms : ['ios', 'android'];

  if (expected.includes('ios') && !iosRegistered.has(name)) {
    problems.push(
      `${name}: iOS köprüsü YOK (RCT_EXTERN_MODULE bulunamadı).\n` +
        `      JS ona NativeModules.${name} ile erişiyor; iOS'ta undefined olur\n` +
        '      ve çağrılar sessizce yutulur.',
    );
  }
  if (expected.includes('android') && !androidNames.has(name)) {
    problems.push(
      `${name}: Android köprüsü YOK (const val NAME = "${name}" bulunamadı).\n` +
        `      JS ona NativeModules.${name} ile erişiyor; Android'de undefined olur\n` +
        '      ve çağrılar sessizce yutulur.',
    );
  }
}

// İstisna listesi de BAYATLAR: artık kullanılmayan bir modül için istisna
// tutmak, bir sonraki okuyucuya var olmayan bir kısıtı doğru sanmasına yol
// açar.
for (const [name, { platforms }] of NATIVE_EXEMPTIONS) {
  if (!referenced.has(name)) {
    problems.push(
      `NATIVE_EXEMPTIONS: ${name} artık JS tarafında kullanılmıyor — istisna kaldırılmalı.`,
    );
    continue;
  }
  // Tek platformluk istisnası varken diğer platform da yazılmışsa istisna
  // gereksizdir ve gerçeği yansıtmaz.
  if (platforms.length === 1) {
    const other = platforms[0] === 'ios' ? 'android' : 'ios';
    const present = other === 'ios' ? iosRegistered.has(name) : androidNames.has(name);
    if (present) {
      problems.push(
        `NATIVE_EXEMPTIONS: ${name} artık ${other} tarafında da var — istisna güncellenmeli.`,
      );
    }
  }
}

// --- iOS köprü metodu pariteti ------------------------------------------
//
// `.m` dosyasındaki `RCT_EXTERN_METHOD(x:)`, Swift tarafında karşılığı
// olmayan bir seçici bildirir. Derleyici bunu YAKALAMAZ (iki dosya ayrı
// derlenir); hata çalışma anında "unrecognized selector" çökmesi olarak
// çıkar — yani kullanıcıda.
//
// Aynı sebeple `@objc(...)` adı olmayan bir Swift sınıfı JS'te görünmez.

const iosDir = join(app, 'ios');
const swiftPairs = walk(iosDir).filter((f) => f.endsWith('.m'));

for (const objcFile of swiftPairs) {
  const swiftFile = objcFile.replace(/\.m$/, '.swift');
  const objcSource = readFileSync(objcFile, 'utf8');

  if (!existsSync(swiftFile)) {
    // AppDelegate gibi kendi başına duran .m dosyaları RCT_EXTERN_METHOD
    // içermez; yalnızca köprü bildiren dosyalar eşleşme gerektirir.
    if (/RCT_EXTERN_METHOD/.test(objcSource)) {
      problems.push(
        `${basename(objcFile)}: köprü metotları bildiriyor ama eşleşen .swift dosyası yok.`,
      );
    }
    continue;
  }

  const swiftSource = readFileSync(swiftFile, 'utf8');
  const funcs = new Set([...swiftSource.matchAll(/func\s+([A-Za-z0-9_]+)/g)].map((m) => m[1]));
  const selectors = [...swiftSource.matchAll(/@objc\(([A-Za-z0-9_:]+)\)/g)].map((m) => m[1]);

  for (const match of objcSource.matchAll(/RCT_EXTERN_METHOD\(\s*([A-Za-z0-9_]+)/g)) {
    const name = match[1];
    const hasFunc = funcs.has(name);
    const hasSelector = selectors.some((s) => s === name || s.startsWith(`${name}:`));
    if (!hasFunc && !hasSelector) {
      problems.push(
        `${basename(objcFile)}: RCT_EXTERN_METHOD(${name}) — Swift tarafında karşılığı YOK.\n` +
          '      Derleyici görmez; çalışma anında "unrecognized selector" çökmesi olur.',
      );
    }
  }
}

// --- Swift sözdizimi tuzakları -------------------------------------------
//
// Bu depoda Swift derlenmiyor (CI'da Xcode yok), bu yüzden derleyicinin
// yakalayacağı birkaç yaygın hata burada aranıyor. Tam bir sözdizimi
// denetimi DEĞİL — yalnızca sessizce gözden kaçan biçimler.

for (const swiftFile of walk(iosDir).filter((f) => f.endsWith('.swift'))) {
  const source = readFileSync(swiftFile, 'utf8');
  const lines = source.split('\n');

  lines.forEach((line, index) => {
    // Yorum satırları denetlenmez: aşağıdaki biçimleri ANLATAN yorumlar var.
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;

    // `??.` diye bir operatör yoktur. `try?` bir sözlük aboneliğiyle
    // zincirlendiğinde iç içe isteğe bağlı üretir ve bu yazım denenir.
    if (line.includes('??.')) {
      problems.push(
        `${basename(swiftFile)}:${index + 1}: geçersiz \`??.\` — Swift'te böyle bir operatör yok.`,
      );
    }
  });

  // Süslü parantez dengesi: eksik/fazla parantez, uzun bir dosyada gözle
  // kolayca kaçar ve derleyici hatası anlaşılmaz bir satırı gösterir.
  const withoutStrings = source.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/\/\/[^\n]*/g, '');
  const open = (withoutStrings.match(/\{/g) ?? []).length;
  const close = (withoutStrings.match(/\}/g) ?? []).length;
  if (open !== close) {
    problems.push(
      `${basename(swiftFile)}: süslü parantez dengesiz (${open} açık, ${close} kapalı).`,
    );
  }
}

// --- Info.plist zorunlu anahtarları --------------------------------------

const plistPath = join(app, 'ios/EvenGirl/Info.plist');
if (existsSync(plistPath)) {
  const plist = readFileSync(plistPath, 'utf8');
  for (const [key, why] of [
    ['CFBundleExecutable', 'uygulama çalıştırılabiliri bulunamaz'],
    ['UILaunchStoryboardName', 'App Store reddi + küçük pencerede açılma'],
    ['UISupportedInterfaceOrientations', 'yatay modda editör jestleri çakışır'],
  ]) {
    if (!plist.includes(`<key>${key}</key>`)) {
      problems.push(`Info.plist: ${key} eksik — ${why}`);
    }
  }

  // ATS istisnası eklenmemiş olmalı.
  //
  // `<key>` etiketiyle aranıyor, düz metinle DEĞİL: plist'in başındaki
  // yorum bu adı "TANIMLI DEĞİLDİR" diye açıklamak için içeriyor ve düz
  // arama o yorumu ihlal sanıyordu. Yorum üzerine ateşleyen bir kontrol,
  // zamanla görmezden gelinen bir kontroldür.
  if (plist.includes('<key>NSAllowsArbitraryLoads</key>')) {
    problems.push('Info.plist: NSAllowsArbitraryLoads TANIMLI — TLS zorunluluğu delinmiş.');
  }
}

if (problems.length === 0) {
  console.log(`${label} OK — ${REQUIRED.length + BUILDABLE.length} native/proje dosyası, ${referenced.size} köprü, bileşen adı, ${moduleClasses.size} Android modülü ve iOS köprü metotları tutarlı.`);
} else {
  console.error(`${label} ${problems.length} sorun:\n`);
  for (const p of problems) console.error(`  ✗ ${p}\n`);
  process.exit(1);
}
