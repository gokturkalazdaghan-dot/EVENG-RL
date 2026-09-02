/**
 * ExportGate — dışa aktarım kotasının kalıcılığı ve ekran koruma tetikleyicisi.
 *
 * Sayaç şifreli depoda tutulur (Keychain / EncryptedSharedPreferences):
 * düz depoda tek satır düzenleyerek hak sıfırlanabilirdi.
 */
import { NativeModules } from 'react-native';

import { createLogger } from '@/core/logging/Logger';
import { SecureStore } from '@/security/SecureStore';
import { Entitlements } from '@/billing/Entitlements';
import {
  INITIAL_QUOTA,
  applySubscription,
  canExport,
  consumeExport,
  remainingFreeExports,
  shouldProtectScreen,
  type ExportDecision,
  type ExportQuotaState,
} from '@/export/ExportQuotaPolicy';

const log = createLogger('ExportGate');

interface NativeScreenGuard {
  /** Android: FLAG_SECURE. iOS: UIScreen.isCaptured izleme + kaplama. */
  enableCaptureProtection(): void;
  disableCaptureProtection(): void;
  /** iOS: ekran şu anda kaydediliyor/yansıtılıyor mu. */
  isCaptured(): Promise<boolean>;
}

const guard = NativeModules.EvenGirlScreenGuard as NativeScreenGuard | undefined;

type Listener = (state: ExportQuotaState) => void;

class ExportGateImpl {
  private state: ExportQuotaState = INITIAL_QUOTA;
  private readonly listeners = new Set<Listener>();
  private loaded = false;

  async load(): Promise<ExportQuotaState> {
    if (this.loaded) return this.state;
    this.loaded = true;

    const raw = await SecureStore.get('trial.watermarked.exports');
    if (raw) {
      const used = Number.parseInt(raw, 10);
      if (Number.isFinite(used) && used >= 0) {
        this.state = { ...this.state, usedFreeExports: used };
      }
    }

    this.syncSubscription();
    Entitlements.subscribe(() => this.syncSubscription());
    return this.state;
  }

  private syncSubscription(): void {
    this.apply(applySubscription(this.state, Entitlements.isPro));
  }

  private apply(next: ExportQuotaState): void {
    this.state = next;
    this.applyScreenProtection();
    this.listeners.forEach((listener) => listener(next));
  }

  /** Ekran koruması kota durumuna göre açılır/kapanır. */
  private applyScreenProtection(): void {
    if (!guard) return;
    if (shouldProtectScreen(this.state)) guard.enableCaptureProtection();
    else guard.disableCaptureProtection();
  }

  get current(): ExportQuotaState {
    return this.state;
  }

  get remaining(): number {
    return remainingFreeExports(this.state);
  }

  /** Dışa aktarımdan ÖNCE çağrılır. */
  check(): ExportDecision {
    return canExport(this.state);
  }

  /** Dışa aktarım BAŞARILI olduktan sonra çağrılır. */
  async commit(): Promise<void> {
    const next = consumeExport(this.state);
    this.apply(next);
    await SecureStore.set('trial.watermarked.exports', String(next.usedFreeExports));
    log.info(`Dışa aktarım kullanıldı — kalan: ${remainingFreeExports(next)}`);
  }

  /** iOS: ekran kaydı/yansıtma anlık kontrolü. */
  async isBeingCaptured(): Promise<boolean> {
    return (await guard?.isCaptured().catch(() => false)) ?? false;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const ExportGate = new ExportGateImpl();
