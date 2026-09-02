/**
 * SafeModeNoticeScreen — Safe Mode'a düşen kullanıcıya ne değiştiğini anlatır.
 *
 * NEDEN SESSİZCE KISITLAMIYORUZ: Kullanıcı bir özelliği bulamadığında bunu
 * arıza sanar ve destek yazar. Neyin neden kapalı olduğunu bir kez açıkça
 * söylemek, hem dürüst hem de destek yükünü düşüren davranıştır.
 *
 * Metin, kısıtlamayı bir CEZA gibi sunmaz: düzenleme araçlarının tamamının
 * açık kaldığı da aynı ekranda yazar.
 */
import React from 'react';
import {StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/ui/components/Button';
import { useTheme } from '@/ui/theme/ThemeProvider';
import { radius, spacing, typography } from '@/ui/theme/tokens';

export function SafeModeNoticeScreen({
  onAcknowledge,
}: {
  onAcknowledge: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <View
        style={[
          styles.card,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        <View style={[styles.badge, { backgroundColor: theme.colors.success }]} />

        <Text style={[typography.title, { color: theme.colors.textPrimary }]}>
          {t('age.safeMode.title')}
        </Text>
        <Text style={[typography.body, { color: theme.colors.textSecondary }]}>
          {t('age.safeMode.body')}
        </Text>

        <Button label={t('age.safeMode.gotIt')} onPress={onAcknowledge} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.xl,
    gap: spacing.md,
  },
  badge: { width: 40, height: 4, borderRadius: radius.sm },
  button: {
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  buttonLabel: { color: '#FFFFFF', fontWeight: '600' },
});
