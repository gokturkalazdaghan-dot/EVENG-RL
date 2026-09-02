/**
 * AnonymousCrashReporter — kişisel veri içermeyen çökme raporlaması.
 *
 * NE GÖNDERİLİR
 *   - Temizlenmiş hata mesajı ve yığın izi (bkz. Scrubber.ts)
 *   - Uygulama sürümü, platform, OS ana sürümü, cihaz sınıfı (low/mid/high)
 *   - Yığın imzasının hash'i (aynı hatayı gruplamak için)
 *
 * NE GÖNDERİLMEZ — ve neden
 *   - Kurulum kimliği / cihaz kimliği / IDFA: kimlik oluşturur. Gruplamayı
 *     cihaza göre değil, YIĞIN İMZASINA göre yapıyoruz; "kaç cihaz etkilendi"
 *     sorusunu kaybediyoruz, buna karşılık kimseyi izlemiyoruz. Bu bilinçli
 *     bir takas.
 *   - Tam cihaz modeli: "iPhone15,3 + tr-TR + 03:14" birleşimi küçük
 *     popülasyonlarda tekilleştiricidir. Yerine üç kademeli cihaz sınıfı.
 *   - Zaman damgası (dakika hassasiyetinde): saate yuvarlanır.
 *   - Ekran/kullanıcı yolu, girdi verisi, dosya adları.
 *
 * DÜRÜST SINIR: İstemci kendi IP'sini sunucudan gizleyemez. IP'yi hiç
 * kaydetmemek ALICI TARAFIN sözleşmesidir (bkz. docs/PRIVACY.md); istemci
 * tarafında yapılabilecek her şey yapılmıştır ama bu tek başına yeterli
 * değildir ve öyleymiş gibi sunulmaz.
 */
import { Platform } from 'react-native';

import { ENV } from '@/core/config/env';
import { FEATURES } from '@/core/config/featureFlags';
import { createLogger } from '@/core/logging/Logger';
import { pinnedRequest } from '@/security/SslPinning';
import {
  containsLikelyPii,
  scrubMessage,
  scrubStack,
  type ScrubbedFrame,
} from '@/telemetry/Scrubber';

const log = createLogger('CrashReporter');

declare const __DEV__: boolean;
declare const ErrorUtils: {
  getGlobalHandler(): ((error: Error, isFatal?: boolean) => void) | undefined;
  setGlobalHandler(handler: (error: Error, isFatal?: boolean) => void): void;
};

export type DeviceClass = 'low' | 'mid' | 'high';

export interface CrashReport {
  readonly schema: 1;
  readonly fatal: boolean;
  readonly errorName: string;
  readonly message: string;
  readonly frames: readonly ScrubbedFrame[];
  /** Aynı hatayı gruplamak için yığın imzası (cihaz kimliği DEĞİL). */
  readonly signature: string;
  readonly appVersion: string;
  readonly platform: 'ios' | 'android';
  /** Yalnızca ana sürüm: "17", "14" — yama sürümü tekilleştirici olabilir. */
  readonly osMajor: string;
  readonly deviceClass: DeviceClass;
  /** Saate yuvarlanmış zaman — dakika hassasiyeti korelasyon riski taşır. */
  readonly hourBucketMs: number;
}

/**
 * Yığın imzası — kriptografik olmayan, deterministik hash (FNV-1a).
 *
 * Amaç aynı çökmeyi gruplamak; gizlilik değil. Girdi zaten temizlenmiş
 * yığındır, dolayısıyla imza kişisel veri türetemez.
 */
export function signatureOf(errorName: string, frames: readonly ScrubbedFrame[]): string {
  // Yalnızca ilk 5 kare: derin kareler çağıran yola göre değişir ve aynı
  // hatayı farklı gruplara böler.
  const basis = [errorName, ...frames.slice(0, 5).map((f) => `${f.file}:${f.fn}:${f.line ?? 0}`)].join('|');

  let hash = 0x811c9dc5;
  for (let i = 0; i < basis.length; i++) {
    hash ^= basis.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Cihaz sınıfı — tam model yerine üç kademe.
 * RAM eşiği, model çalıştırma kapasitesiyle de örtüştüğü için teşhiste
 * gerçekten işe yarar bilgidir.
 */
export function classifyDevice(totalRamBytes: number): DeviceClass {
  const GB = 1024 * 1024 * 1024;
  if (totalRamBytes >= 8 * GB) return 'high';
  if (totalRamBytes >= 4 * GB) return 'mid';
  return 'low';
}

export function buildReport(input: {
  error: Error;
  fatal: boolean;
  appVersion: string;
  osMajor: string;
  deviceClass: DeviceClass;
  nowMs: number;
}): CrashReport {
  const frames = scrubStack(input.error.stack ?? '');
  const errorName = scrubMessage(input.error.name || 'Error');

  return {
    schema: 1,
    fatal: input.fatal,
    errorName,
    message: scrubMessage(input.error.message ?? ''),
    frames,
    signature: signatureOf(errorName, frames),
    appVersion: input.appVersion,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    osMajor: input.osMajor,
    deviceClass: input.deviceClass,
    // Saate yuvarla: dakika hassasiyetli zaman, iki raporu aynı kullanıcıya
    // bağlamak için kullanılabilir.
    hourBucketMs: Math.floor(input.nowMs / 3_600_000) * 3_600_000,
  };
}

/** Oturum içi tekrar gönderimini önler — aynı imza bir kez raporlanır. */
const reportedSignatures = new Set<string>();

/** Kullanıcı ilk açılışta reddettiyse hiçbir şey gönderilmez. */
let userOptedIn = true;

export function setCrashReportingEnabled(enabled: boolean): void {
  userOptedIn = enabled;
}

export async function sendReport(report: CrashReport): Promise<boolean> {
  if (!FEATURES.anonymousCrashReporting || !userOptedIn) return false;
  if (reportedSignatures.has(report.signature)) return false;

  const serialized = JSON.stringify(report);

  // SON SAVUNMA HATTI: temizleyiciden bir kalıp kaçtıysa rapor GÖNDERİLMEZ.
  // Sessizce sızdırmaktansa çökme verisini kaybetmeyi tercih ediyoruz.
  if (containsLikelyPii(serialized)) {
    log.warn('Rapor PII denetiminden geçemedi — gönderilmedi');
    return false;
  }

  reportedSignatures.add(report.signature);

  const result = await pinnedRequest<{ received: boolean }>({
    baseUrl: new URL(ENV.crashIngestUrl).origin,
    path: new URL(ENV.crashIngestUrl).pathname,
    method: 'POST',
    body: report,
  });

  return result.ok;
}

interface InstallOptions {
  readonly appVersion?: string;
  readonly osMajor?: string;
  readonly deviceClass?: DeviceClass;
}

/**
 * Global hata yakalayıcıyı kurar.
 *
 * index.js içinde, React ağacı monte edilmeden ÖNCE çağrılır — erken
 * hatalar (modül yükleme, native köprü kurulumu) da yakalanabilsin diye.
 */
export function installCrashReporter(options: InstallOptions = {}): void {
  if (typeof ErrorUtils === 'undefined') return;

  const appVersion = options.appVersion ?? '1.0.0';
  const osMajor = options.osMajor ?? String(Platform.Version).split('.')[0] ?? '0';
  const deviceClass = options.deviceClass ?? 'mid';

  const previousHandler = ErrorUtils.getGlobalHandler();

  ErrorUtils.setGlobalHandler((error, isFatal) => {
    try {
      const report = buildReport({
        error,
        fatal: isFatal === true,
        appVersion,
        osMajor,
        deviceClass,
        nowMs: Date.now(),
      });
      void sendReport(report);
    } catch (e) {
      // Raporlayıcının kendisi çökmeyi ENGELLEMEMELİ: burada yutulan hata,
      // aşağıdaki previousHandler çağrısının çalışmasını garanti eder.
      if (__DEV__) console.error('[CrashReporter] Rapor üretilemedi', e);
    }

    // Önceki işleyici (RN'in kendi kırmızı ekranı / native çökme) MUTLAKA
    // çağrılır; aksi halde debug'da hata görünmez hale gelir.
    previousHandler?.(error, isFatal);
  });
}

/** Testler için — oturum durumunu sıfırlar. */
export function resetReporterStateForTests(): void {
  reportedSignatures.clear();
  userOptedIn = true;
}
