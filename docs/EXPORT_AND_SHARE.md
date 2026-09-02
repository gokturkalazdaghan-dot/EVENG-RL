# EVEN GIRL — Dışa Aktarım Kapısı, Ekran Koruması ve Çapraz Paylaşım

> **EVEN GIRL** · Powered by **ARMANALABS**

## 1. Tek ücretsiz indirme hakkı

| Kural | Değer |
|---|---|
| Üretim ve düzenleme | **Sınırsız** |
| Galeriye kayıt hakkı (ücretsiz) | **1 adet** |
| O tek hakkın çıktısı | **Filigransız**, tam çözünürlük |
| Hak tükendiğinde | Paywall + ekran koruması |
| PRO abonesi | Sınırsız, filigransız |

`Even Girl Generate` çıktıları **her koşulda filigransızdır**.

## 2. Sayaç neden iki yerde

| Katman | Nerede | Neyi çözer | Zayıflığı |
|---|---|---|---|
| İstemci | Keychain / EncryptedSharedPreferences | Anında geri bildirim, çevrimdışı çalışır | Uygulama silinip kurulunca sıfırlanır |
| Sunucu | Anonim `app_user_id`'ye bağlı kayıt | Yeniden kurulumdan etkilenmez — **gerçek kapı** | Ağ gerektirir |

**Çakışma kuralı:** Sunucuya ulaşılamazsa istemci sayacına düşülür. Uçaktaki
bir kullanıcıya "kota bilinmiyor" deyip hakkını kullandırmamak, ödediği şeyi
vermemektir.

**Sıra:** Kayıt denenmeden önce kota sorulur. Hak yokken galeriye yazıp sonra
silmek, kullanıcının galerisinde bir an için dosya oluşturur.

Sayaçlar **yalnızca başarılı kayıttan sonra** ilerler.

## 3. Ekran yakalama koruması

| Platform | Mekanizma | Gerçekten engelliyor mu |
|---|---|---|
| **Android** | `FLAG_SECURE` | **Evet.** OS düzeyinde: kayıtta pencere siyah çıkar, screenshot başarısız olur |
| **iOS** | `UIScreen.isCaptured` + `isSecureTextEntry` katmanı + kayıt kaplaması | **Kısmen.** Ekran kaydı ve yansıtma engellenir; **screenshot engellenemez**, yalnızca `userDidTakeScreenshotNotification` ile sonrasında haber verilir |

iOS'ta Android'in `FLAG_SECURE` karşılığı yoktur. Kod bunu gizlemez —
`ScreenGuard.swift` içinde ne yapılabildiği ve ne yapılamadığı yazılıdır.

Koruma **hak tükendiğinde** açılır, PRO abonesinde kapalıdır.

### Kalkanı ekranı kapatmak sanmak

Kalkan göstermek ekranı kapatır ama **belleği temizlemez**. Tam çözünürlük,
filigransız bir görüntü bellekte dururken üç sızıntı yolu açık kalır:

1. Kalkan çizilene kadar geçen kareler kayda girer,
2. Uygulama arka plana alındığında sistem anlık görüntü (snapshot) alır ve
   bunu **diske yazar**,
3. Bir bellek dökümü ham pikselleri taşır.

Bu yüzden yakalama algılandığında kalkan gösterilir **ve** tamponlar
boşaltılır. `ImageBufferRegistry` bunu yönetir:

```
UIScreen.capturedDidChangeNotification
UIApplication.userDidTakeScreenshotNotification
              │
              ▼
   ImageBufferRegistry.purgeAll()   ← ÖNCE (senkron, ana thread)
              │
              ▼
   PaywallGateView                  ← SONRA (opak kalkan)
              │
              ▼
   sendEvent → CaptureShieldHost → CaptureShield.decideCaptureResponse
                                          │
                                    paywall / bildirim / kalkanı kaldır
```

**Sıra önemli:** boşaltma kalkandan öncedir. Ters sıra, kalkanın çizildiği
kare ile boşaltmanın gerçekleştiği kare arasında tam çözünürlük görüntünün
bellekte kalması demektir.

`ImageBufferRegistry` **zayıf referans** tutar (`NSHashTable.weakObjects`).
Güçlü referans tutsaydı sınıfın kendisi sızıntı kaynağı olurdu: kimse
serbest bırakmadığı için hiçbir görüntü boşalmazdı.

### Native hızlı ve kaba, JS doğru ve geri alınabilir

Native taraf kalkanı ve boşaltmayı **JS yanıtını beklemeden** yapar.
Köprüyü beklemek, JS thread'i meşgulken (bir render sürerken) korunmak
istenen karelerin geçmesi demektir. Kararı JS ayrıca alır ve kalkanı
kaldırma ile paywall yönlendirmesini o yönetir.

### İki farklı olay, iki farklı doğa

| Olay | Doğası | Yanıt |
|---|---|---|
| `recording` | **Sürekli** ve önlenebilir | Kalkan + tampon boşaltma. Paywall **açılmaz** — kayıt kullanıcının kendi destek videosu olabilir |
| `screenshot` | **Anlık** ve önlenemez (bildirim kare alındıktan SONRA gelir) | Kalkan + boşaltma + paywall. O kare geri gelmez; korunan bir SONRAKİ karedir |

### Kalkan neden `PaywallGateView`, genel bir siyah pencere değil

Ekranın açıklamasız kararması kullanıcıya **arıza** gibi görünür.
`PaywallGateView` ne olduğunu, neden olduğunu ve nasıl devam edileceğini
söyler; suçlayıcı bir ton kullanmaz — kullanıcı bir suçlu değil, ücretsiz
hakkını kullanmış bir kişidir.

Zemin **tam opak**. Blur veya `alpha < 1` bir kaplama, ekran kaydında
altındaki içeriği okunabilir bırakabilir — özellikle yüksek kontrastlı bir
portre altında. Pencere seviyesi `.alert + 1`: bir sistem uyarısının kalkanın
üstüne çıkması, altındaki içeriğin kenarlarını görünür bırakırdı.

Kalkan metinleri **JS'ten gelir** (`setGateStrings`). Native tarafta sabit
metin tutmak, 8 dilin 9.'sunu yaratırdı; dil değiştiğinde metinler kalkan
görünürken bile güncellenir.

### Kim kalkan görmez

`CaptureShield` politikası PRO aboneyi ve **ücretsiz hakkı kalan**
kullanıcıyı hiç kısıtlamaz. Ödeme yapmış kullanıcının kendi çıktısının ekran
görüntüsünü alması meşrudur; kalkan onun için yalnızca bir arıza olur.
Amaç herkesi ekran görüntüsünden alıkoymak değil, hakkı tükenmiş kullanıcının
ödeme duvarını atlatmasını zorlaştırmaktır.

Abonelik alındığında veya kayıt durduğunda kalkan **derhal** kalkar
(`shouldLiftShield` + `Entitlements` aboneliği). "Bir sonraki açılışta
düzelir" davranışı, ödeme yapmış kullanıcının bozuk bir uygulamayla baş başa
kalması demektir.

### Android tarafında ne değişti

`FLAG_SECURE` korunuyor — sistem zaten kareyi vermediği için Android'de kalkan
görünümüne gerek yok. Eklenenler:

- **Android 14+ `Activity.ScreenCaptureCallback`**: koruma KAPALIYKEN (kullanıcının
  hâlâ hakkı varken) ekran görüntüsü olayını görmek, JS'in politikayı iOS ile
  aynı sözleşme üzerinden işletmesini sağlar.
- **`purgeImageBuffers`**: native tarafta tutulan tampon olmadığı için istek
  JS'e iletilir. Sessizce hiçbir şey yapmamak, iOS'ta korunan bir şeyin
  Android'de korunmadığını gizlerdi.

### Dürüstlük kuralı

Ekran görüntüsünü "engelledik" **demiyoruz**. iOS'ta engellenemez. Yapılan
şey, hakkı tükenmiş kullanıcının filigransız çıktıyı ekran görüntüsüyle elde
etmesini zorlaştırmak ve bunu ona açıkça söylemektir.

### Test kapsamı

`__tests__/CaptureShield.test.ts` (11 test): PRO muafiyeti, kayıt/screenshot
ayrımı, kalkanın kaldırılma koşulları, tampon boşaltma kararı.

## 4. Çapraz paylaşım

### Instagram Hikayeler

| Platform | Yol |
|---|---|
| iOS | `instagram-stories://share` + `UIPasteboard` (`com.instagram.sharedSticker.*`) |
| Android | `com.instagram.share.ADD_TO_STORY` intent + `FileProvider` |

Pano öğesi **5 dakika ömürlüdür**: kullanıcının panosunda süresiz bir görsel
bırakmıyoruz.

### WhatsApp Durumu

| Platform | Yol |
|---|---|
| iOS | `UIDocumentInteractionController` ("Open In") — `whatsapp://send` medya taşımaz |
| Android | `ACTION_SEND` + `setPackage("com.whatsapp")` + `FileProvider` |

Hedefi (Durum, sohbet) kullanıcı WhatsApp içinde seçer.

### İki kritik yapılandırma

**iOS — `LSApplicationQueriesSchemes`:** `instagram-stories` ve `whatsapp`
bildirilmezse `canOpenURL` **her zaman false** döner ve doğrudan paylaşım
sessizce ölür.

**Android — `<queries>`:** Android 11+ paket görünürlüğü nedeniyle
`resolveActivity` ve `getPackageInfo`, manifest'te bildirilmeyen paketleri
**göremez**. Bildirilmezse "Instagram kurulu değil" sonucu her cihazda döner.

**Android — `FileProvider`:** Android 7'den beri başka uygulamaya `file://`
URI verilemez (`FileUriExposedException`). `file_paths.xml` yalnızca
paylaşıma açık üç dizini listeler — şifreli depo, model dosyaları ve
önbelleğin geri kalanı **yoktur**; FileProvider'a geniş bir kök vermek,
herhangi bir uygulamanın uygulama verisini okuyabilmesi demektir.

### Yedek yol

Şema yoksa, uygulama kurulu değilse veya aktarım hata verirse **sistem
paylaşım sayfası** açılır. Kullanıcı hiçbir zaman çıkmaza düşmez.

### Paylaşım kotayı tüketmez

Paylaşım galeriye kayıt değildir. Kullanıcı içeriği zaten üretmiştir; başka
bir uygulamaya göndermek ayrı bir kota gerektirmez. Kota **yalnızca cihaza
indirmede** uygulanır.

## 5. Otomatik dil senkronizasyonu

| Ne | Nasıl |
|---|---|
| Arayüz, düğmeler, bildirimler | Sistem locale'i (`NSLocale` / `Locale`) açılışta okunur |
| Ön plana dönüş | `resyncDeviceLanguage()` — Android 13+ uygulama başına dil seçimi uygulamayı yeniden başlatmaz |
| AI ajan promptları ve çıktıları | `agentLanguageTag()` istekle birlikte gider |

**Bölge kodu gönderilmez:** `tr` gider, `tr-TR` değil. Bölge, dil + saat
dilimi birleşiminde ek bir ayırt edici bittir ve ajanın çıktısını
değiştirmez.

Arayüz Türkçe'yken altyazının İngilizce gelmesi tutarsızlıktır — ajan ve
arayüz aynı etiketi kullanır.

## 6. Sürüm öncesi kontrol listesi

- [ ] `FACEBOOK_APP_ID` gerçek değerle dolduruldu (Instagram Hikaye aktarımı için zorunlu)
- [ ] iOS `LSApplicationQueriesSchemes` içinde `instagram-stories` ve `whatsapp` var
- [ ] Android `<queries>` bloğunda her iki paket bildirilmiş
- [ ] `file_paths.xml` yalnızca paylaşıma açık dizinleri listeliyor
- [ ] Instagram/WhatsApp **kurulu olmayan** bir cihazda sistem paylaşım sayfasına düşüldüğü doğrulandı
- [ ] Hak tükendikten sonra Android'de screenshot'ın gerçekten engellendiği doğrulandı
- [ ] iOS'ta ekran kaydı sırasında `PaywallGateView`'in göründüğü doğrulandı
- [ ] Ekran görüntüsü sonrası kalkanın belirdiği ve paywall'un açıldığı doğrulandı
- [ ] Tam çözünürlük gösteren görünümler `ProtectedImageView` kullanıyor (kayıtsız görünüm boşaltılmaz)
- [ ] Kalkan açıkken abone olunduğunda kalkanın DERHAL kalktığı doğrulandı
- [ ] Kayıt sırasında arka plana alıp geri dönüldüğünde sistem snapshot'ında çıktı görünmediği doğrulandı
- [ ] Kalkan metinlerinin cihaz dili değiştiğinde güncellendiği doğrulandı
- [ ] Uygulama silinip yeniden kurulduğunda sunucu sayacının korunduğu doğrulandı
