# EVEN GIRL — Mimari

> **EVEN GIRL** · Powered by **ARMANALABS**

> Kurumsal düzeyde AI video/fotoğraf düzenleme uygulaması.
> Bu doküman canlıdır: her modül teslim edildikçe ilgili bölüm doldurulur.

## 1. Teslim durumu

| Modül | Kapsam | Durum |
|---|---|---|
| **Modül 1** | Proje hiyerarşisi + güvenlik çekirdeği (SSL pinning, root/jailbreak, anti-debug, karartma) | ✅ Tamamlandı |
| **Modül 2** | Kaydırmalı arayüz (gesture navigation), batarya/termal yönetimi, akıllı önbellek temizliği | ✅ Tamamlandı |
| **Modül 3** | StoreKit 2 + Play Billing, 1 gün deneme, paywall, yerelleştirme ve mağaza uyumluluğu | ✅ Tamamlandı |
| **Modül 4** | Çevrimdışı çıkarım (CoreML/TFLite köprüsü), sıfır veri toplama, anonim çökme raporlama | ✅ Tamamlandı |
| **Marka + destek** | EVEN GIRL adlandırması, ARMANALABS künyesi, geri bildirim/istek/şikayet akışı | ✅ Tamamlandı |
| **Modül 5** | 18+ yaş kapısı, Safe Mode, NSFW sınıflandırma, görünürlük kalkanı, UGC moderasyonu | ✅ Tamamlandı |
| **Modül 6** | Sosyal akış, hikayeler, DM, şablon pazarı, creator abonelik, gamification | ⏳ Sırada |
| **Modül 7** | Tek ücretsiz indirme hakkı, anti-capture, WhatsApp/Instagram çapraz paylaşım, dil senkronu | ✅ Tamamlandı |

## 2. Teknoloji seçimleri ve gerekçeleri

| Karar | Gerekçe |
|---|---|
| **React Native + TypeScript** (Hermes) | Tek arayüz kod tabanı, iki mağaza. AI/güvenlik gibi kritik işler zaten native; RN yalnızca sunum katmanı. |
| **Güvenlik mantığı %100 native** | JS bundle'ı cihazda değiştirilebilir. JS'te yapılan root kontrolü koruma sayılmaz. |
| **Reanimated + Gesture Handler** | Kaydırma animasyonları UI thread'de worklet olarak çalışır; JS köprüsü tıkansa bile 120 FPS korunur. |
| **Abonelik doğrulaması sunucuda** | İstemci "isPro" değeri sahtelenebilir. Tek doğruluk kaynağı backend'dir (bkz. `server.js`, `billing_infrastructure/revenuecat-webhook.js`). |
| **Sıfır kişisel veri** | Hesap yok, e-posta yok, IDFA yok. Kimlik yoksa sızdırılacak veri de yoktur; Data Safety / App Privacy formları temiz kalır. |

## 3. Dosya ve klasör hiyerarşisi

```
even-girl/
├── server.js                          # Backend giriş noktası (router montajı)
│
├── client_mobile/                     # Mobil uygulama (React Native + TS)
├── core_gateway/                      # Çift modlu stüdyo ajanları (FastAPI)
├── export_gate/                       # Tek ücretsiz indirme hakkı + anti-capture
├── social_gamification/               # Akış, hikaye, DM, moderasyon, sıralama
├── reward_automation/                 # Redis ZSET puanlama + haftalık ödül cron
├── billing_infrastructure/            # StoreKit 2 / Play Billing senkronu
├── .env.example                       # Backend gizli değerleri (repoya asla gerçek değerle girmez)
├── docs/
│   ├── ARCHITECTURE.md                # bu dosya
│   ├── SECURITY.md                    # tehdit modeli + güvenlik çekirdeği
│   ├── PERFORMANCE.md                 # jest mimarisi, termal, önbellek
│   ├── BILLING.md                     # abonelik, fiyatlandırma, mağaza uyumluluğu
│   ├── PRIVACY.md                     # sıfır veri, çökme raporlama, çevrimdışı, etik
│   ├── SAFETY.md                      # yaş kapısı, NSFW politikası, görünürlük kalkanı
│   └── EXPORT_AND_SHARE.md            # indirme kapısı, ekran koruması, çapraz paylaşım
└── app/                               # Mobil uygulama
    ├── package.json
    ├── tsconfig.json                  # yol takma adı: @/* -> ./src/*
    ├── babel.config.js                # reanimated/plugin EN SONDA olmalı
    ├── index.js                       # giriş noktası
    ├── app.json
    │
    ├── jest.config.js                  # saf karar mantığı testleri
    ├── __tests__/
    │   ├── ThermalPolicy.test.ts       # güç profili merdiveni (16 test)
    │   ├── CachePolicy.test.ts         # eviction planı (14 test)
    │   ├── FeedbackComposer.test.ts    # mailto kaçışı + teşhis içeriği (15 test)
    │   ├── PricingPolicy.test.ts       # fiyat/deneme mantığı (17 test)
    │   ├── StoreCompliance.test.ts     # paywall uyumluluğu (10 test)
    │   ├── Scrubber.test.ts            # PII temizliği (27 test)
    │   └── RoutingPolicy.test.ts       # yerel/uzak yönlendirme (17 test)
    │
    ├── tools/                         # Build zamanı doğrulama araçları
    │   ├── obfuscated-strings.json    # karartılacak sabitlerin kaynağı
    │   ├── gen-obfuscated-strings.mjs # Swift + Kotlin sabit üreteci (--check ile CI kapısı)
    │   ├── verify-security-config.mjs # 4 kaynaktaki SSL pin listelerinin tutarlılık denetimi
    │   ├── verify-i18n.mjs            # çeviri anahtar + yer tutucu bütünlüğü
    │   └── verify-privacy.mjs         # sıfır veri toplama ilkesinin denetimi
    │
    ├── src/
    │   ├── App.tsx                    # kök: önce SecurityGate, sonra uygulama kabuğu
    │   │
    │   ├── core/                      # Çapraz kesen altyapı
    │   │   ├── config/
    │   │   │   ├── env.ts             # PUBLIC yapılandırma (secret YOK)
    │   │   │   └── featureFlags.ts    # derleme zamanı bayrakları (uzaktan config yok)
    │   │   ├── logging/Logger.ts      # release'te susar, uzağa veri göndermez
    │   │   └── result/Result.ts       # Result<T,E> — hata tip sisteminde taşınır
    │   │
    │   ├── security/                  # ── MODÜL 1 ──
    │   │   ├── SecurityGate.ts        # tek güvenlik karar noktası
    │   │   ├── SslPinning.ts          # pinlenmiş kanaldan istek (native köprü)
    │   │   ├── SecureStore.ts         # Keychain / EncryptedSharedPreferences önyüzü
    │   │   └── native/NativeSecurity.ts  # native modül sözleşmesi + olay köprüsü
    │   │
    │   ├── core/lifecycle/AppLifecycle.ts  # arka plan bakımı, bellek baskısı
    │   │
    │   ├── ui/
    │   │   ├── theme/
    │   │   │   ├── tokens.ts          # renk / tipografi / hareket / jest eşikleri
    │   │   │   └── ThemeProvider.tsx  # dark/light + güç profiline bağlı hareket
    │   │   ├── components/
    │   │   │   ├── PageIndicator.tsx      # ilerleme + alternatif giriş yolu
    │   │   │   ├── ContextualToolbar.tsx  # bağlamsal, termal/çevrimdışı farkında
    │   │   │   └── FeedbackButton.tsx     # mailto + posta uygulaması yoksa yedek yol
    │   │   └── screens/
    │   │       ├── SecurityCheckScreen.tsx    # kontrol sürerken
    │   │       ├── SecurityBlockedScreen.tsx  # ihlalde (çökme değil, kilit)
    │   │       ├── ProjectsScreen.tsx
    │   │       ├── EditorScreen.tsx           # tuval + dikey katmanlar
    │   │       ├── StorageScreen.tsx          # depolama kullanımı + temizlik
    │   │       └── SettingsScreen.tsx         # geri bildirim, gizlilik, künye
    │   │
    │   ├── navigation/                # ── MODÜL 2 ──
    │   │   ├── routes.ts              # sabit sayfa dizisi + katman tanımları
    │   │   ├── GestureShell.tsx       # yatay kaydırma (UI thread worklet'leri)
    │   │   └── LayerSheet.tsx         # dikey katman geçişi, hız izdüşümlü snap
    │   │
    │   ├── performance/               # ── MODÜL 2 ──
    │   │   ├── PowerProfile.ts        # 4 güç bütçesi tanımı
    │   │   ├── ThermalPolicy.ts       # SAF karar mantığı (test edilir)
    │   │   ├── ThermalGovernor.ts     # platform adaptörü
    │   │   ├── TensorArena.ts         # native tensor ömrü, bellek baskısı
    │   │   └── FrameBudget.ts         # kare bütçesini bölen yardımcı
    │   │
    │   ├── storage/                   # ── MODÜL 2 ──
    │   │   ├── CachePolicy.ts         # SAF eviction planı (test edilir)
    │   │   ├── CacheManager.ts        # RNFS adaptörü
    │   │   └── paths.ts               # yedeklenen/yedeklenmeyen dizin ayrımı
    │   │
    │   ├── age/                       # ── MODÜL 5 ──
    │   │   ├── AgePolicy.ts           # SAF yaş/yetenek mantığı (test edilir)
    │   │   ├── AgeGate.ts             # şifreli kayıt + kademe dağıtımı
    │   │   └── dateOptions.ts         # tekerlek seçenekleri (SAF)
    │   │
    │   ├── moderation/                # ── MODÜL 5 ──
    │   │   ├── ContentRating.ts       # SAF derecelendirme politikası
    │   │   ├── VisibilityShield.ts    # SAF görünürlük kararı
    │   │   ├── ContentClassifier.ts   # cihaz üstü sınıflandırıcı (fail-closed)
    │   │   └── Reporting.ts           # rapor + engelle (Guideline 1.2)
    │   │
    │   ├── support/                   # ── DESTEK ──
    │   │   ├── FeedbackComposer.ts    # SAF mailto oluşturucu (test edilir)
    │   │   └── DeviceProfile.ts       # kimlik OLMAYAN cihaz sınıfı
    │   │
    │   ├── billing/                   # ── MODÜL 3 ──
    │   │   ├── Products.ts            # plan tanımları (fiyat GÖSTERİLMEZ)
    │   │   ├── PricingPolicy.ts       # SAF paywall modeli (test edilir)
    │   │   ├── StoreCompliance.ts     # SAF uyumluluk denetimi (test edilir)
    │   │   ├── BillingService.ts      # RevenueCat -> StoreKit 2 / Play Billing
    │   │   ├── StoreManagement.ts     # yönetim/iade/Play mesajları köprüsü
    │   │   ├── Entitlements.ts        # yetki durumu + uzlaştırma kuralı
    │   │   └── EntitlementSync.ts     # sunucu doğrulaması + imzalı token
    │   │
    │   ├── i18n/                      # ── MODÜL 3 ──
    │   │   ├── index.ts               # dil algılama, RTL, fallback
    │   │   └── locales/               # tr en de es fr ja pt ar (53 anahtar)
    │   ├── ai/                        # ── MODÜL 4 ──
    │   │   ├── engine/
    │   │   │   ├── AiEngine.ts        # tek giriş kapısı: yetki+etik+yönlendirme
    │   │   │   ├── RoutingPolicy.ts   # SAF yerel/uzak kararı (test edilir)
    │   │   │   ├── ModelRegistry.ts   # yetenek -> model + bütünlük özeti
    │   │   │   ├── ModelStore.ts      # indirme, SHA-256 doğrulama, sürümleme
    │   │   │   ├── LocalInferenceRuntime.ts  # CoreML/TFLite oturum yönetimi
    │   │   │   ├── RemoteInferenceClient.ts  # pinlenmiş kanal + imzalı token
    │   │   │   └── EthicsConsent.ts   # telif/deepfake onay akışı
    │   │   └── pipelines/             # video, portre, üretken foto, şablon
    │   │
    │   ├── connectivity/              # ── MODÜL 4 ──
    │   │   ├── NetworkMonitor.ts      # çevrimiçi/çevrimdışı/ölçülü
    │   │   └── OfflineCapability.ts   # araç bazlı gerçek kullanılabilirlik
    │   │
    │   └── telemetry/                 # ── MODÜL 4 ──
    │       ├── Scrubber.ts            # SAF PII temizleyici (test edilir)
    │       └── AnonymousCrashReporter.ts  # kimliksiz rapor + son savunma hattı
    │
    ├── ios/
    │   ├── EvenGirl/
    │   │   ├── Info.plist             # ATS zorunlu, IDFA yok, izinler asgari
    │   │   └── Security/
    │   │       ├── IntegrityChecker.swift        # jailbreak/enjeksiyon/paketleme (puanlı)
    │   │       ├── AntiDebug.swift               # LLDB + Frida tespiti, sürekli izleme
    │   │       ├── PinnedSession.swift           # SPKI SHA-256 pinning (URLSession)
    │   │       ├── PinConfiguration.swift        # pin listesi (yedek pin zorunlu)
    │   │       ├── KeychainStore.swift           # ThisDeviceOnly, senkronizasyon yok
    │   │       ├── ObfuscatedConstants.swift     # ÜRETİLMİŞ — elle düzenlenmez
    │   │       ├── EvenGirlSecurityModule.swift   # RN köprüsü
    │   │       └── EvenGirlSecurityModule.m       # köprü makroları
    │   └── scripts/
    │       ├── obfuscate.sh                      # SwiftShield (+ opsiyonel OLLVM)
    │       └── verify-release-hardening.sh       # release yapılandırma kapısı
    │
    └── android/
        └── app/
            ├── build.gradle                      # R8 karartma + verifyReleaseHardening görevi
            ├── proguard-rules.pro                # karartma kuralları + log temizliği
            └── src/main/
                ├── AndroidManifest.xml           # asgari izin, AD_ID kaldırılmış
                ├── res/xml/
                │   ├── network_security_config.xml  # kullanıcı CA'sı güvenilmez + platform pinning
                │   └── data_extraction_rules.xml    # yedekleme/aktarım kapalı
                └── java/com/evengirl/app/
                    ├── billing/
                    │   ├── PlayBillingBridge.kt      # Play içi mesajlar, yönetim
                    │   └── PlayBillingPackage.kt
                    ├── inference/
                    │   ├── TFLiteRuntime.kt          # cihaz üstü çıkarım
                    │   └── InferencePackage.kt
                    ├── perf/
                    │   ├── EvenGirlPerformanceModule.kt  # PowerManager termal + pil
                    │   └── EvenGirlPerformancePackage.kt
                    └── security/
                    ├── IntegrityChecker.kt          # puan toplayıcı, eşik kararı
                    ├── RootDetector.kt              # 6 kategori sinyal
                    ├── DebuggerDetector.kt          # TracerPid, JDWP, Frida izleri
                    ├── SignatureVerifier.kt         # yeniden paketleme tespiti
                    ├── PinnedHttpClient.kt          # OkHttp CertificatePinner
                    ├── EncryptedPrefsStore.kt       # AES256-GCM + StrongBox
                    ├── ObfuscatedConstants.kt       # ÜRETİLMİŞ — elle düzenlenmez
                    ├── EvenGirlSecurityModule.kt     # RN köprüsü
                    └── EvenGirlSecurityPackage.kt    # modül kaydı
```

## 3.1 Marka ve kimlikler

| Alan | Değer |
|---|---|
| Görünen ad | **EVEN GIRL** |
| Yayıncı | **ARMANALABS** |
| Bundle / application id | `com.evengirl.app` |
| Abonelik ürün kimlikleri | `com.evengirl.app.pro.{weekly,monthly,annual}` |
| Native modül önekleri | `EvenGirl*` (Security, Performance, Inference, StoreKit, PlayBilling) |
| Destek adresi | `gokturkalazdaghan@gmail.com` |
| API / pin alan adı | `evengirl.app` — ⚠️ **yayın öncesi karar bekliyor** (bkz. aşağıda) |

> ⚠️ **Alan adı henüz değiştirilmedi.** `api.evengirl.app`, `crash.evengirl.app`
> ve yasal bağlantılar eski markadan kalmadır. Hangi alan adının sahibi
> olduğunuzu bilemediğim için tahmin etmedim. Değiştirmek DÖRT dosyada tek bir
> düzenlemedir ve `npm run verify:security` tutarsızlığı derhal yakalar:
>
> - `src/core/config/env.ts`
> - `ios/EvenGirl/Security/PinConfiguration.swift`
> - `android/client_mobile/src/main/java/com/evengirl/app/security/PinnedHttpClient.kt`
> - `android/client_mobile/src/main/res/xml/network_security_config.xml`
>
> Ayrıca `src/billing/Products.ts` içindeki yasal bağlantılar. Mağaza
> incelemesinde, yasal bağlantıların uygulama ve yayıncı adıyla tutarlı
> olması beklenir — bu yüzden **yayın öncesi engelleyici** madde sayılmalıdır.

## 4. Katman kuralları

Bağımlılıklar **yalnızca aşağı doğru** akar; ihlali lint kuralıyla kırılır.

```
        ui/  ─────────────┐
                          ▼
   navigation/ ──▶  ai/ · billing/ · storage/ · connectivity/
                          ▼
              security/ · performance/ · telemetry/
                          ▼
                        core/
```

- `core/` hiçbir üst katmanı import etmez.
- `security/` yalnızca `core/`'a bağlıdır — güvenlik kararı, iş mantığından bağımsız kalmalıdır.
- `ui/` hiçbir zaman native modülü doğrudan çağırmaz; her zaman bir servis katmanından geçer.

## 5. Açılış akışı

```
index.js
  ├─ gesture-handler kurulumu           ← kaydırma jestlerinin native tarafı
  ├─ installCrashReporter()             ← React'ten ÖNCE: erken hatalar da yakalansın
  └─ AppRegistry.registerComponent
       └─ App.tsx
            ├─ SecurityGate.verify()    ← native bütünlük kontrolü (~30-60 ms)
            │    ├─ compromised → SecurityBlockedScreen  (ÇÖKMEZ, kilitlenir)
            │    └─ temiz       → sürekli izleme başlar
            │                     └─ runtime ihlali → aynı kilit ekranı
            └─ AppLifecycle.start()     ← yalnızca kontrol geçtiyse
                 ├─ dizinler + i18n + ağ izleme + termal izleme
                 ├─ BillingService.configure() + yetki tazeleme
                 └─ kaydırmalı kabuk + etik onay host'u
```

Uygulama **her ön plana dönüşte** kontrolü tekrarlar: arka plandayken cihaza debugger bağlanmış olabilir.

## 6. Build kapıları

Yapılandırma kaymasını code review'a bırakmayıp derlemeyi kırıyoruz:

| Kapı | Çalıştığı yer | Neyi engeller |
|---|---|---|
| `npm run verify:security` | CI + `prebuild:release` | Üretilmiş sabitlerin bayatlaması; 4 kaynaktaki SSL pin listelerinin ayrışması; yedek pin eksikliği; 90 günden yakın pin-set son kullanma tarihi |
| `npm run typecheck` | CI | Tip hataları (strict + `noUncheckedIndexedAccess`) |
| `npm run verify:i18n` | CI + `prebuild:release` | Eksik çeviri anahtarı; **kayıp `{{price}}` yer tutucusu** (Guideline 3.1.2 ihlali); boş çeviri |
| `npm run verify:privacy` | CI + `prebuild:release` | Yasaklı kimlik/izleme API'si, analitik/reklam paketi, izleme izni, rapor şemasında kimlik alanı |
| `npm test` | CI + `prebuild:release` | Termal merdiven, önbellek eviction, fiyat/deneme mantığı, paywall uyumluluğu, PII temizliği, yönlendirme kararı |
| `verifyReleaseHardening` (Gradle) | `assembleRelease` / `bundleRelease` | `minifyEnabled false`, `-dontobfuscate`, eksik `networkSecurityConfig`, `debuggable=true`, doldurulmamış imza özeti/pin |
| `verify-release-hardening.sh` | Xcode Release | Yer tutucu pin, yedek pin eksikliği, `NSAllowsArbitraryLoads`, `get-task-allow=true` |

## 10. Modüler repo mimarisi ve modüller arası iletişim

```
                          ┌─────────────────────┐
                          │   client_mobile/    │
                          │  RN + TS, native    │
                          └──────────┬──────────┘
                                     │ SSL pinned HTTPS
                                     │ x-app-user-id (anonim)
                                     │ x-entitlement (imzalı token)
                                     ▼
                          ┌─────────────────────┐
                          │      server.js      │
                          │   router montajı    │
                          └──────────┬──────────┘
          ┌──────────────┬───────────┼───────────┬──────────────┐
          ▼              ▼           ▼           ▼              ▼
  ┌──────────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐ ┌──────────────┐
  │   billing_   │ │  export_ │ │ social_│ │  core_   │ │   reward_    │
  │infrastructure│ │   gate   │ │gamific.│ │ gateway  │ │  automation  │
  └──────┬───────┘ └────┬─────┘ └───┬────┘ └────┬─────┘ └──────┬───────┘
         │              │            │           │              │
         │  entitlement │            │           │              │
         └──────────────┴────────────┴───────────┘              │
                        requireProEntitlement                    │
                                     ▲                           │
                                     └───── hediye PRO ──────────┘
                                            (haftalık ödül)
```

### Modül sorumlulukları

| Modül | Sorumluluk | Diğer modüllerle ilişkisi |
|---|---|---|
| `client_mobile/` | Arayüz, güvenlik çekirdeği, yerel depolama, cihaz üstü çıkarım | Tüm backend uçlarını SSL pinlenmiş kanaldan çağırır |
| `core_gateway/` | Çift modlu stüdyo ajanları (Manuel & Botox + Even Girl Generate), Claude prompt önbelleği, **24 saat SLA moderasyon kuyruğu ve ban-hammer** | `billing_infrastructure`'dan yetki doğrular; moderasyon uçları ayrı personel jetonu ister |
| `export_gate/` | Tek ücretsiz indirme hakkı, anti-capture tetikleyicisi, tam çözünürlük render | `billing_infrastructure`'dan PRO kontrolü |
| `social_gamification/` | Keşfet akışı, 24s hikayeler (PRO), şifreli DM (PRO), **zorunlu yükleme tarama kapısı**, çelenk dağıtımı | `reward_automation`'a etkileşim puanı yazar; `core_gateway/moderation` kuyruğunu besler |
| `reward_automation/` | Redis ZSET puanlama, Pazartesi 00:00 UTC cron, ilk 20'ye mağaza teklif kodu | Yetkiye yazmaz; kodu mağaza üretir, `billing_infrastructure` sonucu webhook'tan okur |
| `billing_infrastructure/` | StoreKit 2 / Play Billing webhook senkronu, imzalı entitlement token | Tüm modüllerin yetki kaynağı |

### Sözlükler tek taraftan sahiplenilir

İstemci ile sunucunun paylaştığı her sözlük **istemcinin tip birliğinde**
tanımlıdır; sunucu ona uyar ve bir test uyumu zorunlu kılar. Sözlük iki
yerde ayrı ayrı yazıldığında sessizce ayrışıyordu:

| Sözlük | Sahip | Kapı |
|---|---|---|
| İçerik derecesi | `moderation/ContentRating.ts` | `tests/moderationProxy.test.js` |
| Yetenek | `ai/engine/ModelRegistry.ts` | `tests/capabilityCoverage.test.js` |
| Rapor gerekçesi → SLA | `social_gamification/social.js` | `tests/reasonCoverage.test.js` |

Yetenek sözlüğünde bu gerçekten olmuştu: sunucu listesi ürünün **iki amiral
modunu** (Manuel & Botox Stüdyo, Even Girl Generate) hiç tanımıyordu — sekiz
yetenek eksikti ve bu adımları içeren hiçbir şablon yayınlanamıyordu.

Kapı testleri listeyi **kopyalamaz**, kaynak dosyayı okur veya kararı
çalıştırır: elle yazılmış bir liste, listenin kendisinin eskimesine açıktır.

### Tek yetki kaynağı

`billing_infrastructure/entitlements.js` içindeki `requireProEntitlement`
middleware'i, PRO gerektiren HER uçta kullanılır. Yetki kontrolünü modüllere
dağıtmak, altı ay sonra birinin kontrolsüz bir uç eklemesi demektir.

### Ödül akışı

`reward_automation` **hiçbir yetki alanına yazmaz**. Backend'in kendi
entitlement kaydına süreli "hediye PRO" eklemek — yani `pro_expiry_date`'i
ileri tarihe çekmek — mağazayı atlayarak abonelik hakkı dağıtmak olurdu
(Guideline 3.1.1 / Play Payments) ve abonelik durumuna ikinci bir yazar
ekleyerek tek gerçek kaynağı çatallardı.

Bunun yerine ödül, mağazanın kendi tanıtım kodu mekanizmasıyla dağıtılır:

```
scoring.js → ilk 20 ──► promoCodes.js ──► storeClients.js
                                              ├─ App Store Connect: tek kullanımlık teklif kodu
                                              └─ Play Developer API: onetimecode
                                                        │
                            push (kod DEĞİL, çeviri anahtarı + derin bağlantı)
                                                        │
                            RewardRedemption.ts → native kullanım kâğıdı
                                                        │
                            mağaza işlemi → RevenueCat webhook → entitlement
```

Yetki yine yalnızca gerçek bir mağaza işleminden doğar. Ayrıntı:
[`docs/BILLING.md` §7](BILLING.md).

Cron çift çalışmaya karşı iki katmanla korunur: hafta düzeyinde `SET NX`
kilidi ve kullanıcı düzeyinde `issued` işareti. Bir kullanıcı için mağaza
çağrısı başarısız olursa yalnızca o işaret geri alınır; diğerleri etkilenmez
ve cron sıfırdan farklı çıkış kodu döndürür.

## Kalıcılık katmanı

Depo fonksiyonları önceden `console.log` yazıp `null` döndüren **örnek**
fonksiyonlardı — yani hiçbir veri saklanmıyordu. Artık gerçek SQL:

```
persistence/
  schema.sql            18 tablo, iki motorda da çalışan taşınabilir alt küme
  driver/sqlite.js      node:sqlite — BAĞIMLILIK YOK, testlerin çalıştığı motor
  driver/postgres.js    pg — çok örnekli üretim dağıtımı
  repositories.js       47 depo fonksiyonu, gerçek sorgular
  registry.js           istek anında çözülen enjeksiyon noktası
  migrate.js            şema uygulayıcı
```

### Neden iki sürücü, tek SQL

Sorgular **bir kez** yazılır; sürücüler yalnızca yürütme biçiminde ayrışır.
İki ayrı sorgu seti yazmak, ikisinin zamanla ayrışması demektir. Tek fark
yer tutucu biçimidir (`?` ↔ `$1`) ve çeviri tek bir yerde yapılır —
**dize içindeki `?` karakterine dokunmadan**, çünkü `WHERE note = 'neden?'`
içindeki soru işareti yer tutucu değildir.

### Neden testler SQLite üzerinde çalışıyor

`node:sqlite` Node 22 ile birlikte gelir. Depo katmanı **gerçek SQL**
üzerinde test edilebiliyor — sahte bir bellek nesnesi üzerinde değil.
Sahte depo ile test etmek SQL'in kendisini test etmemektir: bir sözdizimi
hatası, eksik indeks veya yanlış JOIN sessizce geçerdi.

### Enjeksiyon istek anında çözülür

Router'lar `getRepositories()`'i **istek işlenirken** çağırır, modül
yüklenirken değil. İki şeyi mümkün kılar: `server.js` açılışta gerçek
veritabanını bağlayabilir (PostgreSQL kurulumu asenkrondur, modül yükleme
anında beklenemez) ve testler her senaryo için temiz bir veritabanı verir.

`server.js` **önce veritabanını hazırlar, sonra dinlemeye başlar**. Ters
sıra, şema hazır olmadan istek kabul etmek demektir: ilk istekler "table
not found" ile 500 döner ve sebebi log'da kaybolur.

### Sessiz düşüş yok

`NODE_ENV=production` iken `DATABASE_URL` yoksa uygulama **başlamaz**.
Bellek içi veritabanıyla üretimde çalışmak, her yeniden başlatmada tüm
verinin kaybolması demektir. `DATABASE_URL` PostgreSQL adresiyse ve `pg`
kurulu değilse hata verilir — SQLite'a sessizce düşmek, yanlış
veritabanına yazmaktır.
