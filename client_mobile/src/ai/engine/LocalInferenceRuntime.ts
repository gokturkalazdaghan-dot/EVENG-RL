/**
 * LocalInferenceRuntime — cihaz üstü çıkarım (CoreML / TFLite).
 *
 * BELLEK DİSİPLİNİ
 *   - Her çalıştırma bir TensorArena scope'unda yapılır; scope biterken
 *     native buffer'lar derhal bırakılır (bkz. performance/TensorArena.ts).
 *   - Aynı anda bellekte tutulan model sayısı MAX_RESIDENT_MODELS ile
 *     sınırlıdır; yeni model yüklenirken en eski interpreter native tarafta
 *     kapatılır. Sınırsız tutmak, üç ağır modelden sonra OOM demektir.
 *
 * PİKSEL VERİSİ KÖPRÜDEN GEÇMEZ
 * Giriş ve çıkış URI olarak taşınır. 4K bir kareyi JS köprüsünden geçirmek
 * (base64 veya sayı dizisi olarak) tek başına yüzlerce ms ve iki kat bellek
 * demektir; tüm piksel işi native tarafta kalır.
 */
import { NativeModules, Platform } from 'react-native';

import { createLogger } from '@/core/logging/Logger';
import { appError, Err, Ok, type Result } from '@/core/result/Result';
import { ThermalGovernor } from '@/performance/ThermalGovernor';
import { withArena } from '@/performance/TensorArena';
import { describe, type Capability, type LocalModelSpec } from '@/ai/engine/ModelRegistry';
import { ModelStore } from '@/ai/engine/ModelStore';

const log = createLogger('LocalInference');

export type ComputeUnit = 'npu' | 'gpu' | 'cpu';

interface NativeInferenceBridge {
  /** Model dosyasını yükler, oturum kimliği döner. */
  loadModel(path: string, compute: ComputeUnit): Promise<string>;
  unloadModel(sessionId: string): Promise<void>;
  run(sessionId: string, input: NativeInferenceInput): Promise<InferenceOutput>;
  deviceTotalRamBytes(): Promise<number>;
  /** NPU (Neural Engine / NNAPI) bu cihazda kullanılabilir mi. */
  supportedComputeUnits(): Promise<ComputeUnit[]>;
}

const bridge = NativeModules.EvenGirlInference as NativeInferenceBridge | undefined;

export interface InferenceInput {
  /** Kaynak medya URI'si — piksel verisi köprüden GEÇMEZ. */
  readonly sourceUri: string;
  readonly maxEdgePx: number;
  readonly params?: Readonly<Record<string, number | string | boolean>>;
  /** Video için kare atlama oranı. */
  readonly frameStride?: number;
}

interface NativeInferenceInput extends InferenceInput {
  readonly compute: ComputeUnit;
}

export interface InferenceOutput {
  readonly outputUri: string;
  readonly durationMs: number;
}

const MAX_RESIDENT_MODELS = 2;

interface ResidentModel {
  sessionId: string;
  lastUsedMs: number;
  compute: ComputeUnit;
}

class LocalInferenceRuntimeImpl {
  private readonly resident = new Map<Capability, ResidentModel>();
  private deviceRamBytes: number | null = null;
  private availableUnits: ComputeUnit[] | null = null;

  get isAvailable(): boolean {
    return bridge !== undefined;
  }

  /**
   * Bu yetenek bu cihazda YERELDE çalışabilir mi.
   *
   * Üç koşul: native köprü var, model tanımlı, cihazın RAM'i yeterli.
   * RAM eşiği model tanımında durur; eşiğin altında denemek, işlemin
   * yarısında OOM ile öldürülmek demektir — hiç denememekten kötüdür.
   */
  async isSupported(capability: Capability): Promise<boolean> {
    const model = describe(capability).localModel;
    if (!model || !bridge) return false;

    // Model dosyası henüz indirilmediyse yerelde çalışmaz.
    if (!(await ModelStore.isInstalled(capability))) return false;

    // BAŞARISIZ OKUMA ÖNBELLEĞE ALINMAZ.
    //
    // `??=` ile `0` yazmak, `0` null/undefined olmadığı için bir daha ASLA
    // yeniden denenmemesi demekti: köprüde tek bir geçici hata, oturumun
    // geri kalanında HER yerel modeli reddederdi. Kullanıcı gayet güçlü bir
    // telefonda "cihazın yetersiz" görür ve sebebi hiçbir yerde yazmaz.
    if (this.deviceRamBytes === null) {
      const ram = await bridge.deviceTotalRamBytes().catch(() => 0);
      // Yalnızca ANLAMLI bir değer saklanır; 0 bir sonraki çağrıda yeniden
      // sorulur.
      if (ram > 0) this.deviceRamBytes = ram;
      return ram >= model.minDeviceRamBytes;
    }
    return this.deviceRamBytes >= model.minDeviceRamBytes;
  }

  /**
   * Güç profilinin istediği hesaplama birimi cihazda yoksa aşağı düşer.
   * NPU olmayan bir cihazda NPU istemek native tarafta hataya değil, sessiz
   * CPU'ya düşmeye yol açar — bunu bilinçli ve görünür yapıyoruz.
   */
  private async resolveComputeUnit(preferred: ComputeUnit): Promise<ComputeUnit> {
    // Burada geri düşüş önbelleğe alınabilir: 'cpu' her cihazda geçerli bir
    // yanıttır ve en kötü ihtimalle biraz daha yavaş çalışılır — RAM
    // okumasının aksine, bir yeteneği tamamen kapatmaz.
    this.availableUnits ??= (await bridge
      ?.supportedComputeUnits()
      .catch(() => ['cpu' as const])) ?? ['cpu'];
    if (this.availableUnits.includes(preferred)) return preferred;
    if (this.availableUnits.includes('gpu')) return 'gpu';
    return 'cpu';
  }

  async run(capability: Capability, input: InferenceInput): Promise<Result<InferenceOutput>> {
    const model = describe(capability).localModel;
    if (!model || !bridge) {
      return Err(appError('MODEL_UNAVAILABLE', `${capability} için yerel model yok`));
    }
    if (!(await this.isSupported(capability))) {
      return Err(
        appError('MODEL_TOO_HEAVY_FOR_DEVICE', `${capability} bu cihaz için ağır`, {
          i18nKey: 'errors.deviceTooWeak',
        }),
      );
    }

    const budget = ThermalGovernor.budget;
    const compute = await this.resolveComputeUnit(budget.compute);

    return withArena(capability, async (arena) => {
      try {
        // Tepe bellek ihtiyacını arena'ya bildiriyoruz; native taraf gerekirse
        // önce başka arena'ları boşaltır.
        await arena.allocate(model.peakMemoryBytes, `${capability}:workspace`);

        const sessionId = await this.acquireSession(capability, model, compute);

        const output = await bridge.run(sessionId, {
          ...input,
          compute,
          maxEdgePx: Math.min(input.maxEdgePx, budget.maxOutputEdgePx),
          frameStride: input.frameStride ?? budget.frameStride,
        });

        return Ok(output);
      } catch (e) {
        log.error(`${capability} yerel çalıştırma hatası`, e);
        // Oturum bozulmuş olabilir; bir sonraki denemede temiz yüklensin.
        await this.evict(capability);
        return Err(
          appError('MODEL_UNAVAILABLE', `local inference failed: ${capability}`, {
            retryable: true,
          }),
        );
      }
      // arena.close() finally'de otomatik — tensor'lar burada serbest kalır.
    });
  }

  private async acquireSession(
    capability: Capability,
    model: LocalModelSpec,
    compute: ComputeUnit,
  ): Promise<string> {
    const existing = this.resident.get(capability);
    // Hesaplama birimi değiştiyse (termal düşüş) oturum yeniden kurulmalı:
    // delegate çalışma anında değiştirilemez.
    if (existing && existing.compute === compute) {
      existing.lastUsedMs = Date.now();
      return existing.sessionId;
    }
    if (existing) await this.evict(capability);

    if (this.resident.size >= MAX_RESIDENT_MODELS) {
      await this.evictOldest();
    }

    const path = await ModelStore.pathFor(capability);
    const sessionId = await bridge!.loadModel(path, compute);
    this.resident.set(capability, { sessionId, lastUsedMs: Date.now(), compute });
    log.debug(`Model yüklendi: ${capability} (${compute})`);
    return sessionId;
  }

  private async evict(capability: Capability): Promise<void> {
    const entry = this.resident.get(capability);
    if (!entry) return;
    this.resident.delete(capability);
    await bridge?.unloadModel(entry.sessionId).catch(() => undefined);
  }

  private async evictOldest(): Promise<void> {
    let oldest: Capability | null = null;
    let oldestTime = Number.POSITIVE_INFINITY;

    for (const [capability, entry] of this.resident) {
      if (entry.lastUsedMs < oldestTime) {
        oldestTime = entry.lastUsedMs;
        oldest = capability;
      }
    }
    if (oldest) {
      await this.evict(oldest);
      log.debug(`Model bellekten atıldı: ${oldest}`);
    }
  }

  /** Uygulama arka plana alındığında çağrılır (AppLifecycle). */
  async releaseAll(): Promise<void> {
    const sessions = [...this.resident.values()];
    this.resident.clear();
    await Promise.all(
      sessions.map((session) => bridge?.unloadModel(session.sessionId).catch(() => undefined)),
    );
    if (sessions.length > 0) log.info(`${sessions.length} model interpreter'ı kapatıldı`);
  }
}

export const LocalInferenceRuntime = new LocalInferenceRuntimeImpl();
