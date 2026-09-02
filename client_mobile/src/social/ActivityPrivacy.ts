/**
 * ActivityPrivacy — çevrimiçi / son görülme görünürlüğünün SAF mantığı.
 *
 * KARŞILIKLILIK KURALI (spec'in çekirdeği)
 * "Gizleyen, diğerininkini de göremez." Bu kural adalet için değil,
 * SÜRDÜRÜLEBİLİRLİK için vardır: karşılıklılık olmadan herkes kendi
 * durumunu gizler ve başkalarınınkini izler; özellik iki hafta içinde
 * anlamsızlaşır. WhatsApp ve Telegram aynı kuralı aynı sebeple uygular.
 *
 * GHOST MODE (EVEN PRO)
 * PRO abonesi, karşılıklılıktan MUAF DEĞİLDİR — Ghost Mode açıkken de
 * başkalarının durumunu göremez. Aksi halde "para verirsen tek taraflı
 * gözetleyebilirsin" satmış oluruz; bu hem etik olarak savunulamaz hem de
 * gizliliği bir ödeme duvarının arkasına koyduğu için mağaza incelemesinde
 * sorun çıkarır.
 *
 * Ghost Mode'un normal gizlemeden farkı KAPSAMDIR:
 *   - Normal gizleme: son görülme gizlenir, "çevrimiçi" rozeti kalır.
 *   - Ghost Mode: ikisi de gizlenir, yazıyor göstergesi ve okundu bilgisi de.
 * İkisi de aynı karşılıklılık bedelini öder.
 */

export type ActivityVisibility =
  /** Herkes görebilir. */
  | 'everyone'
  /** Yalnızca karşılıklı takipleşilen kişiler. */
  | 'mutuals'
  /** Kimse göremez (son görülme gizli, çevrimiçi rozeti görünür). */
  | 'nobody';

export interface ActivitySettings {
  readonly lastSeenVisibility: ActivityVisibility;
  readonly onlineBadgeVisible: boolean;
  /** EVEN PRO: her şeyi gizler (yazıyor, okundu dahil). */
  readonly ghostMode: boolean;
  /** Ghost Mode yalnızca aktif PRO abonesinde etkindir. */
  readonly isPro: boolean;
}

export const DEFAULT_ACTIVITY_SETTINGS: ActivitySettings = {
  lastSeenVisibility: 'everyone',
  onlineBadgeVisible: true,
  ghostMode: false,
  isPro: false,
};

/**
 * Kullanıcı kendi aktifliğini paylaşıyor mu?
 *
 * Ghost Mode, abonelik bittiğinde otomatik olarak devre dışı kalır: aksi
 * halde abonelik sonrası kullanıcı hâlâ gizli görünür ama başkalarınınkini
 * de göremez — yani ödemediği bir şeyin bedelini ödemeye devam eder.
 */
export function isSharingActivity(settings: ActivitySettings): boolean {
  const ghostActive = settings.ghostMode && settings.isPro;
  if (ghostActive) return false;
  return settings.lastSeenVisibility !== 'nobody' || settings.onlineBadgeVisible;
}

export interface ActivityViewInput {
  /** Bakan kişinin ayarları. */
  readonly viewer: ActivitySettings;
  /** Bakılan kişinin ayarları. */
  readonly target: ActivitySettings;
  /** İki kullanıcı karşılıklı takipleşiyor mu. */
  readonly mutualFollow: boolean;
  /** Bakan kişi hedefi engellemiş mi (veya tersi). */
  readonly blockedEitherWay: boolean;
}

export type ActivityView =
  | { readonly kind: 'online' }
  | { readonly kind: 'last-seen'; readonly showTimestamp: true }
  | {
      readonly kind: 'hidden';
      readonly reason:
        | 'target-hidden'
        | 'reciprocity'
        | 'not-mutual'
        | 'blocked'
        | 'target-ghost';
    };

/**
 * Bir kullanıcının başkasının aktifliğini görüp göremeyeceği.
 *
 * Sıra önemlidir ve her adım bir öncekinden daha "yerel" bir sebeple reddeder;
 * böylece kullanıcıya gösterilecek açıklama doğru olanı olur.
 */
export function resolveActivityView(input: ActivityViewInput): ActivityView {
  // 1) Engelleme her şeyin önünde.
  if (input.blockedEitherWay) {
    return { kind: 'hidden', reason: 'blocked' };
  }

  // 2) Hedef Ghost Mode'daysa kimse göremez.
  if (input.target.ghostMode && input.target.isPro) {
    return { kind: 'hidden', reason: 'target-ghost' };
  }

  // 3) KARŞILIKLILIK: bakan kişi kendi aktifliğini gizliyorsa, başkasınınkini
  //    de göremez. PRO olmak bu kuraldan muaf tutmaz.
  if (!isSharingActivity(input.viewer)) {
    return { kind: 'hidden', reason: 'reciprocity' };
  }

  // 4) Hedefin görünürlük tercihi.
  const target = input.target;

  if (target.lastSeenVisibility === 'nobody' && !target.onlineBadgeVisible) {
    return { kind: 'hidden', reason: 'target-hidden' };
  }

  if (target.lastSeenVisibility === 'mutuals' && !input.mutualFollow) {
    // Çevrimiçi rozeti hâlâ açıksa onu gösteriyoruz: kullanıcı son görülme
    // ile anlık durumu ayrı ayrı kontrol edebilmeli.
    return target.onlineBadgeVisible
      ? { kind: 'online' }
      : { kind: 'hidden', reason: 'not-mutual' };
  }

  if (target.lastSeenVisibility === 'nobody') {
    return target.onlineBadgeVisible
      ? { kind: 'online' }
      : { kind: 'hidden', reason: 'target-hidden' };
  }

  return { kind: 'last-seen', showTimestamp: true };
}

/**
 * "Yazıyor…" göstergesi ve okundu bilgisi.
 *
 * Bunlar da aktiflik verisidir ve aynı karşılıklılık kuralına tabidir:
 * son görülmesini gizleyip karşısındakinin "yazıyor" göstergesini izlemek,
 * gizlemenin amacını boşa çıkarır.
 */
export function canSeeTypingIndicator(input: ActivityViewInput): boolean {
  const view = resolveActivityView(input);
  if (view.kind === 'hidden') return false;
  // Ghost Mode'daki kullanıcı zaten yukarıda elenir; burada bakan tarafın
  // Ghost Mode'u da yazıyor göstergesini kapatır (karşılıklılık).
  return !(input.viewer.ghostMode && input.viewer.isPro);
}

export function canSeeReadReceipts(input: ActivityViewInput): boolean {
  return canSeeTypingIndicator(input);
}

/**
 * Abonelik bittiğinde ayarları normalleştirir.
 *
 * Ghost Mode kapanır ama kullanıcının DİĞER gizlilik tercihleri korunur:
 * abonelik bitti diye son görülmesini herkese açmak, kullanıcının açık
 * iradesini görmezden gelmek olur.
 */
export function normalizeAfterSubscriptionLapse(settings: ActivitySettings): ActivitySettings {
  if (!settings.ghostMode) return { ...settings, isPro: false };
  return { ...settings, ghostMode: false, isPro: false };
}
