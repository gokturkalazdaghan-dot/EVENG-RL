/**
 * StoryPolicy — hikayelerin ömrü ve görünürlüğünün SAF mantığı.
 *
 * 24 SAAT KURALI
 * Hikaye, yayınlandıktan 24 saat sonra akıştan düşer. "Düşmek" SİLİNMEK
 * DEĞİLDİR: Zero-Deletion politikası gereği kullanıcının medyası cihazından
 * ve bulutundan silinmez, yalnızca başkalarına GÖRÜNMEZ olur. Arşiv,
 * kullanıcının kendi hikaye geçmişinde kalır.
 *
 * Bu ayrım önemlidir: "24 saat sonra silinir" diyen bir uygulama,
 * kullanıcının bir yıl önceki hikayesini de silmiş olur — oysa kullanıcı onu
 * kendi arşivinde tutmak isteyebilir.
 */
import type { ContentRating } from '@/moderation/ContentRating';

export const STORY_LIFETIME_MS = 24 * 60 * 60 * 1000;

export type StoryAudience =
  /** Herkes (yalnızca yetişkin hesaplar seçebilir). */
  | 'public'
  /** Takipçiler. */
  | 'followers'
  /** Karşılıklı takipleşilenler — "yakın arkadaşlar" karşılığı. */
  | 'mutuals';

export interface Story {
  readonly storyId: string;
  readonly authorId: string;
  readonly publishedAtMs: number;
  readonly rating: ContentRating;
  readonly audience: StoryAudience;
}

/** Hikaye hâlâ akışta mı (24 saat dolmadı mı). */
export function isLive(story: Story, nowMs: number): boolean {
  return nowMs - story.publishedAtMs < STORY_LIFETIME_MS;
}

/** Kalan süre (ms). Süresi dolmuşsa 0. */
export function remainingMs(story: Story, nowMs: number): number {
  return Math.max(0, story.publishedAtMs + STORY_LIFETIME_MS - nowMs);
}

/**
 * Hikaye halkasının doluluk oranı (0..1) — UI'daki ilerleme çemberi.
 * Yeni hikaye 1.0, süresi dolmak üzere olan 0'a yakın.
 */
export function lifetimeProgress(story: Story, nowMs: number): number {
  return remainingMs(story, nowMs) / STORY_LIFETIME_MS;
}

/**
 * Hikaye YAYINLAMA PRO gerektirir (spec: 24h stories — PRO Only).
 * Görüntüleme herkese açıktır; yalnızca paylaşım abonelik ister.
 */
export function canPublishStory(isPro: boolean): boolean {
  return isPro;
}

export interface StoryViewInput {
  readonly story: Story;
  readonly viewerId: string;
  readonly viewerFollowsAuthor: boolean;
  readonly mutualFollow: boolean;
  readonly nowMs: number;
}

export type StoryVisibility =
  | { readonly visible: true }
  | {
      readonly visible: false;
      readonly reason: 'expired' | 'not-follower' | 'not-mutual';
    };

/**
 * Hikayenin bu izleyiciye görünüp görünmediği.
 *
 * DİKKAT: Bu fonksiyon YAŞ ve DERECELENDİRME kontrolü YAPMAZ. O kontrol
 * `VisibilityShield.canView` üzerinden geçer ve her yüzeyde aynıdır.
 * İki yerde iki farklı yaş kontrolü yazmak, birinin gerileme sırasında
 * unutulması demektir.
 */
export function canViewStory(input: StoryViewInput): StoryVisibility {
  const { story, viewerId, nowMs } = input;

  // Yazarın kendisi süresi dolmuş hikayesini arşivinde görür.
  if (story.authorId === viewerId) return { visible: true };

  if (!isLive(story, nowMs)) return { visible: false, reason: 'expired' };

  switch (story.audience) {
    case 'public':
      return { visible: true };
    case 'followers':
      return input.viewerFollowsAuthor
        ? { visible: true }
        : { visible: false, reason: 'not-follower' };
    case 'mutuals':
      return input.mutualFollow ? { visible: true } : { visible: false, reason: 'not-mutual' };
  }
}

/**
 * Reşit olmayan kullanıcı hikayesini "herkese açık" yayınlayamaz.
 *
 * Takipçi/karşılıklı seçenekleri açıktır; kısıtlanan tek şey, tanımadığı
 * kişilerin hikayesine erişmesidir. Bu, Safe Mode'un "temas yüzeyini daralt,
 * yaratıcılığı kısıtlama" ilkesinin hikayelere yansımasıdır.
 */
export function allowedAudiences(tier: 'adult' | 'safe' | 'unverified'): readonly StoryAudience[] {
  if (tier === 'adult') return ['public', 'followers', 'mutuals'];
  if (tier === 'safe') return ['followers', 'mutuals'];
  return [];
}

/** Akışta gösterilecek canlı hikayeler, en yeniden eskiye. */
export function liveStories(stories: readonly Story[], nowMs: number): readonly Story[] {
  return stories
    .filter((story) => isLive(story, nowMs))
    .sort((a, b) => b.publishedAtMs - a.publishedAtMs);
}
