/**
 * FeedbackButton — geri bildirim / istek / şikayet gönderme.
 *
 * ÇALIŞAN BUTON OLMASI İÇİN GEREKENLER
 *
 * 1. `Linking.openURL('mailto:...')` her cihazda çalışmaz. E-posta uygulaması
 *    kurulu değilse (özellikle temiz kurulmuş Android cihazlarda ve iOS'ta
 *    Mail uygulaması silinmişse) çağrı sessizce reddedilir ve kullanıcı
 *    hiçbir şey olmadığını görür — "bozuk düğme" algısı böyle doğar.
 *    Bu yüzden önce `canOpenURL` ile deneniyor, olmazsa adres EKRANDA
 *    gösteriliyor: kullanıcı en kötü ihtimalle adresi kopyalayabiliyor.
 *
 * 2. Kategori seçimi (geri bildirim / istek / şikayet) konu satırına yazılır;
 *    gelen kutusunda filtrelemeyi mümkün kılar.
 *
 * 3. `selectable` metin, ek bir pano kütüphanesi olmadan kopyalamaya izin
 *    verir — yeni bir bağımlılık eklemeden çalışan bir yedek yol.
 */
import React, { useCallback, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/ui/components/Button';
import { createLogger } from '@/core/logging/Logger';
import { detectDeviceLanguage } from '@/i18n';
import { deviceClass, osMajor, platformName } from '@/support/DeviceProfile';
import {
  FEEDBACK_CATEGORIES,
  SUPPORT_EMAIL,
  buildMailtoUrl,
  type FeedbackCategory,
} from '@/support/FeedbackComposer';
import { APP_VERSION } from '@/core/config/appInfo';
import { useTheme } from '@/ui/theme/ThemeProvider';
import { radius, spacing, typography } from '@/ui/theme/tokens';


const log = createLogger('Feedback');

export interface FeedbackButtonProps {
  readonly plan: 'pro' | 'free';
}

export function FeedbackButton({ plan }: FeedbackButtonProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const theme = useTheme();

  const [category, setCategory] = useState<FeedbackCategory>('feedback');
  const [mailAppMissing, setMailAppMissing] = useState(false);

  const send = useCallback(async () => {
    const url = buildMailtoUrl({
      category,
      diagnostics: {
        appVersion: APP_VERSION,
        platform: platformName(),
        osMajor: osMajor(),
        // Cihaz SINIFI; tam model değil (bkz. FeedbackComposer.ts).
        deviceClass: await deviceClass(),
        language: i18n.language || detectDeviceLanguage(),
        plan,
      },
      bodyPlaceholder: t('settings.feedback.bodyPlaceholder'),
      diagnosticsHeading: t('settings.feedback.diagnosticsHeading'),
    });

    try {
      // canOpenURL, iOS'ta LSApplicationQueriesSchemes gerektirmez (mailto
      // sistem şemasıdır) ama Android'de e-posta uygulaması yoksa false döner.
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        setMailAppMissing(true);
        return;
      }
      await Linking.openURL(url);
      setMailAppMissing(false);
    } catch (e) {
      // openURL, canOpenURL true dese bile hata verebilir (ör. varsayılan
      // uygulama seçilmemişse). Sessiz kalmıyoruz: yedek yolu gösteriyoruz.
      log.warn('Posta uygulaması açılamadı', e);
      setMailAppMissing(true);
    }
  }, [category, i18n.language, plan, t]);

  return (
    <View style={styles.root}>
      <View style={styles.categories}>
        {FEEDBACK_CATEGORIES.map((item) => {
          const selected = item === category;
          return (
            <Pressable
              key={item}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => setCategory(item)}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? theme.colors.accent : theme.colors.surfaceElevated,
                  borderColor: selected ? theme.colors.accent : theme.colors.border,
                },
              ]}
            >
              <Text
                style={[
                  typography.caption,
                  { color: selected ? '#FFFFFF' : theme.colors.textPrimary },
                ]}
              >
                {t(`settings.feedback.category.${item}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Button label={t('settings.feedback.title')} onPress={() => void send()} />

      {/* Yedek yol: posta uygulaması yoksa adres ekranda ve kopyalanabilir. */}
      {mailAppMissing ? (
        <View style={[styles.fallback, { borderColor: theme.colors.border }]}>
          <Text style={[typography.caption, { color: theme.colors.textSecondary }]}>
            {t('settings.feedback.noMailApp')}
          </Text>
          <Text selectable style={[typography.body, { color: theme.colors.textPrimary }]}>
            {SUPPORT_EMAIL}
          </Text>
          <Text style={[typography.caption, { color: theme.colors.textDisabled }]}>
            {t('settings.feedback.copyHint')}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sendButton: {
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendLabel: { color: '#FFFFFF', fontWeight: '600' },
  fallback: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: spacing.xs,
  },
});
