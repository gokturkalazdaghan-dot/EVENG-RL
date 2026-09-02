/**
 * ThermalPolicy — güç profili seçiminin SAF karar mantığı.
 *
 * Platform API'lerinden (ProcessInfo, PowerManager) bilerek ayrıldı:
 * bu dosya hiçbir şey import etmez, yan etkisi yoktur ve doğrudan test edilir
 * (__tests__/ThermalPolicy.test.ts). Termal politikadaki bir hata, cihazı
 * ısıtan veya kaliteyi sebepsiz düşüren türden — yani kullanıcının fark ettiği
 * ama bizim log'da göremediğimiz — bir hatadır; testsiz bırakılamaz.
 */
import type { PowerProfileId } from '@/performance/PowerProfile';

export type ThermalState = 'nominal' | 'fair' | 'serious' | 'critical';

export interface DeviceSignals {
  readonly thermal: ThermalState;
  /** 0..1 */
  readonly batteryLevel: number;
  readonly isCharging: boolean;
  /** iOS Low Power Mode / Android Battery Saver */
  readonly lowPowerMode: boolean;
}

/** Kısıtlama merdiveni: soldan sağa doğru daha kısıtlı. */
export const PROFILE_LADDER: readonly PowerProfileId[] = [
  'performance',
  'balanced',
  'saver',
  'critical',
];

/** Profili gevşetmek için hedefin bu kadar süre stabil kalması gerekir. */
export const UPGRADE_STABLE_MS = 20_000;

const LOW_BATTERY = 0.25;
const CRITICAL_BATTERY = 0.1;

/**
 * Anlık sinyallerden hedef profili seçer.
 *
 * Sıralama önemlidir: en kısıtlayıcı koşul önce değerlendirilir, ilk eşleşen
 * kazanır. Örneğin kritik sıcaklıkta şarjda olmak profili yükseltmez —
 * şarj olurken ısınma daha da kötüdür.
 */
export function targetProfileFor(signals: DeviceSignals): PowerProfileId {
  if (signals.thermal === 'critical') return 'critical';
  if (signals.batteryLevel <= CRITICAL_BATTERY && !signals.isCharging) return 'critical';

  if (signals.thermal === 'serious') return 'saver';
  if (signals.lowPowerMode) return 'saver';

  if (signals.thermal === 'fair') return 'balanced';
  if (signals.batteryLevel <= LOW_BATTERY && !signals.isCharging) return 'balanced';

  // Yalnızca her şey iyiyken ve şarjdayken tam performans. Pil ile çalışırken
  // 'performance' seçmek, kullanıcının fark ettiği tek şeyin hızla eriyen pil
  // olmasına yol açar.
  return signals.isCharging ? 'performance' : 'balanced';
}

export interface LadderInput {
  readonly current: PowerProfileId;
  readonly target: PowerProfileId;
  /** Hedefin değişmeden kaldığı andan bu yana geçen süre (ms). */
  readonly targetStableForMs: number;
}

/**
 * Merdiven geçişi. İki asimetrik kural:
 *
 *   1. KISITLAMA yönünde derhal ve tek kademe inilir. Isınmanın geçmesini
 *      beklemek, cihazın throttle'a girmesine ve tüm işlemin yavaşlamasına
 *      yol açar — geç kalmış kısıtlama, kısıtlama yapmamaktan kötüdür.
 *   2. GEVŞETME yönünde hedefin UPGRADE_STABLE_MS boyunca stabil kalması
 *      istenir. Aksi halde sıcaklık eşiğinde profil sürekli gidip gelir ve
 *      kullanıcı çıktı kalitesinin zıpladığını görür.
 *
 * Her iki yönde de TEK kademe hareket edilir: 'critical'dan doğrudan
 * 'performance'a sıçramak, cihazı yeni ısınma döngüsüne sokar.
 */
export function nextProfile(input: LadderInput): PowerProfileId {
  const currentIndex = PROFILE_LADDER.indexOf(input.current);
  const targetIndex = PROFILE_LADDER.indexOf(input.target);

  // Bilinmeyen profil: güvenli varsayılana dön.
  if (currentIndex === -1 || targetIndex === -1) return 'balanced';
  if (targetIndex === currentIndex) return input.current;

  if (targetIndex > currentIndex) {
    return PROFILE_LADDER[currentIndex + 1]!;
  }

  if (input.targetStableForMs >= UPGRADE_STABLE_MS) {
    return PROFILE_LADDER[currentIndex - 1]!;
  }

  return input.current;
}
