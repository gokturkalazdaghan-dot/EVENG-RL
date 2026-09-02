/**
 * Özellik bayrakları. Uzaktan yapılandırma yok — uzaktan config çekmek cihaz
 * kimliği/segment göndermeyi gerektirir ve "sıfır veri toplama" ilkesini bozar.
 * Bayraklar derleme zamanında sabittir.
 */
export const FEATURES = {
  /** Ağır modeller için sunucuya düşme izni. Kapalıyken uygulama %100 offline. */
  allowRemoteInference: true,
  /** Cihaz üstü (on-device) model çalıştırma. Kapatılırsa offline mod devre dışı kalır. */
  allowLocalInference: true,
  /** Root/jailbreak tespitinde uygulamayı durdur. */
  enforceIntegrityGate: true,
  /** Anonim çökme raporu gönderimi (kullanıcı ilk açılışta reddedebilir). */
  anonymousCrashReporting: true,
  /** 120 Hz ekranlarda yüksek yenileme hızını hedefle. */
  targetHighRefreshRate: true,
} as const;

export type FeatureFlag = keyof typeof FEATURES;
