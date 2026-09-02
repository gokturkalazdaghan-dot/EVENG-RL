/**
 * SettingsScreen — geri bildirim, gizlilik tercihleri, yasal bağlantılar.
 *
 * NEDEN BU EKRAN VAR
 *   1. GERİ BİLDİRİM. Kullanıcının görüşünü, isteğini veya şikayetini
 *      iletebileceği çalışan bir yol; aynı zamanda her iki mağazanın da
 *      aradığı "destek iletişimi" gereksinimini karşılar.
 *   2. Gizlilik tercihleri — çökme raporlamasını kapatma, AI onaylarını
 *      geri çekme. Onay verilebiliyorsa geri de alınabilmelidir.
 *   3. Yasal bağlantılar — paywall dışında da erişilebilir olmalı.
 */
import React, { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';


import { EthicsConsent } from '@/ai/engine/EthicsConsent';
import { Entitlements } from '@/billing/Entitlements';
import { LEGAL_LINKS } from '@/billing/Products';
import { setCrashReportingEnabled } from '@/telemetry/AnonymousCrashReporter';
import { FeedbackButton } from '@/ui/components/FeedbackButton';
import { APP_VERSION } from '@/core/config/appInfo';
import { useTheme } from '@/ui/theme/ThemeProvider';
import { radius, spacing, typography } from '@/ui/theme/tokens';

export function SettingsScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();

  const [crashReporting, setCrashReporting] = useState(true);
  const [consentNotice, setConsentNotice] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  const toggleCrashReporting = useCallback((enabled: boolean) => {
    setCrashReporting(enabled);
    setCrashReportingEnabled(enabled);
  }, []);

  const revokeConsents = useCallback(() => {
    EthicsConsent.revokeAll();
    setConsentNotice(t('settings.privacy.revokeConsentDone'));
  }, [t]);

  /**
   * Bağlantıyı açar; AÇILAMAZSA KULLANICIYA SÖYLER.
   *
   * Hatayı yutmak, kullanıcının "destek" ya da "gizlilik politikası"
   * satırına dokunup hiçbir şey olmadığını görmesi demekti. Destek yolu,
   * mağaza incelemesinin de aradığı şeydir: sessizce çalışmayan bir
   * iletişim bağlantısı, olmayan bir iletişim yoludur.
   */
  const openLink = useCallback(
    (url: string) => {
      setLinkError(null);
      void Linking.openURL(url).catch(() => setLinkError(t('settings.linkFailed')));
    },
    [t],
  );

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[typography.title, { color: theme.colors.textPrimary }]}>
        {t('settings.title')}
      </Text>

      {linkError !== null ? (
        <Text
          accessibilityRole="alert"
          style={[typography.caption, { color: theme.colors.danger }]}
        >
          {linkError}
        </Text>
      ) : null}

      {/* --- Geri bildirim --- */}
      <Section title={t('settings.feedback.title')}>
        <Text style={[typography.caption, { color: theme.colors.textSecondary }]}>
          {t('settings.feedback.subtitle')}
        </Text>
        <FeedbackButton plan={Entitlements.isPro ? 'pro' : 'free'} />
      </Section>

      {/* --- Gizlilik --- */}
      <Section title={t('settings.privacy.title')}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={[typography.body, { color: theme.colors.textPrimary }]}>
              {t('settings.privacy.crashReporting')}
            </Text>
            <Text style={[typography.caption, { color: theme.colors.textSecondary }]}>
              {t('settings.privacy.crashReportingHint')}
            </Text>
          </View>
          <Switch
            value={crashReporting}
            onValueChange={toggleCrashReporting}
            accessibilityLabel={t('settings.privacy.crashReporting')}
          />
        </View>

        <Pressable accessibilityRole="button" onPress={revokeConsents} style={styles.linkRow}>
          <Text style={[typography.body, { color: theme.colors.textPrimary }]}>
            {t('settings.privacy.revokeConsent')}
          </Text>
        </Pressable>

        {consentNotice ? (
          <Text style={[typography.caption, { color: theme.colors.success }]}>
            {consentNotice}
          </Text>
        ) : null}
      </Section>

      {/* --- Yasal --- */}
      <Section title={t('settings.legal.title')}>
        <Pressable
          accessibilityRole="link"
          onPress={() => openLink(LEGAL_LINKS.terms)}
          style={styles.linkRow}
        >
          <Text style={[typography.body, { color: theme.colors.textPrimary }]}>
            {t('settings.legal.terms')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="link"
          onPress={() => openLink(LEGAL_LINKS.privacy)}
          style={styles.linkRow}
        >
          <Text style={[typography.body, { color: theme.colors.textPrimary }]}>
            {t('settings.legal.privacy')}
          </Text>
        </Pressable>
      </Section>

      {/* --- Künye --- */}
      <View style={styles.footer}>
        <Text style={[typography.caption, { color: theme.colors.textDisabled }]}>
          {t('settings.version', { version: APP_VERSION })}
        </Text>
        <Text style={[typography.label, { color: theme.colors.textSecondary }]}>
          {t('settings.poweredBy')}
        </Text>
      </View>
    </ScrollView>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.section,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      <Text style={[typography.label, { color: theme.colors.textSecondary }]}>
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  section: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowText: { flex: 1, gap: 2 },
  linkRow: { paddingVertical: spacing.sm },
  footer: { alignItems: 'center', gap: spacing.xs, paddingTop: spacing.lg },
});
