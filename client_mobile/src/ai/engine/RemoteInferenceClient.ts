/**
 * RemoteInferenceClient — ağır modellerin (difüzyon, metinden video) sunucuda
 * çalıştırılması.
 *
 * GİZLİLİK SÖZLEŞMESİ
 *   - İstekte kullanıcı kimliği YOKTUR. Yetki, backend'in ürettiği kısa ömürlü
 *     imzalı token ile verilir (bkz. billing/EntitlementSync.ts). Token "hangi
 *     satın alma" sorusunu yanıtlar, "kim" sorusunu değil.
 *   - Medya sunucuda saklanmaz: işlenir, döner, tampon silinir. Bu bir
 *     backend sözleşmesidir ve gizlilik politikasında beyan edilir.
 *   - Tüm trafik SSL pinlenmiş kanaldan geçer (bkz. security/SslPinning.ts).
 *
 * DÜRÜSTLÜK NOTU: Uzak çalıştırma seçildiğinde medya CİHAZDAN ÇIKAR. Bu,
 * çevrimdışı modun aksine kaçınılmazdır; kullanıcıya bu ayrım açıkça
 * gösterilir (araç çubuğundaki "ÇEVRİMDIŞI" rozeti).
 */
import { createLogger } from '@/core/logging/Logger';
import { appError, Err, type Result } from '@/core/result/Result';
import { pinnedRequest } from '@/security/SslPinning';
import { SecureStore } from '@/security/SecureStore';
import { NetworkMonitor } from '@/connectivity/NetworkMonitor';
import { agentLanguageTag } from '@/i18n';
import { describe, type Capability } from '@/ai/engine/ModelRegistry';
import type { InferenceInput, InferenceOutput } from '@/ai/engine/LocalInferenceRuntime';

const log = createLogger('RemoteInference');

export const RemoteInferenceClient = {
  async run(capability: Capability, input: InferenceInput): Promise<Result<InferenceOutput>> {
    const endpoint = describe(capability).remoteEndpoint;
    if (!endpoint) {
      return Err(appError('MODEL_UNAVAILABLE', `${capability} için uzak uç yok`));
    }
    if (!NetworkMonitor.isOnline) {
      return Err(
        appError('NETWORK_UNAVAILABLE', 'offline', {
          i18nKey: 'errors.offlineFeatureUnavailable',
          retryable: true,
        }),
      );
    }

    const token = await SecureStore.get('entitlement.cache.signed');
    if (!token) {
      // Token yoksa sunucu zaten 401 döndürecek; ağ turu harcamıyoruz.
      return Err(
        appError('ENTITLEMENT_REQUIRED', 'entitlement token yok', {
          i18nKey: 'paywall.requiredForFeature',
        }),
      );
    }

    log.debug(`Uzak çalıştırma: ${capability}`);

    return pinnedRequest<InferenceOutput>({
      path: endpoint,
      method: 'POST',
      headers: { 'x-entitlement': token },
      body: {
        // Medya, imzalı ve tek kullanımlık bir URL'e ayrıca yüklenir;
        // ham dosya bu gövdede taşınmaz.
        sourceUri: input.sourceUri,
        maxEdgePx: input.maxEdgePx,
        params: input.params ?? {},
        // Ajan çıktısı (altyazı, şablon adı, konsept çözümlemesi) kullanıcının
        // kendi dilinde üretilir. Bölge kodu gönderilmez — ayırt edici bir bit
        // ekler ve çıktıyı değiştirmez.
        language: agentLanguageTag(),
      },
    });
  },
};
