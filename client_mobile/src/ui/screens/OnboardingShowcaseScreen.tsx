/**
 * OnboardingShowcaseScreen — ilk açılıştaki PRO vitrini.
 *
 * Yaş kapısından SONRA, uygulama kabuğundan ÖNCE bir kez gösterilir.
 *
 * "Satın Almadan Devam Et" düğmesi vitrinin İÇİNDE ve görünür konumdadır:
 * gizlenmiş veya geciktirilmiş kapatma her iki mağazada da ret sebebidir ve
 * kullanıcı kaybını artırır.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { MMKV } from 'react-native-mmkv';

import { Button } from '@/ui/components/Button';
import { BillingService } from '@/billing/BillingService';
import { DEFAULT_SELECTED_PLAN, LEGAL_LINKS, type PlanId } from '@/billing/Products';
import { buildPaywall, type PaywallViewModel } from '@/billing/PricingPolicy';
import { assertPaywallCompliance } from '@/billing/StoreCompliance';
import { useTheme } from '@/ui/theme/ThemeProvider';
import { radius, spacing, typography } from '@/ui/theme/tokens';

const store = new MMKV({ id: 'evengirl.onboarding' });
const SHOWN_KEY = 'showcase.shown.v1';

export function hasSeenShowcase(): boolean {
  return store.getBoolean(SHOWN_KEY) === true;
}

export function markShowcaseSeen(): void {
  store.set(SHOWN_KEY, true);
}

export interface OnboardingShowcaseProps {
  readonly onContinue: () => void;
}

export function OnboardingShowcaseScreen({
  onContinue,
}: OnboardingShowcaseProps): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();

  const [model, setModel] = useState<PaywallViewModel | null>(null);
  const [selected, setSelected] = useState<PlanId>(DEFAULT_SELECTED_PLAN);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const build = useCallback(async (plan: PlanId) => {
    const products = await BillingService.loadProducts();
    if (!products.ok) return null;

    const trialEligible = await BillingService.isTrialEligible();
    const next = buildPaywall({
      products: products.value,
      selectedPlanId: plan,
      trialEligible,
      termsUrl: LEGAL_LINKS.terms,
      privacyUrl: LEGAL_LINKS.privacy,
    });
    assertPaywallCompliance(next);
    return next;
  }, []);

  useEffect(() => {
    void build(DEFAULT_SELECTED_PLAN)
      .then(setModel)
      .finally(() => setLoading(false));
  }, [build]);

  const skip = useCallback(() => {
    markShowcaseSeen();
    onContinue();
  }, [onContinue]);

  const purchase = useCallback(async () => {
    setBusy(true);
    try {
      const result = await BillingService.purchase(selected);
      if (result.ok) {
        markShowcaseSeen();
        onContinue();
      }
    } finally {
      setBusy(false);
    }
  }, [selected, onContinue]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  // Ürünler yüklenemediyse kullanıcıyı burada TUTMUYORUZ: vitrin bir engel
  // değil, bir teklif. Yükleme hatası uygulamayı kilitlememeli.
  if (!model) {
    skip();
    return <View style={{ backgroundColor: theme.colors.background, flex: 1 }} />;
  }

  const selectedPlan = model.plans.find((plan) => plan.planId === model.selectedPlanId);

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[typography.display, { color: theme.colors.textPrimary }]}>
        {t('onboarding.title')}
      </Text>
      <Text style={[typography.body, { color: theme.colors.textSecondary }]}>
        {t('onboarding.subtitle')}
      </Text>

      <View style={styles.benefits}>
        {(t('onboarding.benefits', { returnObjects: true }) as string[]).map((benefit) => (
          <Text key={benefit} style={[typography.body, { color: theme.colors.textPrimary }]}>
            {`·  ${benefit}`}
          </Text>
        ))}
      </View>

      <View style={styles.plans}>
        {model.plans.map((plan) => {
          const isSelected = plan.planId === model.selectedPlanId;
          return (
            <Pressable
              key={plan.planId}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              onPress={() => {
                setSelected(plan.planId);
                void build(plan.planId).then((next) => next && setModel(next));
              }}
              style={[
                styles.plan,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: isSelected ? theme.colors.accent : theme.colors.border,
                  borderWidth: isSelected ? 2 : StyleSheet.hairlineWidth,
                },
              ]}
            >
              <View>
                <Text style={[typography.heading, { color: theme.colors.textPrimary }]}>
                  {t(plan.periodKey)}
                </Text>
                <Text style={[typography.title, { color: theme.colors.textPrimary }]}>
                  {plan.priceLabel}
                </Text>
                {plan.perWeekLabel ? (
                  <Text style={[typography.caption, { color: theme.colors.textSecondary }]}>
                    {t('paywall.perWeek', { price: plan.perWeekLabel })}
                  </Text>
                ) : null}
              </View>

              <View style={styles.badges}>
                {plan.highlighted ? (
                  <Text style={[typography.label, { color: theme.colors.accent }]}>
                    {t('paywall.bestValue')}
                  </Text>
                ) : null}
                {plan.savingsPercent !== null ? (
                  <Text style={[typography.label, { color: theme.colors.success }]}>
                    {t('paywall.savings', { percent: plan.savingsPercent })}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <Button
        label={t(model.ctaKey, { count: selectedPlan?.trialDays ?? 0 })}
        busy={busy}
        busyLabel={t('common.loading')}
        onPress={() => void purchase()}
      />

      <Text style={[typography.caption, styles.disclosure, { color: theme.colors.textSecondary }]}>
        {t(model.disclosureKey, {
          trialDays: selectedPlan?.trialDays ?? 0,
          price: selectedPlan?.priceLabel ?? '',
        })}
      </Text>

      {/* Satın almadan devam — vitrinin içinde, görünür ve erişilebilir. */}
      <Pressable accessibilityRole="button" onPress={skip} style={styles.continueButton}>
        <Text style={[typography.body, { color: theme.colors.textPrimary }]}>
          {t('onboarding.continueFree')}
        </Text>
      </Pressable>

      <View style={styles.footer}>
        <Pressable accessibilityRole="button" onPress={() => void BillingService.restore()}>
          <Text style={[typography.caption, { color: theme.colors.textSecondary }]}>
            {t('paywall.restore')}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, paddingTop: spacing.xxl, gap: spacing.sm },
  benefits: { gap: spacing.xs, marginTop: spacing.md },
  plans: { gap: spacing.sm, marginTop: spacing.lg },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  badges: { alignItems: 'flex-end', gap: 2 },
  cta: {
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  ctaLabel: { color: '#FFFFFF', fontWeight: '600' },
  disclosure: { marginTop: spacing.sm, lineHeight: 18 },
  continueButton: { height: 48, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md },
  footer: { alignItems: 'center', marginTop: spacing.md },
});
