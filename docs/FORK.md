# Bu depo nereden geldi

`EVENG-RL` (`com.evengirl.app`), `gokturkalazdaghan-dot/com.evenai.app`
deposunun `3d6e99b` commit'inden türetildi.

Kod, testler, native köprüler ve mimari kararların tamamı oradan geldi.
Bu dosya, **neyin değiştiğini ve neyin hâlâ ana depodan devralınan borç
olduğunu** yazıyor — çünkü bir çatal (fork), kopyalandığı andaki eksikleri
de birlikte kopyalar ve bunu kimse hatırlamazsa iki depoda birden aynı
hata iki kez aranır.

## Değişenler — tamamı mekanik

| Nereden | Nereye | Kapsam |
|---|---|---|
| `com.evenai.app` | `com.evengirl.app` | Android `applicationId` + `namespace`, iOS `CFBundleIdentifier`, Java paket ağacı, mağaza ürün kimlikleri |
| `EvenAI` | `EvenGirl` | Kotlin/Swift sınıf adları, native modül adları, iOS hedef dizini, `app.json` `name` |
| `EVEN AI` / `Even AI` | `EVEN GIRL` / `Even Girl` | Görünen uygulama adı, 20 dildeki çeviri dosyaları, belgeler |
| `even-ai-app` / `even-ai-backend` | `even-girl-app` / `even-girl-backend` | npm paket adları |

**Değişmeyenler:** yayıncı ARMANALABS, `armanalabs.com` alan adları, SSL
pin yapılandırması, fiyat kademeleri, gizlilik ve güvenlik politikaları.

Kopyalamadan sonra doğrulandı: 284 sunucu testi, 652 istemci testi, tip
denetimi temiz, `verify-native-project` ve `verify-store-products` OK.

## SİZİN YAPMANIZ GEREKENLER

Bunlar kod değil, hesap işi — ben yapamam ve yapmamalıyım:

1. **App Store Connect / Play Console'da yeni uygulama kaydı.**
   `com.evengirl.app` için ayrı bir kayıt gerekir. Ürün kimlikleri
   (`com.evengirl.app.pro.weekly` / `.monthly` / `.annual`) Apple
   hesabınızda **benzersiz olmak zorunda** — bu yüzden EVEN AI'ınkilerle
   çakışmayacak biçimde ayrıldılar.
2. **Ayrı RevenueCat projesi ve API anahtarları.** İki uygulama tek
   projede yönetilirse bir uygulamanın aboneliği diğerinde PRO açar.
   `tools/set-release-values.mjs` ile girin.
3. **Ayrı imzalama anahtarı** (Android keystore, iOS sertifikası).
   Anahtarı siz üretip siz saklayacaksınız.
4. **Uygulama adı ve marka incelemesi.** "EVEN GIRL" adıyla 18+ yaş kapısı
   ve NSFW sınıflandırma aynı üründe bulunuyor. Bu bileşim App Store
   Guideline 1.1.4 (aşırı cinsel içerik) ve 1.1.1 (çocuk güvenliği)
   incelemesinde ana depodan **daha sıkı** değerlendirilir. Mağaza
   listelemesindeki ad, ikon ve ekran görüntülerinin yaş derecelendirmesiyle
   tutarlı olması gerekir; aksi halde ret sebebi olur.

## DEVRALINAN BORÇLAR

Bunlar ana depoda da açık. Çatal onları düzeltmedi, taşıdı.

- **iOS derlenmiyor.** `ios/*.xcodeproj` yok; 35 Swift/ObjC dosyasının
  hiçbiri bir derleme hedefine ait değil ve `pod install` çalışamaz.
  `verify-release-ready.mjs` bunu açık BUILD BLOCKER olarak bildiriyor.
- **Altı modül kullanıcıya ulaşmıyor.** `EvenGenerate`, `ContentClassifier`,
  `ActivityPrivacy`, `DmPolicy`, `Lut`, `TimelineEdits` — kodu var, testi
  yeşil, hiçbir ekrandan çağrılmıyor. Liste
  `client_mobile/__tests__/ModuleReachability.test.ts` içinde gerekçeleriyle
  duruyor ve biri bağlandığı anda test kırmızıya döner.
- **Model ikilileri yok.** `ModelRegistry` gerçek ağırlık dosyası olmadan
  çalışıyor; AI yetenekleri cihazda henüz koşturulmadı.
- **Üretim yapılandırması boş.** `verify-release-ready.mjs` çıktısındaki
  liste, release build'i bilerek durduruyor.

Ana depoda bunlardan biri düzelirse buraya elle taşınması gerekir —
otomatik bir senkron yok.
