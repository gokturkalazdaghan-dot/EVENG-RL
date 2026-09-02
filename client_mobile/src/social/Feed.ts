/**
 * Feed — akış ve hikaye verisinin alınması.
 *
 * KALKAN İKİ KEZ UYGULANIR
 * Sunucu, kullanıcının kademesine göre zaten filtrelenmiş bir liste döndürür.
 * İstemci AYNI filtreyi bir kez daha uygular. Gereksiz görünebilir; değildir:
 *   - Önbellekten okunan eski liste, kullanıcı Safe Mode'a geçtikten sonra
 *     hâlâ eski içeriği taşıyor olabilir.
 *   - Sunucu yanıtı bir hata veya sürüm uyumsuzluğu yüzünden gevşek gelebilir.
 * İki katman birbirinin yedeğidir ve maliyeti bir dizi filtresidir.
 */
import { createLogger } from '@/core/logging/Logger';
import { appError, Err, Ok, type Result } from '@/core/result/Result';
import { pinnedRequest } from '@/security/SslPinning';
import { AgeGate } from '@/age/AgeGate';
import { Moderation } from '@/moderation/Reporting';
import { filterVisible, type ContentItem, type Viewer } from '@/moderation/VisibilityShield';
import type { ContentRating } from '@/moderation/ContentRating';
import type { Story } from '@/social/StoryPolicy';
import { liveStories } from '@/social/StoryPolicy';

const log = createLogger('Feed');

export interface FeedPost extends ContentItem {
  readonly postId: string;
  readonly authorHandle: string;
  readonly mediaUri: string;
  readonly caption: string;
  readonly likeCount: number;
  readonly publishedAtMs: number;
  /** Bu gönderi bir şablondan üretildiyse: şablon kimliği. */
  readonly templateId?: string;
}

export interface FeedPage {
  readonly posts: readonly { readonly item: FeedPost; readonly blurred: boolean }[];
  readonly nextCursor: string | null;
}

export interface UserPreferences {
  readonly adultContentOptIn: boolean;
  readonly revealSensitiveByDefault: boolean;
}

function viewerFrom(preferences: UserPreferences): Viewer {
  return {
    tier: AgeGate.current,
    // Reşit olmayan kullanıcının tercihi kalkanı devre dışı bırakamaz;
    // VisibilityShield bunu zaten kilitler ama tercihi burada da
    // yansıtmıyoruz ki iki yerde iki farklı davranış olmasın.
    adultContentOptIn: preferences.adultContentOptIn,
    revealSensitiveByDefault: preferences.revealSensitiveByDefault,
  };
}

export const Feed = {
  async page(preferences: UserPreferences, cursor?: string): Promise<Result<FeedPage>> {
    const result = await pinnedRequest<{
      posts: (FeedPost & { rating: ContentRating })[];
      nextCursor: string | null;
    }>({
      path: `/v1/feed${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    });

    if (!result.ok) {
      log.warn('Akış alınamadı', result.error.code);
      return Err(
        appError('NETWORK_UNAVAILABLE', 'feed fetch failed', {
          i18nKey: 'feed.loadFailed',
          retryable: true,
        }),
      );
    }

    const visible = filterVisible(
      result.value.posts,
      viewerFrom(preferences),
      Moderation.blockedAuthorIds,
    );

    return Ok({ posts: visible, nextCursor: result.value.nextCursor });
  },

  /** Hikaye halkası — 24 saatlik canlı hikayeler. */
  async stories(preferences: UserPreferences): Promise<Result<readonly Story[]>> {
    const result = await pinnedRequest<{ stories: (Story & ContentItem)[] }>({
      path: '/v1/stories',
    });
    if (!result.ok) return Err(appError('NETWORK_UNAVAILABLE', 'stories fetch failed'));

    const now = Date.now();
    const visible = filterVisible(
      result.value.stories,
      viewerFrom(preferences),
      Moderation.blockedAuthorIds,
    ).map((entry) => entry.item);

    return Ok(liveStories(visible, now));
  },

  async like(postId: string): Promise<Result<void>> {
    const result = await pinnedRequest<{ ok: boolean }>({
      path: '/v1/feed/like',
      method: 'POST',
      body: { postId },
    });
    return result.ok ? Ok(undefined) : Err(appError('NETWORK_UNAVAILABLE', 'like failed'));
  },
};
