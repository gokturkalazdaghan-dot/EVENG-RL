import { auditPaywall } from '@/billing/StoreCompliance';
import type { PaywallViewModel, PlanViewModel } from '@/billing/PricingPolicy';

const plan = (overrides: Partial<PlanViewModel> = {}): PlanViewModel => ({
  planId: 'annual',
  productId: 'com.evengirl.app.pro.annual',
  priceLabel: '$59.99',
  periodKey: 'paywall.period.year',
  perWeekLabel: '$1.15',
  savingsPercent: null,
  hasFreeTrial: true,
  trialDays: 1,
  highlighted: true,
  ...overrides,
});

const model = (overrides: Partial<PaywallViewModel> = {}): PaywallViewModel => ({
  plans: [plan({ planId: 'weekly', savingsPercent: null }), plan()],
  selectedPlanId: 'annual',
  ctaKey: 'paywall.cta.startTrial',
  disclosureKey: 'paywall.disclosure.trial',
  disclosureParams: {},
  restoreVisible: true,
  termsUrl: 'https://evengirl.app/legal/terms',
  privacyUrl: 'https://evengirl.app/legal/privacy',
  ...overrides,
});

const codesOf = (m: PaywallViewModel) => auditPaywall(m).map((v) => v.code);

describe('auditPaywall — uyumlu paywall', () => {
  it('eksiksiz paywallda ihlal bulmaz', () => {
    expect(auditPaywall(model())).toEqual([]);
  });
});

describe('auditPaywall — Guideline 3.1.2 zorunlu unsurları', () => {
  it('geri yükleme düğmesi eksikse yakalar', () => {
    // Hakemler geri yüklemeyi HER incelemede dener; eksikliği tek başına
    // ret sebebidir.
    expect(codesOf(model({ restoreVisible: false }))).toContain('MISSING_RESTORE');
  });

  it('fiyat dizesi boşsa yakalar', () => {
    expect(codesOf(model({ plans: [plan({ priceLabel: '' })] }))).toContain('MISSING_PRICE');
  });

  it('faturalama dönemi eksikse yakalar', () => {
    expect(codesOf(model({ plans: [plan({ periodKey: '' })] }))).toContain('MISSING_PERIOD');
  });

  it('otomatik yenileme açıklaması eksikse yakalar', () => {
    expect(codesOf(model({ disclosureKey: '' }))).toContain('MISSING_DISCLOSURE');
  });

  it('deneme sunulurken deneme açıklaması yoksa yakalar', () => {
    // "1 gün ücretsiz" yazıp sonrasında ne tahsil edileceğini söylememek
    // yanıltıcı beyandır.
    expect(
      codesOf(model({ disclosureKey: 'paywall.disclosure.standard' })),
    ).toContain('TRIAL_WITHOUT_RENEWAL_TERMS');
  });

  it('koşullar bağlantısı geçersizse yakalar', () => {
    expect(codesOf(model({ termsUrl: 'https://' }))).toContain('MISSING_TERMS_LINK');
    expect(codesOf(model({ termsUrl: 'http://evengirl.app/terms' }))).toContain('MISSING_TERMS_LINK');
  });

  it('gizlilik bağlantısı eksikse yakalar', () => {
    expect(codesOf(model({ privacyUrl: '' }))).toContain('MISSING_PRIVACY_LINK');
  });
});

describe('auditPaywall — Guideline 3.1.1 (harici ödeme)', () => {
  it('harici ödeme sağlayıcısına yönlendirmeyi yakalar', () => {
    expect(codesOf(model({ termsUrl: 'https://checkout.stripe.com/pay/abc' }))).toContain(
      'EXTERNAL_PAYMENT_LINK',
    );
  });
});

describe('auditPaywall — yanıltıcı iddialar', () => {
  it('karşılaştırma planı ekranda yokken tasarruf iddiasını yakalar', () => {
    // "%61 tasarruf" doğrulanamıyorsa iddiadır; karşılaştırılan plan da
    // görünmelidir.
    const onlyAnnual = model({ plans: [plan({ savingsPercent: 61 })] });
    expect(codesOf(onlyAnnual)).toContain('SAVINGS_WITHOUT_BASELINE');
  });
});

describe('auditPaywall — boş durum', () => {
  it('hiç ürün yoksa yakalar', () => {
    // Hakem boş paywall görürse "satın alma çalışmıyor" der.
    expect(codesOf(model({ plans: [] }))).toContain('NO_PLANS_AVAILABLE');
  });
});
