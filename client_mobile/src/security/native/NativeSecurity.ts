/**
 * Native güvenlik modülünün TypeScript sözleşmesi.
 *
 * Kontrollerin TAMAMI native tarafta (Swift/Kotlin) çalışır. JS'te yapılan bir
 * root kontrolü değersizdir: JS bundle'ı cihazda değiştirilebilir. Burada
 * yalnızca native sonucu okuyup UI kararına çeviriyoruz.
 *
 * Native karşılıkları:
 *   iOS     : ios/EvenGirl/Security/EvenGirlSecurityModule.swift
 *   Android : android/app/src/main/java/com/evengirl/app/security/EvenGirlSecurityModule.kt
 */
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

/** Native tarafla birebir aynı olmalıdır (IntegrityFinding enum'ları). */
export type IntegrityFinding =
  | 'ROOTED'
  | 'JAILBROKEN'
  | 'EMULATOR'
  | 'DEBUGGER_ATTACHED'
  | 'HOOKING_FRAMEWORK'
  | 'APP_SIGNATURE_MISMATCH'
  | 'REPACKAGED';

export interface IntegrityReport {
  readonly findings: readonly IntegrityFinding[];
  /** Kararı native taraf verir; JS yeniden hesaplamaz, yalnızca uygular. */
  readonly compromised: boolean;
  readonly checkedAtMs: number;
}

export interface NativeSecuritySpec {
  runIntegrityCheck(): Promise<IntegrityReport>;
  startContinuousMonitoring(): void;
  stopContinuousMonitoring(): void;

  secureSet(key: string, value: string): Promise<void>;
  secureGet(key: string): Promise<string | null>;
  secureDelete(key: string): Promise<void>;

  pinnedFetch(
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string },
  ): Promise<{ status: number; body: string }>;
}

const LINKING_ERROR =
  'EvenGirlSecurity native modülü bulunamadı.\n' +
  '  iOS     : cd ios && pod install\n' +
  '  Android : MainApplication.getPackages() içine EvenGirlSecurityPackage() eklendi mi?\n' +
  'Bu modül olmadan uygulama başlatılmaz — güvenlik kontrolleri atlanamaz.';

const nativeModule = NativeModules.EvenGirlSecurity as NativeSecuritySpec | undefined;

/**
 * Modül yoksa her erişimde hata fırlatan bir proxy döner. Sessizce no-op'a
 * düşmek, güvenlik kontrollerinin fark edilmeden devre dışı kalması demektir.
 */
export const NativeSecurity: NativeSecuritySpec =
  nativeModule ??
  new Proxy({} as NativeSecuritySpec, {
    get() {
      throw new Error(LINKING_ERROR);
    },
  });

export const isNativeSecurityAvailable = nativeModule !== undefined;

/**
 * Çalışma zamanı ihlal olayı (sonradan attach edilen debugger / enjekte edilen
 * Frida). Native taraf `integrityViolation` olayını yayar.
 */
export function subscribeToViolations(
  handler: (report: IntegrityReport) => void,
): () => void {
  if (!nativeModule) return () => undefined;

  const emitter = new NativeEventEmitter(
    // iOS'ta RCTEventEmitter örneği gerekir; Android'de parametre yok sayılır.
    Platform.OS === 'ios' ? (nativeModule as unknown as never) : undefined,
  );
  const subscription = emitter.addListener('integrityViolation', handler);
  return () => subscription.remove();
}

export const IS_IOS = Platform.OS === 'ios';
