/**
 * SecureStore — kısa ömürlü hassas değerlerin (oturum token'ı, entitlement
 * imzası, model lisans anahtarı) tek saklama yeri.
 *
 * iOS   : Keychain, kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
 * Android: EncryptedSharedPreferences (AES256-GCM, key MasterKey/StrongBox)
 *
 * AsyncStorage / MMKV / dosya sistemi bu değerler için ASLA kullanılmaz —
 * hepsi düz metindir ve rootlu cihazda okunabilir.
 */
import { createLogger } from '@/core/logging/Logger';
import { NativeSecurity } from '@/security/native/NativeSecurity';

const log = createLogger('SecureStore');

/** İzinli anahtarlar — serbest string kabul etmiyoruz ki yanlışlıkla PII
 *  (e-posta, kullanıcı adı) anahtar adı olarak sızdırılmasın. */
export type SecureKey =
  | 'entitlement.cache.signed'
  | 'device.anonymous.install.salt'
  | 'model.license.token'
  /** Yaş doğrulama kaydı. Düz depoda tutulursa rootlu cihazda tek satırla
   *  değiştirilir; Keychain/EncryptedSharedPreferences yerel olarak
   *  yapılabilecek en güçlü korumadır. Asıl kapı yine sunucudadır. */
  | 'age.verification.record'
  /** Filigranlı deneme hakkı sayacı (Modül 7). */
  | 'trial.watermarked.exports';

export const SecureStore = {
  async set(key: SecureKey, value: string): Promise<void> {
    await NativeSecurity.secureSet(key, value);
  },

  async get(key: SecureKey): Promise<string | null> {
    try {
      return await NativeSecurity.secureGet(key);
    } catch (e) {
      log.warn('secureGet başarısız', e);
      return null;
    }
  },

  async delete(key: SecureKey): Promise<void> {
    await NativeSecurity.secureDelete(key);
  },
};
