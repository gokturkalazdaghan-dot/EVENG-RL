/**
 * GestureShell — yatay kaydırmalı üst düzey navigasyon kabuğu.
 *
 * PERFORMANS MİMARİSİ (60/120 FPS hedefi)
 * - Jest ve animasyon TAMAMEN UI thread'inde çalışır (Reanimated worklet'leri).
 *   Parmak hareketi ile pikselin hareketi arasında JS köprüsü YOKTUR; JS thread
 *   ağır bir iş yapıyor olsa bile (proje listesi hesaplama, model yükleme)
 *   kaydırma takılmaz. Bu, kategorideki en görünür kalite farkıdır.
 * - JS'e yalnızca geçiş TAMAMLANDIĞINDA tek bir `runOnJS` çağrısı gider.
 *   Her karede JS'e haber vermek, tam da kaçındığımız köprü trafiğini yaratır.
 * - Görünmeyen sayfalar `renderWindow` ile sınırlanır: 3 sayfalık bir kabukta
 *   fark yaratmaz ama sayfa sayısı arttığında bellek tavanını sabit tutar.
 *
 * ERİŞİLEBİLİRLİK: Kaydırma TEK giriş yolu değildir. Üstteki sekme
 * göstergesine dokunarak da geçilebilir (motor becerisi kısıtlı kullanıcılar
 * ve "kaydırmayı keşfedemeyen" kullanıcılar için).
 */
import React, { useCallback, useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { clampIndex } from '@/navigation/routes';
import { useTheme } from '@/ui/theme/ThemeProvider';
import { gesture as gestureTokens } from '@/ui/theme/tokens';

export interface GestureShellProps<T extends string> {
  readonly pages: readonly T[];
  readonly index: number;
  readonly onIndexChange: (index: number) => void;
  readonly renderPage: (page: T, isActive: boolean) => React.ReactNode;
  /** Aktif sayfanın kaç komşusu monte edilsin (varsayılan 1). */
  readonly renderWindow?: number;
  /** Kaydırma ilerlemesi — göstergeler bunu okur (0..pages.length-1). */
  readonly progress?: SharedValue<number>;
}

export function GestureShell<T extends string>({
  pages,
  index,
  onIndexChange,
  renderPage,
  renderWindow = 1,
  progress,
}: GestureShellProps<T>): React.JSX.Element {
  const { width } = useWindowDimensions();
  const theme = useTheme();

  const translateX = useSharedValue(-index * width);
  const startX = useSharedValue(0);
  const internalProgress = useSharedValue(index);
  const trackedProgress = progress ?? internalProgress;

  // Hareket profili batarya durumuna göre değişir (bkz. ThemeProvider).
  const useReducedMotion = theme.motionProfile === 'reduced';
  const springConfig = theme.motion.spring;
  const timingConfig = theme.motion.timing;

  const commitIndex = useCallback(
    (next: number) => {
      if (next !== index) onIndexChange(next);
    },
    [index, onIndexChange],
  );

  // `index` prop'u dışarıdan değişirse (sekmeye dokunma, derin bağlantı)
  // animasyonu senkronize et.
  React.useEffect(() => {
    const destination = -index * width;
    translateX.value = useReducedMotion
      ? withTiming(destination, timingConfig)
      : withSpring(destination, springConfig);
    trackedProgress.value = useReducedMotion
      ? withTiming(index, timingConfig)
      : withSpring(index, springConfig);
  }, [index, width, useReducedMotion, springConfig, timingConfig, translateX, trackedProgress]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        // Yatay hareket eşiği: dikey kaydırma (liste scroll'u, katman geçişi)
        // ile çakışmayı önler. Bu değer olmadan her dikey scroll denemesi
        // sayfayı hafifçe kaydırır ve arayüz "kaygan" hissettirir.
        .activeOffsetX([-gestureTokens.activationDistance, gestureTokens.activationDistance])
        .failOffsetY([-gestureTokens.activationDistance * 1.5, gestureTokens.activationDistance * 1.5])
        .onStart(() => {
          startX.value = translateX.value;
        })
        .onUpdate((event) => {
          const raw = startX.value + event.translationX;
          const min = -(pages.length - 1) * width;

          // Kenarlarda direnç (rubber banding): sınırın ötesine gidilebilir
          // ama hareketin yalnızca 1/3'ü uygulanır. Sert duvar, kullanıcıya
          // "uygulama dondu" hissi verir.
          if (raw > 0) {
            translateX.value = raw / 3;
          } else if (raw < min) {
            translateX.value = min + (raw - min) / 3;
          } else {
            translateX.value = raw;
          }

          trackedProgress.value = -translateX.value / width;
        })
        .onEnd((event) => {
          const distanceRatio = -event.translationX / width;
          const flung = Math.abs(event.velocityX) > gestureTokens.velocity;

          // Karar: yeterince uzağa gidildi mi, YA DA yeterince hızlı fırlatıldı mı.
          // Yalnızca mesafeye bakmak, hızlı ve kısa kaydırmaları yok sayar —
          // deneyimli kullanıcıların en sık yaptığı hareket budur.
          let delta = 0;
          if (distanceRatio > gestureTokens.distanceRatio || (flung && event.velocityX < 0)) {
            delta = 1;
          } else if (distanceRatio < -gestureTokens.distanceRatio || (flung && event.velocityX > 0)) {
            delta = -1;
          }

          const next = clampIndex(index + delta, pages.length);
          const destination = -next * width;

          if (useReducedMotion) {
            translateX.value = withTiming(destination, timingConfig);
            trackedProgress.value = withTiming(next, timingConfig);
          } else {
            // Jestin hızını yaya devret: animasyon parmağın bıraktığı yerden
            // aynı hızla devam eder, kopukluk hissi olmaz.
            translateX.value = withSpring(destination, { ...springConfig, velocity: event.velocityX });
            trackedProgress.value = withSpring(next, springConfig);
          }

          // JS'e giden TEK köprü çağrısı.
          if (next !== index) runOnJS(commitIndex)(next);
        }),
    [
      index,
      pages.length,
      width,
      commitIndex,
      startX,
      translateX,
      trackedProgress,
      useReducedMotion,
      springConfig,
      timingConfig,
    ],
  );

  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const visible = useMemo(() => {
    const from = Math.max(0, index - renderWindow);
    const to = Math.min(pages.length - 1, index + renderWindow);
    return new Set(pages.slice(from, to + 1));
  }, [index, pages, renderWindow]);

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[
          styles.track,
          { width: width * pages.length, backgroundColor: theme.colors.background },
          trackStyle,
        ]}
      >
        {pages.map((page, pageIndex) => (
          <View key={page} style={[styles.page, { width }]}>
            {visible.has(page) ? renderPage(page, pageIndex === index) : null}
          </View>
        ))}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  track: { flex: 1, flexDirection: 'row' },
  page: { flex: 1 },
});
