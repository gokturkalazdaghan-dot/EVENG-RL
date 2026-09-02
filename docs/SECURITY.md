# EVEN GIRL — Güvenlik Çekirdeği (Modül 1)

## 1. Tehdit modeli

| # | Tehdit | Saldırganın amacı | Karşı önlem | Gerçekçi etkinlik |
|---|---|---|---|---|
| T1 | **MitM proxy** (Burp, Charles, mitmproxy) | API trafiğini okumak, entitlement yanıtını değiştirmek | SPKI pinning (native, iki katman) | **Yüksek** — pinning bypass'ı için uygulamanın yamalanması gerekir (T3'e döner) |
| T2 | **Rootlu/jailbreakli cihaz** | Şifreli depoyu okumak, dosya sistemine erişmek | Çok kategorili bütünlük kontrolü + kilit | **Orta** — Magisk DenyList/Shadow bazı sinyalleri gizler, hepsini değil |
| T3 | **Statik tersine mühendislik** | Premium kontrolünü yamalayıp modlu APK/IPA dağıtmak | R8/DexGuard + SwiftShield karartma, sabit maskeleme, imza doğrulama | **Düşük-orta** — geciktirir, engellemez |
| T4 | **Dinamik enstrümantasyon** (Frida, LLDB, Xposed) | Çalışma anında `isPro` döndüren fonksiyonu hook'lamak | Anti-debug + hook tespiti + **sunucu tarafı doğrulama** | **Yüksek** — hook başarılı olsa bile sunucu yetkiyi vermez |
| T5 | **Yerel depodan sır çalma** | Token'ı okuyup başka cihazda kullanmak | Keychain (ThisDeviceOnly) / EncryptedSharedPreferences (Keystore+StrongBox), yedekleme kapalı | **Yüksek** |
| T6 | **Yeniden paketleme** | Reklam/telemetri enjekte edilmiş sahte EVEN GIRL yayınlamak | İmza özeti + bundle id + FairPlay/`embedded.mobileprovision` kontrolü | **Orta** |

### Kabul edilen sınır

> **Bu koruma katmanı kararlı bir tersine mühendisi durdurmaz.** İstemci
> tarafındaki hiçbir kontrol durduramaz — saldırgan donanıma ve binary'ye
> tamamen sahiptir. Amaç, "5 dakikada premium açma" seviyesindeki toplu ve
> otomatik istismarın maliyetini, kazancının üzerine çıkarmaktır.
>
> Bu yüzden **paraya dokunan hiçbir karar istemcide verilmez**: abonelik
> durumunun tek doğruluk kaynağı, RevenueCat webhook'uyla beslenen backend
> veritabanıdır (`billing_infrastructure/revenuecat-webhook.js`). İstemci kilidi tamamen
> kırılsa bile sunucu ücretli özellik çağrısına yetki vermez.

## 2. Bütünlük kontrolü — neden puanlama?

Tek bir `isJailbroken() -> Bool` fonksiyonu iki nedenle yetersizdir:

1. **Her tekil kontrolün bilinen bir bypass'ı vardır.** Liberty Lite dosya
   kontrollerini, Shadow `canOpenURL`'ü, Magisk DenyList `su` aramasını gizler.
2. **Tek karar noktası = tek yama noktası.** Tek `ret` talimatı tüm korumayı
   kapatır.

Bunun yerine farklı **kategorilerden** ağırlıklı sinyal toplanır:

| Kategori | Ağırlık | Neden bu ağırlık |
|---|---|---|
| Sandbox dışına yazma (iOS) | 100 | Jailbreak'in tanım gereği kanıtı; dosya gizleyiciler engelleyemez |
| `fork()` başarısı (iOS) | 100 | Sandbox'lı süreç alt süreç açamaz |
| `su` çalıştırılabilir (Android) | 100 | Dosya sistemi gizlemeyi aşar |
| `/system` rw mount (Android) | 100 | Normal cihazda imkânsız |
| Enjekte edilmiş kütüphane / Frida | 100 | dyld image listesi ve `/proc/self/maps` gizlenemez |
| Debugger (`P_TRACED` / `TracerPid`) | 100 | Kernel'den okunur |
| İmza uyuşmazlığı / yeniden paketleme | 100 | Orijinal anahtarla yeniden imzalamak mümkün değil |
| Jailbreak dosya izleri | 40 | Tweak'ler gizleyebilir |
| Root yönetici paketi | 60 | Gizlenebilir ama gizlemek ek çaba ister |
| `test-keys` build | 25 | Custom ROM'da yanlış pozitif riski yüksek |
| Emülatör | 20 | Tek başına kötü niyet değil (QA cihazları) |

**Eşik: 100.** Zayıf bir sinyal tek başına kimseyi kilitlemez; güçlü bir sinyal
tek başına yeter. Eşik iOS ve Android'de aynıdır, bulgu isimleri de aynıdır —
JS tarafı platform ayrımı yapmak zorunda kalmaz.

## 3. Neden `exit(0)` yok?

İhlal tespit edildiğinde uygulama **çökertilmez**, kilitlenir
(`SecurityBlockedScreen`). Üç gerekçe:

1. **Mağaza reddi.** App Store Guideline 2.1, kasıtlı sonlandırmayı çökme
   olarak değerlendirir. Play Console'da da kararlılık metriği bozulur.
2. **Saldırgana yol göstermek.** Çökme, hangi çağrının kontrol olduğunu
   saniyeler içinde işaret eder — kırılma noktası bulunur, `ret` yamalanır.
3. **Yanlış pozitif kurtarma.** Analiz aracı kapatıldıysa kullanıcı "Yeniden
   dene" ile kurtulabilir; çöken uygulamada bu şansı yoktur.

Kilit ekranı **hangi bulgunun** tetiklendiğini söylemez ("rootlu cihaz tespit
edildi" demez). Spesifik geri bildirim, saldırgan için doğrudan bypass rehberidir.

## 4. SSL Pinning

### Neden sertifika değil, public key (SPKI)?
Sertifika pinlenirse her yenilemede (Let's Encrypt: 90 gün) uygulama sahada
kilitlenir. SPKI pinlemede aynı anahtar çiftiyle yenilenen sertifika pin'i bozmaz.

### Yedek pin zorunluluğu
Her host için **en az 2 pin** şarttır: aktif anahtar + henüz yayına alınmamış
yedek. Tek pinli yapılandırmada anahtar kaybı = sahadaki tüm kurulumların
kalıcı kilitlenmesi. Kural üç yerde uygulanır: `PinnedSession.assertConfigurationIsSafe()`,
`PinnedHttpClient.assertConfigurationIsSafe()` ve `verify-security-config.mjs`.

### Katmanlar
| Katman | Dosya | Neyi yakalar |
|---|---|---|
| Uygulama | `PinnedSession.swift` / `PinnedHttpClient.kt` | Uygulamanın kendi trafiği |
| Platform (Android) | `network_security_config.xml` | Üçüncü parti SDK'ların trafiği + kullanıcı CA'ları |
| ATS (iOS) | `Info.plist` (istisna yok) | Düz HTTP ve zayıf TLS |

`network_security_config.xml` pin-set'inin `expiration` tarihi geçtiğinde
platform pinning'i **sessizce kapatır (fail-open)**. Bu yüzden CI, tarihin
90 günden yakın olmadığını doğrular.

### Pin nasıl hesaplanır
```bash
openssl s_client -servername api.evengirl.app -connect api.evengirl.app:443 \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform der \
  | openssl dgst -sha256 -binary | openssl enc -base64
```

### Pin uyuşmazlığında davranış
Bağlantı TLS el sıkışmasında kesilir; JS'e dönen hata **"ağ hatası"dır**.
Pin uyuşmazlığını ağ hatasından ayırt edilebilir yapmak, saldırgana
"pinning var, şimdi onu kapat" geri bildirimi vermektir.

## 5. Karartma katmanları

| Katman | Araç | Kapsam |
|---|---|---|
| Sembol adları (Android) | R8 (`minifyEnabled true` + `-repackageclasses ''`) | Tüm uygulama kodu |
| Sembol adları (iOS) | SwiftShield (`scripts/obfuscate.sh`) | Swift sınıf/metot/özellik adları |
| Kontrol akışı | OLLVM (`-fla -sub -bcf`, opsiyonel) | Yalnızca `Security/` — tüm hedefe uygulamak binary'yi ~%40 büyütür |
| String maskeleme | `gen-obfuscated-strings.mjs` | Jailbreak/root yolları, hook imzaları, paket adları |
| String şifreleme (ticari) | DexGuard | R8'in üstüne, opsiyonel |
| Log temizliği | `-assumenosideeffects android.util.Log` | Release'te tüm log çağrıları kaldırılır |

**Güvenlik sınıfları bilerek `-keep` edilmez.** Yalnızca RN köprüsünden
refleksiyonla çağrılan giriş noktaları korunur; iç mantığın adlarının
karartılması korumanın parçasıdır.

### Sembol haritaları
`mapping.txt` (R8) ve `conversionMap.txt` (SwiftShield) çökme raporlarını
çözmek için **şarttır** ama repoda durmaz ve uygulamayla dağıtılmaz
(`.gitignore`). Kaybolurlarsa o sürümün çökme raporları kalıcı olarak
okunamaz hale gelir; sürüm arşivine yüklenmeleri zorunludur.

## 6. Hassas veri saklama

| Platform | Mekanizma | Erişim sınıfı | Neden |
|---|---|---|---|
| iOS | Keychain | `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` | Arka plan yenilemesi kilitliyken okumalı; iCloud Keychain'e ve şifreli yedeğe **girmemeli** |
| Android | EncryptedSharedPreferences | AES256-GCM, MasterKey (mümkünse StrongBox) | Anahtar Keystore'da; rootlu cihazda dahi ham anahtar dışarı çıkmaz |

Düz `SharedPreferences`, `AsyncStorage` ve MMKV bu değerler için **asla**
kullanılmaz — hepsi rootlu cihazda düz metin okunur.

Android'de yedekleme ve cihazdan cihaza aktarım tamamen kapalıdır
(`data_extraction_rules.xml`): şifreli depo başka cihazda zaten çözülemez ve
yedekten gelen bir "isPro" değeri sahtelenebilir. Abonelik her zaman mağazadan
geri yüklenir.

iOS'ta uygulama silinip yeniden kurulduğunda Keychain kayıtları **silinmez**;
`KeychainStore.purgeAll()` ilk açılışta bu artıkları temizler.

## 7. Anti-debug: neden `PT_DENY_ATTACH` yok?

`ptrace(PT_DENY_ATTACH)` bilinçli olarak **kullanılmamaktadır**:
- Geçmişte App Store reddine yol açmıştır (private API kullanımı algısı),
- Tek talimatla (`ret`) yamalanabildiği için koruma değeri düşüktür,
- Meşru kilitlenme raporlamasını (ve Xcode Organizer'ı) bozar.

Bunun yerine **belgelenmiş public API** olan `sysctl(KERN_PROC)` + `P_TRACED`
okuması kullanılır. Android'de karşılığı `/proc/self/status` içindeki
`TracerPid` alanıdır — framework API'sinden (`Debug.isDebuggerConnected()`)
bağımsız ikinci bir kanaldır ve JDWP kapalıyken de yakalar.

Sürekli izleme aralığı **jitter'lıdır**: sabit periyot, saldırganın kontrol
anını uyku/yama ile atlatmasını kolaylaştırır.

## 8. İzin politikası

Talep **edilmeyenler** (bilinçli): `READ_CONTACTS`, `ACCESS_FINE_LOCATION`,
`READ_PHONE_STATE`, `GET_ACCOUNTS`, `AD_ID`, `NSUserTrackingUsageDescription`.

`AD_ID` izni manifest'ten `tools:node="remove"` ile **açıkça kaldırılır** —
uygulamada reklam olmamasına rağmen bir bağımlılık bu izni sürükleyebilir ve
Play Data Safety formunu kirletir.

## 9. Sürüm öncesi kontrol listesi

- [ ] `npm run verify:security` yeşil
- [ ] `npm run typecheck` yeşil
- [ ] `PinConfiguration.swift`, `PinnedHttpClient.kt`, `env.ts`, `network_security_config.xml` → gerçek pin'ler, her host için ≥2
- [ ] `SignatureVerifier.EXPECTED_SIGNATURE_SHA256` → Play Console *app signing* sertifika özeti (upload key değil)
- [ ] `pin-set expiration` > bugün + 90 gün
- [ ] `mapping.txt` ve `conversionMap.txt` sürüm arşivine yüklendi
- [ ] Rootlu bir test cihazında kilit ekranı doğrulandı
- [ ] Temiz bir cihazda **yanlış pozitif olmadığı** doğrulandı (en kritik madde: yanlış pozitif, tüm kullanıcı tabanını kilitler)

## Girdi doğrulama: "boş değil" bir doğrulama değildir

Üç uç, istemciden gelen bir dizeyi yalnızca doğruluk (truthiness) kontrolüyle
geçiriyordu. Her üçünde de değer bir **anahtar veya yol** olarak kullanılıyor.

| Alan | Nereye giriyor | "Boş değil" neyi geçiriyordu |
|---|---|---|
| `projectId` | Saklama yolu / render URL'i | `../../gizli`, `a/b`, `proje?x=1`, 65+ karakter, `{}`, `[]` |
| `week` | Veritabanı anahtarı | `{ $ne: null }`, `['2026-W35']`, `5` |
| `maxEdgePx` | Render kenar boyutu | Negatif ve devasa değerler |

`maxEdgePx` özellikle sinsiydi: `Number(x) || 4096` kalıbı `0` ve `NaN`'ı
varsayılana düşürdüğü için doğru görünüyor, ama **negatif ve devasa**
değerleri olduğu gibi geçiriyordu.

Üçü de artık beyaz listeye veya aralığa tabi:

- `projectId`: `/^[A-Za-z0-9_-]{1,64}$/` — dizin dışına çıkma, URL kesme ve
  aşırı uzunluk sınıflarının tamamını birden kapatır.
- `week`: `/^\d{4}-W\d{2}$/` — `scoring.weekKey` ile aynı biçim.
- `maxEdgePx`: sonlu, pozitif, 8192 ile sınırlı.

`renderFullResolution` ayrıca `encodeURIComponent` uyguluyor: beyaz liste
zaten yeterli, ama tek bir savunmaya bağlı kalmak, beyaz liste ileride
gevşetildiğinde sessiz bir açık bırakır.

Bu geçişte üçüncü bir eski alan adı da bulundu (`cdn.even-girl.app`); daha
önceki `ai-guard.app` → `evengirl.app` geçişi tireli biçimi kaçırmıştı.

### Kimlik alanları: tek bir denetleyici, sekiz uç

Aynı kalıp sosyal katmanda sekiz alanda daha vardı: `contentId`, `authorId`,
`storyId`, `attachmentId`, `messageId`, `conversationId`,
`reportedMessageId` ve `attachmentIds` dizisinin elemanları. Hepsi
`suspendContent`, `addBlock`, `storeEnvelope` gibi fonksiyonlara **anahtar**
olarak giriyor; hepsi yalnızca doğruluk kontrolünden geçiyordu.

Bu, `{ $ne: null }` gibi bir nesneyi, bir diziyi ve megabaytlarca uzunlukta
bir dizeyi anahtar yapıyordu.

Sekiz yere ayrı ayrı satır içi kontrol yazmak yerine tek bir `isValidId`
kullanılıyor — **biri mutlaka atlanırdı**. Ek kimlikleri dizisi ayrıca
eleman bazında denetleniyor: önceden yalnızca dizi uzunluğuna bakılıyor,
elemanlar `String()` ile zorlanıp anahtar oluyordu.

**Karakter kümesi kısıtlanmıyor**, yalnızca tür ve uzunluk. Bu kimlikler
opak (UUID, saklama anahtarı, mağaza kimliği) ve biçimleri kaynak
sistemden geliyor; karakter beyaz listesi meşru bir kimlik biçimini
kırabilirdi. Kritik güvence şudur: **dize olmayan hiçbir şey anahtar
olamaz.**

Kapsam testi uçları tek tek dolaşır. Tek bir uçta doğrulama gevşetildiğinde
test kırmızıya döner — ve testin her şeyi reddeden bozuk bir kapıyı yeşil
göstermemesi için geçerli kimliğin gerçekten geçtiği de doğrulanır.
