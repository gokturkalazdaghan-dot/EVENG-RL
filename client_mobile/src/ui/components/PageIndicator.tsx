/**
 * PageIndicator — kaydırmalı kabuğun sekme göstergesi.
 *
 * İki işlevi var:
 *   1. Konum geri bildirimi — kaydırma sırasında nokta genişliği animasyonla
 *      ilerlemeyi izler (JS'e uğramadan, doğrudan shared value'dan okur).
 *   2. ALTERNATİF GİRİŞ — dokunarak da geçiş yapılabilir. Kaydırma tek yol
 *      olsaydı, motor becerisi kısıtlı kullanıcılar ve kaydırmayı keşfedemeyen
 *      kullanıcılar için uygulama kullanılamaz olurdu.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import { useTheme } from '@/ui/theme/ThemeProvider';
import { radius, spacing } from '@/ui/theme/tokens';

interface Props {
  readonly count: number;
  readonly progress: SharedValue<number>;
  readonly onSelect: (index: number) => void;
  readonly labels?: readonly string[];
}

export function PageIndicator({ count, progress, onSelect, labels }: Props): React.JSX.Element {
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {Array.from({ length: count }, (_, index) => (
        <Dot
          key={index}
          index={index}
          progress={progress}
          onPress={() => onSelect(index)}
          label={labels?.[index]}
        />
      ))}
    </View>
  );
}

function Dot({
  index,
  progress,
  onPress,
  label,
}: {
  index: number;
  progress: SharedValue<number>;
  onPress: () => void;
  label?: string;
}): React.JSX.Element {
  const theme = useTheme();

  const animatedStyle = useAnimatedStyle(() => {
    // Komşu sayfalara olan uzaklık: aktif nokta genişler, uzaktakiler solar.
    const distance = Math.abs(progress.value - index);
    return {
      width: interpolate(distance, [0, 1], [22, 6], 'clamp'),
      opacity: interpolate(distance, [0, 1], [1, 0.35], 'clamp'),
    };
  });

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      onPress={onPress}
      // Dokunma hedefi görsel noktadan büyük: 6 px'lik bir noktaya isabet
      // ettirmek imkânsızdır (asgari 44x44 pt kuralı).
      hitSlop={{ top: 14, bottom: 14, left: 10, right: 10 }}
      style={styles.hit}
    >
      <Animated.View
        style={[styles.dot, { backgroundColor: theme.colors.textPrimary }, animatedStyle]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  hit: { paddingHorizontal: 2, justifyContent: 'center' },
  dot: { height: 6, borderRadius: radius.pill },
});
