# EVEN GIRL — Gizlilik, Çevrimdışı Çalışma ve Etik (Modül 4)

## 1. Sıfır kişisel veri: ne anlama geliyor, ne anlama gelmiyor

**Toplanmayanlar:** e-posta, telefon, isim, cinsiyet, doğum tarihi, hesap,
cihaz kimliği, kurulum kimliği, reklam kimliği (IDFA/GAID), IP kaydı, konum,
rehber, kullanım analitiği.

Uygulamada **hesap yoktur.** Abonelik, mağazanın ürettiği anonim bir kimlikle
takip edilir (bkz. `docs/BILLING.md`).

### Bu bir slogan değil, derleme kapısı

`tools/verify-privacy.mjs` her CI çalışmasında dört şeyi denetler:

| Kontrol | Ne yakalar |
|---|---|
| A | Kaynak kodda yasaklı kimlik API'si (`getUniqueId`, `identifierForVendor`, `AdvertisingIdClient`, `ATTrackingManager`, IMEI, MAC, konum, rehber) |
| B | Yasaklı paket (Sentry, Crashlytics, Firebase Analytics, AdMob, AppsFlyer, Segment, Mixpanel, Amplitude, device-info) |
| C | Android manifest'inde yasaklı izin (`AD_ID`, `READ_CONTACTS`, konum, `READ_PHONE_STATE`, `GET_ACCOUNTS`) |
| D | Çökme raporu şemasında kimlik alanı (`deviceId`, `installId`, `userId`, `ipAddress`, `advertisingId`) |

Yorum satırları taranmaz — "IDFA okumuyoruz" yazan bir yorum ihlal değildir.

Bu kapı olmadan ilke, altı ay sonra eklenen bir analitik SDK'sıyla sessizce
kaybolurdu. **Üç yoldan da kapandığı doğrulandı** (yasaklı paket, yasaklı API
çağrısı, rapor şemasına kimlik alanı ekleme).

## 2. Anonim çökme raporlama

### Çelişki gibi görünen şey

"Sıfır veri" ile "çökme nedenini görmek" çelişmez: yığın izinin teşhis değeri
**dosya adları ve satır numaralarındadır**, kullanıcının kim olduğunda değil.

### Ama yığın izleri farkında olmadan kişisel veri taşır

| Sızıntı | Örnek | Çözüm |
|---|---|---|
| Kullanıcı adı | `/Users/gokturk/src/app.js` | Yol atılır, yalnızca dosya adı kalır |
| Android paket yolu | `/data/user/0/com.evengirl.app/...` | Aynı |
| Token | `bundle.js?token=abc123` | Sorgu dizesi kesilir |
| E-posta / URL / IP / UUID | hata mesajlarında | Kalıp eşleşmesiyle çıkarılır |
| Medya adı | `IMG_20240612_Antalya.jpg` | Tarih ve konum sızdırır → çıkarılır |

`Scrubber.ts` bu işi yapar ve **en yoğun test edilen mantıktır** (27 test).
Buradaki bir hata sessiz bir gizlilik ihlalidir.

> **Test yazarken iki gerçek hata bulundu.** Birincisi: yol temizliği dosya
> adından önce çalıştığı için Android yığın kareleri tamamen `<path>` oluyor
> ve rapor teşhis değerini kaybediyordu. İkincisi: dosya adı ayrıştırıldıktan
> sonra `bundle.js?token=...` sorgu dizesi hayatta kalıyordu. Her ikisi de
> düzeltildi.

### Gönderilenler / gönderilmeyenler

| Gönderilir | Gönderilmez ve neden |
|---|---|
| Temizlenmiş mesaj ve yığın | Kurulum/cihaz kimliği — **kimlik oluşturur** |
| Yığın imzası (FNV-1a hash) | Tam cihaz modeli — `iPhone15,3 + tr-TR + 03:14` küçük popülasyonlarda tekilleştirici |
| Uygulama sürümü, platform, OS **ana** sürümü | Yama sürümü — tekilleştirici olabilir |
| Cihaz sınıfı (`low`/`mid`/`high`) | Dakika hassasiyetli zaman — iki raporu aynı kişiye bağlar |
| Saate yuvarlanmış zaman | Ekran adı, girdi verisi, dosya adları |

**Bilinçli takas:** Gruplama cihaza göre değil, yığın imzasına göre yapılır.
"Kaç cihaz etkilendi" sorusunu kaybediyoruz; karşılığında kimseyi izlemiyoruz.

### Son savunma hattı

`containsLikelyPii` gönderilecek JSON'u son bir kez tarar. Temizleyiciden bir
kalıp kaçtıysa **rapor gönderilmez**. Sessizce sızdırmaktansa çökme verisini
kaybetmeyi tercih ediyoruz.

### Dürüst sınır: IP adresi

> **İstemci kendi IP'sini sunucudan gizleyemez.** İstemci tarafında
> yapılabilecek her şey yapılmıştır, ama bu tek başına yeterli değildir.
>
> IP'yi hiç kaydetmemek **alıcı tarafın sözleşmesidir**: `crash.evengirl.app`
> ucu, IP'yi uygulama katmanına geçirmeden kenarda (edge) düşürmek ve erişim
> loglarında saklamamak zorundadır. Bu, gizlilik politikasında beyan edilir ve
> altyapı yapılandırmasıyla uygulanır — uygulama kodu bunu garanti edemez ve
> ediyormuş gibi sunulmaz.

Raporlama kullanıcı tarafından kapatılabilir (`setCrashReportingEnabled`).

## 3. Çevrimdışı çalışma

### Neden önemli

Metroda, uçakta ve zayıf bağlantıda çalışan bir düzenleyici, kategoride
ölçülebilir bir fark yaratır. Ayrıca çevrimdışı çalışan her araçta **medya
cihazdan hiç çıkmaz** — bu, en güçlü gizlilik garantisidir.

### Yerel / uzak ayrımı

| Yerelde çalışır (medya cihazdan çıkmaz) | Yalnızca sunucu (medya cihazdan çıkar) |
|---|---|
| Kırpma, filtre, kesme, boyutlandırma | Metinden video |
| Sihirli silgi (LaMa) | Üretken kaldırma / genişletme (difüzyon) |
| Lens bulanıklığı (derinlik) | AI avatar, yaş dönüşümü, konsept portre |
| Yüz onarımı, HD netleştirme | Akıllı şablon önerisi |
| Stüdyo arka planı, nesne takibi, otomatik altyazı | |

Bu ayrım kullanıcıdan **gizlenmez**: araç çubuğundaki "ÇEVRİMDIŞI" rozeti,
tahmin değil ölçülen durumdur — model gerçekten kurulu ve cihaz gerçekten
yetiyorsa görünür.

### Yönlendirme kararı

`RoutingPolicy.ts` saf bir fonksiyondur (17 test). Sırası:

1. **Yetki** — ücretli yetenek, abone olmayana açılmaz
2. **Etik onayı** — üretken/yüz araçlarında zorunlu
3. **Kritik termal** → sunucu tercih edilir (cihazı daha fazla ısıtmamak için)
4. **Varsayılan** → yerel (veri çıkmaz, gecikme yok, bant genişliği yok)
5. **Yerel yoksa** → sunucu

Yetki kontrolü etik onayından **önce** gelir: kullanıcıya onay modalı gösterip
ardından "zaten abone değilsin" demek kötü bir sıralamadır.

**Reddetme sebepleri ayırt edilir.** "İnternete bağlanın" ile "cihazınız
yetersiz" farklı eylemler gerektirir; yanlışını göstermek kullanıcıyı boş yere
uğraştırır.

### Model dosyaları

Toplam ~260 MB, uygulama paketinde **değil**, CDN'den indirilir (App Store
hücresel indirme sınırı 200 MB; pakete eklemek indirme oranını düşürür).

| Kural | Neden |
|---|---|
| SSL pinlenmiş kanaldan indirilir | İndirilen model **cihazda çalışan koddur** |
| SHA-256 doğrulanır | Doğrulanmayan dosya silinir, çalıştırılmaz |
| Hücreselde >5 MB için onay istenir | "Faturam neden şişti" şikâyetlerinin sebebi |
| İndirme sırasında dosya pinlenir | Önbellek bakımının yarım dosyayı silmesi sonsuz döngü üretir |
| Sürüm dosya adına gömülür | Güncellemede eski sürüm otomatik temizlenir |

## 4. Bellek disiplini (çıkarım tarafı)

| Katman | Kural |
|---|---|
| Tensor | `withArena` scope'u; `finally` ile hata durumunda da bırakılır |
| Model oturumu | En fazla 2 model bellekte; LRU ile atılır |
| Delegate değişimi | Termal düşüşte oturum yeniden kurulur (delegate çalışma anında değişmez) |
| Bitmap (Android) | `recycle()` zorunlu; ardışık karelerde bellek doğrusal büyür |
| CVPixelBuffer (iOS) | `autoreleasepool` içinde; blok olmadan video karelerinde birikir |
| Arka plan | Tüm interpreter'lar kapatılır — OS'un uygulamayı öldürme olasılığını en çok düşüren adım |

**Piksel verisi JS köprüsünden geçmez.** Giriş/çıkış URI olarak taşınır; 4K
bir kareyi köprüden geçirmek tek başına yüzlerce ms ve iki kat bellektir.

Android'de görüntü `inSampleSize` ile **çözülürken** küçültülür: 48 MP bir
fotoğrafı tam boyutta çözmek ~190 MB'dır.

## 5. Etik ve telif

### İki katmanlı onay

1. **Genel** — ilk açılışta bir kez: üretken AI'nın doğası, telif sorumluluğu.
2. **Yüz** — yüz üzerinde çalışan bir araç **ilk kez** kullanıldığında.

Ayrı sorulmasının sebebi: kullanıcı "AI ile filtre uyguluyorum" ile
"başkasının yüzünü değiştiriyorum" arasındaki farkı, ikincisini **yaparken**
görmeli. Açılışta gösterilen tek bir uzun metin okunmaz.

### Reddetme gerçek bir seçenektir

Uygulama kapanmaz; yalnızca ilgili araçlar kapalı kalır. "Kabul et ya da çık"
kalıbı hem etik olarak zayıftır hem de AB'de rızanın geçerliliğini tartışmalı
hâle getirir (GDPR md. 7: rıza özgür iradeyle verilmiş olmalı).

Onay **cihazda** tutulur, sunucuya gönderilmez (kimlik oluşturur) ve
ayarlardan geri çekilebilir. `DISCLAIMER_VERSION` değişince yeniden sorulur.

## 6. Mağaza veri beyanları

Bu mimarinin doğrudan sonucu:

| Beyan | Değer |
|---|---|
| Apple — App Privacy | "Data Not Collected" |
| Google Play — Data safety | Toplanan veri yok; çökme verisi paylaşılıyor, **anonim ve kullanıcıyla ilişkilendirilmiyor** |
| Apple — Tracking | Yok (`NSUserTrackingUsageDescription` tanımlı değil) |
| Play — Reklam kimliği | `AD_ID` izni manifest'ten açıkça kaldırıldı |

## 7. Sürüm öncesi kontrol listesi

- [ ] `npm run verify` yeşil (güvenlik + gizlilik + i18n + tip + test)
- [ ] `crash.evengirl.app` ucu IP'yi kenarda düşürüyor ve loglamıyor
- [ ] Model dosyalarının gerçek SHA-256 özetleri `ModelRegistry` içinde
- [ ] Uçak modunda: çevrimdışı araçlar çalışıyor, diğerleri **rozetle** pasif
- [ ] Etik onayı reddedildiğinde uygulama çalışmaya devam ediyor
- [ ] Gerçek bir çökme raporu ele alınıp içinde PII olmadığı gözle doğrulandı
- [ ] Gizlilik politikası metni bu dokümanla tutarlı

## 8. Geri bildirim akışı ve gizlilik

Ayarlar ekranındaki geri bildirim düğmesi, kullanıcının **kendi posta
uygulamasını** açar (`mailto:`). Uygulama içi bir form kullanılmadı — ve bu
bilinçli bir karardır:

| Uygulama içi form | `mailto:` |
|---|---|
| Mesaj bizim sunucumuza gider | Mesaj kullanıcının posta sağlayıcısından gider |
| Gönderim kaydı, zaman damgası ve (kaçınılmaz) IP kaydı oluşur | Bizde hiçbir kayıt oluşmaz |
| Kullanıcı ne gönderildiğini tam olarak göremez | Kullanıcı tam metni görür ve düzenleyebilir |
| Hesapsız bir uygulamada bile bir "gönderim kimliği" doğar | Kimlik doğmaz |

"Sıfır veri toplama" ilkesiyle tutarlı olan tek çözüm budur.

### E-postaya eklenen teşhis bilgisi

Çökme raporundakiyle **aynı disiplin** uygulanır:

| Eklenir | Eklenmez ve neden |
|---|---|
| Uygulama sürümü | Cihaz/kurulum kimliği — kimlik oluşturur |
| Platform + OS **ana** sürümü | Tam OS sürümü — tekilleştirici olabilir |
| Cihaz **sınıfı** (`low`/`mid`/`high`) | Tam cihaz modeli — dil ve saatle birleşince tekilleştirici |
| Arayüz dili | Zaman damgası — e-posta başlığında zaten var |
| Plan (`pro`/`free`) | Proje/dosya adları — kullanıcı içeriğidir |

Blok görünür bir `---` ayırıcıdan sonra gelir; kullanıcı **görür ve silebilir**.
Gizli hiçbir şey eklenmez. Bu, 15 birim testiyle doğrulanır (kimlik kalıbı,
cihaz modeli deseni ve zaman damgası biçimi için ayrı ayrı negatif kontrol).

### Düğmenin gerçekten çalışması

`Linking.openURL('mailto:...')` her cihazda çalışmaz: posta uygulaması kurulu
değilse çağrı sessizce reddedilir ve kullanıcı **hiçbir şey olmadığını** görür
— "bozuk düğme" algısı böyle doğar.

Bu yüzden önce `canOpenURL` denenir; başarısızsa destek adresi ekranda
`selectable` metin olarak gösterilir. Yeni bir pano kütüphanesi eklemeden
çalışan bir yedek yol sağlanmış olur.

Kaçış (escaping) `encodeURIComponent` ile yapılır. `encodeURI` **yetmez**:
`&` ve `#` karakterlerini kaçırmaz ve gövde yarıda kesilir — Türkçe
karakterler ve satır sonları da aynı şekilde bağlantıyı bozar. Testler bu üç
durumu ayrı ayrı kontrol eder.
