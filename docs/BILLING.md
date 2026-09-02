# EVEN GIRL — Abonelik, Fiyatlandırma ve Mağaza Uyumluluğu (Modül 3)

## 1. Altyapı kararı: RevenueCat mi, doğrudan native mi?

**Kullanılan:** RevenueCat SDK'sı.

Bu, StoreKit 2 / Play Billing'in **yerine geçen** bir ödeme sistemi değildir.
SDK iOS'ta StoreKit 2'yi, Android'de Play Billing Library'yi çağırır; tüm
tahsilat Apple ve Google üzerinden yürür. Harici ödeme yönlendirmesi yoktur
(Guideline 3.1.1).

| Neden bu katman | Açıklama |
|---|---|
| Backend zaten kurulu | `billing_infrastructure/revenuecat-webhook.js` bu repoda mevcut. İkinci bir doğrulama hattı kurmak **iki farklı doğruluk kaynağı** yaratır — mümkün olan en kötü seçenek |
| Makbuz doğrulama riski | Yenileme takibi, grace period ve iade yönetimi elle yazıldığında sessiz gelir kaybı üretir |
| Platform farkı tek yerde | Play'in base plan/offer modeli ile Apple'ın intro offer modeli arasındaki fark SDK'da biter |

### Native köprüler ne yapıyor?

RevenueCat'in **kapsamadığı**, mağaza politikasının gerektirdiği işler —
satın alma akışını tekrarlamıyorlar:

| Köprü | İş | Neden gerekli |
|---|---|---|
| `StoreKitBridge.swift` | `Transaction.updates` dinleyicisi | Uygulama **kapalıyken** onaylanan "Ask to Buy" (aile onayı) işlemleri; bu olmadan kullanıcı ödediği hâlde Pro olmaz |
| `StoreKitBridge.swift` | `AppStore.showManageSubscriptions` | Guideline 3.1.2: iptal kolay bulunabilir olmalı |
| `StoreKitBridge.swift` | `beginRefundRequest` (iOS 15+) | Uygulama içi iade; 1 yıldızlı yorum oranını düşürür |
| `PlayBillingBridge.kt` | `showInAppMessages` | Kartı reddedilen abone grace period'a düşer; bu çağrı yapılmazsa **sessizce kaybedilir** |
| `PlayBillingBridge.kt` | Abonelik yönetim derin bağlantısı | Play politikası: iptal kolay bulunabilir olmalı |

## 2. Fiyatlandırma

| Plan | Referans (USD) | Ürün kimliği | Deneme |
|---|---|---|---|
| Haftalık | 2.99 | `com.evengirl.app.pro.weekly` | 1 gün |
| Aylık | 6.99 | `com.evengirl.app.pro.monthly` | 1 gün |
| Yıllık | 39.99 | `com.evengirl.app.pro.annual` | 1 gün |

> **Bu USD değerleri hiçbir yerde GÖSTERİLMEZ.** App Store Connect / Play
> Console'da hangi fiyat kademesinin seçileceğini belgelerler, o kadar.

### Yerelleştirilmiş fiyat: neden kendi dönüşümümüzü yapmıyoruz

Kullanıcıya gösterilen her fiyat, mağazanın döndürdüğü `priceString`
değeridir. Apple ve Google her ülke için kendi kur ve vergi dönüşümünü uygular.
Sabit `"$2.99"` göstermek üç sorunu birden yaratır:

1. Türkiye'de TL, Japonya'da JPY gösterilmesi gerekirken dolar görünür,
2. Mağaza fiyatı güncellendiğinde uygulama **yalan söyler**,
3. Gösterilen fiyat ≠ tahsil edilen fiyat → **Guideline 3.1.2 ret sebebi**.

Karşılaştırma satırları (`haftada ~X`) da mağazanın hesapladığı
`pricePerWeekString`'den gelir; kendi bölme işlemimiz farklı ay uzunlukları ve
yerel vergi yuvarlamaları yüzünden mağazanınkinden farklı bir sayı üretirdi.

### Tasarruf yüzdesi

Yıllık planın haftalığa göre tasarrufu **aşağı yuvarlanır** (%56.6 → "%56").
"%57" yazıp %56.6 tasarruf ettirmek abartılı iddiadır. Farklı para birimindeki
iki ürün karşılaştırılmaz — bölmek anlamsız bir yüzde üretir.

## 3. Ücretsiz deneme: uygunluk neden mağazaya sorulur

Deneme hakkını kendi tahminimizle ("daha önce satın alma var mı") belirlemek
yanlıştır: aile paylaşımı, farklı ürün ailesinden geçiş ve iade sonrası
durumlarda mağazanın cevabı farklıdır.

`Purchases.checkTrialOrIntroductoryPriceEligibility` kullanılır. **Uygunluk
bilinmiyorsa deneme GÖSTERİLMEZ** — olmayan bir teklifi vaat edip satın alma
anında tam ücret tahsil ettirmek, kullanıcı için en kötü sürprizdir ve mağaza
şikâyetlerinin klasik sebebidir.

Ücretli tanıtım fiyatı (ör. ilk ay 0.99) **deneme sayılmaz**; "ücretsiz"
demek yanıltıcı beyandır. `trialDaysOf` bunu ayırt eder.

## 4. Yetki (entitlement): iki katmanlı doğruluk

```
  Mağaza / RevenueCat  ──►  UI kilitleri (hızlı, çevrimdışı çalışır)
           │
           ▼
  Backend entitlement kaydı  ──►  ücretli SUNUCU çağrıları (tek gerçek kaynak)
           ▲
           │
  RevenueCat webhook (billing_infrastructure/revenuecat-webhook.js)
```

| Katman | Neye karar verir | Kırılabilir mi |
|---|---|---|
| İstemci | UI kilitleri açılsın mı | **Evet** — rootlu cihazda `isPro = true` yapmak dakikalar sürer |
| Sunucu | Ücretli AI çağrısı çalışsın mı | Hayır — istemcinin iddiasına bakmaz |

**Çakışma kuralı:** Sunucu her iki yönde de kazanır. Sunucuya **ulaşılamıyorsa**
istemci yanıtı kullanılır — uçaktaki bir aboneye "aboneliğiniz yok" demek,
kaçak kullanıma izin vermekten daha kötüdür.

### Entitlement token'ı

`GET /v1/entitlements/:appUserId` kısa ömürlü (15 dk) HMAC imzalı bir token
döndürür. Ücretli uçlar her istekte veritabanına gitmek yerine imzayı doğrular.

- Token ömrü **aboneliğin bitişini aşamaz**.
- Token şifreli depoda tutulur (Keychain / EncryptedSharedPreferences).
- Payload'daki `pro` alanını `true` yapmak imza doğrulamasını bozar — bu senaryo
  gerçek HTTP üzerinden test edildi (401 döner).

JWT kütüphanesi kullanılmadı: ihtiyaç duyulan tek şey HMAC'tir ve JWT'nin
`alg: none` sınıfı tuzaklarını taşımaya gerek yok.

### Gizlilik

`app_user_id`, RevenueCat'in ürettiği **anonim** kimliktir — e-posta, cihaz
kimliği veya reklam kimliği değil. "Hangi satın alma kaydı" sorusunu yanıtlar,
"kim" sorusunu değil. Loglara ham hâliyle yazılmaz (SHA-256'nın ilk 8 karakteri).

## 5. Paywall: uyumluluk bir iddia değil, çalışan bir kontrol

`StoreCompliance.auditPaywall` her paywall oluşturulduğunda çalışır. Eksik
unsur DEBUG build'de konsola hata basar ve **testte kırmızıya döner**.

| Kod | Ne yakalar |
|---|---|
| `MISSING_PRICE` | Mağaza yanıtı eksik → ekranda boşluk |
| `MISSING_PERIOD` | Faturalama dönemi belirtilmemiş |
| `MISSING_DISCLOSURE` | Otomatik yenileme açıklaması yok |
| `TRIAL_WITHOUT_RENEWAL_TERMS` | "1 gün ücretsiz" var ama sonrası yazmıyor |
| `MISSING_RESTORE` | Geri yükleme düğmesi yok |
| `MISSING_TERMS_LINK` / `MISSING_PRIVACY_LINK` | Yasal bağlantı geçersiz |
| `EXTERNAL_PAYMENT_LINK` | Harici ödeme yönlendirmesi (Guideline 3.1.1) |
| `SAVINGS_WITHOUT_BASELINE` | Doğrulanamayan tasarruf iddiası |
| `NO_PLANS_AVAILABLE` | Boş paywall → "satın alma çalışmıyor" reddi |

### Kasıtlı olarak YAPILMAYANLAR

| Yapılmadı | Neden |
|---|---|
| Geri sayım / sahte aciliyet | Her iki mağazada da ret sebebi |
| Gizli veya geciktirilmiş kapatma düğmesi | Ret sebebi; kapatma anında erişilebilir |
| Üstü çizili sahte "eski fiyat" | Yanıltıcı fiyatlandırma |
| Reklam (banner/interstitial/ödüllü) | Ürün kararı: uygulamada hiç reklam yok. `AD_ID` izni manifest'ten açıkça kaldırıldı |

### İptal bir hata değildir

Kullanıcı satın almayı iptal ettiğinde hata diyaloğu **gösterilmez** — bilinçli
bir kararı arıza gibi sunmak, güveni zedeler.

### Geri yükleme her zaman açık sonuç döndürür

"Hiçbir şey bulunamadı" da bir sonuçtur ve kullanıcıya söylenir. Sessiz kalmak,
hakemin geri yüklemeyi **bozuk** saymasına yol açar — ve hakemler bunu her
incelemede dener.

## 6. Yerelleştirme (i18n)

**8 dil:** tr, en, de, es, fr, ja, pt, ar (RTL). Referans dil `en`.

### En tehlikeli çeviri hatası

Çevirmenin `{{price}}` yer tutucusunu düşürüp yerine sabit bir tutar yazması.
Sonuç: o dildeki kullanıcı **yanlış para birimi** görür veya fiyat hiç
görünmez — ve bunu yalnızca o dili konuşan bir hakem fark eder.

`tools/verify-i18n.mjs` bunu build zamanında yakalar:

| Kontrol | Ne yakalar |
|---|---|
| A | Eksik/fazla anahtar |
| B | Yer tutucu uyuşmazlığı (**kritik**) |
| C | Boş çeviri |
| D | Yasal metinlerde zorunlu yer tutucuların varlığı |

Negatif testle doğrulandı: Japonca açıklamadan `{{price}}` düşürüldüğünde
kontrol kırmızıya döndü.

### Diğer kurallar

- Cihaz dili okunur ama **sunucuya gönderilmez** — dil + saat dilimi birleşimi
  parmak izi oluşturur.
- `escapeValue: false` — React zaten kaçış yapar; ikinci kaçış Türkçe ve
  Fransızca kesme işaretlerini bozar.
- Eksik anahtar loglanır, kullanıcıya **anahtar adı gösterilmez**.
- Güvenlik kilidi ekranı i18n'e bağımlı değildir: çeviri yüklemesi başarısız
  olsa bile görünmelidir.

> **Yasal metinler için not:** Buradaki 8 dildeki abonelik açıklamaları
> teknik olarak doğrudur ve zorunlu unsurları içerir, ancak **hukuki
> inceleme görmemiştir**. Yayın öncesi, hedef pazarların tüketici mevzuatı
> açısından gözden geçirilmelidir (özellikle AB'de cayma hakkı metinleri).

## 7. Ödül aboneliği: neden veritabanına `pro_expiry_date` YAZILMIYOR

Even Girl / Even Boy haftalık sıralamasının ödülü (Top 1-10 → 7 gün, Top 11-20
→ 3 gün ücretsiz EVEN PRO) **mağaza dışı bir yetki yazımı değildir.**

### Kırılan kural

Backend'de `pro_expiry_date` alanını ileri tarihe çekmek, uygulamanın
StoreKit / Play Billing'i **atlayarak** kendi abonelik hakkını dağıtması
demektir. İki sonuç doğurur:

1. **Guideline 3.1.1 / Play Payments** ihlali — abonelik hakkı yalnızca
   mağaza işlemiyle doğar. Ödül olarak dahi olsa, uygulamanın kendi
   veritabanından "abone" üretmesi mağaza dışı yetki dağıtımıdır.
2. **Tek gerçek kaynağın çatallanması** — abonelik durumu bir yandan
   RevenueCat webhook'undan, bir yandan ödül işçisinden yazılır. İki yazar
   aynı alanı farklı doğrularla günceller; yenileme, iade ve grace period
   akışları sessizce bozulur.

### Uygulanan model

Ödül, mağazanın kendi tanıtım kodu mekanizmasıyla dağıtılır. Yetki yine
**yalnızca** mağaza işleminden doğar; ödül işçisi sadece kodu üretir ve
kullanıcıya ulaştırır.

```
  reward_automation/cron.js  (Pazartesi 00:00 UTC)
        │
        ├─ scoring.js ......... Redis ZSET → haftalık ilk 20
        │
        ├─ promoCodes.js ...... kademe → mağaza teklif kimliği eşlemesi
        │       │
        │       ├─ storeClients.js → App Store Connect
        │       │      POST /v1/subscriptionOfferCodeOneTimeUseCodes
        │       │
        │       └─ storeClients.js → Google Play Developer API
        │              POST .../monetization/onetimecodes
        │
        ├─ push ............... kod DEĞİL, çeviri anahtarı + derin bağlantı
        │
        └─ recordAward ........ denetim kaydı (yalnızca kod parmak izi)

  client_mobile/src/billing/RewardRedemption.ts
        │
        ├─ iOS  → AppStore.presentOfferCodeRedeemSheet (native OS kâğıdı)
        ├─ And. → play.google.com/redeem derin bağlantısı
        │
        └─ BillingService.refresh() → yetki mağazadan geri okunur
```

| Kademe | Gün | App Store teklif kimliği | Play teklif kimliği |
|---|---|---|---|
| Top 1-10 | 7 | `evengirl_pro_7day_free` | `evengirl-pro-7day-free` |
| Top 11-20 | 3 | `evengirl_pro_3day_free` | `evengirl-pro-3day-free` |

### Kodun kendisi neden hiçbir yerde görünmüyor

Tek kullanımlık bir teklif kodu, taşıyıcıya değer taşır. Bu yüzden:

- **Push yükünde kod yok.** Push yalnızca `titleKey`, `bodyKey`, `params` ve
  derin bağlantı taşır; metin istemcide çevrilir. Push yükleri hem OS
  bildirim merkezinde hem de sağlayıcı loglarında birikir.
- **Denetim kaydında kod yok.** `recordAward` yalnızca `codeFingerprint`
  (SHA-256'nın ilk 8 karakteri) yazar. "Bu kullanıcıya hangi kod gitti"
  sorusu kanıtlanabilir kalır, kod yeniden üretilemez.
- **`GET /rewards/pending` kodu değil `redemptionUrl`'i döndürür.** İstemci
  kodu asla göremez; bağlantıyı doğrudan mağazanın kullanım kâğıdına açar.

### Kademe tablosu iki yerde yaşıyor

Aynı tablo hem istemcide (`LeaderboardPolicy.ts` — kullanıcıya "ilk 10'a
girersen 7 gün" diyen yer) hem worker'da (`rewardWorker.js` — kodu gerçekten
dağıtan yer) tanımlı. Ayrıştıklarında **kullanıcıya söylenen ile dağıtılan
farklı olur** ve kullanıcı bunu ancak ödülü gelmeyince anlar.

`tests/rewardContract.test.js` üç bağı birden kilitler:

| Kontrol | Ne yakalar |
|---|---|
| İki tablo birebir aynı | Bir tarafın güncellenip diğerinin unutulması |
| Her sürenin iki mağazada da teklif kimliği var | `OFFER_IDS`'e eklemenin unutulması — kod Pazartesi 00:00 cron'unda üretilemez |
| Kademeler çakışmaz, boşluk bırakmaz | 10. ve 12. sıra arasında ödülsüz bir aralık |
| Üst kademe daha uzun ödül verir | Sıralamanın ters çevrilmesi |
| Sorgu limiti en düşük kademeyi kapsar | Alt kademedeki kazananların hiç sorgulanmaması |
| Push anahtarları sekiz dilde de var | Kullanıcının ham anahtar adı görmesi |
| Push yükü ham kod taşımıyor | Kodun bildirim merkezinde ve sağlayıcı loglarında birikmesi |

### Sorgu limiti neden `Math.max` ile türetiliyor

Limit önceden `REWARD_TIERS[son].maxRank` ile hesaplanıyordu — yani dizinin
**sıralı olduğunu varsayıyordu**. Kademeler yeniden sıralansaydı limit 20
yerine 10 olur, 11-20 arası kazananlar hiç sorgulanmadığı için ödüllerini
sessizce alamazdı. Üretimde ancak "ödülüm gelmedi" şikâyetiyle fark edilirdi.

### Çift dağıtım koruması

| Katman | Mekanizma |
|---|---|
| Hafta kilidi | `SET NX` — aynı hafta için ikinci çalıştırma hiç başlamaz |
| Kullanıcı işareti | `issuedKey(week, userId)` — kısmi başarısızlık sonrası yeniden çalıştırmada aynı kullanıcıya ikinci kod çıkmaz |
| Hata geri alma | Mağaza çağrısı başarısız olursa işaret `del` edilir → o kullanıcı bir sonraki denemede yeniden ele alınır |
| Kod tarafı | `maxRedemptions: 1`, 30 gün TTL |

Bir kullanıcı için mağaza çağrısı başarısız olduğunda diğer 19 kullanıcı
etkilenmez; `cron.js` kısmi başarısızlıkta **sıfırdan farklı** çıkış kodu
döndürür, böylece zamanlayıcı sessizce başarılı saymaz.

### Kullanıcı zaten aboneyse

Teklif kodu mağaza tarafında mevcut aboneliğe uygulanır (Apple'da kalan süreye
eklenir, Play'de mevcut base plan'a uygulanır). Bu davranış mağazanın
sorumluluğundadır ve uygulama tarafından taklit edilmez.

## 8. Sürüm öncesi kontrol listesi

- [ ] `npm run verify` yeşil (güvenlik + i18n + tip + test)
- [ ] App Store Connect'te üç ürün ve 1 günlük intro offer tanımlı
- [ ] Play Console'da üç base plan ve offer tanımlı
- [ ] RevenueCat'te `pro` entitlement'ı üç ürüne de bağlı
- [ ] Webhook URL'i ve `REVENUECAT_WEBHOOK_AUTH_HEADER` üretimde ayarlı
- [ ] `JWT_SECRET` üretimde güçlü ve rastgele
- [ ] Sandbox hesabıyla: satın alma → geri yükleme → iptal → yeniden satın alma
- [ ] **Deneme hakkı kullanılmış** bir hesapta paywall'ın deneme vaat etmediği doğrulandı
- [ ] En az bir RTL (ar) ve bir CJK (ja) dilinde paywall yerleşimi kontrol edildi
- [ ] App Store Connect'te `evengirl_pro_7day_free` ve `evengirl_pro_3day_free` teklif kodları tanımlı
- [ ] Play Console'da `evengirl-pro-7day-free` ve `evengirl-pro-3day-free` tanıtım teklifleri tanımlı
- [ ] `APPSTORE_ISSUER_ID` / `APPSTORE_KEY_ID` / `APPSTORE_PRIVATE_KEY` / `APPLE_APP_ID` ve Play servis hesabı (`PLAY_ACCESS_TOKEN`, `ANDROID_PACKAGE_NAME`) üretimde ayarlı
- [ ] Ödül işçisi kuru çalıştırmada denetim kaydına **kod değil parmak izi** yazdığı doğrulandı
- [ ] Yasal metinler hukuki incelemeden geçti

## Mağaza ürünleri tek kaynaktan tanımlanır

`store/products.json` — App Store Connect ve Play Console'da açılacak
ürünlerin eksiksiz tanımı: abonelik kimlikleri, referans fiyatlar, teklif
kodu kimlikleri, abonelik grubu, entitlement adı ve inceleme notları.

`tools/verify-store-products.mjs` bu dosyayı **uygulamanın beklediği**
kimliklerle karşılaştırır. Ayrıştıklarında ne olur:

| Ayrışma | Kullanıcı ne görür |
|---|---|
| Ürün kimliği | "Satın Al"a basar, mağaza ürünü bulamaz, **hiçbir şey olmaz** |
| Teklif kodu kimliği | Ödül kodu Pazartesi 00:00 cron'unda üretilemez |
| Paket kimliği | Hiçbir ürün yüklenmez |
| Referans fiyat | Belge yalan söyler (fiyat mağazadan gelir, ama kayıt bozulur) |

Dördü de mutasyon testinden geçirildi; her biri kapıyı kırmızıya döndürüyor.

**Abonelik grubu kritik:** üç plan aynı grupta olmalı. Farklı gruplarda
olurlarsa kullanıcı üçüne birden abone olabilir.

**Entitlement üç ürüne de bağlanmalı:** biri eksik kalırsa o planı alan
kullanıcı ödeme yapar ama PRO olmaz.
