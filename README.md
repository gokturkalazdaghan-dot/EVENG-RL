# EVEN GIRL

Kurumsal düzeyde AI fotoğraf/video düzenleme uygulaması.

**Paket kimliği:** `com.evengirl.app` · **Yayıncı:** ARMANALABS

> **Bu depo `com.evenai.app`'ten türetildi** (kaynak commit `3d6e99b`).
> Kod, testler ve mimari kararlar oradan geldi; yalnızca marka ve kimlikler
> değişti. Ayrıntı ve devralınan borçlar: [`docs/FORK.md`](docs/FORK.md).

---

## Ne yapıyor

İki mod:

| Mod | Ne | Ücret |
|---|---|---|
| **Manuel & Botox Stüdyo** | Vücut/yüz şekillendirme, botoks çene hattı, cilt yumuşatma, leke silici — cihaz üstü, zorunlu fırçalama yok | Ücretsiz, sınırsız |
| **Even Girl Generate** | 5 referans foto + 3-5 kelime konsept → Light Sync, Cinematic Bokeh, Pore Preserve | PRO |

**Pore Preserve** neden var: difüzyon çıktısı gözenek ve ince tüy gibi yüksek
frekans detayı düzler; "uncanny valley" etkisinin ana kaynağı budur. Detay,
orijinal referans karodan hizalanıp geri taşınır.

Destek araçları: otomatik altyazı, nesne takibi, üretken silme, akıllı
şablonlar, Keşfet akışı, 24 saatlik hikayeler (PRO), şifreli DM (PRO),
içerik üretici abonelikleri.

---

## Depo yapısı

```
client_mobile/            React Native 0.76 + TypeScript (strict), iOS + Android native köprüler
core_gateway/
  ├── ai_studio/          Üretim kapısı: deepfake ve telif koruması
  └── moderation/         24 saat SLA kuyruğu + ban-hammer
social_gamification/      Akış, hikayeler, DM, zorunlu moderasyon tarama kapısı
export_gate/              Tek ücretsiz indirme hakkı, anti-capture tetikleyicisi
reward_automation/        Redis ZSET puanlama, haftalık mağaza teklif kodu dağıtımı
billing_infrastructure/   StoreKit 2 / Play Billing webhook senkronu, imzalı yetki token'ı
docs/                     Mimari kararlar ve gerekçeleri
tests/                    Backend testleri (node --test, bağımlılıksız)
```

---

## Taşınan üç ilke

**1. Yetki yalnızca mağazadan doğar.**
Backend hiçbir yerde `pro_expiry_date` yazmaz. Haftalık sıralama ödülü bile
mağazanın tek kullanımlık teklif koduyla dağıtılır ve kullanıcı native
kullanım kâğıdında kullanır. Veritabanından abonelik üretmek hem Guideline
3.1.1 ihlali, hem de abonelik durumuna ikinci bir yazar ekleyerek tek gerçek
kaynağı çatallar. → [`docs/BILLING.md`](docs/BILLING.md) §7

**2. Kapılar fail-closed ve üretimden öncedir.**
Tarayıcı çökerse içerik "temiz" sayılmaz. Hikaye ve DM eki taranmadan render
edilmez. Deepfake taraması üretimden **önce** çalışır — sonra çalışsaydı,
sahte görüntü bir kez üretilmiş olurdu ve silmek onu üretilmemiş yapmaz.
→ [`docs/SAFETY.md`](docs/SAFETY.md)

**3. Kimlik bilgisi toplanmaz.**
E-posta, telefon, isim veya cinsiyet **hiç istenmez**. Kimlik, mağazanın
ürettiği anonim `originalAppUserId`'dir. Yüz gömmeleri biyometrik veridir ve
hiçbir yere yazılmaz. Kilitlenme raporları PII, IP veya cihaz kimliği
taşımaz. → [`docs/PRIVACY.md`](docs/PRIVACY.md)

---

## Doğrulama

İddialar CI kapılarıyla zorunlu kılınmıştır — belge değil, kırmızıya
dönen kontroller:

```bash
# İstemci
cd client_mobile && npm run verify
#   verify:security  → SSL pin tutarlılığı (4 kaynak) + 16 model SHA-256
#   verify:privacy   → 10 yasak API, 10 yasak paket, 9 yasak izin,
#                      6 yasak Info.plist anahtarı
#   verify:i18n      → 8 dil, yer tutucu pariteleri, yasal metin
#                      zorunlulukları, kaynakta anılan anahtarların varlığı
#   verify:store     → mağaza ürün kimlikleri, fiyatlar, teklif kodları
#   verify:native    → proje iskeleti, bileşen adı, paket kaydı ve
#                      JS↔native köprü envanteri
#   typecheck + test → 480 test / 28 süit

# Backend
npm test             # 284 test, bağımlılıksız (node --test + node:sqlite)
```

Kritik garantiler **mutasyon testinden** geçirilmiştir: kapı kasten
gevşetildiğinde testlerin gerçekten kırmızıya döndüğü doğrulanmıştır.

### Kapıların yakaladığı hata sınıfları

Bu kapılar, **derlenen, testleri geçen ve incelemede doğru görünen** ama
kullanıcı için çalışmayan kodu yakalamak için eklendi. Her biri gerçekten
bir hata bulduğu için var:

| Kapı | Yakaladığı |
|---|---|
| Köprü envanteri (`verify:native`) | JS'in çağırdığı üç native modül hiçbir platformda yoktu; `TensorArena` sessizce `-1` döndürüp bellek ayırdığını sanıyordu |
| Uç sözleşmesi (`tests/apiContract`) | İstemcinin çağırdığı beş uç sunucuda yoktu — hepsi 404, istemci bunu "ağ hatası" sanıyordu |
| Ulaşılabilirlik (`ModuleReachability`) | Dokuz modül yazılmış, testten geçmiş ve hiçbir yerden çağrılmamıştı |
| Anahtar referansı (`verify:i18n`) | Bir hata mesajı, mesaj yerine anahtar adını gösteriyordu |
| Uçtan uca yayın (`tests/publishFlow`) | Tarayıcı hiç kurulmuyordu: fail-closed doğru çalışıyor ama hiçbir içerik onaylanmıyordu |
| Açılış kablolaması (`tests/bootWiring`) | Aynı desenin üç örneği: yer tutucu bağımlılık fail-closed davranıyor, özellik hiç çalışmıyor, hiçbir test görmüyor |
| Depo sözleşmesi (`tests/repositoryContract`) | `isPro` ve `billingIssue` alanları hiç dönmüyordu: ödeme yapan abone paywall'a çarpıyor, ödemesi başarısız olan uyarılmıyordu |
| Yanıt sözleşmesi (`tests/responseContract`) | Aynı sınıfın istemci↔sunucu tarafı: eksik alan `undefined` okunup `false`'a düşer ve geçerli bir değer gibi görünür |

### Üretim değerlerini doldurma

Değerler birden fazla dosyaya dağılır; elle yazıldığında biri atlanır ve
hata ancak sahada görünür. Üç araç bunu tek komuta indirir:

```bash
# SSL pin'leri — canlı sunucudan okur, DÖRT kaynağa birden yazar
npm run pins:set -- api.armanalabs.com --backup <yedek-pin>

# RevenueCat anahtarları, Facebook App ID, Android imza sertifikası, Apple App ID
npm run release:set -- --revenuecat-ios appl_… --facebook-app-id …

# Model özetleri — GERÇEK dosyalardan hesaplar
npm run models:sync -- /yol/modeller
```

Her araç biçim doğrular ve tehlikeli durumda **yazmayı reddeder**:

- **Yedek pin zorunlu.** Tek pinle sertifika yenilendiğinde uygulama sahada
  kilitlenir; düzeltmek yeni sürüm yayınlamayı gerektirir.
- **Ulaşılamayan alan adı reddedilir.** Boş yanıtın SHA-256'sı geçerli bir
  pin gibi görünür (`47DEQpj8…`) ve yazılsaydı her bağlantı reddedilirdi.
- **Tanınmayan host reddedilir.** Hangi pin yuvasına yazılacağı host adından
  tahmin edilmez; `env.ts` ile eşleştirilir.
- **`.mlmodelc` bir dizindir**, tek dosya değil — özet dizin ağacından
  sıralı hesaplanır, yoksa aynı içerik farklı özet üretir.

### Sürüm öncesi kapısı

```bash
npm run verify:release
```

CI her push ve PR'da tüm kapıları çalıştırır
([`.github/workflows/verify.yml`](.github/workflows/verify.yml)); yer tutucu
kapısı yalnızca `v*` sürüm etiketlerinde devreye girer.

Üretim yer tutucularının (SSL pin'leri, RevenueCat anahtarları, Facebook
App ID, Android imza sertifikası, Apple uygulama kimliği) sahaya çıkmadığını
doğrular. `prebuild:release` içinde çalışır: yer tutucu kalmışsa **release
build çıkmaz**.

Bu kontrol bilerek `npm run verify`'ın DIŞINDADIR — yer tutucular geliştirme
sırasında normaldir ve her testi kırmaları kapıyı kullanılmaz yapardı.

Kontrol listesi bir markdown tablosu değil, kod: taşınan bir dosya bile
ihlal sayılır, böylece kontrol sessizce atlanamaz.

---

## Belgeler

| Belge | İçerik |
|---|---|
| [`DEPLOYMENT.md`](docs/DEPLOYMENT.md) | **Kodun bittiği yerde ne kaldığı**: dışarıdan gelmesi gereken değerler ve servisler |
| [`ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Modül sınırları, tek yetki kaynağı, ödül akışı |
| [`SAFETY.md`](docs/SAFETY.md) | Yaş kapısı, NSFW sınırları, moderasyon kapısı, ban-hammer, deepfake koruması |
| [`SECURITY.md`](docs/SECURITY.md) | SSL pinning, root/jailbreak/debugger tespiti, obfuscation |
| [`BILLING.md`](docs/BILLING.md) | Fiyatlandırma, mağaza uyumu, ödül teklif kodları |
| [`PRIVACY.md`](docs/PRIVACY.md) | Sıfır veri toplama, anonim kilitlenme raporlama |
| [`PERFORMANCE.md`](docs/PERFORMANCE.md) | Termal yönetim, tensor arena, kare bütçesi |
| [`EXPORT_AND_SHARE.md`](docs/EXPORT_AND_SHARE.md) | Tek indirme hakkı, yakalama kalkanı, çapraz paylaşım |

---

## Kurulum

```bash
# Backend
npm install
cp .env.example .env                     # sırları doldurun
npm run migrate                          # şemayı uygula
npm start                                # DATABASE_URL ile

# İstemci
cd client_mobile && npm install
cd ios && pod install && cd ..           # yalnızca macOS
npm run android                          # veya: npm run ios
```

Backend `DATABASE_URL` olmadan geliştirmede bellek içi SQLite kullanır;
`NODE_ENV=production` iken **başlamaz** — bellek içi veritabanı her yeniden
başlatmada tüm veriyi kaybeder.

Üretim öncesi doldurulması gereken yer tutucular her belgenin sonundaki
"Sürüm öncesi kontrol listesi" bölümünde listelenmiştir.

---

Geri bildirim, istek ve şikâyet: **gokturkalazdaghan@gmail.com**
