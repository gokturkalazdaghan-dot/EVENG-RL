# EVEN GIRL — Performans, Batarya ve Önbellek (Modül 2)

## 1. Kaydırmalı arayüz: neden UI thread?

React Native'de bir jesti `onTouchMove` + `setState` ile takip etmek, her karede
JS köprüsünden geçmek demektir. JS thread ağır bir iş yaparken (proje listesi
hesaplama, model yükleme, dosya taraması) kaydırma **takılır** — ve bu, bu
kategorideki uygulamalarda kullanıcının fark ettiği en belirgin kalite farkıdır.

Bu yüzden jest ve animasyon Reanimated worklet'leri olarak **UI thread'inde**
çalışır. Parmak hareketi ile pikselin hareketi arasında JS yoktur.

| Ne | Nerede çalışır | Kare başına maliyet |
|---|---|---|
| Pan jesti takibi | UI thread (worklet) | JS köprüsü yok |
| Sayfa/panel dönüşümü | UI thread (worklet) | JS köprüsü yok |
| Gösterge nokta animasyonu | UI thread (shared value okuması) | JS köprüsü yok |
| Sayfa değişimi bildirimi | JS (`runOnJS`) | **Geçiş başına 1 kez** |

### Jest ayrımı: yatay vs. dikey

Tutarlılık kuralı: **yatay = ekranlar arası, dikey = katmanlar arası.**

Çakışma `activeOffsetX` / `failOffsetY` eşikleriyle çözülür:

- `GestureShell` yatay niyet için 12 px ister, 18 px dikey harekette **başarısız
  olur** → dikey jest devralır.
- `LayerSheet` bunun simetriğini yapar.

Bu eşikler olmadan her dikey scroll denemesi sayfayı hafifçe kaydırır ve arayüz
"kaygan" hissettirir — kullanıcı neyin ne yaptığını öğrenemez.

### Geçiş kararı: mesafe VEYA hız

Yalnızca mesafeye bakmak, deneyimli kullanıcıların en sık yaptığı hareketi —
kısa ve hızlı fırlatma (fling) — yok sayar. Karar:

```
geçiş = (mesafe > genişliğin %28'i) VEYA (hız > 550 px/sn)
```

`LayerSheet` ayrıca **hız izdüşümü** kullanır: parmağın bıraktığı hızla 150 ms
sonra nerede olunacağı hesaplanıp en yakın yakalama noktası seçilir.

### Kenar direnci (rubber banding)

Sınırların ötesinde hareketin yalnızca 1/3'ü uygulanır. Sert duvar, kullanıcıya
"uygulama dondu" hissi verir; direnç ise sınıra ulaşıldığını hissettirir.

### Erişilebilirlik

Kaydırma **tek giriş yolu değildir**. `PageIndicator` noktalarına dokunarak da
geçiş yapılır ve dokunma hedefi görsel noktadan büyüktür (6 px'lik bir noktaya
isabet ettirmek imkânsızdır). Kullanıcı sistemde "hareketi azalt" seçmişse
yaylı animasyonlar kısa timing'e döner.

## 2. Batarya koruma ve termal yönetim

### Güç profilleri

| Profil | Hesaplama | Eşzamanlı iş | Kare atlama | Maks. çıktı kenarı | Ön-render | Soğuma |
|---|---|---|---|---|---|---|
| `performance` | NPU | 3 | 1 | 4096 px | ✔ | 0 ms |
| `balanced` | NPU | 2 | 1 | 2560 px | ✔ | 120 ms |
| `saver` | GPU | 1 | 2 | 1440 px | ✘ | 400 ms |
| `critical` | CPU | 1 | 4 | 720 px | ✘ | 1200 ms |

### Profil seçimi (`ThermalPolicy.targetProfileFor`)

En kısıtlayıcı koşul önce değerlendirilir, ilk eşleşen kazanır:

1. Termal `critical` **veya** şarjsız pil ≤ %10 → `critical`
2. Termal `serious` **veya** düşük güç modu → `saver`
3. Termal `fair` **veya** şarjsız pil ≤ %25 → `balanced`
4. Aksi halde: şarjdaysa `performance`, değilse `balanced`

İki bilinçli karar:

- **Kritik sıcaklıkta şarjda olmak profili yükseltmez.** Şarj olurken ısınma
  daha da kötüdür.
- **Pille çalışırken sağlıklı cihazda bile `performance` seçilmez.** Aksi
  halde kullanıcının fark ettiği tek şey hızla eriyen pil olur.

### Merdiven geçişi (`ThermalPolicy.nextProfile`) — asimetrik

| Yön | Davranış | Gerekçe |
|---|---|---|
| **Kısıtlama** | Derhal, tek kademe | Geç kalmış kısıtlama, kısıtlama yapmamaktan kötüdür: cihaz throttle'a girer ve *her şey* yavaşlar |
| **Gevşetme** | Hedef 20 sn stabil kaldıysa, tek kademe | Aksi halde eşikte profil salınır ve kullanıcı çıktı kalitesinin zıpladığını görür |

Her iki yönde de **tek kademe** hareket edilir: `critical`'dan doğrudan
`performance`'a sıçramak yeni bir ısınma döngüsü başlatır.

Bu mantık `ThermalPolicy.ts` içinde **saf fonksiyonlar** olarak durur ve
16 birim testiyle doğrulanır — cihaz/emülatör gerekmez.

### Arayüzle bağlantı

`saver`/`critical` profilinde `ThemeProvider` hareket profilini `reduced`a
düşürür: yaylı animasyonlar kısa timing'e döner, cihaz daha az kare üretir.
`ContextualToolbar` ise ağır araçları pasifleştirir ve **nedenini araç
üzerinde yazar** — kullanıcı önce tıklayıp sonra hata almaz.

### Native sinyal kaynakları (polling YOK)

| Platform | Termal | Güç tasarrufu | Pil |
|---|---|---|---|
| iOS | `thermalStateDidChangeNotification` | `NSProcessInfoPowerStateDidChange` | `batteryStateDidChange` + 60 sn timer |
| Android | `PowerManager.addThermalStatusListener` (API 29+) | `ACTION_POWER_SAVE_MODE_CHANGED` | `ACTION_BATTERY_CHANGED` |

Sıcaklığı döngüyle yoklamak, tam da önlemeye çalıştığımız pil tüketimini
yaratır. Android'in 7 kademeli termal ölçeği iOS'un 4 kademesine eşlenir;
JS tarafı tek ölçekle çalışır.

Pil seviyesi okunamadığında **0.5 raporlanır, 1.0 değil**: "pil dolu" varsaymak
kısıtlamanın hiç uygulanmamasına yol açar.

## 3. Bellek: neden GC'ye güvenilmez

TFLite/CoreML tensor'ları JS heap'inde değil **native heap'te** durur. JS
tarafındaki referans düşse bile:

- GC'nin ne zaman çalışacağı belirsizdir,
- JS GC'si native belleği zaten **saymaz**.

Sonuç: 4K bir kare için ayrılan 100+ MB, JS tarafı "boş" görünürken dakikalarca
tutulur ve uygulama iOS'ta jetsam, Android'de LMK tarafından öldürülür —
kullanıcı için "uygulama kapandı".

### Çözüm: TensorArena

```ts
await withArena('face-restore', async (arena) => {
  await arena.allocate(peakBytes, 'workspace');
  return runInference(...);
});
// scope biter bitmez native buffer'lar SERBEST — hata fırlasa bile (finally).
```

- `releaseEarly()` uzun işlem hatlarında ara çıktıyı hemen bırakır: 12 adımlı
  bir difüzyonda tepe bellek, tüm adımların toplamı yerine tek adımın maliyeti
  olur.
- `releaseUnderMemoryPressure()` bellek uyarısında önce **etkileşimsiz**
  arena'ları (arka plan ön-render) kapatır; kullanıcının beklediği iş en son
  feda edilir.

## 4. Akıllı önbellek yönetimi

### Neden gerekli

4K video düzenlemede tek bir proje 2-3 GB ara dosya üretir. Temizlenmezse
kullanıcı "uygulama 12 GB yer kaplıyor" deyip **uygulamayı siler**. Bu, bu
kategoride en büyük churn sebeplerinden biridir.

### Dizin ayrımı

| Dizin | Yedeklenir | İçerik |
|---|---|---|
| `projects/` | ✔ | Kullanıcının emeği |
| `render/` | ✘ | Ara render çıktıları |
| `thumbnails/` | ✘ | Zaman çizelgesi önizlemeleri |
| `models/` | ✘ | Çevrimdışı AI modelleri |

iOS'ta yedeklenen dizine büyük geçici dosya koymak hem App Store reddine
(Guideline 2.5) hem de "uygulama iCloud kotamı doldurdu" şikâyetlerine yol açar.

### İki aşamalı plan (`CachePolicy.planEviction`)

1. **Bayat temizlik** — 7 günden eski *render artıkları*, tavan aşılmasa bile
   silinir. Yalnızca render artıkları terk edilmiş ara çıktıdır; eski bir modeli
   "bayat" diye silmek çevrimdışı yeteneği sessizce kaldırır.
2. **Tavan eviction** — 1 GB tavan aşıldıysa, **tavanın %70'ine** kadar inilir.
   Tam sınıra kadar silmek, her yeni dosyada yeniden temizlik tetikler (thrashing).

Silme sırası: kova önceliği (`render` > `thumbnail` > `model`), eşitlikte
**LRU**, tam eşitlikte yola göre — aynı girdi her çalıştırmada aynı planı üretir.

### Korunan dosyalar (pinned)

Aktif proje dosyaları ve süren render çıktıları hiçbir aşamada silinmez, ancak
**boyutları tavan hesabına dahildir**. Dahil edilmeseydi, 800 MB'lık korunan bir
dosya varken 400 MB'lık silinebilir içerik "tavanın altında" görünür ve temizlik
hiç çalışmazdı.

Korunan dosyalar tek başına tavanı aşarsa plan hedefe **ulaşamaz** ve bu
kabul edilir: hedefe ulaşmak, kullanıcının süren işini öldürmekten daha önemli
değildir.

### Ne zaman çalışır

| Tetikleyici | Neden |
|---|---|
| Uygulama arka plana alındığında | Dosya sistemi taraması kare bütçesini bozar; ön planda **asla** çalışmaz |
| Dışa aktarım tamamlandığında | Ara dosyaların en çok biriktiği an |
| Kullanıcı "Temizle" dediğinde | `StorageScreen` — modeller varsayılan olarak korunur |

`AppLifecycle.runMaintenanceOnce()` yeniden giriş korumalıdır: iki kaynaktan
aynı anda tetiklenirse ikinci çağrı beklemeden döner (paralel iki tarama,
silinmekte olan dosyaları iki kez planlar).

## 5. Test edilen ne, edilmeyen ne

**Test edilir (30 test):** `ThermalPolicy` ve `CachePolicy` — ikisi de saf
fonksiyon, platform bağımlılığı yok.

Bu ikisinin seçilmesi keyfi değil: her ikisindeki hata da **sessizdir**. Termal
politikadaki hata cihazı ısıtır veya kaliteyi sebepsiz düşürür; önbellek
politikasındaki hata kullanıcının emeğini siler. Hiçbiri log'da görünmez,
yalnızca kullanıcı fark eder.

**Test edilmez:** Bileşen anlık görüntüleri (snapshot). Yerleşim regresyonlarını
yakalamazlar, her stil değişiminde güncellenirler ve gerçek bir hatayı
gösterdikleri nadirdir. Jest davranışı gerçek cihazda doğrulanır.

**Testlerin dişi var mı:** Mutasyon kontrolüyle doğrulandı — pinlenmiş dosya
hesabı ve kova önceliği bilerek bozulduğunda ilgili testler kırmızıya döndü.

## Tek bozuk boyut tahliyeyi tamamen kapatıyordu

Önbellek girdilerinin boyutu `Number(item.size)` ile okunuyordu.
`react-native-fs` boyutu `number` olarak tipler ama değer native katmandan
gelir; bazı Android sağlayıcılarında dize veya eksik olabilir.

Tek bir eksik değer toplamı `NaN` yapıyordu ve sonuç şuydu:

```
NaN > CACHE_LIMIT_BYTES   →  false   → tahliye HİÇ tetiklenmez
[3, NaN, 1].sort(...)     →  bozuk   → tahliye sırası anlamsızlaşır
```

Yani **tek bir bozuk girdi, disk dolana kadar sessizce tüm önbellek
yönetimini devre dışı bırakıyordu.** Kullanıcı için görünen tek şey
"depolama doldu" olurdu; sebebi hiçbir yerde görünmezdi.

`safeBytes` sonlu ve pozitif olmayan her değeri **0** sayar. Uydurulmuş bir
boyut yazmak yerine toplamı eksik bildirmek, `NaN`'ın her şeyi kapatmasından
kesinlikle iyidir: bilinen dosyalar için tahliye çalışmaya devam eder.

Aynı düzeltme `ModelStore.installedBytes` içinde de uygulandı — Depolama
ekranı aksi hâlde "NaN MB" gösterirdi.

Mutasyon kontrolü: `safeBytes` `NaN` sızdıracak şekilde gevşetildiğinde
3 test kırmızıya döndü.
