/**
 * GarlandBadge — profil ve liderlik tablosundaki animasyonlu çelenk rozeti.
 *
 * GÖRSEL: Spec'te tarif edildiği gibi — parlak lila (`Neon Lilac`) ve loş
 * uzay mavisi (`Space Blue`) çelenkler, zirvedeki için altın taç.
 *
 * STİL: Renk profil cinsiyetinden türetilir — dişi profil parlak lila,
 * erkek profil loş uzay mavisi (bkz. social/LeaderboardPolicy.garlandStyleFor).
 *
 * ANİMASYON MALİYETİ: Parıltı, sonsuz döngüde çalışır ve liderlik tablosunda
 * aynı anda 100 tane görünebilir. Bu yüzden:
 *   - Animasyon UI thread'inde (Reanimated), JS köprüsü kullanmaz.
 *   - Güç profili 'saver'/'critical' iken animasyon DURUR ve statik hâle
 *     düşer — 100 sonsuz animasyon, ısınan bir cihazda gerçek bir maliyettir.
 */
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import type { BadgeTier, GarlandStyle } from '@/social/LeaderboardPolicy';
import { useTheme } from '@/ui/theme/ThemeProvider';
import { radius } from '@/ui/theme/tokens';

/** Çelenk renk paleti — stil adları spec'teki isimlerle birebir. */
const GARLAND_PALETTE: Readonly<Record<Exclude<GarlandStyle, 'none'>, { glow: string; core: string }>> = {
  'neon-lilac': { glow: '#C77DFF', core: '#E0AAFF' },
  'space-blue': { glow: '#2B4C7E', core: '#4A6FA5' },
};

const CROWN_COLOR = '#FFD700';

export interface GarlandBadgeProps {
  readonly badge: BadgeTier;
  readonly style: GarlandStyle;
  /** Avatar çapı; çelenk buna göre ölçeklenir. */
  readonly size?: number;
  readonly children?: React.ReactNode;
}

export function GarlandBadge({
  badge,
  style,
  size = 56,
  children,
}: GarlandBadgeProps): React.JSX.Element {
  const theme = useTheme();
  const pulse = useSharedValue(0);

  // Hareket profili 'reduced' iken (batarya tasarrufu veya kullanıcının
  // erişilebilirlik tercihi) animasyon hiç başlatılmaz.
  const animated = theme.motionProfile === 'standard' && badge !== 'none';

  useEffect(() => {
    if (!animated) {
      cancelAnimation(pulse);
      pulse.value = 0;
      return;
    }

    pulse.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
  }, [animated, pulse]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.35, 0.9]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 1.06]) }],
  }));

  if (badge === 'none') {
    return <View style={[styles.root, { width: size, height: size }]}>{children}</View>;
  }

  const palette = style !== 'none' ? GARLAND_PALETTE[style] : GARLAND_PALETTE['space-blue'];
  const ringColor = badge === 'crown' ? CROWN_COLOR : palette.core;
  const glowColor = badge === 'crown' ? CROWN_COLOR : palette.glow;

  return (
    <View style={[styles.root, { width: size, height: size }]}>
      {/* Parıltı halkası — animasyonlu katman */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glow,
          {
            width: size + 12,
            height: size + 12,
            borderRadius: (size + 12) / 2,
            backgroundColor: glowColor,
          },
          glowStyle,
        ]}
      />

      {/* Çelenk halkası — statik katman */}
      <View
        style={[
          styles.ring,
          {
            width: size + 6,
            height: size + 6,
            borderRadius: (size + 6) / 2,
            borderColor: ringColor,
          },
        ]}
      />

      {children}

      {badge === 'crown' ? (
        <View style={[styles.crown, { backgroundColor: theme.colors.surface }]}>
          <Text style={styles.crownGlyph} accessibilityLabel="1">
            ♔
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute' },
  ring: { position: 'absolute', borderWidth: 2 },
  crown: {
    position: 'absolute',
    top: -10,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
  },
  crownGlyph: { color: CROWN_COLOR, fontSize: 16 },
});
