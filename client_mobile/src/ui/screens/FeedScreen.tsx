/**
 * FeedScreen — hikaye halkası + kalıcı akış.
 *
 * KALKAN BURADA DA UYGULANIR: Feed servisi zaten filtrelenmiş liste döndürür
 * (sunucu + istemci iki katman), ekran yalnızca sonucu gösterir. Ekranın
 * kendi filtresi YOKTUR — üçüncü bir filtre, üçüncü bir gerileme noktasıdır.
 *
 * BULANIK İÇERİK: Hassas içerik bulanık gelir ve dokununca açılır. "Aç"
 * kararı kullanıcınındır; otomatik açmak, kullanıcının açık tercihini
 * (revealSensitiveByDefault) görmezden gelmek olur.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { Feed, type FeedPost, type UserPreferences } from '@/social/Feed';
import { lifetimeProgress, type Story } from '@/social/StoryPolicy';
import { Viewer } from '@/social/Viewer';
import { useStack } from '@/navigation/Stack';
import { ReportAffordance } from '@/ui/components/ReportAffordance';
import { useTheme } from '@/ui/theme/ThemeProvider';
import { radius, spacing, typography } from '@/ui/theme/tokens';

const DEFAULT_PREFERENCES: UserPreferences = {
  adultContentOptIn: false,
  revealSensitiveByDefault: false,
};

interface FeedEntry {
  readonly item: FeedPost;
  readonly blurred: boolean;
}

export function FeedScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();
  const { push } = useStack();

  const [entries, setEntries] = useState<readonly FeedEntry[]>([]);
  const [stories, setStories] = useState<readonly Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set());

  const load = useCallback(async () => {
    setFailed(false);
    const [page, storyResult] = await Promise.all([
      Feed.page(DEFAULT_PREFERENCES),
      Feed.stories(DEFAULT_PREFERENCES),
    ]);

    if (!page.ok) {
      setFailed(true);
      return;
    }
    setEntries(page.value.posts);
    if (storyResult.ok) setStories(storyResult.value);
  }, []);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const reveal = useCallback((postId: string) => {
    setRevealed((current) => new Set(current).add(postId));
  }, []);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <FlatList
        data={entries as FeedEntry[]}
        keyExtractor={(entry) => entry.item.postId}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
        ListHeaderComponent={
          <StoryRing
            stories={stories}
            onOpen={(authorId) => push({ screen: 'story', authorId })}
            onOpenMarket={() => push({ screen: 'market' })}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[typography.body, { color: theme.colors.textSecondary }]}>
              {failed ? t('feed.loadFailed') : t('feed.empty')}
            </Text>
            {failed ? (
              <Pressable accessibilityRole="button" onPress={() => void load()}>
                <Text style={[typography.body, { color: theme.colors.accent }]}>
                  {t('common.retry')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        }
        renderItem={({ item: entry }) => {
          const hidden = entry.blurred && !revealed.has(entry.item.postId);
          return (
            <View style={[styles.post, { borderColor: theme.colors.border }]}>
              <View style={styles.postHeader}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={entry.item.authorHandle}
                  hitSlop={8}
                  onPress={() => push({ screen: 'profile', userId: entry.item.authorId })}
                >
                  <Text style={[typography.heading, { color: theme.colors.textPrimary }]}>
                    {entry.item.authorHandle}
                  </Text>
                </Pressable>
                {/*
                  Rapor düğmesi bir "⋯" menüsünün ARKASINDA DEĞİL, doğrudan
                  gönderi başlığında. Menüye gömmek, Guideline 1.2
                  incelemesinde "mekanizma bulunamadı" sonucunu doğurur.
                */}
                <ReportAffordance
                  surface="feed-post"
                  contentId={entry.item.postId}
                  authorId={entry.item.authorId}
                  viewerId={Viewer.anonymousId}
                />
              </View>

              <Pressable
                disabled={!hidden}
                onPress={() => reveal(entry.item.postId)}
                style={styles.mediaWrapper}
              >
                <Image
                  source={{ uri: entry.item.mediaUri }}
                  style={styles.media}
                  blurRadius={hidden ? 40 : 0}
                />
                {hidden ? (
                  <View style={styles.blurOverlay}>
                    <Text style={[typography.caption, styles.blurLabel]}>
                      {t('moderation.sensitiveLabel')}
                    </Text>
                    <Text style={[typography.caption, styles.blurLabel]}>
                      {t('moderation.tapToReveal')}
                    </Text>
                  </View>
                ) : null}
              </Pressable>

              {entry.item.caption ? (
                <Text style={[typography.body, { color: theme.colors.textSecondary }]}>
                  {entry.item.caption}
                </Text>
              ) : null}
            </View>
          );
        }}
      />
    </View>
  );
}

/**
 * Hikaye halkası — çember doluluğu kalan 24 saatlik ömrü gösterir.
 *
 * Halka BOŞ OLSA BİLE pazar girişi görünür: pazar yerine ulaşmanın başka
 * yolu yoktur ve hikaye yokken erişilemez olması, özelliğin var olmadığı
 * anlamına gelirdi.
 */
function StoryRing({
  stories,
  onOpen,
  onOpenMarket,
}: {
  readonly stories: readonly Story[];
  readonly onOpen: (authorId: string) => void;
  readonly onOpenMarket: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();
  const now = Date.now();

  return (
    <View style={styles.storyRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('market.title')}
        onPress={onOpenMarket}
        style={styles.storyItem}
      >
        <View
          style={[
            styles.storyCircle,
            { borderColor: theme.colors.border, borderStyle: 'dashed' },
          ]}
        />
        <Text style={[typography.label, { color: theme.colors.textSecondary }]} numberOfLines={1}>
          {t('market.title')}
        </Text>
      </Pressable>

      {stories.map((story) => (
        <Pressable
          key={story.storyId}
          accessibilityRole="button"
          accessibilityLabel={t('story.next')}
          onPress={() => onOpen(story.authorId)}
          style={styles.storyItem}
        >
          <View
            style={[
              styles.storyCircle,
              {
                borderColor: theme.colors.accent,
                // Ömrü tükenen hikayenin halkası soluklaşır.
                opacity: 0.4 + lifetimeProgress(story, now) * 0.6,
              },
            ]}
          />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: spacing.sm, padding: spacing.xxl },
  storyRow: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  storyItem: { alignItems: 'center' },
  storyCircle: { width: 64, height: 64, borderRadius: 32, borderWidth: 2 },
  post: {
    padding: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  postHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mediaWrapper: { borderRadius: radius.md, overflow: 'hidden' },
  media: { width: '100%', aspectRatio: 1, backgroundColor: '#00000022' },
  blurOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  blurLabel: { color: '#FFFFFF', fontWeight: '600' },
});
