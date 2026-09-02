/**
 * DmPolicy — kimin kime mesaj atabileceğinin SAF mantığı.
 *
 * TACİZ YÜZEYİ BURADA BELİRLENİR
 * Bir sosyal uygulamada en yaygın taciz vektörü, tanımadık birinden gelen
 * istenmeyen mesajdır. Varsayılanı "herkes yazabilir" yapmak, uygulamayı
 * moderasyon ekibine bağımlı hale getirir; varsayılanı doğru koymak,
 * moderasyona hiç düşmeyen bir sorun demektir.
 */
import type { AccessTier } from '@/age/AgePolicy';

export type DmAudience =
  /** Herkes yazabilir. */
  | 'everyone'
  /** Yalnızca takip ettiklerim yazabilir. */
  | 'following'
  /** Yalnızca karşılıklı takipleşilenler. */
  | 'mutuals'
  /** Kimse yazamaz. */
  | 'nobody';

export interface DmSettings {
  readonly audience: DmAudience;
  /** İstek kutusu: izin verilmeyenler doğrudan gelen kutusuna düşmez,
   *  ayrı bir "istekler" bölümünde bekler. */
  readonly allowRequests: boolean;
}

/**
 * VARSAYILAN: karşılıklı takipleşilenler.
 *
 * "Herkes" değil — yeni kullanıcının ilk deneyimi istenmeyen mesaj olmamalı.
 * "Kimse" de değil — uygulamanın sosyal işlevini kapatır.
 */
export const DEFAULT_DM_SETTINGS: DmSettings = {
  audience: 'mutuals',
  allowRequests: true,
};

export interface DmPermissionInput {
  readonly senderId: string;
  /** Gönderen aktif EVEN PRO abonesi mi — DM PRO özelliğidir. */
  readonly senderIsPro: boolean;
  readonly recipientTier: AccessTier;
  readonly recipientSettings: DmSettings;
  readonly recipientFollowsSender: boolean;
  readonly mutualFollow: boolean;
  readonly blockedEitherWay: boolean;
  /** Alıcı reşit değilse: gönderen zaten tanıdığı biri mi. */
  readonly senderIsKnownContact: boolean;
}

export type DmPermission =
  /** Doğrudan gelen kutusuna düşer. */
  | { readonly allowed: true; readonly asRequest: false }
  /** İstek kutusuna düşer; alıcı kabul edene kadar bildirim gitmez. */
  | { readonly allowed: true; readonly asRequest: true }
  | {
      readonly allowed: false;
      readonly reason:
        | 'blocked'
        | 'audience'
        | 'minor-protection'
        | 'not-verified'
        | 'pro-required';
    };

export function canSendDm(input: DmPermissionInput): DmPermission {
  // DM PRO gerektirir (spec: encrypted DMs — PRO Only).
  if (!input.senderIsPro) {
    return { allowed: false, reason: 'pro-required' };
  }

  if (input.blockedEitherWay) {
    return { allowed: false, reason: 'blocked' };
  }

  if (input.recipientTier === 'unverified') {
    return { allowed: false, reason: 'not-verified' };
  }

  // REŞİT OLMAYAN KORUMASI: tanımadığı kişiden mesaj almaz. İstek kutusu bile
  // açılmaz — istek kutusu, tanımadık birinin metin göndermesine izin verir
  // ve içeriği alıcıya görünür. Reşit olmayan için bu yeterli bir koruma değil.
  if (input.recipientTier === 'safe' && !input.senderIsKnownContact) {
    return { allowed: false, reason: 'minor-protection' };
  }

  switch (input.recipientSettings.audience) {
    case 'everyone':
      return { allowed: true, asRequest: false };

    case 'following':
      if (input.recipientFollowsSender) return { allowed: true, asRequest: false };
      break;

    case 'mutuals':
      if (input.mutualFollow) return { allowed: true, asRequest: false };
      break;

    case 'nobody':
      return { allowed: false, reason: 'audience' };
  }

  // İzin listesine girmiyor: istek kutusu açıksa oraya düşer.
  return input.recipientSettings.allowRequests
    ? { allowed: true, asRequest: true }
    : { allowed: false, reason: 'audience' };
}

/**
 * Reşit olmayan kullanıcı için seçilebilir DM ayarları.
 * "Herkes" seçeneği sunulmaz — sunup sonra engellemek kafa karıştırır.
 */
export function allowedDmAudiences(tier: AccessTier): readonly DmAudience[] {
  if (tier === 'adult') return ['everyone', 'following', 'mutuals', 'nobody'];
  if (tier === 'safe') return ['mutuals', 'nobody'];
  return [];
}
