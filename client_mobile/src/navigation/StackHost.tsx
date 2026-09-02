/**
 * StackHost — yığındaki ekranı kabuğun üstünde render eder.
 *
 * YALNIZCA EN ÜSTTEKİ ekran çizilir. Yığındaki tüm ekranları üst üste
 * monte etmek, her birinin veri yüklemeye devam etmesi ve arka plandaki
 * bir hikaye görüntüleyicinin sessizce ilerlemesi demektir.
 *
 * VERİ ÜST DÜZEYDE ÇÖZÜLÜR
 * Yığın girdisi yalnızca KİMLİK taşır (profil kimliği, şablon kimliği).
 * Ekranın ihtiyaç duyduğu nesne burada yüklenir; kimliği taşımak, geri
 * gelindiğinde bayat bir nesne göstermeyi önler.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Feed } from '@/social/Feed';
import { TemplateMarket, type Template } from '@/social/TemplateMarket';
import { Entitlements } from '@/billing/Entitlements';
import { useStack, type StackEntry } from '@/navigation/Stack';
import { ChatScreen } from '@/ui/screens/ChatScreen';
import { MarketScreen } from '@/ui/screens/MarketScreen';
import { PaywallScreen } from '@/ui/screens/PaywallScreen';
import { ProfileScreen, loadProfilePosts, type PublicProfile } from '@/ui/screens/ProfileScreen';
import { StoryViewerScreen, type StoryItem } from '@/ui/screens/StoryViewerScreen';
import { TemplateDetailScreen } from '@/ui/screens/TemplateDetailScreen';
import { useTheme } from '@/ui/theme/ThemeProvider';
import { spacing, typography } from '@/ui/theme/tokens';

export function StackHost(): React.JSX.Element | null {
  const { stack, pop } = useStack();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const top = stack[stack.length - 1];
  if (!top) return null;

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: theme.colors.background, paddingTop: insets.top },
      ]}
    >
      <BackBar onBack={pop} />
      <View style={styles.fill}>
        <StackScreen entry={top} onClose={pop} />
      </View>
    </View>
  );
}

/** Hikaye görüntüleyici kendi kapatma düğmesini taşır; çubuk gizlenir. */
function BackBar({ onBack }: { onBack: () => void }): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
      onPress={onBack}
      hitSlop={12}
      style={styles.backBar}
    >
      <Text style={[typography.body, { color: theme.colors.accent }]}>{t('common.back')}</Text>
    </Pressable>
  );
}

function StackScreen({
  entry,
  onClose,
}: {
  readonly entry: StackEntry;
  readonly onClose: () => void;
}): React.JSX.Element {
  switch (entry.screen) {
    case 'market':
      return <MarketScreen />;
    case 'profile':
      return <ProfileHost userId={entry.userId} />;
    case 'story':
      return <StoryHost authorId={entry.authorId} onClose={onClose} />;
    case 'template':
      return <TemplateHost templateId={entry.templateId} onClose={onClose} />;
    case 'chat':
      return (
        <ChatScreen
          conversationId={entry.conversationId}
          peerId={entry.peerId}
          peerHandle={entry.peerHandle}
          messages={[]}
        />
      );
    case 'paywall':
      return (
        <PaywallScreen onDismiss={onClose} onPurchased={onClose} reasonKey={entry.reasonKey} />
      );
  }
}

// ------------------------------------------------------------ veri yükleme ----

function Loading(): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={theme.colors.accent} />
    </View>
  );
}

function ProfileHost({ userId }: { readonly userId: string }): React.JSX.Element {
  const [posts, setPosts] = useState<Awaited<ReturnType<typeof loadProfilePosts>> | null>(null);

  useEffect(() => {
    void loadProfilePosts(userId).then(setPosts);
  }, [userId]);

  const profile: PublicProfile = {
    userId,
    // Takma ad gönderilerden gelir; hiç gönderi yoksa kimliğin kendisi
    // gösterilir — uydurulmuş bir ad göstermek yanıltıcı olurdu.
    handle: posts?.[0]?.authorHandle ?? userId,
    avatarUri: null,
    bio: '',
    gender: 'unspecified',
    isPro: false,
    badge: 'none',
    postCount: posts?.length ?? 0,
  };

  if (posts === null) return <Loading />;
  return <ProfileScreen profile={profile} posts={posts} />;
}

function StoryHost({
  authorId,
  onClose,
}: {
  readonly authorId: string;
  readonly onClose: () => void;
}): React.JSX.Element {
  const [stories, setStories] = useState<readonly StoryItem[] | null>(null);

  useEffect(() => {
    void Feed.stories({ adultContentOptIn: false, revealSensitiveByDefault: false }).then(
      (result) => {
        if (!result.ok) {
          setStories([]);
          return;
        }
        setStories(
          (result.value as readonly StoryItem[]).filter((story) => story.authorId === authorId),
        );
      },
    );
  }, [authorId]);

  if (stories === null) return <Loading />;
  return <StoryViewerScreen stories={stories} onClose={onClose} />;
}

function TemplateHost({
  templateId,
  onClose,
}: {
  readonly templateId: string;
  readonly onClose: () => void;
}): React.JSX.Element {
  const [template, setTemplate] = useState<Template | null | undefined>(undefined);

  useEffect(() => {
    void TemplateMarket.browse({ adultContentOptIn: false }).then((result) => {
      if (!result.ok) {
        setTemplate(null);
        return;
      }
      setTemplate(result.value.templates.find((t) => t.templateId === templateId) ?? null);
    });
  }, [templateId]);

  const { t } = useTranslation();
  const theme = useTheme();

  if (template === undefined) return <Loading />;
  if (template === null) {
    return (
      <View style={styles.center}>
        <Text style={[typography.body, { color: theme.colors.textSecondary }]}>
          {t('market.loadFailed')}
        </Text>
      </View>
    );
  }

  return (
    <TemplateDetailScreen
      template={template}
      isPro={Entitlements.isPro}
      onApply={() => onClose()}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backBar: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, alignSelf: 'flex-start' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
});
