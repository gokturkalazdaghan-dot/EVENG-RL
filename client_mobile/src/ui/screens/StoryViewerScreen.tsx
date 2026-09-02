/**
 * StoryViewerScreen — tam ekran hikaye görüntüleyici.
 *
 * EN ZOR YÜZEY: hikaye tam ekran, otomatik ilerliyor ve arayüz elemanları
 * medyanın üstünde. Rapor düğmesinin "tasarımı bozduğu" gerekçesiyle
 * gizlendiği yer tam olarak burasıdır. Bu ekranda düğme:
 *   - medyanın üstünde, yarı saydam zeminle okunur (tone="overlay"),
 *   - otomatik ilerleme onu ASLA gizlemez,
 *   - dokunulduğunda hikaye DURUR (rapor yazarken hikayenin kayıp gitmesi,
 *     kullanıcının vazgeçmesi demektir).
 *
 * 24 SAAT KURALI İSTEMCİDE DE UYGULANIR: sunucu zaten süresi dolmuş
 * hikayeyi göndermez; burada ikinci kez kontrol edilir çünkü ekran
 * önbellekten de beslenebilir.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { isLive, remainingMs, type Story } from '@/social/StoryPolicy';
import { Viewer } from '@/social/Viewer';
import { ReportAffordance } from '@/ui/components/ReportAffordance';
import { useTheme } from '@/ui/theme/ThemeProvider';
import { radius, spacing, typography } from '@/ui/theme/tokens';

/** Bir hikayenin ekranda kalma süresi. */
const SEGMENT_MS = 5000;

export interface StoryItem extends Story {
  readonly mediaUri: string;
  readonly authorHandle: string;
}

export interface StoryViewerScreenProps {
  readonly stories: readonly StoryItem[];
  readonly onClose: () => void;
}

export function StoryViewerScreen({
  stories,
  onClose,
}: StoryViewerScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();

  // Süresi dolmuş hikaye görüntüleyiciye HİÇ girmez.
  const live = stories.filter((story) => isLive(story, Date.now()));

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const advance = useCallback(() => {
    setIndex((current) => {
      if (current + 1 >= live.length) {
        onClose();
        return current;
      }
      return current + 1;
    });
  }, [live.length, onClose]);

  useEffect(() => {
    if (paused || live.length === 0) return undefined;
    timer.current = setTimeout(advance, SEGMENT_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [advance, index, paused, live.length]);

  if (live.length === 0) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: theme.colors.background }]}>
        <Text style={[typography.body, { color: theme.colors.textSecondary }]}>
          {t('story.expired')}
        </Text>
      </View>
    );
  }

  const story = live[index] ?? live[0];
  if (!story) {
    return <View style={[styles.root, { backgroundColor: theme.colors.background }]} />;
  }

  const remainingHours = Math.floor(remainingMs(story, Date.now()) / (60 * 60 * 1000));

  return (
    <View style={styles.root}>
      <Image source={{ uri: story.mediaUri }} style={StyleSheet.absoluteFill} />

      {/* İlerleme çubukları */}
      <View style={styles.progressRow}>
        {live.map((item, i) => (
          <View
            key={item.storyId}
            style={[styles.progressTrack, { opacity: i <= index ? 1 : 0.3 }]}
          />
        ))}
      </View>

      <View style={styles.topBar}>
        <Text style={[typography.heading, styles.overlayText]} numberOfLines={1}>
          {story.authorHandle}
        </Text>
        <Text style={[typography.caption, styles.overlayText]}>
          {t('story.remainingHours', { count: remainingHours })}
        </Text>
      </View>

      {/* Dokunma bölgeleri: sol geri, sağ ileri. Rapor düğmesinin ÜSTÜNDE
          değil — düğmeye basmak istediğinde hikaye ilerlemez. */}
      <View style={styles.tapZones} pointerEvents="box-none">
        <Pressable
          style={styles.tapZone}
          accessibilityLabel={t('story.previous')}
          onPress={() => setIndex((current) => Math.max(0, current - 1))}
        />
        <Pressable style={styles.tapZone} accessibilityLabel={t('story.next')} onPress={advance} />
      </View>

      <View style={styles.bottomBar}>
        {/*
          RAPOR DÜĞMESİ: tam ekran medyanın üstünde, kalıcı.
          `onPressIn` ile hikaye DURDURULUR — kullanıcı rapor akışındayken
          hikayenin arkada ilerlemesi, geri döndüğünde başka bir içeriğe
          bakıyor olması demektir.
        */}
        <Pressable onPressIn={() => setPaused(true)} accessible={false}>
          <ReportAffordance
            surface="story"
            contentId={story.storyId}
            authorId={story.authorId}
            viewerId={Viewer.anonymousId}
            tone="overlay"
          />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          hitSlop={12}
          onPress={onClose}
          style={styles.closeButton}
        >
          <Text style={[typography.label, styles.overlayText]}>{t('common.close')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  center: { alignItems: 'center', justifyContent: 'center' },
  progressRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl,
  },
  progressTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: '#FFFFFF' },
  topBar: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.xs },
  overlayText: { color: '#FFFFFF' },
  tapZones: { ...StyleSheet.absoluteFillObject, flexDirection: 'row' },
  tapZone: { flex: 1 },
  bottomBar: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
});
