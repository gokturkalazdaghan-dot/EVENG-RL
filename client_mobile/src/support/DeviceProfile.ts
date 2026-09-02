/**
 * DeviceProfile — teşhis için gereken, KİMLİK OLMAYAN cihaz bilgisi.
 *
 * Yalnızca üç şey: platform, OS ana sürümü ve RAM'e göre cihaz sınıfı.
 * Tam model, kimlik veya seri numarası okunmaz (bkz. tools/verify-privacy.mjs).
 *
 * RAM değeri, çıkarım köprüsünden alınır — zaten model kapasitesi kararı için
 * okunuyor; ikinci bir native çağrı eklemeye gerek yok.
 */
import { NativeModules, Platform } from 'react-native';

import { classifyDevice, type DeviceClass } from '@/telemetry/AnonymousCrashReporter';

interface RamProvider {
  deviceTotalRamBytes(): Promise<number>;
}

const bridge = NativeModules.EvenGirlInference as RamProvider | undefined;

let cachedClass: DeviceClass | null = null;

export async function deviceClass(): Promise<DeviceClass> {
  if (cachedClass) return cachedClass;

  const ramBytes = await bridge?.deviceTotalRamBytes().catch(() => 0);
  // RAM okunamadıysa 'mid' varsayıyoruz: 'low' demek, destek tarafında
  // yanlış teşhise yol açar ("cihazı zayıfmış" denip gerçek hata kaçırılır).
  cachedClass = ramBytes ? classifyDevice(ramBytes) : 'mid';
  return cachedClass;
}

export function platformName(): 'ios' | 'android' {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

/** Yalnızca ana sürüm — yama sürümü tekilleştirici olabilir. */
export function osMajor(): string {
  return String(Platform.Version).split('.')[0] ?? '0';
}
