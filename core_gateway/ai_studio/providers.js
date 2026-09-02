/**
 * core_gateway/ai_studio/providers.js
 *
 * Even Girl Generate'in iki dış bağımlılığını ORTAMDAN kurar:
 *   1. Yüz tarayıcı (deepfake kapısının görüntü hattı)
 *   2. Görüntü üreteci
 *
 * NEDEN BU DOSYA VAR
 * İkisi de kalıcı olarak fırlatan yer tutucuydu. Fail-closed davranış
 * doğruydu — hiçbir şey üretilmiyordu — ama sonuç, ÖZELLİĞİN HİÇ
 * ÇALIŞMAMASIYDI. Doğru davranış ile çalışan ürün aynı şey değildir.
 *
 * FAIL-CLOSED KORUNUR
 * Yapılandırılmamışsa yine fırlatılır (sessizce `undefined` dönmek, kapıyı
 * fail-closed yoluna sokar ama sebebi görünmez kılar) — fark, artık
 * açılışta ne olduğunun SÖYLENMESİ.
 *
 * GÖMME TAŞINMAZ
 * Yüz tarayıcıdan yalnızca eşleşme sonucu okunur. Benzerlik vektörü ya da
 * gömme geri alınsa bile buradan öteye geçmez; kayıt katmanı zaten yalnızca
 * sonuç ve kategori yazar.
 */

'use strict';

function unconfigured(name, envVar) {
  return async function throwUnconfigured() {
    const error = new Error(`${name} yapılandırılmadı (${envVar} tanımsız)`);
    error.code = `${name}_not_configured`;
    throw error;
  };
}

async function postJson(endpoint, path, apiKey, body) {
  const response = await fetch(`${endpoint.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  });

  // HTTP hatası YUTULMAZ. `null` döndürmek, çağıran tarafın onu "tarayıcı
  // çalıştı, eşleşme yok" sanmasına bir adım yaklaştırır.
  if (!response.ok) throw new Error(`ai_studio_http_${response.status}`);
  return response.json();
}

/**
 * Yüz tarayıcı.
 *
 * `screenerRan` KESİN olmalı: `undefined`'ı "çalıştı" saymak, tarayıcı
 * çalışmadığı halde referansların temiz sayılması demektir — deepfake
 * kapısının tam olarak kapatması gereken durum.
 */
function faceScreener({ endpoint, apiKey }) {
  return async function screenFaces(references) {
    const result = await postJson(endpoint, '/screen-faces', apiKey, { references });

    if (typeof result?.screenerRan !== 'boolean') {
      throw new Error('face_screener_bad_response');
    }
    if (!Array.isArray(result.faces)) {
      throw new Error('face_screener_bad_faces');
    }
    return { screenerRan: result.screenerRan, faces: result.faces };
  };
}

/**
 * Görüntü üreteci.
 *
 * Dönen adres DOĞRULANIR: boş ya da şifresiz bir adresi istemciye
 * geçirmek, üretim yapılmadan "başarılı" demekle aynı sonucu verir.
 */
function imageGenerator({ endpoint, apiKey }) {
  return async function generate({ positive, negative, references, userId }) {
    const result = await postJson(endpoint, '/generate', apiKey, {
      positive,
      negative,
      references,
      // Kullanıcı kimliği yalnızca hız sınırı ve kötüye kullanım takibi
      // için gider; üretim geçmişi bizde tutulmaz.
      userId,
    });

    if (typeof result?.outputUri !== 'string' || !/^https:\/\//.test(result.outputUri)) {
      throw new Error('generator_bad_output');
    }

    return {
      outputUri: result.outputUri,
      // Even Girl Generate çıktıları HER ZAMAN filigransızdır (bkz.
      // client_mobile/src/ai/generate/EvenGenerate.ts).
      watermarked: false,
      durationMs: Number.isFinite(result.durationMs) ? result.durationMs : 0,
    };
  };
}

/**
 * @returns {{ screenFaces: Function, generate: Function,
 *             faceScreenerConfigured: boolean, generatorConfigured: boolean }}
 */
function createProvidersFromEnv(env = process.env) {
  const faceUrl = env.FACE_SCREENER_URL;
  const genUrl = env.IMAGE_GENERATOR_URL;

  for (const [name, url] of [['FACE_SCREENER_URL', faceUrl], ['IMAGE_GENERATOR_URL', genUrl]]) {
    // Yüz gömmeleri ve üretim istekleri şifresiz taşınamaz.
    if (url && !/^https:\/\//.test(url)) throw new Error(`${name} https olmalı`);
  }

  return {
    screenFaces: faceUrl
      ? faceScreener({ endpoint: faceUrl, apiKey: env.FACE_SCREENER_KEY ?? null })
      : unconfigured('face_screener', 'FACE_SCREENER_URL'),
    generate: genUrl
      ? imageGenerator({ endpoint: genUrl, apiKey: env.IMAGE_GENERATOR_KEY ?? null })
      : unconfigured('generator', 'IMAGE_GENERATOR_URL'),
    faceScreenerConfigured: Boolean(faceUrl),
    generatorConfigured: Boolean(genUrl),
  };
}

module.exports = { createProvidersFromEnv, faceScreener, imageGenerator, unconfigured };
