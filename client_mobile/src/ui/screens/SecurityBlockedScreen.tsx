/**
 * SecurityBlockedScreen — bütünlük ihlali tespit edildiğinde gösterilen ekran.
 *
 * TASARIM KARARLARI
 * - Uygulama ÇÖKMEZ, kilitlenir. Kullanıcı ne olduğunu anlar.
 * - "Rootlu cihaz tespit edildi" gibi SPESİFİK bir bulgu gösterilmez:
 *   hangi kontrolün tetiklendiğini söylemek, saldırgana bypass rehberi vermektir.
 * - "Yeniden dene" düğmesi vardır: yanlış pozitif durumunda (ör. geçici bir
 *   analiz aracı kapatıldıysa) kullanıcı kurtulabilir.
 * - Destek bağlantısı e-posta İSTEMEZ; yalnızca web formuna yönlendirir
 *   (sıfır kişisel veri toplama ilkesi).
 *
 * NOT: Metinler Modül 3'teki i18n katmanına taşınacak; şu an güvenlik akışının
 * i18n'e bağımlı olmaması bilinçlidir — çeviri yüklemesi başarısız olsa bile
 * kilit ekranı görünmelidir.
 */
import React from 'react';
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';

import { Button } from '@/ui/components/Button';
import { palette, radius, spacing, typography } from '@/ui/theme/tokens';

const COPY = {
  tr: {
    title: 'Güvenli ortam doğrulanamadı',
    body:
      'EVEN GIRL, düzenlediğiniz medyanın ve abonelik bilgilerinizin güvenliği için ' +
      'cihaz bütünlüğünü kontrol eder. Bu cihazda kontrol tamamlanamadığı için ' +
      'uygulama başlatılmadı.',
    hint: 'Hata ayıklama araçları veya cihaz değişiklikleri kapatıldıktan sonra tekrar deneyebilirsiniz.',
    retry: 'Yeniden dene',
    support: 'Destek al',
  },
  en: {
    title: 'Secure environment could not be verified',
    body:
      'EVEN GIRL checks device integrity to protect the media you edit and your ' +
      'subscription. The check could not be completed on this device, so the app ' +
      'was not started.',
    hint: 'You can try again after closing debugging tools or reverting device modifications.',
    retry: 'Try again',
    support: 'Get support',
  },
} as const;

const SUPPORT_URL = 'https://evengirl.app/support/integrity';

interface Props {
  onRetry: () => void;
  locale?: 'tr' | 'en';
}

export function SecurityBlockedScreen({ onRetry, locale = 'tr' }: Props): React.JSX.Element {
  const scheme = useColorScheme() === 'light' ? 'light' : 'dark';
  const colors = palette[scheme];
  const copy = COPY[locale];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.badge, { backgroundColor: colors.danger }]} />

        <Text style={[typography.title, styles.title, { color: colors.textPrimary }]}>
          {copy.title}
        </Text>

        <Text style={[typography.body, styles.body, { color: colors.textSecondary }]}>
          {copy.body}
        </Text>

        <Text style={[typography.caption, styles.hint, { color: colors.textSecondary }]}>
          {copy.hint}
        </Text>

        <Button label={copy.retry} onPress={onRetry} />

        <Pressable
          accessibilityRole="link"
          onPress={() => void Linking.openURL(SUPPORT_URL)}
          style={styles.secondaryButton}
        >
          <Text style={[typography.caption, { color: colors.textSecondary }]}>{copy.support}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.xl,
  },
  badge: {
    width: 40,
    height: 4,
    borderRadius: radius.sm,
    marginBottom: spacing.lg,
  },
  title: { marginBottom: spacing.md },
  body: { marginBottom: spacing.md },
  hint: { marginBottom: spacing.xl },
  primaryButton: {
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: { color: '#FFFFFF', fontWeight: '600' },
  secondaryButton: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
});
