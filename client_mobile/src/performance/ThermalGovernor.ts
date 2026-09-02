/**
 * ThermalGovernor — ThermalPolicy'nin platform adaptörü.
 *
 * Native sinyal kaynakları:
 *   iOS     : ProcessInfo.thermalStateDidChangeNotification + isLowPowerModeEnabled
 *   Android : PowerManager.addThermalStatusListener + isPowerSaveMode + BatteryManager
 *
 * Bu sınıf karar VERMEZ; kararı ThermalPolicy'ye devreder ve sonucu yayınlar.
 * Böylece politika testleri cihaz/emülatör gerektirmez.
 */
import { NativeEventEmitter, NativeModules } from 'react-native';

import { createLogger } from '@/core/logging/Logger';
import { POWER_BUDGETS, type PowerBudget, type PowerProfileId } from '@/performance/PowerProfile';
import {
  nextProfile,
  targetProfileFor,
  type DeviceSignals,
} from '@/performance/ThermalPolicy';

const log = createLogger('ThermalGovernor');

interface NativePerformanceModule {
  startMonitoring(): void;
  stopMonitoring(): void;
  readSignals(): Promise<DeviceSignals>;
}

const nativeModule = NativeModules.EvenGirlPerformance as NativePerformanceModule | undefined;

type Listener = (budget: PowerBudget) => void;

class ThermalGovernorImpl {
  private current: PowerProfileId = 'balanced';
  private lastTarget: PowerProfileId = 'balanced';
  private targetChangedAtMs = Date.now();
  private readonly listeners = new Set<Listener>();
  private unsubscribeNative: (() => void) | null = null;

  async start(): Promise<void> {
    if (this.unsubscribeNative) return;

    if (!nativeModule) {
      // Native modül yoksa 'balanced'da sabitleniyoruz. 'performance'a
      // düşmek, termal sinyal olmayan bir cihazda sınırsız yük demektir.
      log.warn('EvenGirlPerformance yok — balanced profilde sabitlendi');
      return;
    }

    const emitter = new NativeEventEmitter(nativeModule as unknown as never);
    const subscription = emitter.addListener('deviceSignals', (signals: DeviceSignals) =>
      this.apply(signals),
    );
    nativeModule.startMonitoring();

    this.unsubscribeNative = () => {
      subscription.remove();
      nativeModule.stopMonitoring();
    };

    // İlk değeri beklemeden oku: ilk termal olay dakikalar sonra gelebilir.
    try {
      this.apply(await nativeModule.readSignals());
    } catch (e) {
      log.warn('İlk sinyal okunamadı', e);
    }
  }

  stop(): void {
    this.unsubscribeNative?.();
    this.unsubscribeNative = null;
  }

  /** Sinyal girişi — testler ve native olaylar aynı kapıdan geçer. */
  apply(signals: DeviceSignals, nowMs: number = Date.now()): void {
    const target = targetProfileFor(signals);

    if (target !== this.lastTarget) {
      this.lastTarget = target;
      this.targetChangedAtMs = nowMs;
    }

    const next = nextProfile({
      current: this.current,
      target,
      targetStableForMs: nowMs - this.targetChangedAtMs,
    });

    if (next === this.current) return;

    // Gevşetme gerçekleştiyse stabilite sayacı sıfırlanır: bir sonraki
    // kademe için yeniden UPGRADE_STABLE_MS beklenir (kademeli çıkış).
    if (PROFILE_ORDER[next] < PROFILE_ORDER[this.current]) {
      this.targetChangedAtMs = nowMs;
    }

    this.current = next;
    log.info(`Güç profili -> ${next}`);
    const budget = POWER_BUDGETS[next];
    this.listeners.forEach((listener) => listener(budget));
  }

  get budget(): PowerBudget {
    return POWER_BUDGETS[this.current];
  }

  get profileId(): PowerProfileId {
    return this.current;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.budget);
    return () => this.listeners.delete(listener);
  }

  /** Testler için — modül düzeyi tekil nesnenin durumunu sıfırlar. */
  resetForTests(profile: PowerProfileId = 'balanced'): void {
    this.current = profile;
    this.lastTarget = profile;
    this.targetChangedAtMs = 0;
  }
}

const PROFILE_ORDER: Record<PowerProfileId, number> = {
  performance: 0,
  balanced: 1,
  saver: 2,
  critical: 3,
};

export const ThermalGovernor = new ThermalGovernorImpl();
export type { DeviceSignals };
