/**
 * CrossShare — Instagram Hikayeleri ve WhatsApp Durumu'na doğrudan aktarım.
 *
 * İKİ YOL
 *   1. DOĞRUDAN ŞEMA: Instagram ve WhatsApp, kendi uygulamalarına içerik
 *      aktarmak için özel URL şemaları sunar. Bu yol, kullanıcıyı paylaşım
 *      sayfasında gezdirmeden hedefe götürür.
 *   2. YEREL SHARE SHEET: Şema yoksa veya uygulama kurulu değilse sistemin
 *      kendi paylaşım sayfası açılır — kullanıcı hiçbir zaman çıkmaza düşmez.
 *
 * Instagram Hikaye şeması `instagram-stories://share` iOS'ta Info.plist
 * `LSApplicationQueriesSchemes` içinde bildirilmiş olmalıdır; aksi halde
 * `canOpenURL` her zaman false döner ve doğrudan yol sessizce ölür.
 */
import { Linking, Platform, Share } from 'react-native';

import { createLogger } from '@/core/logging/Logger';
import { appError, Err, Ok, type Result } from '@/core/result/Result';

const log = createLogger('CrossShare');

export type ShareTarget = 'instagram-stories' | 'whatsapp-status' | 'system';

/** Facebook App ID — Instagram Hikaye aktarımı için zorunludur. */
const FACEBOOK_APP_ID = 'REPLACE_WITH_FACEBOOK_APP_ID';

interface NativeShareBridge {
  /** Instagram Hikayeler'e arka plan/sticker olarak aktarır. */
  shareToInstagramStories(input: {
    backgroundImagePath: string;
    stickerImagePath?: string;
    appId: string;
  }): Promise<void>;
  /** WhatsApp'a medya aktarır (Durum paylaşımı kullanıcı tarafından seçilir). */
  shareToWhatsApp(input: { filePath: string; mimeType: string }): Promise<void>;
  isInstalled(target: 'instagram' | 'whatsapp'): Promise<boolean>;
}

const bridge = NativeModulesShare();

function NativeModulesShare(): NativeShareBridge | undefined {
  // Ayrı fonksiyon: NativeModules erişimi test ortamında tembel olsun.
  const { NativeModules } = require('react-native') as typeof import('react-native');
  return NativeModules.EvenGirlShare as NativeShareBridge | undefined;
}

export interface ShareRequest {
  /** Paylaşılacak dosyanın yerel yolu. */
  readonly filePath: string;
  readonly mimeType: 'image/jpeg' | 'image/png' | 'video/mp4';
  /** Sistem paylaşım sayfasında gösterilecek metin. */
  readonly caption?: string;
}

export const CrossShare = {
  async isInstalled(target: 'instagram' | 'whatsapp'): Promise<boolean> {
    if (bridge) {
      return bridge.isInstalled(target).catch(() => false);
    }

    // Köprü yoksa şema sorgusuyla dene. Android'de bu her zaman çalışmaz;
    // false dönmesi "kurulu değil" değil, "bilinmiyor" demektir — bu yüzden
    // paylaşım yine denenir ve hata durumunda sistem sayfasına düşülür.
    const scheme = target === 'instagram' ? 'instagram-stories://' : 'whatsapp://';
    return Linking.canOpenURL(scheme).catch(() => false);
  },

  /** Instagram Hikayeler'e doğrudan aktarım. */
  async toInstagramStories(request: ShareRequest): Promise<Result<void>> {
    if (!bridge) return this.toSystemSheet(request);

    try {
      await bridge.shareToInstagramStories({
        backgroundImagePath: request.filePath,
        appId: FACEBOOK_APP_ID,
      });
      return Ok(undefined);
    } catch (e) {
      log.warn('Instagram aktarımı başarısız — sistem sayfasına düşülüyor', e);
      return this.toSystemSheet(request);
    }
  },

  /** WhatsApp'a aktarım — kullanıcı Durum'u kendi seçer. */
  async toWhatsAppStatus(request: ShareRequest): Promise<Result<void>> {
    if (!bridge) return this.toSystemSheet(request);

    try {
      await bridge.shareToWhatsApp({
        filePath: request.filePath,
        mimeType: request.mimeType,
      });
      return Ok(undefined);
    } catch (e) {
      log.warn('WhatsApp aktarımı başarısız — sistem sayfasına düşülüyor', e);
      return this.toSystemSheet(request);
    }
  },

  /**
   * Yerel paylaşım sayfası — her zaman çalışan yedek yol.
   *
   * iOS `url`, Android `message` alanını kullanır; ikisini birden vermek
   * Android'de dosyayı metin olarak paylaşır.
   */
  async toSystemSheet(request: ShareRequest): Promise<Result<void>> {
    try {
      await Share.share(
        Platform.OS === 'ios'
          ? { url: request.filePath, message: request.caption }
          : { message: request.caption ?? request.filePath, url: request.filePath },
      );
      return Ok(undefined);
    } catch (e) {
      log.warn('Sistem paylaşımı başarısız', e);
      return Err(
        appError('UNKNOWN', 'share failed', { i18nKey: 'share.failed', retryable: true }),
      );
    }
  },

  async share(target: ShareTarget, request: ShareRequest): Promise<Result<void>> {
    switch (target) {
      case 'instagram-stories':
        return this.toInstagramStories(request);
      case 'whatsapp-status':
        return this.toWhatsAppStatus(request);
      case 'system':
        return this.toSystemSheet(request);
    }
  },
};
