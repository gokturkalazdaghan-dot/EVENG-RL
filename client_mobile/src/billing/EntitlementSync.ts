/**
 * EntitlementSync — backend'in entitlement kaydını okur.
 *
 * Backend, RevenueCat webhook'uyla güncellenir (server/revenuecat-webhook.example.js);
 * bu uç nokta o kaydın okuma tarafıdır.
 *
 * GİZLİLİK: İstekte kullanıcı kimliği YOKTUR. RevenueCat'in ürettiği anonim
 * app_user_id kullanılır — e-posta, cihaz kimliği veya reklam kimliği değil.
 * Bu kimlik yalnızca "hangi satın alma kaydı" sorusunu yanıtlar, "kim" sorusunu
 * değil.
 *
 * Yanıt, sunucu tarafından imzalanmış kısa ömürlü bir token içerir; uzak AI
 * çağrıları bu token'ı taşır ve backend her istekte kendi kaydıyla doğrular.
 */
import { createLogger } from '@/core/logging/Logger';
import { pinnedRequest } from '@/security/SslPinning';
import { SecureStore } from '@/security/SecureStore';
import type { EntitlementState } from '@/billing/Entitlements';

const log = createLogger('EntitlementSync');

interface ServerEntitlementResponse {
  readonly isPro: boolean;
  readonly expiresAtMs: number | null;
  readonly willRenew: boolean;
  readonly inTrial: boolean;
  readonly billingIssue: boolean;
  /** Uzak AI çağrılarında kullanılacak imzalı token. */
  readonly entitlementToken: string;
  readonly issuedAtMs: number;
}

export const EntitlementSync = {
  /**
   * Sunucudan doğrulanmış yetkiyi çeker.
   *
   * Başarısızlıkta null döner — çağıran taraf istemci yanıtıyla devam eder.
   * Ağ hatasında kullanıcıyı kilitlemek, uçaktaki abonenin uygulamayı
   * kullanamaması demektir.
   */
  async fetch(anonymousAppUserId: string): Promise<EntitlementState | null> {
    const result = await pinnedRequest<ServerEntitlementResponse>({
      path: `/v1/entitlements/${encodeURIComponent(anonymousAppUserId)}`,
      method: 'GET',
    });

    if (!result.ok) {
      log.warn('Sunucu yetkisi alınamadı', result.error.code);
      return null;
    }

    const data = result.value;

    // Token şifreli depoda tutulur; düz metin depolamak rootlu cihazda
    // doğrudan kopyalanabilir demektir.
    await SecureStore.set('entitlement.cache.signed', data.entitlementToken);

    return {
      isPro: data.isPro,
      source: 'server',
      expiresAtMs: data.expiresAtMs,
      willRenew: data.willRenew,
      inTrial: data.inTrial,
      billingIssue: data.billingIssue,
      checkedAtMs: Date.now(),
    };
  },

  /** Çıkış/sıfırlama — token'ı cihazdan siler. */
  async clear(): Promise<void> {
    await SecureStore.delete('entitlement.cache.signed');
  },
};
