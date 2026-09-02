/**
 * PaywallScreen — abonelik ekranı.
 *
 * MAĞAZA İNCELEMESİ İÇİN ZORUNLU UNSURLAR (Guideline 3.1.2 / Play politikası)
 * Hepsi bu ekranda ve TEK BAKIŞTA görünür; kaydırma arkasına saklanmaz:
 *   1. Her planın adı, süresi ve YERELLEŞTİRİLMİŞ fiyatı
 *   2. Otomatik yenileme açıklaması — satın alma düğmesine BİTİŞİK
 *   3. Deneme varsa: süresi ve sonrasında ne tahsil edileceği
 *   4. "Satın alımları geri yükle" — her zaman görünür (hakemler mutlaka dener)
 *   5. Abonelik koşulları ve gizlilik politikası bağlantıları
 *   6. Harici ödeme yönlendirmesi YOK
 *
 * Bu liste `StoreCompliance.auditPaywall` tarafından çalışma zamanında
 * denetlenir; eksik unsur DEBUG build'de konsola hata basar ve testte
 * kırmızıya döner. "Uyumludur" bir iddia değil, doğrulanan bir durumdur.
 *
 * KASITLI OLARAK YAPILMAYANLAR:
 *   - Geri sayım sayacı / sahte aciliyet ("teklif 5 dk sonra bitiyor")
 *   - Kapatma düğmesini gizleme veya geciktirme
 *   - Üstü çizili sahte "eski fiyat"
 *   Üçü de her iki mağazada da ret sebebidir ve iade oranını yükseltir.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/ui/components/Button';
import { createLogger } from '@/core/logging/Logger';
import { BillingService } from '@/billing/BillingService';
import { LEGAL_LINKS, DEFAULT_SELECTED_PLAN, type PlanId } from '@/billing/Products';
import { buildPaywall, type PaywallViewModel, type StorePriceInfo } from '@/billing/PricingPolicy';
import { assertPaywallCompliance } from '@/billing/StoreCompliance';
import { useTheme } from '@/ui/theme/ThemeProvider';
import { radius, spacing, typography } from '@/ui/theme/tokens';

const log = createLogger('Paywall');

type Status =
  | { kind: 'loading' }
  | { kind: 'ready'; model: PaywallViewModel }
  | { kind: 'error'; messageKey: string };

export interface PaywallScreenProps {
  readonly onDismiss: () => void;
  readonly onPurchased: () => void;
  /** Hangi özellik için açıldı — başlık altında bağlam olarak gösterilir. */
  readonly reasonKey?: string;
}

export function PaywallScreen({
  onDismiss,
  onPurchased,
  reasonKey,
}: PaywallScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();

  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [selectedPlan, setSelectedPlan] = useState<PlanId>(DEFAULT_SELECTED_PLAN);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const rebuild = useCallback(
    (products: readonly StorePriceInfo[], trialEligible: boolean, plan: PlanId) => {
      const model = buildPaywall({
        products,
        selectedPlanId: plan,
        trialEligible,
        termsUrl: LEGAL_LINKS.terms,
        privacyUrl: LEGAL_LINKS.privacy,
      });

      // Uyumluluk denetimi: eksik unsur varsa DEBUG'ta gürültü çıkarır.
      assertPaywallCompliance(model);
      return model;
    },
    [],
  );

  const [products, setProducts] = useState<readonly StorePriceInfo[]>([]);
  const [trialEligible, setTrialEligible] = useState(false);

  const load = useCallback(async () => {
    setStatus({ kind: 'loading' });

    const result = await BillingService.loadProducts();
    if (!result.ok) {
      // Boş paywall göstermek yerine açık hata + yeniden dene: hakem boş
      // ekran görürse "satın alma çalışmıyor" diyerek reddeder.
      setStatus({ kind: 'error', messageKey: result.error.i18nKey });
      return;
    }

    const eligible = await BillingService.isTrialEligible();
    setProducts(result.value);
    setTrialEligible(eligible);
    setStatus({ kind: 'ready', model: rebuild(result.value, eligible, selectedPlan) });
  }, [rebuild, selectedPlan]);

  useEffect(() => {
    void load();
    // load, selectedPlan'a bağlı olsa da ilk yüklemede bir kez çalışmalı;
    // plan değişimi ayrı bir etkide (aşağıda) ele alınır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectPlan = useCallback(
    (plan: PlanId) => {
      setSelectedPlan(plan);
      if (products.length > 0) {
        setStatus({ kind: 'ready', model: rebuild(products, trialEligible, plan) });
      }
    },
    [products, trialEligible, rebuild],
  );

  const purchase = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await BillingService.purchase(selectedPlan);

      if (result.ok) {
        onPurchased();
        return;
      }

      // İptal bir hata değildir: kullanıcı bilinçli karar verdi, sessizce dön.
      if (result.error.code === 'BILLING_CANCELLED') return;

      setNotice(t(result.error.i18nKey));
    } finally {
      setBusy(false);
    }
  }, [selectedPlan, onPurchased, t]);

  const restore = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await BillingService.restore();

      if (!result.ok) {
        setNotice(t(result.error.i18nKey));
        return;
      }

      // "Hiçbir şey bulunamadı" da açık bir sonuçtur. Sessiz kalmak,
      // hakemin geri yüklemeyi "bozuk" saymasına yol açar.
      if (result.value.restoredSomething) {
        setNotice(t('paywall.restored'));
        onPurchased();
      } else {
        setNotice(t('paywall.nothingToRestore'));
      }
    } finally {
      setBusy(false);
    }
  }, [onPurchased, t]);

  const openLink = useCallback((url: string) => {
    Linking.openURL(url).catch((e) => log.warn('Bağlantı açılamadı', e));
  }, []);

  if (status.kind === 'loading') {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  if (status.kind === 'error') {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <Text style={[typography.body, styles.errorText, { color: theme.colors.textSecondary }]}>
          {t(status.messageKey)}
        </Text>
        <Button label={t('common.retry')} block={false} onPress={() => void load()} />
        <Pressable accessibilityRole="button" onPress={onDismiss} style={styles.textButton}>
          <Text style={[typography.caption, { color: theme.colors.textSecondary }]}>
            {t('common.close')}
          </Text>
        </Pressable>
      </View>
    );
  }

  const { model } = status;
  const selected = model.plans.find((p) => p.planId === model.selectedPlanId);

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      {/* Kapatma düğmesi ANINDA erişilebilir — gecikmeli veya gizli kapatma
          düğmesi her iki mağazada da ret sebebidir. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
        onPress={onDismiss}
        hitSlop={16}
        style={styles.closeButton}
      >
        <Text style={[typography.body, { color: theme.colors.textSecondary }]}>✕</Text>
      </Pressable>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[typography.display, { color: theme.colors.textPrimary }]}>
          {t('paywall.title')}
        </Text>
        <Text style={[typography.body, { color: theme.colors.textSecondary }]}>
          {reasonKey ? t(reasonKey) : t('paywall.subtitle')}
        </Text>

        <View style={styles.plans}>
          {model.plans.map((plan) => {
            const isSelected = plan.planId === model.selectedPlanId;
            return (
              <Pressable
                key={plan.planId}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                onPress={() => selectPlan(plan.planId)}
                style={[
                  styles.plan,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: isSelected ? theme.colors.accent : theme.colors.border,
                    borderWidth: isSelected ? 2 : StyleSheet.hairlineWidth,
                  },
                ]}
              >
                <View style={styles.planMain}>
                  <Text style={[typography.heading, { color: theme.colors.textPrimary }]}>
                    {t(plan.periodKey)}
                  </Text>

                  {/* Fiyat HER ZAMAN mağazadan gelen yerelleştirilmiş dizedir. */}
                  <Text style={[typography.title, { color: theme.colors.textPrimary }]}>
                    {plan.priceLabel}
                  </Text>

                  {plan.perWeekLabel ? (
                    <Text style={[typography.caption, { color: theme.colors.textSecondary }]}>
                      {t('paywall.perWeek', { price: plan.perWeekLabel })}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.planBadges}>
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
                  {plan.hasFreeTrial ? (
                    <Text style={[typography.label, { color: theme.colors.textSecondary }]}>
                      {t('paywall.freeTrialBadge', { count: plan.trialDays })}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        <Button
          label={t(model.ctaKey, { count: selected?.trialDays ?? 0 })}
          busy={busy}
          busyLabel={t('common.loading')}
          onPress={() => void purchase()}
        />

        {/* Otomatik yenileme açıklaması — düğmeye BİTİŞİK olmak zorunda. */}
        <Text style={[typography.caption, styles.disclosure, { color: theme.colors.textSecondary }]}>
          {t(model.disclosureKey, {
            trialDays: selected?.trialDays ?? 0,
            price: selected?.priceLabel ?? '',
          })}
        </Text>

        {notice ? (
          <Text style={[typography.caption, styles.notice, { color: theme.colors.textPrimary }]}>
            {notice}
          </Text>
        ) : null}

        <View style={styles.footer}>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void restore()}>
            <Text style={[typography.caption, { color: theme.colors.textPrimary }]}>
              {t('paywall.restore')}
            </Text>
          </Pressable>

          <Pressable accessibilityRole="link" onPress={() => openLink(model.termsUrl)}>
            <Text style={[typography.caption, { color: theme.colors.textSecondary }]}>
              {t('paywall.terms')}
            </Text>
          </Pressable>

          <Pressable accessibilityRole="link" onPress={() => openLink(model.privacyUrl)}>
            <Text style={[typography.caption, { color: theme.colors.textSecondary }]}>
              {t('paywall.privacy')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  errorText: { textAlign: 'center' },
  closeButton: { position: 'absolute', top: spacing.md, right: spacing.md, zIndex: 1, padding: spacing.sm },
  content: { padding: spacing.lg, paddingTop: spacing.xxl, gap: spacing.sm },
  plans: { gap: spacing.sm, marginTop: spacing.lg },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  planMain: { gap: 2 },
  planBadges: { alignItems: 'flex-end', gap: 2 },
  primaryButton: {
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  primaryLabel: { color: '#FFFFFF', fontWeight: '600' },
  disclosure: { marginTop: spacing.sm, lineHeight: 18 },
  notice: { marginTop: spacing.sm, textAlign: 'center' },
  textButton: { padding: spacing.sm },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
});
