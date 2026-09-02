# Yayına çıkma

Bu belge, **kodun bittiği yerde ne kaldığını** anlatır. Depoda çalışmayan
hiçbir kod yolu bırakılmadı; kalanların hepsi *dışarıdan gelmesi gereken
değerler* ve *dışarıda çalışması gereken servisler*.

Ayrım önemli: bir eksik "yazılmadı" mı yoksa "hesap açılmadı" mı — ikisi
farklı iştir ve karıştırıldığında biri diğerini bekleyerek sonsuza kadar
durur.

---

## 1. Yalnızca sizin sağlayabileceğiniz değerler

Bunların hiçbiri bu depoda üretilemez; hesap, alan adı veya donanım
gerektirir. Sekizi de `npm run verify:release` ile denetlenir ve eksikse
**sürüm çıkmaz**.

| Değer | Nereden | Eksikse ne olur |
|---|---|---|
| SSL pin'leri (birincil + yedek) | Canlı `api.armanalabs.com` sertifikası | Uygulama hiçbir isteği yapamaz |
| RevenueCat public SDK anahtarları | RevenueCat → Project Settings → API Keys | Satın alma akışı hiç açılmaz |
| Facebook App ID | developers.facebook.com | Instagram Hikaye aktarımı **sessizce** çalışmaz |
| Android release imza SHA-256 | `keytool -list -v -keystore …` | Repackaging tespiti çalışmaz |
| Apple App ID | App Store Connect | Teklif kodu kullandırma sayfası açılmaz |

```bash
npm run pins:set     -- api.armanalabs.com --backup <yedek-pin>
npm run release:set  -- --revenuecat-ios appl_… --facebook-app-id …
```

**İmza anahtarını ben üretmedim ve üretmemeliyim.** Geçici bir konteynerde
üretilip aktarılan bir anahtar, doğduğu anda tehlikeye girmiş sayılır.
Anahtarı siz üretin, siz saklayın; buraya yalnızca ondan türeyen SHA-256
özeti girer.

---

## 2. Dışarıda çalışması gereken servisler

### Moderasyon tarayıcısı — **zorunlu**

```bash
MODERATION_SCANNER_URL=https://tarayici.example
MODERATION_SCANNER_KEY=…          # isteğe bağlı
```

Üç uç bekleniyor: `POST /hash`, `POST /hash-lookup`, `POST /classify`
(sözleşme: `social_gamification/scannerConfig.js`).

Tanımlı değilse sunucu **açılışta yüksek sesle uyarır** ve fail-closed
davranış korunur — ama bu, **yüklenen hiçbir içeriğin onaylanmaması**
demektir: her şey `pending` kalır ve akış boş görünür. Doğru davranış ile
çalışan ürün aynı şey değildir.

### Even Girl Generate — yüz tarayıcı ve üreteç

```bash
FACE_SCREENER_URL=https://yuz.example      # deepfake kapısının görüntü hattı
IMAGE_GENERATOR_URL=https://uretec.example # görüntü üreteci
```

İkisi de tanımlı değilse fail-closed korunur ama **Even Girl Generate hiç
çalışmaz**: yüz tarayıcı yoksa referans içeren hiçbir üretim tamamlanmaz,
üreteç yoksa istekler 500 döner. Sunucu açılışta ikisini de tek tek
bildirir.

Yüz tarayıcıdan dönen `screenerRan` alanı **boolean olmak zorunda**:
`undefined`'ı "çalıştı" saymak, tarayıcı çalışmadığı halde referansların
temiz sayılması demektir — deepfake kapısının tam olarak kapatması gereken
durum.

### Veritabanı

```bash
DATABASE_URL=postgres://…    # üretim
DATABASE_URL=file:./even.db  # yerel geliştirme (node:sqlite)
```

Üretimde tanımsızsa sunucu **başlamayı reddeder**. Veritabanısız ayakta
kalmak, her isteğin 500 dönmesi demektir.

```bash
node persistence/migrate.js   # şema sürüm 2, 23 tablo
```

### Diğer ortam değişkenleri

| Değişken | Ne için | Yoksa |
|---|---|---|
| `JWT_SECRET` | Yetki ve personel jetonları | Ücretli uçlar 503 döner |
| `REVENUECAT_WEBHOOK_AUTH_HEADER` | Webhook kimlik doğrulaması | Webhook 401 döner, kimse PRO olmaz |
| `PLAY_ACCESS_TOKEN` | Haftalık ödül kodu üretimi | Play tarafı ödül dağıtılmaz |
| `REDIS_URL` | Haftalık sıralama ve dağıtım kilidi | Ödül işi başlamaz |
| `PUSH_GATEWAY_URL` | Ödül bildirimi | Bildirim gitmez — **ödül yine ulaşır** (aşağıya bakın) |
| `RENDER_SERVICE_URL` | Sunucu tarafı tam çözünürlük render'ı | `/v1/export/render` 503 döner |

`RENDER_SERVICE_URL` **isteğe bağlıdır**: uygulama render'ı cihazda yapıyor
ve bu ucu çağırmıyor. Uç, sunucu tarafı render'ın gerekli olduğu ileri bir
senaryo için duruyor ve yapılandırılmadan çalışmaz — eskiden hiçbir render
yapmadan var olmayan bir CDN adresi döndürüyordu.

### Haftalık ödül işi

```bash
npm install ioredis          # yalnızca bu iş için gerekir
DATABASE_URL=… REDIS_URL=… node reward_automation/cron.js   # cron: 0 0 * * 1
```

Veritabanı **zorunlu**: ödül `reward_awards` tablosuna yazılmazsa
`/v1/rewards/pending` boş döner ve kazanan kullanıcı ödülünü uygulamada
hiç göremez — mağazada kod üretilir, kimseye ulaşmaz.

**Push isteğe bağlıdır ve teslimatın kendisi değildir.** Ödülün gerçek
teslimatı veritabanı kaydıdır; uygulama her açılışta `pending` uçlarını
sorar ve sıralama ekranında gösterir. Push yalnızca kullanıcının daha
erken haberdar olmasını sağlar.

İstemci tarafında **push kaydı henüz yok** (jeton üretilmiyor). Bu bilinçli
bir sıralama: ödülü push'a bağlamak, bildirim izni vermemiş ya da o an
cihazı kapalı olan kazananları ödülsüz bırakırdı. Push eklendiğinde
`pushSender.js` içindeki dikiş yeri hazır.

**Hesabın mağazası bilinmiyorsa kod ÜRETİLMEZ.** Tahmin edilen mağazadan
üretilen kod kullanıcının elinde ölüdür ve bunu ancak kullanmayı deneyince
anlar; üstelik o kod mağaza kotasından düşer. İşçi o kullanıcıyı atlar,
diğerlerini engellemez ve bir sonraki çalıştırmada yeniden dener.

---

## 3. Model dosyaları

`ModelRegistry.ts` on altı yerel model tanımlıyor. Dosyaların kendisi
depoda yok (boyut) ve depoda **olmamalı**.

```bash
npm run models:sync -- /yol/modeller
```

Bu komut özetleri **gerçek dosyalardan** hesaplar. Elle yazılmış bir özet
biçim olarak geçerlidir ama hiçbir dosyaya ait değildir — yani bütünlük
kontrolü var gibi görünür ve hiçbir şey doğrulamaz.

Model dosyası olmadan uygulama **çalışır**: `ModelStore.isInstalled` false
döner, yönlendirme sunucuya düşer, sunucu da yoksa kullanıcı *sebebi
yazan* bir hata görür (`errors.MODEL_UNAVAILABLE`). Sessiz bir hiçlik yok.

---

## 4. Bilinçli olarak eksik bırakılan: DM uçtan uca şifreleme

`NativeModules.EvenGirlE2EE` **hiçbir platformda yok** ve bu, gerekçesiyle
`tools/verify-native-project.mjs` içindeki istisna listesinde kayıtlı.

Sebep: uçtan uca şifreleme libsignal gerektirir. Kripto elle yazılmaz — bu
sınıftaki bir hata sessizdir ve "şifreli" sanılan bir sohbeti okunur
bırakır.

Köprü yokken davranış **yüksek sesle** başarısız: `SecureMessaging.isAvailable`
false döner ve `ChatScreen` yazma alanını **hiç göstermez**. Kullanıcı
mesajını yazıp gönderdiğini sanamaz.

Etkinleştirmek için: `org.signal:libsignal-android` (Android) ve
`LibSignalClient` (iOS) bağımlılıklarını ekleyip
`SecureMessaging.ts` içindeki `NativeE2eeBridge` sözleşmesini uygulayın;
sonra istisna listesinden `EvenGirlE2EE` satırını silin.

---

## 5. Mağaza kayıtları

`store/products.json` üç abonelik ve iki teklif kodu tanımlıyor;
`npm run verify:store` kimlik ve fiyat tutarlılığını denetliyor. Ürünlerin
**App Store Connect ve Play Console'da aynı kimliklerle açılması** gerekir
— kod tarafı hazır, kayıtlar sizde.

---

## Sırayla

1. Alan adı + TLS sertifikası → `npm run pins:set`
2. RevenueCat / Meta hesapları → `npm run release:set`
3. Android imza anahtarı (siz üretin) → `npm run release:set`
4. Mağaza ürünlerini konsollarda açın
5. Moderasyon tarayıcısını ayağa kaldırın → `MODERATION_SCANNER_URL`
6. PostgreSQL → `DATABASE_URL` → `node persistence/migrate.js`
7. Modelleri yerleştirin → `npm run models:sync`
8. `npm run verify:release` — yer tutucu kalmışsa sürüm çıkmaz
