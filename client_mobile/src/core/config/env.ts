/**
 * Derleme zamanı yapılandırması.
 *
 * KURAL: Bu dosyada hiçbir gizli anahtar (secret) bulunmaz. Mobil binary tersine
 * mühendislikle her zaman açılabilir; bu yüzden yalnızca PUBLIC anahtarlar
 * (RevenueCat public SDK key, pin hash'leri gibi doğası gereği açık veriler)
 * gömülür. Apple shared secret / Google service account gibi değerler SADECE
 * backend'de (bkz. repo kökündeki .env.example) durur.
 */

declare const __DEV__: boolean;

export interface AppEnv {
  readonly apiBaseUrl: string;
  /** RevenueCat public SDK key — gizli değildir, istemciye gömülmesi tasarım gereğidir. */
  readonly revenueCatPublicKeyIos: string;
  readonly revenueCatPublicKeyAndroid: string;
  /** SPKI SHA-256 pin'leri (base64). En az bir yedek pin zorunlu. */
  readonly pinnedHosts: Readonly<Record<string, readonly string[]>>;
  readonly crashIngestUrl: string;
  readonly isProduction: boolean;
}

export const ENV: AppEnv = {
  apiBaseUrl: 'https://api.armanalabs.com',
  revenueCatPublicKeyIos: 'appl_PUBLIC_SDK_KEY_PLACEHOLDER',
  revenueCatPublicKeyAndroid: 'goog_PUBLIC_SDK_KEY_PLACEHOLDER',
  pinnedHosts: {
    // Leaf + yedek (backup) pin. Yedek pin olmadan sertifika yenilemesi
    // uygulamayı sahada kilitler — bu yüzden CI, tek pinli config'i reddeder.
    'api.armanalabs.com': [
      'sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      'sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=',
    ],
    'crash.armanalabs.com': [
      'sha256/CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC=',
      'sha256/DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD=',
    ],
  },
  crashIngestUrl: 'https://crash.armanalabs.com/v1/anonymous-crash',
  isProduction: !__DEV__,
};
