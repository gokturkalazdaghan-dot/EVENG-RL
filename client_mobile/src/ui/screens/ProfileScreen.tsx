/**
 * ProfileScreen — başka bir kullanıcının profili.
 *
 * RAPOR DÜĞMESİ BAŞLIKTA, MENÜDE DEĞİL. Profil, taciz edilen kullanıcının
 * ilk gittiği yerdir; aracı burada bulamazsa hiçbir yerde aramaz.
 * `ReportSurfaces.REQUIRED_REPORT_SURFACES` bu ekranı zorunlu tutar ve
 * `__tests__/ReportSurfaces.test.ts` düğmenin gerçekten burada olduğunu
 * kaynak kodundan doğrular.
 *
 * KİMLİK BİLGİSİ GÖSTERİLMEZ: profilde e-posta, telefon, gerçek isim veya
 * konum YOKTUR — uygulama bunları hiç toplamaz. Görünen tek şey kullanıcının
 * kendi seçtiği takma ad ve paylaştığı içeriktir.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { CreatorSubscriptions, type CreatorOffer } from '@/billing/CreatorSubscriptions';
import { createLogger } from '@/core/logging/Logger';
import { Moderation } from '@/moderation/Reporting';
import { Feed, type FeedPost } from '@/social/Feed';
import { garlandStyleFor, type BadgeTier, type ProfileGender } from '@/social/LeaderboardPolicy';
import { Viewer } from '@/social/Viewer';
import { GarlandBadge } from '@/ui/components/GarlandBadge';
import { ReportAffordance } from '@/ui/components/ReportAffordance';
import { useTheme } from '@/ui/theme/ThemeProvider';
import { radius, spacing, typography } from '@/ui/theme/tokens';

const log = createLogger('ProfileScreen');

export interface PublicProfile {
  readonly userId: string;
  readonly handle: string;
  readonly avatarUri: string | null;
  readonly bio: string;
  readonly gender: ProfileGender;
  readonly isPro: boolean;
  readonly badge: BadgeTier;
  readonly postCount: number;
}

export interface ProfileScreenProps {
  readonly profile: PublicProfile;
  readonly posts: readonly FeedPost[];
  readonly loading?: boolean;
}

export function ProfileScreen({
  profile,
  posts,
  loading = false,
}: ProfileScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();
  const [blocked, setBlocked] = useState(() => Moderation.isBlocked(profile.userId));
  /**
   * Creator VIP aboneliği.
   *
   * Kullanıcılar arası ödeme, mağaza kuralınca IAP kapsamındadır; harici
   * ödeme (Stripe, IBAN, "DM'den anlaşalım") Guideline 3.1.1 ihlali ve
   * doğrudan ret sebebidir. Bu yüzden teklif de satın alma da StoreKit /
   * Play Billing üzerinden yürür.
   *
   * FİYAT MAĞAZADAN gelir; sunucudan gelen bir fiyatı göstermek,
   * gösterilen ile tahsil edilenin ayrışması (Guideline 3.1.2) demektir.
   */
  const [offer, setOffer] = useState<CreatorOffer | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);

  useEffect(() => Moderation.subscribe((ids) => setBlocked(ids.has(profile.userId))), [
    profile.userId,
  ]);

  useEffect(() => {
    let live = true;

    void CreatorSubscriptions.offerFor(profile.userId).then((result) => {
      // Teklifi olmayan kullanıcı için düğme HİÇ görünmez; hata da
      // gösterilmez, çünkü bu bir arıza değil (herkes creator değil).
      if (live && result.ok) setOffer(result.value);
    });

    void CreatorSubscriptions.active().then((list) => {
      if (live) setSubscribed(list.some((s) => s.creatorId === profile.userId && s.active));
    });

    return () => {
      live = false;
    };
  }, [profile.userId]);

  const subscribe = useCallback(async () => {
    if (!offer || subscribing) return;

    setSubscribing(true);
    setSubscribeError(null);
    const result = await CreatorSubscriptions.subscribeToOffer(offer);
    setSubscribing(false);

    if (!result.ok) {
      // İPTAL HATA DEĞİLDİR: kullanıcı satın almadan vazgeçti, mesaj
      // göstermeye gerek yok.
      if (result.error.code !== 'BILLING_CANCELLED') {
        setSubscribeError(result.error.i18nKey ?? 'creator.productUnavailable');
      }
      return;
    }
    setSubscribed(result.value.active);
  }, [offer, subscribing]);

  const toggleBlock = useCallback(async () => {
    // ENGELLEME RAPORDAN AYRI: kullanıcı çoğu zaman moderasyon istemez,
    // sadece o kişiyi görmek istemez.
    const result = blocked
      ? await Moderation.unblock(profile.userId)
      : await Moderation.block(profile.userId);
    if (!result.ok) log.warn('Engel durumu değiştirilemedi');
  }, [blocked, profile.userId]);

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <GarlandBadge badge={profile.badge} style={garlandStyleFor(profile.gender)} size={72}>
          {profile.avatarUri ? (
            <Image source={{ uri: profile.avatarUri }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: theme.colors.surfaceElevated }]} />
          )}
        </GarlandBadge>

        <View style={styles.identity}>
          <Text style={[typography.title, { color: theme.colors.textPrimary }]} numberOfLines={1}>
            {profile.handle}
          </Text>
          <Text style={[typography.caption, { color: theme.colors.textSecondary }]}>
            {t('profile.postCount', { count: profile.postCount })}
          </Text>
        </View>
      </View>

      {profile.bio ? (
        <Text style={[typography.body, styles.bio, { color: theme.colors.textSecondary }]}>
          {profile.bio}
        </Text>
      ) : null}

      {/*
        CREATOR ABONELİĞİ engellenen hesap için gösterilmez: engellediğin
        birine para ödeme akışı açmak anlamsızdır.
      */}
      {offer && !blocked ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={subscribed ? t('creator.subscribed') : t('creator.subscribe')}
          disabled={subscribed || subscribing}
          onPress={() => void subscribe()}
          style={[
            styles.subscribeButton,
            {
              backgroundColor: subscribed ? theme.colors.surfaceElevated : theme.colors.accent,
              opacity: subscribing ? 0.5 : 1,
            },
          ]}
        >
          <Text
            style={[
              typography.label,
              { color: subscribed ? theme.colors.textSecondary : '#FFFFFF' },
            ]}
          >
            {subscribed ? t('creator.subscribed') : t('creator.subscribe')}
          </Text>
        </Pressable>
      ) : null}

      {subscribeError !== null ? (
        <Text
          accessibilityRole="alert"
          style={[typography.caption, { color: theme.colors.danger }]}
        >
          {t(subscribeError)}
        </Text>
      ) : null}

      <View style={styles.actions}>
        {/* Rapor düğmesi profilde HER ZAMAN görünür — kendi profilinde bile
            (devre dışı olarak). Bkz. ReportSurfaces atlatılamazlık #2. */}
        <ReportAffordance
          surface="profile"
          contentId={profile.userId}
          authorId={profile.userId}
          viewerId={Viewer.anonymousId}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={blocked ? t('moderation.action.unblock') : t('moderation.action.block')}
          hitSlop={12}
          onPress={() => void toggleBlock()}
          style={[styles.blockButton, { borderColor: theme.colors.border }]}
        >
          <Text style={[typography.label, { color: theme.colors.textSecondary }]}>
            {blocked ? t('moderation.action.unblock') : t('moderation.action.block')}
          </Text>
        </Pressable>
      </View>

      {blocked ? (
        // Engellenen hesabın içeriği TEK KARE bile gösterilmez.
        <View style={styles.center}>
          <Text style={[typography.body, { color: theme.colors.textSecondary }]}>
            {t('moderation.blockedNotice')}
          </Text>
        </View>
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : (
        <FlatList
          data={posts as FeedPost[]}
          numColumns={3}
          keyExtractor={(post) => post.postId}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={[typography.body, { color: theme.colors.textSecondary }]}>
                {t('profile.empty')}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Image source={{ uri: item.mediaUri }} style={styles.gridItem} />
          )}
        />
      )}
    </View>
  );
}

/** Profil verisini yükler — akış servisinin aynı kalkanından geçer. */
export async function loadProfilePosts(userId: string): Promise<readonly FeedPost[]> {
  const page = await Feed.page({ adultContentOptIn: false, revealSensitiveByDefault: false });
  if (!page.ok) return [];
  return page.value.posts.filter((entry) => entry.item.authorId === userId).map((e) => e.item);
}

const styles = StyleSheet.create({
  subscribeButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
  },
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md },
  avatar: { width: 72, height: 72, borderRadius: radius.pill },
  identity: { flex: 1, gap: spacing.xs },
  bio: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  blockButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  gridItem: { flex: 1 / 3, aspectRatio: 1, margin: 1 },
});
