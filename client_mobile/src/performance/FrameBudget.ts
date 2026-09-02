/**
 * FrameBudget — UI thread'in kare bütçesini koruyan yardımcı.
 *
 * 60 Hz'de 16.6 ms, 120 Hz'de 8.3 ms bütçe vardır. Ağır JS işi (ör. proje
 * listesi hesaplama, thumbnail hazırlama) bu bütçeyi aşarsa kaydırma
 * animasyonu takılır. Burada işi kare aralarına bölüyoruz.
 */
import { InteractionManager } from 'react-native';

import { FEATURES } from '@/core/config/featureFlags';

export const TARGET_FPS = FEATURES.targetHighRefreshRate ? 120 : 60;
export const FRAME_BUDGET_MS = 1000 / TARGET_FPS;
/** Bütçenin tamamını harcamak jank üretir; %60'ını JS'e ayırıyoruz. */
const JS_SLICE_MS = FRAME_BUDGET_MS * 0.6;

/** Etkileşim (gesture/animasyon) bitene kadar bekler, sonra işi çalıştırır. */
export function afterInteractions<T>(work: () => T): Promise<T> {
  return new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => resolve(work()));
  });
}

/**
 * Büyük bir diziyi kare bütçesini aşmadan işler. Her dilimde geçen süre
 * ölçülür; bütçe dolduğunda kontrol event loop'a bırakılır.
 */
export async function processInSlices<T, R>(
  items: readonly T[],
  fn: (item: T, index: number) => R,
): Promise<R[]> {
  const out: R[] = [];
  let sliceStart = Date.now();

  for (let i = 0; i < items.length; i++) {
    out.push(fn(items[i]!, i));
    if (Date.now() - sliceStart >= JS_SLICE_MS) {
      await new Promise<void>((r) => setTimeout(r, 0));
      sliceStart = Date.now();
    }
  }
  return out;
}
