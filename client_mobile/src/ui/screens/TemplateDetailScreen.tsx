/**
 * TemplateDetailScreen — pazar yerindeki bir kullanıcı şablonu.
 *
 * ŞABLON DA UGC'DİR. Kapak görseli, başlık ve adım isimleri kullanıcı
 * tarafından yazılır; hepsi ihlal taşıyabilir. Pazar yerini "içerik değil,
 * araç" sayıp rapor mekanizmasını dışarıda bırakmak, Guideline 1.2
 * kapsamında bir boşluktur.
 *
 * TELİF RAPORU BURADA ANLAMLIDIR: `copyright` gerekçesi en çok bu yüzeyde
 * kullanılır — başkasının hazır ayarını kendi adıyla yayınlayan şablonlar.
 */
import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Viewer } from '@/social/Viewer';
import { type Template } from '@/social/TemplateMarket';
import { ReportAffordance } from '@/ui/components/ReportAffordance';
import { useTheme } from '@/ui/theme/ThemeProvider';
import { radius, spacing, typography } from '@/ui/theme/tokens';

export interface TemplateDetailScreenProps {
  readonly template: Template;
  readonly isPro: boolean;
  readonly onApply: (template: Template) => void;
}

export function TemplateDetailScreen({
  template,
  isPro,
  onApply,
}: TemplateDetailScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();

  const locked = template.proOnly && !isPro;

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
    >
      <Image source={{ uri: template.previewUri }} style={styles.preview} />

      <View style={styles.titleRow}>
        <View style={styles.titleText}>
          <Text style={[typography.title, { color: theme.colors.textPrimary }]} numberOfLines={2}>
            {template.title}
          </Text>
          <Text style={[typography.caption, { color: theme.colors.textSecondary }]}>
            {template.authorHandle} · {t('market.useCount', { count: template.useCount })}
          </Text>
        </View>

        {/* Şablon da UGC'dir: rapor düğmesi burada da zorunludur. */}
        <ReportAffordance
          surface="template"
          contentId={template.templateId}
          authorId={template.authorId}
          viewerId={Viewer.anonymousId}
        />
      </View>

      <View style={styles.steps}>
        {template.steps.map((step, index) => (
          <View
            key={`${step.capability}-${index}`}
            style={[styles.step, { borderColor: theme.colors.border }]}
          >
            <Text style={[typography.label, { color: theme.colors.textSecondary }]}>
              {index + 1}
            </Text>
            <Text style={[typography.body, { color: theme.colors.textPrimary }]}>
              {t(`tools.${step.capability}`)}
            </Text>
          </View>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={locked ? t('paywall.cta.subscribe') : t('market.use')}
        onPress={() => onApply(template)}
        style={[styles.apply, { backgroundColor: theme.colors.accent }]}
      >
        <Text style={[typography.heading, styles.applyLabel]}>
          {locked ? t('paywall.cta.subscribe') : t('market.use')}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg },
  preview: { width: '100%', aspectRatio: 3 / 4, borderRadius: radius.lg },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  titleText: { flex: 1, gap: spacing.xs },
  steps: { gap: spacing.sm },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  apply: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  applyLabel: { color: '#FFFFFF' },
});
