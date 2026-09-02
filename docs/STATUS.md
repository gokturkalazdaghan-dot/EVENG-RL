# EVENGIRL — devir sonrası durum

`EVENGIRL-CLAUDE.zip` (1 Eylül 2026) kurulup derlendi, test edildi, eksikleri
tamamlandı. Bu dosya **neyin ölçüldüğünü, neyin düzeltildiğini ve neyin hâlâ
eksik olduğunu** yazıyor.

## Ölçüm — iddia değil

| Kapı | Devir zip'i geldiğinde | Şimdi |
|---|---|---|
| `npm run typecheck` | **kırık** (`@/lib/kod-zip` yok) | temiz |
| `npm test` | **16 kırmızı** / 195 | 192 geçti, 0 kırmızı, 4 gerekçeli atlandı |
| `npm run build` | çalışmıyordu (typecheck kırık) | geçiyor |
| `npm run lint` | **çalışmıyordu** (`eslint.config.js` yok) | koşuyor |
| Tarayıcıda açılış | 7 varlık 404 | 0 hata, 0 kırık istek |
| `scripts/browser-smoke.mjs` | **koşamıyordu** (`/workspace` sabit) | geçiyor — 200, `pageErrors: []`, yatay taşma yok |

Yedi sekmenin (Projeler, Düzenle, Efekt, Oluştur, Fal, Araçlar, Ayarlar)
yedisi de tıklanarak gezildi; hepsi çiziliyor, JS hatası yok.

## Düzeltilenler

**1. `@/lib/kod-zip` yoktu — tip denetimi kırıktı.**
O modül üretilen bir şeydi: uygulamanın kendi kaynağını base64 olarak JS
paketine gömüyordu. Base64 ikiliyi %33 şişirir ve dize paketin parçası
olduğu için *uygulamayı açan herkes* ~440 KB fazladan indiriyordu — "kaynağı
paylaş" düğmesine hiç dokunmayanlar dahil. Yerine `scripts/make-kod-zip.mjs`
geldi: dosya `public/kod/` altında duruyor, yalnızca düğmeye basan indiriyor.
`zip` ikilisi yerine `fflate` (zaten bağımlılık) kullanılıyor ki derleme
ortamında ikilinin varlığına bağlı olmasın.

**2. Dört ayrı yerde `/workspace` sabit yolu.**
`make-legal-pdfs.py`, `browser-smoke.mjs` (dört çağrı), `computeBrandWarnings`
varsayılanı. O dizin yalnızca app-builder kum havuzunda var; başka her yerde
betikler ya yanlış yere yazıyor ya hiç koşmuyordu. Marka kontrolü, kartlar
depoda dururken "kart yok" diyordu — yanlış yere bakan bir kapı, hiç bakmayan
bir kapıdan kötüdür: düzeltilecek şey yokken uyarır ve zamanla susturulur.

**3. Sekiz test kendini depodan yalıtmıyordu.**
`injectGrokPwaHead`, `site` verilmediğinde `src/lib/og/site.json` dosyasını
diskten okur — üretimde doğru davranış. Ama sekiz test `site` ve `cwd`
vermeden çağırıyordu, yani deponun kendi `site.json`'ı teste sızıyordu.
"Belge başlığı og:title olur" iddiası, `site.json` yokken doğru görünüyor,
eklendiği an kırılıyordu. Hepsine yalıtılmış `cwd` verildi.

**4. Hydration uyuşmazlığı — her açılışta tüm ağaç yeniden çiziliyordu.**
`legal-gate.tsx` portalı doğrudan ilk istemci çiziminde `document.body`ye
basıyordu; sunucu hiçbir şey üretmediği için React "Hydration failed" verip
ağacın tamamını baştan render ediyordu. `mounted` bayrağıyla ilk çizim
sunucununkiyle eşitlendi. Ölçüldü: düzeltmeden önce 1 pageError, sonra 0.

**5. `migrations/` yokken test ENOENT atıyordu.**
Bu üründe oturum açma kapalı (CLAUDE.md: hesap yok, localStorage). Dizinin
olmaması "bekleyen migration yok" demek. Test artık ölçmek istediği değişmezi
ölçüyor; `migrations/auth/` varsa eski iddia aynen sürüyor.

## Tamamlanan eksikler

Zip'te `public/` hiç yoktu. Üretecleriyle birlikte kondu:

| Ne | Nereden | Betik |
|---|---|---|
| Yasal PDF'ler | zaten depodaki metinlerden | `make-legal-pdfs.py` (yolu düzeltildi) |
| PWA ikonları, `og.jpg`, `x-banner.jpg`, favicon | `site.json` paletinden üretiliyor | `make-brand-assets.py` |
| MediaPipe wasm + `face_landmarker.task` | node_modules + Google CDN | `sync-mediapipe.mjs` |
| Kaynak zip | depodan | `make-kod-zip.mjs` |
| `.env.example`, `.gitignore`, `eslint.config.js`, `.grok/app-env.json` | koddan okunan değişkenlerden | — |

MediaPipe olmadan klinik **sessizce** yüz ağı olmadan çalışıyordu:
`getLandmarker()` catch'e düşüp `meshFailed = true` yapıyor, dudak/göz/çene
işlemleri kabaca konumlanıyor, konsolda tek satır bile çıkmıyordu.

## HÂLÂ EKSİK

**1. `android/` — YOK ve uydurulmadı.**
Zip'te değildi. Sizin asıl deponuzda var (ANDROID.md imzalı `even-release.jks`
ve versionCode 3'ten söz ediyor). Burada Android SDK yok, yani yazacağım
Gradle projesini derleyerek doğrulayamazdım — ve sizin gerçek kabuğunuzun
üstüne tahminimi yazmak, hiç yazmamaktan kötü olurdu. Asıl deponuzdan
kopyalayın.

**2. `public/media/` içindeki altı görsel YER TUTUCU.**
Zeminler (cafe, forest, loft, prism, street-night) gerçekten kullanılabilir
soyut dokular. Ama üç portre ve üç kahin karesi insan fotoğrafı; üstünde
"PLACEHOLDER" yazan karolar kondu. Sahte yüz üretmedim — CLAUDE.md kural 4
zaten tohum portrelerinin kullanıcının yüzü sanılmasını yasaklıyor.
Gerçekleri asıl deponuzdan kopyalayınca üzerine yazılır.

**3. `.grok/skills/og/` ve `AGENTS.md` yok → 4 test atlanıyor.**
Platformun kendi ajan belgeleri; bu ürüne ait değiller. Atlamalar test
çıktısında gerekçesiyle **görünür** ve "belge kümesi ya tam ya hiç" tripwire'ı
yarım bir geri koymayı yakalar.

**4. `src/lib/store.ts` tip denetiminin DIŞINDA.**
Bkz. dosyanın başındaki ölçüm bloğu: `@ts-nocheck` kaldırılınca 147 hata
çıkıyor (113'ü typesiz parametre gürültüsü, 34'ü gerçek). İkisi önemli —
kaydedilen sürümün `kind` alanı `VersionKind` yerine `string`, ve `unknown`
üzerinde `.report`/`.calib` okuması. 1900 satırlık bir durum deposuna
anlamadan tip yazmak davranış değiştirir; ayrı ve dikkatli bir geçiş gerekir.

## SİZİN YAPMANIZ GEREKENLER

- **`android/app/build.gradle` içindeki imzalama parolaları.** ANDROID.md
  bunu böyle anlatıyor; o dosya git'e giriyor. Parolalar
  `android/keystore.properties`'e (gitignore'da) taşınmalı.
- **Devir zip'ine keystore koymayın.** CLAUDE.md `even-release.jks`'i zip'e
  koymayı söylüyor. Bu zip'te yoktu (iyi ki) — ama süreç olarak yanlış: o
  dosya sızarsa uygulamanızı başkası imzalayabilir ve anahtar değiştirilemez.
- **Play Billing hâlâ yalnızca arayüz** (`src/lib/play-store.ts`). Mağazaya
  göndermeden önce gerçek BillingClient bağlanmalı.
- `.env` dosyasını `.env.example`'dan üretip anahtarları girin. Hiçbiri
  zorunlu değil; boşsa üretim cihaz üstü yedeğe düşer.
