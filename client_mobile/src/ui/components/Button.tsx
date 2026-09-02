/**
 * Button — uygulamanın TEK buton bileşeni.
 *
 * NEDEN TEK
 * Butonlar her ekranda ayrı ayrı `Pressable` + satır içi stil ile
 * yazılmıştı. Sonucu: aynı işlevin ekranlar arasında farklı yükseklikte,
 * farklı köşe yarıçapında ve farklı basılı davranışında görünmesi. Bir
 * arayüzün "elden çıkmış" hissi tam olarak buradan gelir.
 *
 * HACİM NEREDEN GELİYOR
 * React Native'de gradyan yok (ek bağımlılık ister). Derinlik üç GERÇEK
 * katmandan geliyor:
 *
 *   1. Gölge (`elevation.key`) — tuşu zeminden ayırır.
 *   2. Alt kenar (`borderBottomWidth` + koyu ton) — tuş kapağının tabanı.
 *   3. Üst kenardaki ince ışık (`edgeLight`) — yüzeyin ışığı yakaladığı yer.
 *
 * Basılınca taban 3px'ten 1px'e iner, yüzey 2px aşağı kayar ve gölge
 * neredeyse kaybolur. Toplam yükseklik SABİT kalır — bu olmadan basılan
 * tuş çevresindeki her şeyi 2px oynatır ve arayüz "zıplar".
 *
 * ERİŞİLEBİLİRLİK
 * Dokunma hedefi hiçbir zaman 44pt'nin altına inmez (küçük boyutta hedef
 * `hitSlop` ile büyütülür). Devre dışı buton `accessibilityState` ile
 * bildirilir; yalnızca soluklaştırmak ekran okuyucuya hiçbir şey söylemez.
 */
import React, { useCallback, useMemo } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/ui/theme/ThemeProvider';
import { depth, elevation, radius, spacing, typography } from '@/ui/theme/tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger' | 'reward';
export type ButtonSize = 'large' | 'medium' | 'small';

export interface ButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly disabled?: boolean;
  /** İşlem sürerken: etiket değişir, tuş kilitlenir. */
  readonly busy?: boolean;
  readonly busyLabel?: string;
  /** Satırın tamamını kaplasın mı. */
  readonly block?: boolean;
  readonly accessibilityHint?: string;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

const HEIGHTS: Record<ButtonSize, number> = { large: 52, medium: 46, small: 36 };
const PADDING: Record<ButtonSize, number> = { large: spacing.lg, medium: spacing.md, small: spacing.sm };

/** 44pt altındaki hedefler dokunma alanını hitSlop ile büyütür. */
function slopFor(size: ButtonSize): number {
  return Math.max(0, Math.ceil((44 - HEIGHTS[size]) / 2));
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'large',
  disabled = false,
  busy = false,
  busyLabel,
  block = true,
  accessibilityHint,
  style,
  testID,
}: ButtonProps): React.JSX.Element {
  const theme = useTheme();
  const pressed = useSharedValue(0);

  // Hareket profili düşükken süre kısalır; "batarya modunda animasyonu kıs"
  // kararı tek yerden geliyor (bkz. tokens.motion).
  const duration = theme.motion.timing.duration / 3;

  const skin = useMemo(() => {
    const c = theme.colors;
    switch (variant) {
      case 'primary':
        return { face: c.accent, base: c.accentDeep, ink: '#FFFFFF', outline: 'transparent' };
      case 'reward':
        return { face: c.highlight, base: c.accentDeep, ink: '#FFFFFF', outline: 'transparent' };
      case 'danger':
        return { face: c.danger, base: c.accentDeep, ink: '#FFFFFF', outline: 'transparent' };
      case 'secondary':
        return { face: c.surfaceElevated, base: c.border, ink: c.textPrimary, outline: c.border };
      case 'quiet':
        return { face: 'transparent', base: 'transparent', ink: c.textSecondary, outline: 'transparent' };
    }
  }, [theme.colors, variant]);

  const locked = disabled || busy;

  const surfaceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pressed.value * depth.travel }],
    borderBottomWidth: depth.rest - pressed.value * (depth.rest - depth.pressed),
  }));

  const handleIn = useCallback(() => {
    pressed.value = withTiming(1, { duration });
  }, [duration, pressed]);

  const handleOut = useCallback(() => {
    pressed.value = withTiming(0, { duration });
  }, [duration, pressed]);

  const handlePress = useCallback(() => {
    // Kilitliyken gelen dokunuş YOK SAYILIR. `disabled` prop'una güvenmek
    // yeterli değil: `busy` durumunda buton hâlâ dokunulabilir olmalı ki
    // ekran okuyucu "meşgul" diyebilsin, ama eylem tekrarlanmamalı.
    if (locked) return;
    onPress();
  }, [locked, onPress]);

  const shadow = variant === 'quiet' ? undefined : elevation.key;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={busy && busyLabel ? busyLabel : label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: locked, busy }}
      hitSlop={slopFor(size)}
      onPress={handlePress}
      onPressIn={locked ? undefined : handleIn}
      onPressOut={locked ? undefined : handleOut}
      testID={testID}
      style={[block ? styles.block : styles.inline, style]}
    >
      <Animated.View
        style={[
          styles.surface,
          shadow,
          {
            height: HEIGHTS[size],
            paddingHorizontal: PADDING[size],
            backgroundColor: skin.face,
            borderBottomColor: skin.base,
            borderColor: skin.outline,
            borderWidth: variant === 'secondary' ? StyleSheet.hairlineWidth : 0,
            // Kilitli tuş basılmaz: gölgesi ve tabanı olmayan düz bir yüzey
            // "burası çalışmıyor" der; yalnızca soluklaştırmak demez.
            opacity: locked ? 0.45 : 1,
          },
          surfaceStyle,
        ]}
      >
        {/* Üst kenardaki ışık: yüzeyin ışığı yakaladığı yer. */}
        {variant !== 'quiet' ? (
          <View
            pointerEvents="none"
            style={[styles.edge, { backgroundColor: theme.colors.edgeLight }]}
          />
        ) : null}

        <Text
          numberOfLines={1}
          style={[
            size === 'small' ? typography.label : typography.heading,
            { color: skin.ink },
          ]}
        >
          {busy && busyLabel ? busyLabel : label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  block: { alignSelf: 'stretch' },
  inline: { alignSelf: 'flex-start' },
  surface: {
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    overflow: 'hidden',
    // Toplam yükseklik sabit kalsın diye taban kalınlığı kadar boşluk:
    // basılınca yüzey aşağı iner ama kapladığı alan değişmez.
    marginBottom: depth.rest,
  },
  edge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth * 2,
  },
});
