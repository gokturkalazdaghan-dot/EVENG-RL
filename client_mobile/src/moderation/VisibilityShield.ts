/**
 * VisibilityShield — kimin neyi görebileceğinin SAF karar mantığı.
 *
 * TEK KAPI KURALI
 * Akış, arama, profil, hikaye, DM eki, şablon pazarı — içerik gösteren HER
 * yüzey `canView` üzerinden geçer. Her yüzeyin kendi filtresini yazması,
 * altı ay sonra birinin filtresiz bir yüzey eklemesi demektir; kalkanın
 * değeri tam da atlanamaz olmasındadır.
 *
 * FAIL-CLOSED
 * Bilinmeyen her durum GİZLE yönünde çözülür: kademe doğrulanmamışsa,
 * derecelendirme eksikse, sınıflandırıcı çalışmamışsa içerik gösterilmez.
 * "Emin değilsek gösterelim" kabul edilemez bir varsayılandır.
 *
 * İSTEMCİ TARAFI TEK SAVUNMA DEĞİLDİR
 * Buradaki mantık, sunucudaki filtrenin AYNISIDIR ve onun yerine geçmez.
 * Sunucu, reşit olmayan bir hesaba +18 içeriği hiç GÖNDERMEZ; istemci
 * kalkanı, sunucudan geçmiş içeriğin yanlış yüzeyde belirmesini önler ve
 * çevrimdışı önbellekte de çalışır. İki katman birbirinin yedeğidir.
 */
import type { AccessTier } from '@/age/AgePolicy';
import { isAdultOnly, type ContentRating } from '@/moderation/ContentRating';

export interface Viewer {
  readonly tier: AccessTier;
  /**
   * Yetişkin kullanıcının kendi tercihi. Yetişkin olmak, yetişkin içerik
   * GÖRMEK İSTEMEK anlamına gelmez; varsayılan KAPALI.
   */
  readonly adultContentOptIn: boolean;
  /** Hassas içeriği bulanık göstermek yerine doğrudan açsın mı. */
  readonly revealSensitiveByDefault: boolean;
}

export interface ContentItem {
  readonly rating: ContentRating;
  /** İçeriği yükleyen kullanıcı kimliği — engel listesi kontrolü için. */
  readonly authorId: string;
  /** Kullanıcı tarafından raporlandı ve inceleme bekliyor mu. */
  readonly reportedPendingReview?: boolean;
}

export type VisibilityDecision =
  | { readonly visible: true; readonly blurred: boolean }
  | {
      readonly visible: false;
      readonly reason:
        | 'age-restricted'
        | 'not-verified'
        | 'opt-in-required'
        | 'blocked-author'
        | 'under-review'
        | 'policy-blocked';
    };

export interface ViewContext {
  readonly viewer: Viewer;
  readonly item: ContentItem;
  /** İzleyicinin engellediği kullanıcılar. */
  readonly blockedAuthorIds: ReadonlySet<string>;
}

export function canView(context: ViewContext): VisibilityDecision {
  const { viewer, item, blockedAuthorIds } = context;

  // 1) Politika ihlali — kimseye gösterilmez, yetişkin dahil.
  if (item.rating === 'blocked') {
    return { visible: false, reason: 'policy-blocked' };
  }

  // 2) Engellenen kullanıcı. Derecelendirmeden ÖNCE bakılır: engelleyen
  //    kişi, engellediğinin masum içeriğini de görmek istemez.
  if (blockedAuthorIds.has(item.authorId)) {
    return { visible: false, reason: 'blocked-author' };
  }

  // 3) Doğrulanmamış kademe — fail-closed.
  if (viewer.tier === 'unverified') {
    return { visible: false, reason: 'not-verified' };
  }

  // 4) YAŞ KALKANI. Reşit olmayan kullanıcı, yalnızca 'adult' değil
  //    'sensitive' ve 'review' içeriği de görmez. Belirsiz olanı göstermek,
  //    kalkanı sınıflandırıcının en zayıf anına bağlamak olurdu.
  if (isAdultOnly(item.rating) && viewer.tier !== 'adult') {
    return { visible: false, reason: 'age-restricted' };
  }

  // 5) Raporlanmış ve inceleme bekleyen içerik yetişkinlere de gösterilmez.
  if (item.reportedPendingReview === true) {
    return { visible: false, reason: 'under-review' };
  }

  // 6) Yetişkin kullanıcının kendi tercihi. Yetişkin olmak, yetişkin içerik
  //    görmek istemek DEĞİLDİR — varsayılan kapalı, kullanıcı açar.
  if (item.rating === 'adult' && !viewer.adultContentOptIn) {
    return { visible: false, reason: 'opt-in-required' };
  }

  // 7) Hassas içerik görünür ama varsayılan olarak bulanık.
  const blurred = item.rating === 'sensitive' && !viewer.revealSensitiveByDefault;
  return { visible: true, blurred };
}

/**
 * Liste filtresi — akış ve arama sonuçları bundan geçer.
 *
 * Gizlenen öğe listeden TAMAMEN ÇIKARILIR; "bu içerik gizlendi" yer tutucusu
 * bırakılmaz. Yer tutucu, reşit olmayan kullanıcıya orada bir şey olduğunu
 * söyler ve merak uyandırır — kalkanın amacına terstir.
 */
export function filterVisible<T extends ContentItem>(
  items: readonly T[],
  viewer: Viewer,
  blockedAuthorIds: ReadonlySet<string>,
): readonly { readonly item: T; readonly blurred: boolean }[] {
  const output: { item: T; blurred: boolean }[] = [];

  for (const item of items) {
    const decision = canView({ viewer, item, blockedAuthorIds });
    if (decision.visible) output.push({ item, blurred: decision.blurred });
  }
  return output;
}

/**
 * Arama sorgusu kalkanı.
 *
 * Reşit olmayan kullanıcının yetişkin içerik ARAMASI da engellenir: sonuç
 * boş dönse bile, sorgunun kendisi öneri ve otomatik tamamlama sistemlerini
 * besler. Terim listesi sunucudan gelir; burada yalnızca uygulanır.
 */
export function isSearchAllowed(viewer: Viewer, matchesAdultTerm: boolean): boolean {
  if (viewer.tier === 'unverified') return false;
  if (!matchesAdultTerm) return true;
  return viewer.tier === 'adult' && viewer.adultContentOptIn;
}
