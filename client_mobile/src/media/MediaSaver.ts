/**
 * MediaSaver — düzenlenen çıktıyı kullanıcının galerisine yazar.
 *
 * YALNIZCA EKLEME
 * iOS'ta `.addOnly` yetkisi, Android'de MediaStore üzerinden kendi
 * eklediğimiz öğe. İkisi de kullanıcının fotoğraflarını OKUMA hakkı
 * vermez. Tam erişim istemek, seçici sayesinde hiç gerekmeyen bir yetkiyi
 * geri getirirdi.
 *
 * SESSİZ BAŞARI YOK
 * İzin reddedilirse ya da köprü yoksa hata döner. "Kaydedildi" deyip
 * galeride hiçbir şey olmaması, kullanıcının çıktısını kaybetmesidir.
 */
import { NativeModules } from 'react-native';

import { createLogger } from '@/core/logging/Logger';
import { appError, Err, Ok, type Result } from '@/core/result/Result';

const log = createLogger('MediaSaver');

export type SaveAuthorization = 'granted' | 'denied' | 'undetermined';

interface NativeSaverBridge {
  /** İstem GÖSTERMEDEN mevcut durumu döndürür. */
  authorizationStatus(): Promise<SaveAuthorization>;
  save(filePath: string, kind: 'photo' | 'video'): Promise<void>;
}

const bridge = NativeModules.EvenGirlMediaSaver as NativeSaverBridge | undefined;

export const MediaSaver = {
  get isAvailable(): boolean {
    return bridge !== undefined;
  },

  /**
   * Kaydetmenin mümkün olup olmadığı — İSTEM GÖSTERMEDEN.
   *
   * Arayüz düğmeyi buna göre gizler. İzin isteminin, kullanıcı gerçekten
   * kaydetmek istediğinde çıkması gerekir; ekranı açar açmaz istem
   * göstermek, kullanıcının ne için sorulduğunu bilmeden reddetmesine yol
   * açar ve o karar KALICIDIR.
   */
  async authorization(): Promise<SaveAuthorization> {
    if (!bridge) return 'denied';
    try {
      return await bridge.authorizationStatus();
    } catch {
      return 'denied';
    }
  },

  async save(filePath: string, kind: 'photo' | 'video'): Promise<Result<void>> {
    if (!bridge) {
      return Err(appError('UNKNOWN', 'kaydedici köprüsü yok', { i18nKey: 'export.saverUnavailable' }));
    }
    if (filePath.trim() === '') {
      return Err(appError('UNKNOWN', 'boş dosya yolu'));
    }

    try {
      await bridge.save(filePath, kind);
      return Ok(undefined);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'permission_denied') {
        return Err(
          appError('UNKNOWN', 'galeri izni yok', { i18nKey: 'export.permissionDenied' }),
        );
      }
      if (code === 'unsupported') {
        return Err(
          appError('UNKNOWN', 'bu sürümde kayıt kapalı', { i18nKey: 'export.saveUnsupported' }),
        );
      }
      log.warn('Galeriye kaydedilemedi', e);
      return Err(appError('UNKNOWN', 'gallery save failed', { retryable: true }));
    }
  },
};
