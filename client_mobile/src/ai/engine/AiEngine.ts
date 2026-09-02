/**
 * AiEngine — tüm AI çağrılarının tek giriş kapısı.
 *
 * İşlem hatları (pipelines) doğrudan LocalInferenceRuntime veya
 * RemoteInferenceClient çağırmaz; hepsi buradan geçer ki dört kural
 * atlanamasın:
 *   1. Yetki    — ücretli yetenek, abone olmayana açılmaz
 *   2. Etik     — üretken/yüz araçlarında onay zorunlu
 *   3. Yönlendirme — yerel mi uzak mı (RoutingPolicy, saf ve test edilir)
 *   4. Güç bütçesi — ThermalGovernor sınırları uygulanır
 *
 * Kuralları tek kapıda toplamanın bedeli: her yeni araç bu kapıdan geçmek
 * zorunda. Faydası: bir kuralı unutmak MÜMKÜN DEĞİL.
 */
import { createLogger } from '@/core/logging/Logger';
import { FEATURES } from '@/core/config/featureFlags';
import { appError, Err, Ok, type Result } from '@/core/result/Result';
import { Entitlements } from '@/billing/Entitlements';
import { ThermalGovernor } from '@/performance/ThermalGovernor';
import { NetworkMonitor } from '@/connectivity/NetworkMonitor';
import { EthicsConsent } from '@/ai/engine/EthicsConsent';
import { describe, type Capability } from '@/ai/engine/ModelRegistry';
import {
  LocalInferenceRuntime,
  type InferenceInput,
  type InferenceOutput,
} from '@/ai/engine/LocalInferenceRuntime';
import { RemoteInferenceClient } from '@/ai/engine/RemoteInferenceClient';
import {
  canFallbackToRemote,
  decideRoute,
  refusalI18nKey,
  type ExecutionSite,
} from '@/ai/engine/RoutingPolicy';

const log = createLogger('AiEngine');

export interface RunOptions extends InferenceInput {
  /** Kullanıcı açıkça "sunucuda çalıştır (daha kaliteli)" dediyse. */
  readonly preferRemote?: boolean;
}

export interface RunResult extends InferenceOutput {
  readonly executedOn: ExecutionSite;
  /** Yerel deneme başarısız olup sunucuya düşüldü mü. */
  readonly usedFallback: boolean;
}

export const AiEngine = {
  async run(capability: Capability, options: RunOptions): Promise<Result<RunResult>> {
    const descriptor = describe(capability);

    // Etik onayı, yönlendirmeden ÖNCE alınır: kullanıcıya modal gösterip
    // sonra "zaten çalışamıyordu" demek kötü bir sıralamadır.
    const needsConsent = descriptor.generative || descriptor.operatesOnFaces;
    const consentGranted = needsConsent
      ? await EthicsConsent.ensureAcceptedFor(descriptor)
      : true;

    const decision = decideRoute({
      localSupported:
        FEATURES.allowLocalInference && (await LocalInferenceRuntime.isSupported(capability)),
      hasRemoteEndpoint: FEATURES.allowRemoteInference && descriptor.remoteEndpoint !== undefined,
      isOnline: NetworkMonitor.isOnline,
      thermalCritical: ThermalGovernor.profileId === 'critical',
      preferRemote: options.preferRemote === true,
      entitled: Entitlements.isPro,
      consentGranted,
      isFree: descriptor.free,
    });

    if (decision.kind === 'refuse') {
      const code =
        decision.reason === 'entitlement-required'
          ? 'ENTITLEMENT_REQUIRED'
          : decision.reason === 'consent-required'
            ? 'DISCLAIMER_NOT_ACCEPTED'
            : decision.reason === 'no-execution-path'
              ? 'MODEL_UNAVAILABLE'
              : 'NETWORK_UNAVAILABLE';

      return Err(
        appError(code, `${capability} reddedildi: ${decision.reason}`, {
          i18nKey: refusalI18nKey(decision.reason),
        }),
      );
    }

    const budget = ThermalGovernor.budget;
    const input: InferenceInput = {
      ...options,
      maxEdgePx: Math.min(options.maxEdgePx, budget.maxOutputEdgePx),
      frameStride: options.frameStride ?? budget.frameStride,
    };

    log.debug(`${capability} -> ${decision.site} (profil: ${budget.id})`);

    const result =
      decision.site === 'local'
        ? await LocalInferenceRuntime.run(capability, input)
        : await RemoteInferenceClient.run(capability, input);

    if (!result.ok) {
      // Yerel çalıştırma CİHAZ GÜCÜ yüzünden düştüyse ve ağ varsa sunucuya
      // düş. Diğer hatalarda (bozuk girdi, iptal) tekrar denemek anlamsızdır.
      const isCapacityFailure = result.error.code === 'MODEL_TOO_HEAVY_FOR_DEVICE';
      const canFallback = canFallbackToRemote({
        hasRemoteEndpoint: descriptor.remoteEndpoint !== undefined,
        isOnline: NetworkMonitor.isOnline,
      });

      if (decision.site === 'local' && isCapacityFailure && canFallback) {
        log.info(`${capability}: yerel yetersiz, sunucuya düşülüyor`);
        const fallback = await RemoteInferenceClient.run(capability, input);
        return fallback.ok
          ? Ok({ ...fallback.value, executedOn: 'remote' as const, usedFallback: true })
          : fallback;
      }
      return result;
    }

    // İşler arası soğuma — ardışık ağır işlerde cihaz sıcaklığını düşürür.
    if (budget.interJobCooldownMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, budget.interJobCooldownMs));
    }

    return Ok({ ...result.value, executedOn: decision.site, usedFallback: false });
  },
};
