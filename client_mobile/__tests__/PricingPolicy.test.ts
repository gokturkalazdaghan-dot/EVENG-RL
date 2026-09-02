import {
  buildPaywall,
  savingsPercentVsWeekly,
  trialDaysOf,
  type StorePriceInfo,
} from '@/billing/PricingPolicy';
import type { PlanId } from '@/billing/Products';

/** Mağazadan gelen tipik bir abonelik ürünü. */
const product = (
  planId: PlanId,
  overrides: Partial<StorePriceInfo> = {},
): StorePriceInfo => ({
  planId,
  productId: `com.evengirl.app.pro.${planId}`,
  priceString: '$2.99',
  price: 2.99,
  currencyCode: 'USD',
  pricePerWeekString: '$2.99',
  pricePerWeek: 2.99,
  pricePerMonthString: '$12.95',
  introOffer: { periodUnit: 'DAY', periodNumberOfUnits: 1, cycles: 1, price: 0 },
  ...overrides,
});

const weekly = product('weekly');
const annual = product('annual', {
  priceString: '$39.99',
  price: 39.99,
  pricePerWeekString: '$0.77',
  pricePerWeek: 0.769,
  pricePerMonthString: '$3.33',
});

describe('trialDaysOf', () => {
  it('1 günlük ücretsiz denemeyi tanır', () => {
    expect(trialDaysOf(weekly)).toBe(1);
  });

  it('ücretli tanıtım fiyatını deneme saymaz', () => {
    // 0.99'a ilk ay = indirim, ücretsiz deneme değil. "Ücretsiz" demek
    // yanıltıcı beyandır.
    const discounted = product('monthly', {
      introOffer: { periodUnit: 'MONTH', periodNumberOfUnits: 1, cycles: 1, price: 0.99 },
    });
    expect(trialDaysOf(discounted)).toBe(0);
  });

  it('tanıtım teklifi yoksa 0 döner', () => {
    expect(trialDaysOf(product('annual', { introOffer: null }))).toBe(0);
  });

  it('hafta cinsinden denemeyi güne çevirir', () => {
    const w = product('monthly', {
      introOffer: { periodUnit: 'WEEK', periodNumberOfUnits: 1, cycles: 1, price: 0 },
    });
    expect(trialDaysOf(w)).toBe(7);
  });
});

describe('savingsPercentVsWeekly', () => {
  it('yıllık planın haftalığa göre tasarrufunu hesaplar', () => {
    // 0.769 / 2.99 -> %74.2 tasarruf, aşağı yuvarlanır.
    expect(savingsPercentVsWeekly(annual, weekly)).toBe(74);
  });

  it('tasarrufu AŞAĞI yuvarlar', () => {
    // %74.2 için "%75 tasarruf" yazmak abartılı iddiadır.
    const result = savingsPercentVsWeekly(annual, weekly);
    expect(result).not.toBeNull();
    expect(result!).toBeLessThanOrEqual(74);
  });

  it('haftalık planın kendisi için tasarruf göstermez', () => {
    expect(savingsPercentVsWeekly(weekly, weekly)).toBeNull();
  });

  it('farklı para birimlerini karşılaştırmaz', () => {
    // Kullanıcının bölgesi değişmişken iki ürün farklı para biriminde
    // gelebilir; bölmek anlamsız bir yüzde üretir.
    const euroAnnual = product('annual', { currencyCode: 'EUR', pricePerWeek: 1.1 });
    expect(savingsPercentVsWeekly(euroAnnual, weekly)).toBeNull();
  });

  it('tasarruf yoksa (pahalıysa) null döner', () => {
    const expensive = product('annual', { pricePerWeek: 3.5 });
    expect(savingsPercentVsWeekly(expensive, weekly)).toBeNull();
  });

  it('karşılaştırma planı yoksa null döner', () => {
    expect(savingsPercentVsWeekly(annual, undefined)).toBeNull();
  });
});

describe('buildPaywall', () => {
  const base = {
    products: [weekly, annual],
    selectedPlanId: 'annual' as PlanId,
    termsUrl: 'https://evengirl.app/legal/terms',
    privacyUrl: 'https://evengirl.app/legal/privacy',
  };

  it('fiyatı HER ZAMAN mağazanın yerelleştirilmiş dizesinden alır', () => {
    // Kendi biçimlendirmemizi yapmak, TL/JPY/EUR kullanıcılarına yanlış
    // para birimi göstermek demektir.
    const model = buildPaywall({ ...base, trialEligible: true });
    const annualPlan = model.plans.find((p) => p.planId === 'annual');
    expect(annualPlan?.priceLabel).toBe('$39.99');
  });

  it('deneme hakkı olan kullanıcıya deneme CTA metnini verir', () => {
    const model = buildPaywall({ ...base, trialEligible: true });
    expect(model.ctaKey).toBe('paywall.cta.startTrial');
    expect(model.disclosureKey).toBe('paywall.disclosure.trial');
  });

  it('deneme hakkı olmayan kullanıcıya deneme vaat etmez', () => {
    // Daha önce deneme kullanmış birine "1 gün ücretsiz" göstermek, satın
    // alma anında tam ücret tahsil edilmesi demektir.
    const model = buildPaywall({ ...base, trialEligible: false });
    expect(model.ctaKey).toBe('paywall.cta.subscribe');
    expect(model.disclosureKey).toBe('paywall.disclosure.standard');
    expect(model.plans.every((p) => !p.hasFreeTrial)).toBe(true);
  });

  it('haftalık planda gereksiz "haftada X" satırını göstermez', () => {
    const model = buildPaywall({ ...base, trialEligible: true });
    expect(model.plans.find((p) => p.planId === 'weekly')?.perWeekLabel).toBeNull();
    expect(model.plans.find((p) => p.planId === 'annual')?.perWeekLabel).toBe('$0.77');
  });

  it('geri yükleme her zaman görünür', () => {
    expect(buildPaywall({ ...base, trialEligible: true }).restoreVisible).toBe(true);
  });

  it('seçili plan listede yoksa ilk plana düşer', () => {
    const model = buildPaywall({
      ...base,
      products: [weekly],
      selectedPlanId: 'annual',
      trialEligible: true,
    });
    expect(model.selectedPlanId).toBe('weekly');
  });
});
