# EVEN GIRL — çalışma kuralları

Bu depo projenin **tek** evidir. Eski `ai-guard-webhook` deposu arşivdir;
oraya commit atılmaz.

## Doğrulama

Değişiklikten sonra ilgili kapıyı çalıştırın:

```bash
npm test                              # backend (86 test)
cd client_mobile && npm run verify    # 4 kapı + 329 test
```

CI aynı kapıları her push ve PR'da çalıştırır (`.github/workflows/verify.yml`).

## Değiştirmeden önce bilinmesi gerekenler

**SSL pin'leri dört kaynakta yaşar** — `client_mobile/src/core/config/env.ts`,
`PinnedHttpClient.kt`, `network_security_config.xml`, `PinConfiguration.swift`.
Birini güncelleyip diğerini atlamak `verify:security` kapısını kırar. Bu
kasıtlıdır: ayrışmış pin listesi, uygulamanın bir platformda sessizce
korumasız kalması demektir.

**Obfuscated sabitler üretilir, elle yazılmaz.** Kaynak
`client_mobile/tools/obfuscated-strings.json`; değişiklikten sonra
`npm run gen:obf` çalıştırıp sonucu commit edin. CI `--check` ile
güncelliği doğrular.

**i18n anahtarları sekiz dilde birden eklenir** (tr, en, de, es, fr, pt, ja,
ar). Yer tutucu paritesi (`{{price}}` gibi) kapıyla zorunlu kılınmıştır —
bir dilde düşen yer tutucu, o dildeki kullanıcının yanlış fiyat görmesi
demektir.

**Yetki yalnızca mağazadan doğar.** Backend'de `pro_expiry_date` benzeri bir
alana PRO hakkı yazmayın; ödüller bile mağaza teklif koduyla dağıtılır.
Gerekçe: `docs/BILLING.md` §7.

**Moderasyon ve deepfake kapıları fail-closed'dır.** Tarayıcı çalışmadığında
"geç" modu yoktur. Eşikleri gevşetmeden önce `docs/SAFETY.md` §6 ve §10'daki
gerekçeleri okuyun.

## Test yazımı

Kritik garantiler için **mutasyon testi** yapın: kapıyı kasten gevşetip
testin gerçekten kırmızıya döndüğünü doğrulayın. Geçmişte bu yöntem üç
gerçek hata buldu (bkz. `docs/SAFETY.md` §10).

Backend testleri bağımlılıksızdır (`node --test`); yeni bağımlılık
eklemeyin.

## Sürüm öncesi

```bash
npm run verify:release
```

Üretim yer tutucuları (SSL pin'leri, RevenueCat anahtarları, Facebook App
ID, Android imza sertifikası, Apple uygulama kimliği) yerindeyse **sürüm
çıkmaz**. Bu kapı bilerek `npm run verify`'ın dışındadır: yer tutucular
geliştirme sırasında normaldir.

## Dil

Kod yorumları ve commit mesajları Türkçedir. Mevcut üsluba uyun: yorum
*ne* yapıldığını değil, **neden** öyle yapıldığını ve alternatifin neyi
bozacağını anlatır.
