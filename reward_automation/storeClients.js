/**
 * reward_automation/storeClients.js
 *
 * Mağaza promosyon API'lerinin ince sarmalayıcıları.
 *
 * Kod ÜRETİMİ mağazaya aittir. Kendi jetonumuzu üretip "promosyon kodu"
 * demek, mağazanın tanımadığı bir değer yaratmaktır ve kullanılamaz.
 *
 * KİMLİK BİLGİLERİ
 *   App Store Connect : ES256 imzalı JWT (issuer id + key id + .p8)
 *   Play Developer API: servis hesabı JSON'u
 * İkisi de yalnızca backend ortamında bulunur (bkz. .env.example).
 */

const crypto = require('crypto');

/** App Store Connect API için kısa ömürlü ES256 JWT üretir. */
function appStoreConnectToken({ issuerId, keyId, privateKeyPem, nowMs = Date.now() }) {
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const payload = {
    iss: issuerId,
    // Apple 20 dakikadan uzun token kabul etmez.
    iat: Math.floor(nowMs / 1000),
    exp: Math.floor(nowMs / 1000) + 19 * 60,
    aud: 'appstoreconnect-v1',
  };

  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');

  const signingInput = `${encode(header)}.${encode(payload)}`;
  const signature = crypto
    .createSign('SHA256')
    .update(signingInput)
    .sign({ key: privateKeyPem, dsaEncoding: 'ieee-p1363' })
    .toString('base64url');

  return `${signingInput}.${signature}`;
}

/**
 * App Store Connect offer code istemcisi.
 *
 * Uç: POST /v1/subscriptionOfferCodeOneTimeUseCodes
 * Teklif (offer) App Store Connect'te önceden tanımlanır; burada yalnızca
 * o teklife bağlı tek kullanımlık kod üretilir.
 */
function createAppStoreClient({ fetchImpl = fetch } = {}) {
  return {
    async createOfferCode({ offerId, maxRedemptions, expiresAtMs }) {
      const token = appStoreConnectToken({
        issuerId: process.env.APPSTORE_ISSUER_ID,
        keyId: process.env.APPSTORE_KEY_ID,
        privateKeyPem: process.env.APPSTORE_PRIVATE_KEY,
      });

      const response = await fetchImpl(
        'https://api.appstoreconnect.apple.com/v1/subscriptionOfferCodeOneTimeUseCodes',
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            data: {
              type: 'subscriptionOfferCodeOneTimeUseCodes',
              attributes: {
                numberOfCodes: maxRedemptions,
                expirationDate: new Date(expiresAtMs).toISOString().slice(0, 10),
              },
              relationships: {
                offerCode: { data: { type: 'subscriptionOfferCodes', id: offerId } },
              },
            },
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`App Store Connect ${response.status}`);
      }

      const body = await response.json();
      // Apple kodları ayrı bir dosya olarak sunar; tek kod istediğimiz için
      // ilk değeri alıyoruz.
      const code = body?.data?.attributes?.codes?.[0];
      if (!code) throw new Error('App Store kod döndürmedi');

      return { code };
    },
  };
}

/**
 * Google Play promosyon kodu istemcisi.
 *
 * Uç: POST /androidpublisher/v3/applications/{pkg}/monetization/subscriptions/
 *          {productId}/basePlans/{basePlanId}/offers/{offerId}:activate
 * ve tek kullanımlık kodlar için `onetimecodes` uçları.
 */
function createPlayStoreClient({ fetchImpl = fetch, accessTokenProvider } = {}) {
  return {
    async createOfferCode({ offerId, maxRedemptions, expiresAtMs }) {
      const accessToken = await accessTokenProvider();
      const packageName = process.env.ANDROID_PACKAGE_NAME ?? 'com.evengirl.app';

      const response = await fetchImpl(
        `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/monetization/onetimecodes`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            offerId,
            count: maxRedemptions,
            validUntil: new Date(expiresAtMs).toISOString(),
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`Play Developer API ${response.status}`);
      }

      const body = await response.json();
      const code = body?.codes?.[0];
      if (!code) throw new Error('Play kod döndürmedi');

      return { code };
    },
  };
}

module.exports = {
  appStoreConnectToken,
  createAppStoreClient,
  createPlayStoreClient,
};
