# core_gateway

Çift modlu stüdyo ajanlarının (Manuel & Botox + Even Girl Generate) master
backend'i.

## Sorumluluk

| Uç | İş |
|---|---|
| `POST /v1/ai/even-generate` | 5 referans + 3-5 kelime konsept → ajan zinciri |
| `POST /v1/ai/light-sync` | Arka planın ışık açısı ve renk paletini yüze füzyonlar |
| `POST /v1/ai/*` | Diğer üretken araçlar (generative-remove, expand, avatar…) |

## Ajan zinciri (even-generate)

```
5 referans foto ──┐
                  ├─► kimlik gömme (identity embedding)
3-5 kelime ───────┘            │
                               ▼
                    konsept → arka plan seçimi
                               │
                               ▼
                    difüzyon + kimlik koşullama
                               │
                               ▼
                    Light Sync  (ışık açısı + palet füzyonu)
                               │
                               ▼
                    Cinematic Bokeh  (derinlik haritası)
                               │
                               ▼
                    Pore Preserve  (yüksek frekans detay geri taşıma)
                               │
                               ▼
                        FİLİGRANSIZ çıktı
```

**Pore Preserve neden son adım:** Difüzyon çıktısı gözenek ve ince tüy gibi
yüksek frekans detayı düzler; "uncanny valley" etkisinin ana kaynağı budur.
Detay, orijinal referans karodan hizalanıp geri taşınır — üretim sırasında
korumaya çalışmak yerine sonradan geri getirmek hem daha ucuz hem daha
güvenilirdir.

## Prompt önbelleği

Konsept çözümleme ve arka plan seçimi için kullanılan sistem promptu
sabittir ve her istekte tekrarlanır. Anthropic prompt caching ile sabit
bölüm önbelleğe alınır; yalnızca kullanıcının 3-5 kelimesi ve referans
gömmeleri değişken kalır.

## Üretim kapısı: deepfake ve telif koruması

`ai_studio/` dizini, üretimden ÖNCE çalışan üç kapıyı taşır:

| Dosya | Kapı |
|---|---|
| `restrictedRegistry.js` | METİN hattı — konseptte kısıtlı isim (ünlü, siyasi kimlik, markalı karakter) |
| `faceScreening.js` | GÖRÜNTÜ hattı — referans fotoğraflarda kısıtlı yüz; gömmeler SAKLANMAZ |
| `negativePrompts.js` | Zorunlu negatif liste + prompt enjeksiyonuna direnç |

Kapı sırası, eşikler ve gerekçeler: [`docs/SAFETY.md` §10](../docs/SAFETY.md).

## Yetki

Her istek `x-entitlement` başlığındaki imzalı token ile doğrulanır
(`billing_infrastructure/entitlements.js` → `requireProEntitlement`).
İstemcinin "abone oldum" demesi yeterli değildir.

## Durum

Bu dizin, uç sözleşmelerini ve mimari kararları taşır. FastAPI uygulaması
ayrı bir dağıtım birimidir ve bu repoda iskelet olarak durur; model
çalıştırma altyapısı (GPU havuzu, kuyruk) dağıtım ortamına bağlıdır.
