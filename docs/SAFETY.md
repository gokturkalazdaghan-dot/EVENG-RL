# EVEN GIRL — Yaş Doğrulama, İçerik Derecelendirme ve Görünürlük Kalkanı (Modül 5)

> **EVEN GIRL** · Powered by **ARMANALABS**

## 1. Konumlandırma

Uygulama **"AI Art & Aesthetic Fantasy Studio"** olarak konumlanır. Bu, Apple
Guideline 1.1 açısından anlamlı bir ayrımdır: uygulamanın birincil işlevi
yaratıcı düzenleme ve stilize üretimdir; yetişkin içerik, yetişkin
kullanıcıların **kendi ürettiği** ve **açıkça açtığı** bir alt kümedir,
uygulamanın satış vaadi değildir.

Bu konumlandırma, mağaza formunda ve store listing'de tutarlı olmak
zorundadır. Ekran görüntülerinde veya tanıtım metninde yetişkin içerik
kullanmak, bu savunmayı tek başına geçersiz kılar.

## 2. Yaş doğrulama

| Karar | Değer | Gerekçe |
|---|---|---|
| Yöntem | Doğum tarihi tekerleği (gün/ay/yıl) | Tek dokunuşluk "18+'ım" onayı ne mağazalarca ciddiye alınır ne de çocuk için sürtünme yaratır |
| Eşik | `age >= 18` | Tam doğum günü yetişkin sayılır; `>` kullanmak kullanıcıyı bir yıl daha kilitler |
| Varsayılan tarih | ~25 yaş | Bugün = "0 yaşında"; eşiğe koymak kullanıcıyı hiç kaydırmadan onaylamaya iter |
| Geçersiz tarih | **Üretilemez** | Gün listesi seçilen ay/yıla göre daralır — hata göstermek yerine seçeneği sunmuyoruz |
| Saklanan | Yalnızca **kademe** | Doğum tarihi kişisel veridir ve kademe kararı için gerekli değildir |
| Depo | Keychain / EncryptedSharedPreferences | Düz depoda tek satır düzenleyerek Safe Mode'dan çıkılır |
| Yeniden sorma | `AGE_RECORD_VERSION` | Politika değişirse herkese yeniden sorulur |

### Safe Mode (18 yaş altı)

| Yetenek | Durum | Gerekçe |
|---|---|---|
| Düzenleme araçları | ✅ **Tamamı açık** | Kısıtlama yaratıcılıkta değil, temas yüzeyindedir |
| Abonelik satın alma | ✅ Açık | Ebeveyn onayını Ask to Buy / Aile Kütüphanesi ile **mağaza** yürütür; uygulamanın ikinci kez engellemesi anlamsızdır |
| +18 içerik görme | ❌ | — |
| +18 içerik yayınlama | ❌ | — |
| Yabancılardan DM | ❌ | — |
| Herkese açık liderlik tablosu | ❌ | Bir kullanıcının reşit olmadığını herkese açık sıralamada duyurmak, yetişkin içerik ve DM barındıran bir uygulamada **hedefleme sinyalidir** |

`capabilitiesFor` tek bir `isMinor` boolean'ı değil açık bir yetenek listesi
döndürür ve `unverified` için **hepsi kapalıdır**. Yeni bir özellik eklendiğinde
geliştirici listeye bakmak zorunda kalır; unutulan özellik varsayılan olarak
kapalı gelir.

## 3. İçerik derecelendirme

`ContentRating.ts` **model değil politikadır**: sınıflandırıcının ürettiği
skorların ne anlama geldiğine burası karar verir. Model değiştiğinde politika
aynı kalır ve politika testleri model olmadan çalışır.

### +18 kriterleri (kesin)

| Sinyal | Eşik |
|---|---|
| Örtüsüz kadın meme ucu / areola | ≥ 0.85 |
| Örtüsüz kadın genital bölgesi | ≥ 0.85 |
| Örtüsüz erkek genital bölgesi | ≥ 0.85 |
| Örtüsüz anüs / rektal bölge | ≥ 0.85 |
| Cinsel eylem | ≥ 0.85 |

### Yanlış pozitif koruması

**Mayo, bikini ve spor kıyafeti kesinlikle +18 değildir.**

Sınıflandırıcılar bu kıyafetleri düzenli olarak çıplaklıkla karıştırır (ten
oranı yüksektir) ve plaj/spor fotoğrafları bu kategorideki en yaygın
içeriklerdendir — yani bu teorik değil, pratik bir sorundur.

Kural: giyim bağlamı güçlüyse (≥0.6) **ve** yetişkin sinyali kesinlik eşiğinin
altındaysa, sinyal bastırılır. Kesin bir tespit (≥0.85) giyim bağlamıyla
bastırıl**maz** — mayo giyen biri de teşhir yapabilir.

### İki yönlü hata maliyeti — ve neden simetrik değil

| Hata | Sonuç |
|---|---|
| **Yanlış negatif** (+18'i güvenli saymak) | Reşit olmayana yetişkin içerik gösterilir. Geri alınamaz |
| **Yanlış pozitif** (mayoyu +18 saymak) | Masum kullanıcı haksız kısıtlanır, akışını kaybeder, uygulamayı bırakır |

İkisi de gerçek zarardır ama birincisi geri alınamaz. Bu yüzden **belirsiz**
aralık (0.5–0.85) otomatik +18 damgalanmaz: `review` kuyruğuna düşer. Reşit
olmayanlara gösterilmez (güvenli taraf) ama kullanıcı da otomatik
cezalandırılmaz.

### Reşit olmayan koruması (Kural 0)

Görüntüde reşit olmayan biri olduğu sinyali (≥0.35) **herhangi** bir cinsel
sinyalle birleşirse karar `blocked`tır: içerik yayınlanmaz, derecelendirilmez,
saklanmaz.

- Eşik bilinçli olarak **düşüktür**: buradaki yanlış pozitifin maliyeti bir
  gönderinin incelemeye düşmesidir; tersinin maliyeti kabul edilemez.
- Giyim bağlamı bu kuralı **bastıramaz** — diğer tüm yanlış pozitifleri
  bastırdığı hâlde.
- Cinsel sinyal yoksa yaş sinyali tek başına engellemez: çocukların normal
  fotoğrafları engellenmez.

### Sınıflandırıcı nerede çalışır

**Cihazda** — bu bir gizlilik kararıdır. Sınıflandırma için medyayı sunucuya
göndermek, kullanıcının yayınlamadığı taslakların bile sunucumuzdan geçmesi
demektir.

Sunucu **yine de** sınıflandırır ve o karar bağlayıcıdır: istemci modeli
yamalanabilir, atlatılabilir veya eski sürümde kalmış olabilir. İki katman
farklı işler yapar.

**Fail-closed:** sınıflandırıcı çalışmazsa içerik "temiz" sayılmaz, `review`
verilir.

## 4. Görünürlük kalkanı

### Tek kapı kuralı

Akış, arama, profil, hikaye, DM eki, şablon pazarı — içerik gösteren **her**
yüzey `canView` üzerinden geçer. Her yüzeyin kendi filtresini yazması, altı ay
sonra birinin filtresiz bir yüzey eklemesi demektir.

### Karar sırası

1. `blocked` → kimseye gösterilmez, yetişkin dahil
2. Engellenen yazar → derecelendirmeden **önce** (engelleyen, masum içeriği de görmek istemez)
3. `unverified` → hiçbir şey (fail-closed)
4. **Yaş kalkanı** → reşit olmayan `adult`, `sensitive` **ve** `review` görmez
5. Raporlanmış + inceleme bekliyor → yetişkine de gösterilmez
6. Yetişkinin kendi tercihi → **varsayılan kapalı**; yetişkin olmak yetişkin içerik görmek istemek değildir
7. `sensitive` → görünür ama varsayılan bulanık

**Reşit olmayan kullanıcının `adultContentOptIn` değerini açması kalkanı
devre dışı bırakmaz** — bu ayrı bir testle kilitlenmiştir.

### Liste filtresi

Gizlenen öğe listeden **tamamen çıkarılır**; "bu içerik gizlendi" yer tutucusu
bırakılmaz. Yer tutucu, reşit olmayan kullanıcıya orada bir şey olduğunu söyler
ve merak uyandırır.

### Arama kalkanı

Reşit olmayan kullanıcının yetişkin terim **araması** da engellenir: sonuç boş
dönse bile sorgu, öneri ve otomatik tamamlama sistemlerini besler.

## 5. UGC moderasyonu (Apple Guideline 1.2)

Guideline 1.2, UGC barındıran uygulamalardan **dört** şey ister. Dördü de
olmadan uygulama reddedilir:

| # | Şart | Karşılık |
|---|---|---|
| 1 | Sakıncalı içeriği filtreleme yöntemi | Yükleme kapısı `moderationProxy.js` (§6) + `ContentRating.ts` + `VisibilityShield.ts` |
| 2 | Rapor mekanizması + zamanında yanıt | `ReportAffordance.tsx` + `Reporting.ts` (§7) + 24 saat SLA kuyruğu (§8) |
| 3 | Taciz eden kullanıcıyı engelleme | `Moderation.block()` + yaptırım kademeleri (§8) |
| 4 | Yayınlanmış iletişim bilgisi | `SettingsScreen` → geri bildirim akışı |

### Tasarım kararları

- **Rapor iki dokunuştan uzak değil.** Mekanizmayı menü içine gömmek,
  incelemede "mekanizma yok" sayılmasının en yaygın sebebidir.
- **Engelle, rapordan ayrı.** Kullanıcı çoğu zaman moderasyon istemez, sadece
  o kişiyi görmek istemez. İkisini birleştirmek insanları gereksiz rapor
  yazmaya zorlar ve kuyruğu kirletir.
- **Engel yerel olarak derhal uygulanır**, sunucu senkronu arka planda.
  Sunucuyu beklemek, kullanıcının "engelle"ye basıp içeriği görmeye devam
  etmesi demektir.
- **Rapor sunucuya ulaşmalıdır.** Yerel bir "raporladım" işareti moderasyon
  yapmaz; bu yüzden ağ hatası sessizce yutulmaz, kullanıcıya söylenir.
- **Serbest metin gerekçe yok.** Yapılandırılmış gerekçe, kuyruğun
  önceliklendirilmesini mümkün kılar. `minor-safety` ve
  `nonconsensual-intimate` içeriği **anında** askıya alır.

## 6. Yükleme kapısı: tarama render'dan ÖNCE

`ContentRating` ve `VisibilityShield`, içeriği **görüntülerken** filtreler.
Yeterli değildi: filtrelenecek dereceyi kimin verdiği ve ne zaman verdiği
açık değildi. `social_gamification/moderationProxy.js` bu boşluğu kapatır.

```
  POST /v1/stories            POST /v1/dm/attachment
        │                            │
        ▼                            ▼
      createStory(state:'pending')   (kayıt yok — onay yoksa ek yok)
        │                            │
        └──────────► scanAndGate ◄───┘
                          │
              scannerClient.scanMedia
                ├─ Hat 1: bilinen CSAM karması  → eşleşme = kesin bilgi
                └─ Hat 2: sınıflandırıcı        → NSFW / şiddet / reşit olmayan
                          │
                      decideIngest
                ┌─────────┼─────────┐
             approve  quarantine   block
                │         │          │
          state:approved  pending  blocked
                          │          ├─ hesap askıya (otomatik)
                          │          ├─ kuyruk (kritik)
                          └──────────┴─ eskalasyon (yasal hat)
```

`isVisibleTo` artık **ilk kural olarak** `moderationState !== 'approved'`
kontrolü yapar. Bu kontrolü aşağı taşımak, sonraki kurallardan birinin
yanlışlıkla `true` üretmesiyle taranmamış içeriğin akışa düşmesi demektir.

### Üç değişmez

| # | Değişmez | Nerede kilitli |
|---|---|---|
| A | **Fail-closed.** Tarayıcı hata verir, zaman aşımına uğrar veya anlamsız yanıt döndürürse içerik temiz sayılmaz; karantinaya alınır ve hiç render edilmez | `decideIngest` ilk dal + `tests/moderationProxy.test.js` |
| B | **CSAM istisnasızdır.** Karma eşleşmesi veya reşit olmayan + cinsel sinyal birleşimi tek yol izler: anında blok, anında askı, kritik eskalasyon. Eşik ayarı, opt-in veya "inceleme sonrası" yok | Eşikler tablosunda **yer almaz** — sabit kodlu |
| C | **Tarama render'dan öncedir.** `approved` olmayan içerik hiçbir yüzeye düşmez; `/dm/send` `approved` olmayan eki reddeder | `isVisibleTo` ilk kuralı + `loadAttachmentState` fail-closed |

### `undefined` ile bozuk değer neden ayrı

`score()` iki farklı "yok" ayırır:

- **Etiket hiç gelmedi (`undefined`) → 0.** `scannerClient.toSignals` her
  etiketi doldurur; eksik etiket, modelin o kavramı bilmediği anlamına gelir.
  Bunu 1 saymak **her içeriği bloke eder** — moderasyonu kapatmakla aynı
  sonucu (kimse yayınlayamaz) ters yönden üretir.
- **Etiket geldi ama anlamsız (NaN, null, metin) → 1.** Sağlayıcı bozuk yanıt
  üretiyorsa güvenli taraf en yüksek skordur.

Bu ayrım testler tarafından bulundu: ayrım yokken kısmi sinyal setiyle gelen
**temiz içerik dahil her şey** bloke ediliyordu.

### Yanlış pozitif bedeli asimetriktir

Reşit olmayan eşikleri (`apparentMinor ≥ 0.35`, `sexualSignal ≥ 0.30`)
yetişkin eşiğinden (`0.85`) belirgin şekilde düşüktür. Bu bilinçlidir:
bu kapıda yanlış pozitifin bedeli **bir insanın içeriği incelemesidir**;
yanlış negatifin bedeli **bir çocuğun istismar görüntüsünün yayınlanmasıdır**.
Bu iki bedel kıyaslanamaz.

Mayo, spor taytı ve plaj kıyafeti bağlamı 0.85 altındaki cinsel sinyalleri
bastırır — ama reşit olmayan birleşimini **asla** bastırmaz.

### E2EE ile nasıl bağdaşıyor

DM **metni** uçtan uca şifrelidir ve sunucu okuyamaz. Ek **medyası** ayrı
taranır: istemci eki saklama katmanına yükler, sunucu yalnızca o nesneyi
tarar ve `attachmentId` üzerinden karar verir. Şifreli mesaj gövdesine
dokunulmaz. Tarama tamamlanmadan `attachmentId` bir mesaja iliştirilemez —
`/dm/send` `approved` olmayan eki reddeder ve **bilinmeyen kimlik de
`approved` değildir** (uydurulmuş kimlik burada durur).

## 7. Atlatılamaz rapor düğmesi

"Her profil, hikaye ve sohbet ekranında rapor düğmesi var" bir **iddiadır**.
Altı ay sonra eklenen dördüncü bir UGC ekranında kimse bunu hatırlamaz.
`src/moderation/ReportSurfaces.ts` iddiayı ölçülebilir hâle getirir:

| Yüzey | Ekran |
|---|---|
| `profile` | `ProfileScreen.tsx` |
| `story` | `StoryViewerScreen.tsx` |
| `chat` | `ChatScreen.tsx` |
| `feed-post` | `FeedScreen.tsx` |
| `template` | `TemplateDetailScreen.tsx` |

`__tests__/ReportSurfaces.test.ts` her yüzeyin gerçekten `ReportAffordance`
render ettiğini **kaynak kodundan** doğrular. Mutasyon kontrolü yapıldı:
`ProfileScreen`'den düğme kaldırıldığında denetim kırmızıya döndü.

### Atlatılamazlık ne demek

1. Düğme, içeriğin kendisiyle **aynı ekranda** ve iki dokunuştan yakın.
   `FeedScreen`'deki eski `⋯` menüsü kaldırıldı — menüye gömmek,
   Guideline 1.2 incelemesinde "mekanizma bulunamadı" sonucunu doğurur.
2. Kullanıcının **kendi** içeriğinde bile gizlenmez, yalnızca devre dışı
   görünür. "Rapor düğmesini görmüyorum" durumu hiç oluşmaz.
3. `ReportAffordance` bir `visible` prop'u **kabul etmez** — kabul etseydi,
   zamanla birinin oraya `&& !isOwnContent` eklemesiyle biterdi. Test bunu
   da doğrular.
4. **PRO/ücretsiz ayrımı yok.** Güvenlik aracı ödeme duvarının arkasına
   konmaz.
5. Hikaye görüntüleyicide düğmeye dokunmak hikayeyi **durdurur** — rapor
   yazarken içeriğin kayıp gitmesi, kullanıcının vazgeçmesi demektir.

Kimlik çözülemediğinde (`Viewer.anonymousId === ''`) düğme **etkin kalır**.
Ters varsayım, mağaza yanıt vermediğinde raporlamayı sessizce öldürürdü.

## 8. 24 saatlik SLA kuyruğu ve ban-hammer

`core_gateway/moderation/` — nöbetçi tarafı. Bu uçlar **uygulama
istemcisine açık değildir**: anonim `x-app-user-id` başlığı burada hiçbir
yetki taşımaz, ayrı bir HMAC imzalı personel jetonu istenir.
`MODERATION_STAFF_SECRET` tanımsızsa uçlar **503 döner** — varsayılan bir
sırla açık bırakılmaz.

### SLA bir yorum değil, ölçülen bir değer

| Öncelik | Süre | Gerekçeler |
|---|---|---|
| `critical` | **1 saat** | CSAM, reşit olmayan güvenliği, rızasız mahrem görüntü |
| `high` | **6 saat** | Grafik şiddet, taciz, nefret söylemi, kimlik taklidi |
| `normal` | **24 saat** | Diğer her şey — taahhüt edilen üst sınır |

`dueAtMs` kayıt anında hesaplanır, kaydın parçasıdır ve **sonradan
uzatılamaz** (kayıt donmuştur; test bunu doğrular). `GET /internal/moderation/sla`
vadesi geçmiş kritik olay varsa **HTTP 503** döner; izleme aracının gövdeyi
ayrıştırmasına gerek kalmaz.

Kuyruk **FIFO değildir**: kritik bir CSAM olayı, üç saat önce gelen bir spam
raporunun arkasında bekleyemez. Sıralama: öncelik → vade → geliş.

**Süre dolduğunda içerik kendiliğinden yayına dönmez.** Vadesi geçmiş kayıt
karantinada kalır ve uyarı üretir.

### Yaptırım kademeleri

| Kademe | Yazma | Okuma | İçerik başkalarına görünür | Geri alınır |
|---|---|---|---|---|
| `shadow` | açık | açık | **hayır** | evet |
| `suspend` | kapalı | **açık** | hayır | evet (süreli, kendiliğinden de kalkar) |
| `ban` | kapalı | kapalı | hayır | evet |
| `terminate` | kapalı | kapalı | hayır | **hayır** |

- **Askıda okuma açık kalır** — kullanıcı itiraz edebilmek için uygulamaya
  girebilmeli.
- **Otomatik sistem kalıcı ban veremez.** `AUTOMATIC_CEILING = suspend`:
  bir sınıflandırıcının yanlış pozitifi, insan onayı olmadan bir hesabı
  kalıcı olarak silemez. Tavanı aşan otomatik çağrı sessizce düzeltilmez,
  **reddedilir**.
- **`terminate` yalnızca `lead` rolüyle.** Geri dönüşü olmayan bir işlemi
  tek bir nöbetçinin tek tıkla yapabilmesi, kötüye kullanımın en kısa yolu.
- **Gerekçesiz yaptırım bu API'den geçmez.** Her kayıt: kim, ne zaman, hangi
  gerekçe, hangi kanıt.
- **Sıra önemli:** önce yetenekler kapatılır, sonra içerik kaldırılır. Ters
  sıra, içerik kaldırılırken kullanıcının yenisini yüklemesine izin veren bir
  pencere açar.

### Bozuk süre sessizce kalıcı askı üretiyordu

Süreli askının bitiş anı şöyle hesaplanıyordu:

```js
sanction === SUSPEND && typeof durationMs === 'number' && durationMs > 0
  ? nowMs + durationMs
  : null
```

Üç yoldan da moderatör "7 günlük askı" verdiğini sanırken **kalıcı** bir
askı uygulanıyordu:

| Girdi | Sonuç | Neden |
|---|---|---|
| `Infinity` | `expiresAtMs = Infinity` | `nowMs >= Infinity` hiçbir zaman doğru olmaz → askı hiç bitmez |
| `1e30` | pratikte kalıcı | Aynı |
| `NaN`, `-5` | `expiresAtMs = null` | Koşul düşer, süresiz askı yolu seçilir |

`resolveExpiry` artık ayırıyor: süre **verilmemişse** (`undefined`/`null`)
süresiz askı meşru ve kasıtlıdır; süre **verilmişse** sonlu, pozitif ve en
fazla 365 gün olmak zorundadır. Bir yazım hatası artık yüzyıllık "geçici"
askı üretemez ve moderatör hatayı anında görür.

Kanıt kimlikleri de `String()` ile zorlanmıyor artık: `String({})`
`"[object Object]"` üretip denetim kaydına anlamsız bir kanıt referansı
yazıyordu.

### Aboneliğe dokunulmaz

Yaptırım, kullanıcının **ödediği** aboneliği iptal etmez ve para iadesi
yapmaz — ikisi de mağazanın yetkisindedir. Yetenek matrisinde abonelikle
ilgili hiçbir alan yoktur; buradan `pro_expiry_date` yazmak, ödül motorunda
kaldırılan aynı hatanın yaptırım tarafından tekrarı olurdu
([`BILLING.md` §7](BILLING.md)). Bir test bunu kilitler.

### Doğrulanmış karma eşleşmesi tek moderatörle geri alınamaz

`applyDecision`, gerekçesi `csam_hash_match` olan bir kaydın `reverse`
edilmesini reddeder — yalnızca `escalate` mümkündür. Diğer kritik
gerekçelerde yanlış pozitif geri alınabilir: otomatik blokajın hata
yapabileceğini kabul etmeyen bir sistem, moderatörleri karar almaktan
caydırır.

## 9. Test kapsamı

| Dosya | Test | Neyi kilitler |
|---|---|---|
| `AgePolicy.test.ts` | 31 | Yaş hesabı tuzakları, Safe Mode yetenekleri |
| `ContentRating.test.ts` | 22 | +18 kriterleri, yanlış pozitif koruması, reşit olmayan kuralı |
| `VisibilityShield.test.ts` | 21 | Kalkan sırası, fail-closed, opt-in, engelleme |
| `ReportSurfaces.test.ts` | 18 | Rapor düğmesinin her UGC yüzeyinde gerçekten bulunduğu (kaynak denetimi) |
| `tests/moderationProxy.test.js` | 15 | Fail-closed, CSAM istisnasızlığı, kıyafet bağlamı, eskalasyonda medya taşınmaması |
| `tests/moderationQueue.test.js` | 17 | SLA süreleri, öncelik sıralaması, vadenin dondurulması, karma geri alınamazlığı |
| `tests/banHammer.test.js` | 26 | Otomatik tavan, yetenek matrisi, yan etki sırası, personel jetonu doğrulama |
| `tests/aiStudioGuard.test.js` | 28 | Yazım oyunları, tek referans kuralı, gömme sızıntısı, prompt enjeksiyonu (§10) |
| `tests/httpRoutes.test.js` | 12 | Uç kablolaması: yetki kapısı, rol hiyerarşisi, durum kodları, sızıntı — **gerçek HTTP** |
| `ContentClassifier.test.ts` | 8 | Sinyal ayrıştırma: eksik vs bozuk etiket ayrımı, sözlük bütünlüğü |
| `tests/reasonCoverage.test.js` | 6 | Her gerekçenin AÇIK SLA önceliği; güvenlik gerekçelerinin kritik kalması |
| `tests/capabilityCoverage.test.js` | 5 | İstemci/sunucu yetenek sözlüğü; `nsfw-classify` muafiyeti |
| `tests/tierContract.test.js` | 7 | Yaş kademesi normalleştirmesi; bozuk değerin fail-closed olması |
| `CaptureShield.test.ts` | 11 | Yakalama kalkanı politikası (bkz. `docs/EXPORT_AND_SHARE.md` §3) |

**Mutasyon kontrolleri:**

- `isAdultOnly` yalnızca `'adult'` döndürecek şekilde gevşetildiğinde 5 test
  kırmızıya döndü — kalkanın `sensitive` ve `review` üzerindeki sıkılığı
  gerçekten test ediliyor.
- `ProfileScreen`'den `ReportAffordance` kaldırıldığında yüzey denetimi
  kırmızıya döndü — denetim gerçekten kaynak kodunu okuyor.
- Deepfake kapısında üç mutasyonun üçü de yakalandı (§10).
- `JWT_SECRET` kontrolü kaldırıldığında HTTP testi kırmızıya döndü.

### Bozuk kademe, eksik kademeden daha geniş olamaz

`isVisibleTo` kademeyi **isimle** sınar: `'unverified'` ise hiçbir şey,
`'adult'` değilse +18 yok. Tanımadığı bir değer ilk kontrolü **geçiyordu**.

Sonuç ölçüldü:

| Veritabanı ne döndürdü | Hesap ne gördü |
|---|---|
| `undefined` (kayıt yok) | hiçbir şey ✓ |
| `''` (yarım kalmış şema göçü) | **genel içerik** ✗ |
| `'pending'`, `'ADMIN'` | **genel içerik** ✗ |

Yani koruma, verinin **bozulma biçimine** bağlıydı — ki bu, korumanın
olmaması demektir. `normalizeTier` artık tanınmayan her değeri
`'unverified'` sayar.

Normalleştirme büyük/küçük harf **toleranslı değil**: `'ADULT'` yazılmışsa
bu bir veri hatasıdır ve gizlenmemelidir.

### Bilinmeyen gerekçe sessizce 24 saate düşerdi

`queue.priorityFor` bilinmeyen bir gerekçeyi `normal` sayar — bilinmeyenler
için makul bir varsayılan. Ama biri yeni bir gerekçe ekleyip öncelik
haritasına yazmayı unutursa, **CSAM sınıfı bir olay da 24 saat beklerdi** ve
hiçbir test bunu yakalamazdı.

`tests/reasonCoverage.test.js` kapsamı zorunlu kılar:

| Kontrol | Ne yakalar |
|---|---|
| Proxy'nin kuyruğa düşürdüğü her gerekçenin açık önceliği var | Yeni bir tarama dalı eklenip haritaya yazılmaması |
| Her rapor gerekçesinin açık önceliği var | `REPORT_REASONS`'a ekleme yapılıp haritanın unutulması |
| Güvenlik gerekçeleri `critical` | Bir gerekçenin sessizce hafifletilmesi |
| Kritik SLA gerçekten 1 saat | Öncelik adı doğru ama sürenin yanlış olması (ayrı şeyler) |
| Güvenlik gerekçeleri en az askı üretir | Yaptırım haritasının ayrışması |

Proxy gerekçeleri sabit listeden değil, **kararı gerçekten çalıştırarak**
türetilir: sabit liste yazmak, listenin kendisinin eskimesine açıktır.

Mutasyon kontrolleri: `minor_in_distress` haritadan silindiğinde 3 test,
kritik SLA 24 saate çıkarıldığında 5 test kırmızıya döndü.

### İki katman aynı soruyu aynı yanıtlamalı

İstemci ve sunucu sınıflandırması bilerek AYRI işler yapar (biri anlık geri
bildirim, diğeri bağlayıcı karar) — ama aynı girdiye aynı anlamı vermelidir.
İki yerde ayrışmışlardı:

**1. Bozuk etiket.** Sunucu `score()` bozuk bir değeri (NaN, metin, null) 1
sayarken istemci `toSignals()` 0 sayıyordu. İstemci fail-OPEN'dı: bozuk yanıt
üreten bir native katman kullanıcıya "bu güvenli olarak paylaşılacak" der,
sunucu sonra `adult` derecelendirirdi — dosyanın kaçınmak istediğini
söylediği sürprizin ta kendisi. Artık ikisi de: eksik → 0, bozuk → 1.

**2. Derece sözlüğü.** Sunucu temiz içeriğe `'safe'` diyordu; istemcinin
`ContentRating` tip birliğinde böyle bir değer YOK (`general`, `sensitive`,
`adult`, `review`, `blocked`). Kazara çalışıyordu, çünkü `isVisibleTo`
bilinmeyen dereceyi "kısıtlanmamış" sayıp geçiriyordu. İki risk taşıyordu:
ileride dereceler üzerine exhaustive `switch` yazan biri varsayılan dala
düşer ve fail-open/fail-closed davranışı kazara belirlenirdi; ayrıca `'safe'`
bu kod tabanında zaten **yaş kademesi** anlamına geliyordu (`AgePolicy`),
yani aynı kelime iki kavramı gösteriyordu.

Sunucu artık `'general'` üretiyor ve bir test sözleşmeyi kilitliyor: 12 farklı
girdi × 4 içerik türü için üretilen her derecenin istemcinin sözlüğünde
bulunduğu doğrulanıyor. Sözlük dışı bir değere dönüldüğünde 3 test kırmızıya
döndü.

### Neden ayrı bir HTTP katmanı var

Diğer dosyalar saf politikayı doğrular. Politika doğru olsa bile uç yanlış
kablolanmış olabilir: middleware unutulur, durum kodu yanlış seçilir, başlık
farklı okunur, router yanlış önekle monte edilir. Bunların hiçbiri birim
testine görünmez.

Bu katman gerçek bir kusur buldu: `JWT_SECRET` tanımsızken `createHmac`
middleware'in **içinde** fırlıyordu. Yanlış yapılandırılmış bir dağıtımda
ücretli her uç 500 döner, sebep yanıttan anlaşılmaz ve bazı Express
kurulumlarında yığın izi gövdeye sızabilirdi. Moderasyon uçları aynı durumda
zaten temiz 503 döndürüyordu — iki yerin farklı davranması, birinin yanlış
olduğu anlamına geliyordu. Artık ikisi de 503 döner.

Testler bağımlılıksızdır: supertest kurulmadı, Express uygulaması geçici bir
portta dinletilip Node'un global `fetch`'iyle çağrılıyor.

Backend testleri bağımlılıksız çalışır: `npm test` (kök) → `node --test`.

## 10. Deepfake ve telif koruması (`core_gateway/ai_studio/`)

Even Girl Generate, 5 referans fotoğraftan **kimlik koşullu** üretim yapar.
Referans olarak bir ünlünün fotoğrafı verilirse çıktı, o kişinin hiç
yapmadığı bir şeyi yapıyormuş gibi görünen fotogerçekçi bir görüntüdür —
yani deepfake. Aynı şey ticari markalı bir karakter için telif ihlalidir.

### Kapı sırası

```
1. Yetki          requireProEntitlement          — PRO değilse hiç başlamaz
2. Konsept        negativePrompts.buildPrompt    — enjeksiyon + sadeleştirme
3. METİN hattı    restrictedRegistry.screenConcept — konseptte kısıtlı isim
4. GÖRÜNTÜ hattı  faceScreening.screenReferences — referansta kısıtlı yüz
5. Bütünlük       assertBaseNegativeIntact       — taban liste eksiksiz mi
6. Üretim
```

Ucuz metin kapıları önce çalışır; yüz taraması en pahalı adımdır (5 gömme +
kayıt sorgusu). Ama **bütünlük doğrulaması en sona konur**: amacı, kendisinden
önceki hiçbir adımın negatif listeyi düşürmediğini üretim çağrısına **bitişik**
olarak kanıtlamaktır.

### İki hat, iki ayrı soru — ikisi de gerekli

| Hat | Soru | Yalnızca bu olsaydı ne kaçardı |
|---|---|---|
| METİN | Konsept metninde kısıtlı isim geçiyor mu | İsmi yazmadan ünlü fotoğrafı yüklemek |
| GÖRÜNTÜ | Referans fotoğraftaki yüz kısıtlı kimliğe mi ait | "&lt;ünlü&gt; tarzında" yazıp kendi fotoğrafını yüklemek |

### Kategoriler ve yaptırım

| Kategori | Gerekçe | Yaptırım |
|---|---|---|
| `public_figure` | Kişilik / benzerlik hakkı | **blok** |
| `political` | Seçim manipülasyonu | **blok** |
| `trademark` | Telif ve marka hakkı | **blok** |
| `private_opt_out` | Kişinin kendi benzerliğini koruması | **blok** |

Siyasi içerik **istisnasız** bloke. Bir seçim döneminde bir siyasetçinin
fotogerçekçi sahte görüntüsü en yüksek zarar potansiyeli olan çıktıdır ve
"parodi" ayrımını otomatik yapmanın güvenilir bir yolu yoktur.

### Yazım oyunları: bir testin bulduğu gerçek atlatma yolu

İlk uygulama noktalamayı **boşluğa çeviriyordu**. Sonuç:

```
"E.l.o.n M-u-s-k"  →  "e l o n m u s k"   ✗ kayıttaki "elon musk" ile eşleşmez
```

Yani ayırıcıyı boşluğa çevirmek, tam olarak yakalanmaya çalışılan oyunu
**çalışır hâle getiriyordu**. Düzeltme: noktalama **silinir**, kelimeleri
yalnızca gerçek boşluk ayırır; üstüne `matchKey` boşlukları da kaldırır.

```
Elon Musk · ELON MUSK · E.l.o.n M-u-s-k · Élon Músk
Ｅｌｏｎ　Ｍｕｓｋ · Elon-Musk · elon_musk · El'on Musk
elon<ZWSP>musk · elon<RLO>musk · elon<BOM>musk
                        │
                        ▼
                   "elonmusk"          ← hepsi tek anahtara iner
```

Aynı sınıf hata konsept sadeleştiricisinde de vardı: bidi override (`U+202E`)
gibi görünmez kontroller boşluğa çevriliyordu. Onlar da artık siliniyor.
Kayıt bu anahtarla indekslenmelidir.

Konsept 3-5 kelimedir; **tüm 1-4 kelimelik pencereler** denenir. Tek kelimeye
bakmak iki kelimelik isimleri kaçırırdı.

### Yüz taraması

- **Gömme saklanmaz.** Yüz gömmeleri **biyometrik veridir** (GDPR Md.9 /
  BIPA). İstek süresince bellekte tutulur, hiçbir yere yazılmaz; denetim
  kaydına gömme, benzerlik vektörü veya fotoğraf referansı **taşınmaz** —
  yalnızca kullanıcı, kategori ve sonuç. Bunun bir testi var.
- **5 referansın TEK BİRİNDE** eşleşme üretimi durdurur. "Çoğunluk kuralı",
  4 kendi + 1 ünlü fotoğrafıyla kimlik harmanlamayı serbest bırakırdı — ki bu
  deepfake üretmenin en bilinen yoludur.
- **Eşik düşük tutulur** (`match: 0.62`). Bu kapıda yanlış pozitifin bedeli
  bir yeniden yükleme; yanlış negatifin bedeli, gerçek bir insanın hiç
  yapmadığı bir şeyi yapıyormuş gibi görünen bir görüntüdür.
- **Fail-closed.** Tarayıcı çalışmadıysa üretim yapılmaz. Deepfake kapısının
  "tarayıcı bozuk, geç" modu olamaz.
- **Aynı fotoğrafı 5 kez yüklemek** geçerli bir referans seti değildir.
- **Tarama üretimden ÖNCEdir.** Sonra yapılsaydı, kısıtlı kimliğin sahte
  görüntüsü bir kez üretilmiş olurdu — diskte, log'da, önbellekte. Silmek
  onu üretilmemiş yapmaz.

### Negatif prompt: kullanıcı YALNIZCA EKLEYEBİLİR

Naif birleştirme tüm güvenlik listesini düşürebilir:

```js
negative = BASE + ", " + userNegative      // ✗ userNegative = '", positive: nsfw'
```

Uygulanan model:

1. Taban liste **sabittir** ve kullanıcı metniyle **aynı string'e girmez** —
   ayrı bir alan olarak taşınır (`{ positive, negative[] }`).
2. Kullanıcı metni önce enjeksiyon açısından taranır (13 kalıp).
3. Metin harf/rakam/boşluk/tire'ye indirgenir; tırnak, süslü ve köşeli
   parantez, iki nokta, ters eğik çizgi, dolar, tilde — prompt yapısını
   taşıyan her karakter düşer. 3-5 kelimelik meşru bir konsept noktalama
   taşımaz, yani bu indirgeme konsepti bozmaz.
4. Taban liste **her zaman önce ve tam** gelir; dizi `Object.freeze`'lidir.

"Kullanıcı yalnızca ekleyebilir" tek cümlelik değişmezdir ve **testi vardır**.

Reddedilen istekte **hangi kalıbın eşleştiği kullanıcıya söylenmez**: bu
bilgi, kapıyı deneme-yanılmayla kalibre etmenin tarifidir.

### Kayıt okunamıyorsa ne olur

`lookupRestrictedNames` **hata fırlatmalıdır**. Boş dizi döndürüp "eşleşme
yok" demek, veritabanı hatasında deepfake kapısını sessizce açmaktır. İskelet
bu yüzden yorumla işaretlenmiştir.

### Test kapsamı

`tests/aiStudioGuard.test.js` (28 test). Mutasyon kontrolleri:

| Mutasyon | Sonuç |
|---|---|
| Noktalama yeniden boşluğa çevrildi | 1 test kırmızı |
| Bidi kontrolleri boşluğa çevrildi | 1 test kırmızı |
| Taban listeden `minor` düşürüldü | 2 test kırmızı |

## 11. Sürüm öncesi kontrol listesi

- [ ] `npm run verify` yeşil
- [ ] NSFW modelinin **gerçek** SHA-256 özeti `ModelRegistry` içinde (kapı yer tutucuyu reddeder)
- [ ] Sunucu tarafı sınıflandırma ve filtre, istemcideki politikayla **aynı eşikleri** kullanıyor
- [ ] Moderasyon kuyruğu için 24 saat SLA'sı olan bir ekip/süreç var
- [ ] `minor-safety` raporları için yasal bildirim süreci tanımlı (NCMEC vb.)
- [ ] `MODERATION_STAFF_SECRET` üretimde güçlü ve rastgele; personel jetonları kısa ömürlü
- [ ] `scannerClient.createScanner` gerçek sağlayıcıyla kuruldu — `moderationDeps.scanMedia` yer tutucusu değiştirildi
- [ ] Bilinen CSAM karma listesi erişimi (NCMEC / IWF) sağlandı ve hat 1 canlı test edildi
- [ ] `GET /internal/moderation/sla` izleme sistemine bağlandı; 503 sayfa çağırıyor
- [ ] `loadAttachmentState` gerçek DB'de eksik kaydı `approved` DÖNDÜRMÜYOR
- [ ] `claimItem` tek sorguda atomik (`WHERE claimed_by IS NULL RETURNING *`)
- [ ] Nöbetçi rolleri atandı; `terminate` yetkisi yalnızca `lead` rolünde
- [ ] Kısıtlı kimlik kaydı bağlandı ve **`matchKey` biçiminde** indekslendi
- [ ] `lookupRestrictedNames` DB hatasında boş dizi DEĞİL, hata fırlatıyor
- [ ] `faceDeps.screenFaces` gerçek biyometrik sağlayıcıyla kuruldu
- [ ] Yüz gömmelerinin hiçbir log, önbellek veya kuyruğa yazılmadığı doğrulandı
- [ ] Ünlü fotoğrafıyla üretim denendi ve reddedildiği görüldü (5/5 ve 1/5 referans)
- [ ] Prompt enjeksiyon listesi kırmızı takım denemesinden geçirildi
- [ ] Siyasi kimlik kaydı hedef pazarların seçim takvimine göre güncelleniyor
- [ ] Store listing ve ekran görüntülerinde yetişkin içerik **yok**
- [ ] Yaş kapısı gerçek cihazda test edildi; 29 Şubat ve yıl başı sınırları denendi
- [ ] Mayolu ve spor kıyafetli örneklerle yanlış pozitif oranı ölçüldü
