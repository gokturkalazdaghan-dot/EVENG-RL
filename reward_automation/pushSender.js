/**
 * reward_automation/pushSender.js
 *
 * Ödül bildirimi göndericisi.
 *
 * PUSH, TESLİMATIN KENDİSİ DEĞİLDİR
 * Ödülün gerçek teslimatı `reward_awards` tablosuna yazılmasıdır;
 * `/v1/rewards/pending` onu okur ve uygulama her açılışta gösterir. Push
 * yalnızca kullanıcının daha erken haberdar olmasını sağlar.
 *
 * Bu ayrım önemli: push başarısız olduğunda ödül dağıtımı DURMAZ. Ödülü
 * push'a bağlamak, bildirim izni vermemiş ya da o an cihazı kapalı olan
 * kazananları ödülsüz bırakırdı.
 *
 * METİN SUNUCUDA ÇEVRİLMEZ
 * `titleKey` / `bodyKey` ve `params` gider; istemci kendi diline çevirir.
 * Sunucuda çevirmek, kullanıcının dilini sunucuda tutmayı gerektirir ve bu
 * bilgi bizde YOK (ve olmamalı).
 */

'use strict';

/** Yapılandırılmamışken: kaydeder, göndermez, dağıtımı DURDURMAZ. */
function noopSender(reason) {
  return async function sendPush({ userId, bodyKey }) {
    console.warn(
      `[Rewards] PUSH GÖNDERİLMEDİ (${reason}) user=${shortId(userId)} key=${bodyKey}\n` +
        '  Ödül yine de kaydedildi; kullanıcı uygulamayı açtığında görecek.',
    );
    return { sent: false, reason };
  };
}

function shortId(value) {
  return typeof value === 'string' && value.length > 8 ? `${value.slice(0, 8)}…` : String(value);
}

/**
 * HTTP push aktarımı.
 *
 * Sağlayıcıdan bağımsız: kendi push ağ geçidinize POST atar. APNs/FCM
 * anahtarlarını buraya koymuyoruz — anahtarlar bu süreçte tutulursa her
 * dağıtım işi onları taşımak zorunda kalır.
 */
function httpSender({ endpoint, apiKey }) {
  return async function sendPush({ userId, pushToken, titleKey, bodyKey, params, deepLink }) {
    // Jetonu olmayan kullanıcı için AĞA HİÇ ÇIKILMAZ: sağlayıcıya boş
    // jetonla istek atmak, her hafta sessizce başarısız olan bir çağrıdır.
    if (typeof pushToken !== 'string' || pushToken.length === 0) {
      return { sent: false, reason: 'no_token' };
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ pushToken, titleKey, bodyKey, params, deepLink }),
      });

      if (!response.ok) {
        // FIRLATILMAZ: push hatası ödül dağıtımını durdurmamalı.
        console.warn(`[Rewards] push HTTP ${response.status} user=${shortId(userId)}`);
        return { sent: false, reason: `http_${response.status}` };
      }
      return { sent: true };
    } catch (err) {
      console.warn(`[Rewards] push hatası user=${shortId(userId)}: ${err.message}`);
      return { sent: false, reason: 'network' };
    }
  };
}

/**
 * Ortamdan gönderici kurar.
 *
 * @returns {{ sendPush: Function, configured: boolean }}
 */
function createPushSenderFromEnv(env = process.env) {
  const endpoint = env.PUSH_GATEWAY_URL;
  if (!endpoint) {
    return { sendPush: noopSender('PUSH_GATEWAY_URL tanımsız'), configured: false };
  }
  if (!/^https:\/\//.test(endpoint)) {
    // Push yükü derin bağlantı ve ödül bilgisi taşır; şifresiz göndermek
    // onu ağdaki herkese açar.
    throw new Error('PUSH_GATEWAY_URL https olmalı');
  }
  return {
    sendPush: httpSender({ endpoint, apiKey: env.PUSH_GATEWAY_KEY ?? null }),
    configured: true,
  };
}

module.exports = { createPushSenderFromEnv, httpSender, noopSender };
