/**
 * SecurityGate — uygulamadaki tek güvenlik karar noktası.
 *
 * Akış:
 *   1. Açılışta native bütünlük kontrolü (root/jailbreak/debugger/hook/imza).
 *   2. Bulgu varsa uygulama "kilitli" duruma geçer: hiçbir AI, ödeme veya ağ
 *      akışı başlatılmaz, kullanıcıya açıklayıcı bir ekran gösterilir.
 *   3. Sürekli izleme başlar — çalışma anında attach edilen LLDB/Frida aynı
 *      kilide düşürür.
 *
 * KASITLI ÇÖKME YOK: `exit(0)` çağırmak hem App Store Guideline 2.1 / Play
 * kararlılık metriklerini bozar hem de saldırgana hangi satırın kontrol
 * olduğunu net biçimde gösterir. Bunun yerine işlevi kapatıp açıklama veriyoruz.
 */
import { createLogger } from '@/core/logging/Logger';
import { FEATURES } from '@/core/config/featureFlags';
import { appError, Err, Ok, type AppError, type Result } from '@/core/result/Result';
import {
  NativeSecurity,
  isNativeSecurityAvailable,
  subscribeToViolations,
  type IntegrityReport,
} from '@/security/native/NativeSecurity';

const log = createLogger('SecurityGate');

export type GateState =
  | { status: 'pending' }
  | { status: 'passed'; report: IntegrityReport }
  | { status: 'blocked'; error: AppError; report: IntegrityReport | null };

type Listener = (state: GateState) => void;

class SecurityGateImpl {
  private state: GateState = { status: 'pending' };
  private readonly listeners = new Set<Listener>();
  private unsubscribeNative: (() => void) | null = null;

  /** Açılışta bir kez çağrılır (src/App.tsx). */
  async verify(): Promise<Result<IntegrityReport>> {
    if (!isNativeSecurityAvailable) {
      // Native modül yoksa güvenli tarafta kalıyoruz: açık değil, KAPALI kabul.
      const error = appError('SECURITY_INTEGRITY_FAILED', 'native module missing', {
        i18nKey: 'security.blocked.generic',
      });
      this.transition({ status: 'blocked', error, report: null });
      return Err(error);
    }

    let report: IntegrityReport;
    try {
      report = await NativeSecurity.runIntegrityCheck();
    } catch (e) {
      log.error('Bütünlük kontrolü çalıştırılamadı', e);
      const error = appError('SECURITY_INTEGRITY_FAILED', 'integrity check threw', {
        i18nKey: 'security.blocked.generic',
      });
      this.transition({ status: 'blocked', error, report: null });
      return Err(error);
    }

    if (report.compromised && FEATURES.enforceIntegrityGate) {
      // Hangi kontrolün yakaladığı LOGLANMAZ: saldırgana doğrudan bypass ipucu.
      log.warn('Bütünlük ihlali — uygulama kilitlendi');
      const error = appError('SECURITY_INTEGRITY_FAILED', 'integrity compromised', {
        i18nKey: 'security.blocked.compromised',
      });
      this.transition({ status: 'blocked', error, report });
      return Err(error);
    }

    this.transition({ status: 'passed', report });
    this.startMonitoring();
    return Ok(report);
  }

  private startMonitoring(): void {
    if (this.unsubscribeNative) return;

    this.unsubscribeNative = subscribeToViolations((report) => {
      if (!FEATURES.enforceIntegrityGate) return;
      log.warn('Çalışma zamanı ihlali');
      this.transition({
        status: 'blocked',
        error: appError('SECURITY_INTEGRITY_FAILED', 'runtime violation', {
          i18nKey: 'security.blocked.runtime',
        }),
        report,
      });
    });

    NativeSecurity.startContinuousMonitoring();
  }

  stopMonitoring(): void {
    this.unsubscribeNative?.();
    this.unsubscribeNative = null;
    if (isNativeSecurityAvailable) NativeSecurity.stopContinuousMonitoring();
  }

  private transition(next: GateState): void {
    this.state = next;
    this.listeners.forEach((listener) => listener(next));
  }

  get current(): GateState {
    return this.state;
  }

  get isBlocked(): boolean {
    return this.state.status === 'blocked';
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }
}

export const SecurityGate = new SecurityGateImpl();
