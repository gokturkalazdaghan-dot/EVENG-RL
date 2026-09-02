/**
 * MediaPicker — kullanıcının düzenleyeceği fotoğraf/videoyu seçtirir.
 *
 * İZİN İSTEMEZ
 * Native taraf sistem seçicisini kullanıyor (iOS PHPickerViewController,
 * Android Fotoğraf Seçici). Seçici ayrı bir süreçte çalışır ve yalnızca
 * kullanıcının SEÇTİĞİ öğeyi verir; uygulama galeriye hiç erişmez. Bu
 * yüzden ne `NSPhotoLibraryUsageDescription` ne de `READ_MEDIA_IMAGES`
 * gerekiyor (bkz. AndroidManifest.xml içindeki açıklama).
 *
 * İPTAL HATA DEĞİLDİR
 * Kullanıcı vazgeçtiğinde `Ok(null)` döner. İptali hata saymak, arayüzde
 * her vazgeçişte gereksiz bir hata mesajı göstermek olurdu.
 */
import { NativeModules } from 'react-native';

import { createLogger } from '@/core/logging/Logger';
import { appError, Err, Ok, type Result } from '@/core/result/Result';

const log = createLogger('MediaPicker');

export type MediaKind = 'photo' | 'video' | 'any';

export interface PickedMedia {
  /** Uygulama kum havuzuna KOPYALANMIŞ dosyanın URI'si. */
  readonly uri: string;
  readonly kind: 'photo' | 'video';
  readonly sizeBytes: number;
}

interface NativePickerBridge {
  /** Seçim iptal edilirse `null` döner. */
  pick(kind: MediaKind): Promise<PickedMedia | null>;
}

const bridge = NativeModules.EvenGirlMediaPicker as NativePickerBridge | undefined;

export const MediaPicker = {
  get isAvailable(): boolean {
    return bridge !== undefined;
  },

  /**
   * Seçiciyi açar.
   *
   * `Ok(null)` = kullanıcı vazgeçti.
   */
  async pick(kind: MediaKind = 'photo'): Promise<Result<PickedMedia | null>> {
    if (!bridge) {
      // Köprü yoksa SESSİZCE null DÖNMEZ: "vazgeçildi" ile "seçici hiç
      // yok" farklı durumlar. İkincisi kurulum hatasıdır ve görünmeli.
      return Err(appError('UNKNOWN', 'seçici köprüsü yok', { i18nKey: 'editor.pickerUnavailable' }));
    }

    try {
      const picked = await bridge.pick(kind);
      if (picked === null || picked === undefined) return Ok(null);

      // Native taraftan gelen değer doğrulanıyor: boş URI ile devam etmek,
      // editörün var olmayan bir dosyayı işlemeye çalışması demektir.
      if (typeof picked.uri !== 'string' || picked.uri.length === 0) {
        return Err(appError('UNKNOWN', 'seçici geçersiz sonuç döndürdü'));
      }

      return Ok({
        uri: picked.uri,
        kind: picked.kind === 'video' ? 'video' : 'photo',
        sizeBytes: Number.isFinite(picked.sizeBytes) ? picked.sizeBytes : 0,
      });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'busy') {
        // Seçici zaten açık: kullanıcı çift dokundu. Hata göstermeye gerek
        // yok, açık olan seçici zaten önünde.
        return Ok(null);
      }
      log.warn('Seçim başarısız', e);
      return Err(appError('UNKNOWN', 'media pick failed', { retryable: true }));
    }
  },
};
