/**
 * reward_automation/promoCodes.js
 *
 * MAĞAZA UYUMLU ÖDÜL DAĞITIMI.
 *
 * NEDEN VERİTABANI BAYRAĞI DEĞİL
 * Backend'in kendi kaydına `pro_expiry_date` yazarak PRO vermek, dijital malı
 * mağazanın ödeme sistemi DIŞINDA dağıtmaktır. Apple Guideline 3.1.1 ve
 * Google Play Payments politikası bunu ihlal sayar: uygulama içinde değeri
 * olan bir aboneliği, mağazanın bilmediği bir yoldan veriyor olursunuz.
 * Ayrıca kullanıcı bu "PRO"yu Ayarlar > Abonelikler altında göremez, iptal
 * edemez ve geri yükleyemez — bu da ayrı bir ret sebebidir.
 *
 * DOĞRU YOL
 * Mağazanın kendi promosyon mekanizması:
 *   iOS     : StoreKit 2 Offer Codes (App Store Connect API ile parti üretimi)
 *   Android : Google Play Developer API — promotion codes / one-time codes
 *
 * Kod kullanıcıya push ile gider, kullanıcı NATIVE ödeme sayfasında kullanır.
 * Abonelik mağazada oluşur; Ayarlar'da görünür, iptal edilebilir, geri
 * yüklenebilir. Deneme hakkı da korunur.
 */

const crypto = require('crypto');

/** Ödül kodunun geçerlilik süresi. Kullanılmayan kod bu süre sonunda düşer. */
const CODE_TTL_DAYS = 30;

/** Desteklenen mağazalar. */
const STORES = Object.freeze(['app_store', 'play_store']);

/**
 * Ödül kademesine karşılık gelen promosyon teklifi kimlikleri.
 *
 * Bu teklifler MAĞAZA KONSOLUNDA önceden tanımlanır:
 *   App Store Connect > Abonelik > Offer Codes > yeni teklif
 *   Play Console > Abonelikler > Promosyonlar
 *
 * Kod üretimi bu tanımlara bağlanır; uygulama serbest süre veremez.
 */
const OFFER_IDS = Object.freeze({
  7: { app_store: 'evengirl_pro_7day_free', play_store: 'evengirl-pro-7day-free' },
  3: { app_store: 'evengirl_pro_3day_free', play_store: 'evengirl-pro-3day-free' },
});

class PromoCodeError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'PromoCodeError';
    this.code = code;
  }
}

function offerIdFor(days, store) {
  const tier = OFFER_IDS[days];
  if (!tier) throw new PromoCodeError(`Tanımsız ödül süresi: ${days} gün`, 'unknown_tier');

  const offerId = tier[store];
  if (!offerId) throw new PromoCodeError(`Tanımsız mağaza: ${store}`, 'unknown_store');
  return offerId;
}

/**
 * Tek kullanımlık promosyon kodu üretir.
 *
 * `storeClient`, mağaza API'sinin ince sarmalayıcısıdır (App Store Connect
 * veya Play Developer API). Burada mağazadan BAĞIMSIZ akış yönetilir;
 * gerçek çağrı enjekte edilir ki test edilebilsin ve mağaza SDK'sı bu
 * dosyaya sızmasın.
 *
 * @returns {Promise<{code: string, store: string, offerId: string,
 *                    redemptionUrl: string, expiresAtMs: number}>}
 */
async function issueRewardCode(storeClient, { userId, days, store, nowMs = Date.now() }) {
  if (!STORES.includes(store)) {
    throw new PromoCodeError(`Bilinmeyen mağaza: ${store}`, 'unknown_store');
  }

  const offerId = offerIdFor(days, store);
  const expiresAtMs = nowMs + CODE_TTL_DAYS * 24 * 60 * 60 * 1000;

  // Mağaza kodu ÜRETİR; biz üretmeyiz. Kendi kodumuzu üretmek, mağazanın
  // tanımadığı bir jeton yaratmak demektir ve kullanılamaz.
  const issued = await storeClient.createOfferCode({
    offerId,
    // Tek kullanımlık: kod paylaşılırsa ikinci kişi kullanamaz.
    maxRedemptions: 1,
    expiresAtMs,
  });

  if (!issued || typeof issued.code !== 'string' || issued.code.length === 0) {
    throw new PromoCodeError('Mağaza kod üretmedi', 'issue_failed');
  }

  return {
    code: issued.code,
    store,
    offerId,
    // Kullanıcı bu bağlantıya dokununca NATIVE ödeme sayfası açılır.
    redemptionUrl: redemptionUrlFor(store, issued.code),
    expiresAtMs,
    // Kod loglanmaz; korelasyon için yalnızca özetin ilk 8 karakteri.
    codeFingerprint: crypto.createHash('sha256').update(issued.code).digest('hex').slice(0, 8),
    userId,
  };
}

/**
 * Kullanım bağlantısı.
 *
 * iOS: `https://apps.apple.com/redeem?ctx=offercodes&id=<appleAppId>&code=<code>`
 *      Uygulama içinden `presentCodeRedemptionSheet` ile de açılabilir.
 * Android: `https://play.google.com/redeem?code=<code>`
 */
function redemptionUrlFor(store, code) {
  const encoded = encodeURIComponent(code);

  if (store === 'app_store') {
    const appleAppId = process.env.APPLE_APP_ID ?? 'APPLE_APP_ID';
    return `https://apps.apple.com/redeem?ctx=offercodes&id=${appleAppId}&code=${encoded}`;
  }
  return `https://play.google.com/redeem?code=${encoded}`;
}

/**
 * Kullanıcının mağazasını belirler.
 *
 * Kod mağazaya özgüdür: App Store kodu Play'de çalışmaz. Kullanıcının
 * aboneliğinin hangi mağazadan geldiği RevenueCat kaydında durur; hiç
 * satın alma yapmamış kullanıcı için cihaz platformuna bakılır.
 */
function storeForUser(account) {
  // BÜYÜK/KÜÇÜK HARF NORMALLEŞTİRİLİR.
  //
  // Şema `store` sütununu 'app_store' | 'play_store' olarak tutuyor ama bu
  // fonksiyon 'APP_STORE' | 'PLAY_STORE' ile karşılaştırıyordu: doğru
  // kaydedilmiş bir hesap bile HİÇBİR ZAMAN eşleşmiyor, her seferinde
  // aşağıdaki tahmine düşüyordu. `platform` alanı da depoda yok, yani
  // sonuç her zaman 'play_store' oluyordu — iOS kazananlar kullanamayacakları
  // bir Play kodu alacaktı.
  const store = typeof account?.store === 'string' ? account.store.toLowerCase() : null;
  if (store === 'app_store') return 'app_store';
  if (store === 'play_store') return 'play_store';

  const platform = typeof account?.platform === 'string' ? account.platform.toLowerCase() : null;
  if (platform === 'ios') return 'app_store';
  if (platform === 'android') return 'play_store';

  // TAHMİN EDİLMEZ. Yanlış mağazadan üretilen kod kullanıcının elinde
  // ölüdür ve bunu ancak kullanmayı deneyince anlar; üstelik o kod mağaza
  // kotasından düşer. Bilinmiyorsa üretmemek doğrudur.
  // İmza `(message, code)` — ters sırada çağırmak, hata kodunu mesaja
  // yazıp `err.code` alanını cümleyle doldururdu.
  throw new PromoCodeError(
    `Hesabın mağazası bilinmiyor; kod üretilmedi (store=${account?.store ?? 'yok'})`,
    'unknown_store',
  );
}

module.exports = {
  CODE_TTL_DAYS,
  STORES,
  OFFER_IDS,
  PromoCodeError,
  offerIdFor,
  redemptionUrlFor,
  storeForUser,
  issueRewardCode,
};
