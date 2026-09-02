# Google Play Faturalandırma — native köprü sözleşmesi

Web tarafı bitti (`src/lib/billing.ts`, 32 test, 19/19 mutasyon yakalandı).
Eksik olan tek şey `android/` içindeki Kotlin karşılığı.

## Neyin yerine geldi

Eski `purchasePlaySku` şunu yapıyordu:

```ts
set({ proUntil: Date.now() + plan.days * 24 * 3600_000 });
```

Google Play'e hiç gitmiyordu. Depoda `purchaseToken` kelimesi bile
geçmiyordu. Sonuç: **kimse ödeme yapamıyor, "satın al"a basan herkes bedava
PRO oluyordu** — ve ekranda "Google Play üzerinden açıldı" yazıyordu.

Şimdi PRO yalnızca gerçek bir satın alma kaydından türetiliyor. Köprü yoksa
satın alma başarısız olur ve sebebi kullanıcıya söylenir; sessizce açılmaz.

Ölçüldü (Playwright, iki senaryo):

| Ortam | Sonuç |
|---|---|
| Tarayıcı, köprü yok | `proUntil` 0 kaldı — PRO açılmadı |
| Native kabuk taklidi | PRO açıldı, süre satın alma kaydından türedi |

## Web tarafın beklediği köprü

`window.EvenBilling` — WebView'e `addJavascriptInterface` ile bağlanır.

| Metot | Dönüş | Ne yapmalı |
|---|---|---|
| `isReady()` | `boolean` | `BillingClient.isReady` |
| `queryPurchases()` | JSON dizi dizesi | `queryPurchasesAsync(SUBS)` sonucunu aşağıdaki şemaya çevir |
| `launchPurchase(productId)` | — | `launchBillingFlow`; sonucu `onEvenPurchases` ile geri yaz |
| `acknowledge(purchaseToken)` | — | `acknowledgePurchase` |

Native → web geri çağrısı:

```kotlin
webView.evaluateJavascript("window.onEvenPurchases?.(${JSONObject.quote(json)})", null)
```

### JSON şeması

```json
[{
  "productId": "even_pro_monthly",
  "purchaseToken": "…",
  "purchaseTimeMs": 1800000000000,
  "state": "purchased",
  "acknowledged": true,
  "autoRenewing": true
}]
```

`state`, Play'in `Purchase.getPurchaseState()` değeri çevrilerek yazılır:

| Play sabiti | JSON |
|---|---|
| `PurchaseState.PURCHASED` (1) | `"purchased"` |
| `PurchaseState.PENDING` (2) | `"pending"` |
| `UNSPECIFIED_STATE` (0) | `"unspecified"` |

## Web tarafın uyguladığı kurallar

Her biri bir hatayı engelliyor; hepsinin testi ve mutasyon doğrulaması var.

- **`pending` PRO VERMEZ.** Play'de PENDING, kullanıcının "mağazada nakit
  ödeyeceğim" dediği durumdur; para henüz alınmamıştır. Bunu kabul etmek
  bu yolun klasik hatasıdır.
- **Token'sız kayıt yok sayılır.** Token satın almanın tek kanıtıdır.
- **Bilinmeyen `productId` yetki vermez.** "Kaç gün" sorusuna cevap
  veremeyen bir ürün için tahmin yürütülmez.
- **Yenilemede en geç biten kazanır.** Play yenilemede yeni kayıt döndürür,
  eskisi listede kalabilir.
- **Onaylanmamış satın alma onaylanır.** `acknowledgePurchase`
  çağrılmazsa Play 3 gün sonra parayı İADE EDER.
- **Bozuk JSON boş dizi sayılır (fail-closed).** Ters varsayım bedava
  abonelik dağıtırdı; bu haliyle kullanıcı bir kez "geri yükle"ye basar.
- **Açılışta `restorePro()` çağrılır** (`app-shell.tsx`). Bu olmadan
  kullanıcı telefon değiştirdiğinde ya da uygulamayı yeniden kurduğunda
  ödediği aboneliği kaybeder.

## Kotlin tarafına yazılacaklar

`android/app/build.gradle`:

```gradle
implementation "com.android.billingclient:billing-ktx:7.1.1"
```

Sınıf iskeleti (`EvenBillingBridge.kt`) — BillingClient'ı `PurchasesUpdatedListener`
ile kurun, `queryProductDetailsAsync` ile `even_pro_weekly` / `even_pro_monthly` /
`even_pro_yearly` ürünlerini çekin, `launchBillingFlow`u ana iş parçacığında
çağırın, `onPurchasesUpdated` içinde JSON'u yukarıdaki şemaya çevirip
`onEvenPurchases`e yazın.

**`@JavascriptInterface` ek açıklaması zorunlu**, yoksa metotlar WebView'den
görünmez ve köprü sessizce yok sayılır — web tarafı bunu "köprü yok" diye
raporlar ve satın alma açılmaz.

## Sunucu doğrulaması (sertleştirme, sonraki adım)

Yukarıdaki akış Play'in istemci tarafı durumuna güvenir; standart taban
budur. Kök erişimi olan bir cihazda `proUntil` yine de kurcalanabilir.
Sertleştirmek için `purchaseToken`ı sunucuya gönderip Google Play Developer
API `purchases.subscriptionsv2.get` ile doğrulayın; bunun için bir servis
hesabı anahtarı gerekir ve o anahtar sizde durmalı.

## Yayına çıkmadan önce

- [ ] `EvenBillingBridge.kt` yazıldı ve `@JavascriptInterface` eklendi
- [ ] Play Console'da üç abonelik ürünü oluşturuldu (kimlikler yukarıda)
- [ ] Lisans testi hesabıyla satın alma denendi
- [ ] `restorePro()` uygulamayı silip yeniden kurunca PRO'yu geri getiriyor
- [ ] İptal sonrası PRO düşüyor
