/**
 * Güç profilleri — AI işlemlerinin cihazı ısıtmadan/pili bitirmeden çalışması
 * için kullanılan bütçe tanımları.
 *
 * Her profil, işlem hattına (pipeline) "ne kadar hızlı gidebilirsin" sınırını
 * verir. Profil seçimi ThermalGovernor tarafından yapılır; pipeline'lar profili
 * sorgular ama değiştiremez.
 */
export type PowerProfileId = 'performance' | 'balanced' | 'saver' | 'critical';

export interface PowerBudget {
  readonly id: PowerProfileId;
  /** Tercih edilen hesaplama birimi. NPU en verimli, CPU en ısıtıcı olanıdır. */
  readonly compute: 'npu' | 'gpu' | 'cpu';
  /** Aynı anda çalışabilecek en fazla AI işi. */
  readonly maxConcurrentJobs: number;
  /** Video işlemede kare atlama oranı (1 = her kare, 2 = bir atla bir işle). */
  readonly frameStride: number;
  /** Model çıktısının uzun kenarı — ısınmada çözünürlük düşürerek yük azaltılır. */
  readonly maxOutputEdgePx: number;
  /** Arka planda ön-render (prefetch) yapılabilir mi. */
  readonly allowBackgroundPrefetch: boolean;
  /** İki iş arasında cihazın soğuması için beklenen süre. */
  readonly interJobCooldownMs: number;
}

export const POWER_BUDGETS: Readonly<Record<PowerProfileId, PowerBudget>> = {
  performance: {
    id: 'performance',
    compute: 'npu',
    maxConcurrentJobs: 3,
    frameStride: 1,
    maxOutputEdgePx: 4096,
    allowBackgroundPrefetch: true,
    interJobCooldownMs: 0,
  },
  balanced: {
    id: 'balanced',
    compute: 'npu',
    maxConcurrentJobs: 2,
    frameStride: 1,
    maxOutputEdgePx: 2560,
    allowBackgroundPrefetch: true,
    interJobCooldownMs: 120,
  },
  saver: {
    // Pil tasarrufu / hafif ısınma: GPU'ya düş, çözünürlüğü kıs, prefetch'i kes.
    id: 'saver',
    compute: 'gpu',
    maxConcurrentJobs: 1,
    frameStride: 2,
    maxOutputEdgePx: 1440,
    allowBackgroundPrefetch: false,
    interJobCooldownMs: 400,
  },
  critical: {
    // Cihaz kritik sıcaklıkta veya pil %10'un altında: yalnızca kullanıcının
    // aktif olarak beklediği tek iş, en düşük ayarla.
    id: 'critical',
    compute: 'cpu',
    maxConcurrentJobs: 1,
    frameStride: 4,
    maxOutputEdgePx: 720,
    allowBackgroundPrefetch: false,
    interJobCooldownMs: 1200,
  },
};
