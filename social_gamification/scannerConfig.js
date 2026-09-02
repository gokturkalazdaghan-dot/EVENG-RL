/**
 * social_gamification/scannerConfig.js
 *
 * Tarayıcı sağlayıcısını ORTAM DEĞİŞKENLERİNDEN kurar.
 *
 * NEDEN BU DOSYA VAR
 * `moderationDeps.scanMedia` kalıcı olarak fırlatan bir yer tutucuydu ve
 * `scannerClient.js` hiçbir yerden çağrılmıyordu. Sonucu şuydu: fail-closed
 * doğru çalışıyor ama HİÇBİR İÇERİK ONAYLANMIYOR — her yükleme `pending`
 * kalıyor, akış kalıcı olarak boş görünüyor ve kimse sebebini görmüyor.
 * Doğru davranış ile çalışan ürün aynı şey değildir.
 *
 * SESSİZ YAPILANDIRMA YOK
 * Tarayıcı adresi tanımlı değilse yer tutucu KALIR (fail-closed korunur)
 * ama açılışta yüksek sesle uyarılır. Üretimde yapılandırılmamış bir
 * tarayıcıyla açılmak, boş bir uygulama yayınlamaktır.
 */

'use strict';

const { createScanner } = require('./scannerClient');

/** Yapılandırılmamışken kullanılan yer tutucu. */
async function unconfiguredScanner() {
  // Sessizce `undefined` dönen bir tarayıcı `decideIngest`'i fail-closed
  // yoluna sokar ama SEBEBİ görünmez olurdu; fırlatmak sebebi log'a yazar.
  throw new Error('scanner_not_configured');
}

/**
 * HTTP tabanlı tarayıcı sağlayıcısı.
 *
 * Üç uç ayrı ayrı yapılandırılabilir çünkü karma araması genellikle ayrı
 * bir servistir (NCMEC/IWF karma listesi) ve sınıflandırıcıdan farklı bir
 * gizlilik/erişim rejimine tabidir.
 */
function httpProvider({ baseUrl, apiKey }) {
  const call = async (path, body) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      // HTTP hatası YUTULMAZ: `scanAndGate` bunu yakalayıp karantinaya
      // alır. `null` döndürmek, hatayı "temiz" sanmaya bir adım yaklaştırır.
      throw new Error(`scanner_http_${response.status}`);
    }
    return response.json();
  };

  return {
    async perceptualHash(mediaRef) {
      const result = await call('/hash', { mediaRef });
      const hash = result?.hash;
      if (typeof hash !== 'string' || hash.length === 0) {
        throw new Error('scanner_bad_hash');
      }
      return hash;
    },

    async hashLookup(hash) {
      const result = await call('/hash-lookup', { hash });
      // `match` KESİN olmalı: `undefined`'ı "eşleşme yok" saymak, bilinen
      // CSAM'in eşleşmemiş gibi geçmesi demektir.
      if (typeof result?.match !== 'boolean') throw new Error('scanner_bad_lookup');
      return { match: result.match };
    },

    async classify({ mediaRef, kind }) {
      return call('/classify', { mediaRef, kind });
    },
  };
}

/**
 * Ortamdan tarayıcıyı kurar.
 *
 * @returns {{ scanMedia: Function, configured: boolean }}
 */
function createScannerFromEnv(env = process.env) {
  const baseUrl = env.MODERATION_SCANNER_URL;

  if (!baseUrl) {
    return { scanMedia: unconfiguredScanner, configured: false };
  }

  if (!/^https:\/\//.test(baseUrl)) {
    // Düz HTTP üzerinden medya referansı ve sınıflandırma sonucu taşımak,
    // moderasyon kararlarını ağdaki herkese açar. Yapılandırma hatasını
    // kabul etmektense tarayıcısız kalmak daha güvenli DEĞİL — ikisi de
    // kötü — ama sessizce kabul etmek en kötüsü.
    throw new Error('MODERATION_SCANNER_URL https olmalı');
  }

  return {
    scanMedia: createScanner(
      httpProvider({
        baseUrl: baseUrl.replace(/\/$/, ''),
        apiKey: env.MODERATION_SCANNER_KEY ?? null,
      }),
    ),
    configured: true,
  };
}

module.exports = { createScannerFromEnv, unconfiguredScanner, httpProvider };
