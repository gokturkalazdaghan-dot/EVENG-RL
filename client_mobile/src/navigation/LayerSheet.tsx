/**
 * LayerSheet — düzenleme katmanları arasında DİKEY kaydırma.
 *
 * Editörde tuval (canvas) sabit kalır; araç paneli ve zaman çizelgesi alttan
 * yukarı kaydırılarak açılır. Bu, tuvalin görünürlüğünü kaybetmeden araca
 * erişmeyi sağlar — düzenleme uygulamalarında kritik olan "yaptığını görerek
 * ayarlama" döngüsü budur.
 *
 * TUTARLILIK KURALI: yatay = ekranlar arası, dikey = katmanlar arası.
 * Bu ayrım olmadan jestler çakışır ve kullanıcı hangi yönün ne yaptığını
 * öğrenemez.
 *
 * Yakalama noktaları (snap points) yüzdedir, piksel değil: küçük telefonda ve
 * tablette aynı oranı korur.
 */
import React, { useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/ui/theme/ThemeProvider';
import { gesture as gestureTokens, radius, spacing } from '@/ui/theme/tokens';

/** Ekran yüksekliğinin oranı olarak yakalama noktaları (kapalı → tam açık). */
export const SNAP_POINTS = [0.12, 0.45, 0.88] as const;

export interface LayerSheetProps {
  readonly snapIndex: number;
  readonly onSnapIndexChange: (index: number) => void;
  readonly children: React.ReactNode;
  /** Panel arkasındaki tuvalin karartılması gerekiyor mu. */
  readonly dimBackdrop?: boolean;
}

export function LayerSheet({
  snapIndex,
  onSnapIndexChange,
  children,
  dimBackdrop = true,
}: LayerSheetProps): React.JSX.Element {
  const { height } = useWindowDimensions();
  const theme = useTheme();

  const snapOffsets = useMemo(
    () => SNAP_POINTS.map((ratio) => height * (1 - ratio)),
    [height],
  );

  const translateY = useSharedValue(snapOffsets[snapIndex] ?? snapOffsets[0]!);
  const startY = useSharedValue(0);

  const reduced = theme.motionProfile === 'reduced';
  const springConfig = theme.motion.spring;
  const timingConfig = theme.motion.timing;

  const animateTo = useCallback(
    (offset: number, velocity = 0) => {
      'worklet';
      translateY.value = reduced
        ? withTiming(offset, timingConfig)
        : withSpring(offset, { ...springConfig, velocity });
    },
    [reduced, springConfig, timingConfig, translateY],
  );

  useEffect(() => {
    const offset = snapOffsets[snapIndex];
    if (offset === undefined) return;
    translateY.value = reduced
      ? withTiming(offset, timingConfig)
      : withSpring(offset, springConfig);
  }, [snapIndex, snapOffsets, reduced, springConfig, timingConfig, translateY]);

  const commit = useCallback(
    (next: number) => {
      if (next !== snapIndex) onSnapIndexChange(next);
    },
    [snapIndex, onSnapIndexChange],
  );

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-gestureTokens.activationDistance, gestureTokens.activationDistance])
        // Yatay hareket bu jesti başarısız kılar → üstteki GestureShell devralır.
        .failOffsetX([-gestureTokens.activationDistance * 2, gestureTokens.activationDistance * 2])
        .onStart(() => {
          startY.value = translateY.value;
        })
        .onUpdate((event) => {
          const top = snapOffsets[snapOffsets.length - 1]!;
          const bottom = snapOffsets[0]!;
          const raw = startY.value + event.translationY;

          // Rubber banding: sınırların ötesinde hareketin 1/3'ü uygulanır.
          if (raw < top) {
            translateY.value = top + (raw - top) / 3;
          } else if (raw > bottom) {
            translateY.value = bottom + (raw - bottom) / 3;
          } else {
            translateY.value = raw;
          }
        })
        .onEnd((event) => {
          // Hız izdüşümü: parmağın bıraktığı hızla 150 ms sonra nerede olacağını
          // tahmin edip EN YAKIN yakalama noktasını seçiyoruz. Yalnızca anlık
          // konuma bakmak, hızlı fırlatmaları yok sayar.
          const projected = translateY.value + event.velocityY * 0.15;

          let nearest = 0;
          let bestDistance = Number.POSITIVE_INFINITY;
          for (let i = 0; i < snapOffsets.length; i++) {
            const distance = Math.abs(snapOffsets[i]! - projected);
            if (distance < bestDistance) {
              bestDistance = distance;
              nearest = i;
            }
          }

          animateTo(snapOffsets[nearest]!, event.velocityY);
          if (nearest !== snapIndex) runOnJS(commit)(nearest);
        }),
    [snapIndex, snapOffsets, startY, translateY, animateTo, commit],
  );

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => {
    if (!dimBackdrop) return { opacity: 0 };
    const top = snapOffsets[snapOffsets.length - 1]!;
    const bottom = snapOffsets[0]!;
    // Panel yükseldikçe tuval kararır; tam kapalıyken karartma yok.
    return {
      opacity: interpolate(translateY.value, [bottom, top], [0, 0.55], 'clamp'),
    };
  });

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.scrim }, backdropStyle]}
      />

      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            styles.sheet,
            {
              height,
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
            sheetStyle,
          ]}
        >
          {/* Tutamaç: paneli sürüklenebilir olarak işaretleyen görsel ipucu.
              Bu olmadan kullanıcıların çoğu panelin kaydırılabildiğini keşfetmez. */}
          <View style={styles.handleArea}>
            <View style={[styles.handle, { backgroundColor: theme.colors.textDisabled }]} />
          </View>

          <View style={styles.content}>{children}</View>
        </Animated.View>
      </GestureDetector>
    </>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  handleArea: {
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: { width: 36, height: 4, borderRadius: radius.pill, opacity: 0.6 },
  content: { flex: 1, paddingHorizontal: spacing.md },
});
