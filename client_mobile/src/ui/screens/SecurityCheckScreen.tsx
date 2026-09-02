/**
 * SecurityCheckScreen — bütünlük kontrolü sürerken gösterilen ara ekran.
 *
 * Kontroller tipik olarak 30-60 ms sürer; bu ekran çoğu cihazda bir kare bile
 * görünmez. Yavaş cihazlarda beyaz ekran yerine marka rengiyle dolu bir yüzey
 * göstermek, "uygulama donmuş" algısını engeller.
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, useColorScheme, View } from 'react-native';

import { palette } from '@/ui/theme/tokens';

export function SecurityCheckScreen(): React.JSX.Element {
  const scheme = useColorScheme() === 'light' ? 'light' : 'dark';
  const colors = palette[scheme];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
