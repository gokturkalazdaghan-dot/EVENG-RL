/**
 * PricingPolicy — paywall görünüm modelinin SAF üretimi.
 *
 * Mağaza ürünlerinden (yerelleştirilmiş fiyat, deneme bilgisi) ekranda
 * gösterilecek her metni burada hesaplıyoruz. Platform API'si import edilmez;
 * girdi sade veri, çıktı sade veri — dolayısıyla tamamen test edilebilir.
 *
 * NEDEN ÖNEMLİ: Buradaki bir hata "gösterilen fiyat ≠ tahsil edilen fiyat"
 * demektir ve bu, App Store Guideline 3.1.2'nin doğrudan ret sebebidir.
 * Ayrıca kullanıcı güvenini bir kerede yok eder.
 */
import type { PlanId } from '@/billing/Products';

export type IntroPeriodUnit = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';

/** Mağazadan gelen ürünün, karar için ihtiyaç duyduğumuz alt kümesi. */
export interface StorePriceInfo {
  readonly planId: PlanId;
  readonly productId: string;
  /** Yerelleştirilmiş, para birimi işaretli tam fiyat. Mağazadan gelir. */
  readonly priceString: string;
  /** Sayısal fiyat — yalnızca KARŞILAŞTIRMA için, gösterimde kullanılmaz. */
  readonly price: number;
  readonly currencyCode: string;
  /** Mağazanın hesapladığı haftalık eşdeğer (yerelleştirilmiş dize). */
  readonly pricePerWeekString: string | null;
  readonly pricePerWeek: number | null;
  readonly pricePerMonthString: string | null;
  /** Tanıtım fiyatı / deneme bilgisi; null ise bu ürün için deneme yok. */
  readonly introOffer: {
    readonly periodUnit: IntroPeriodUnit;
    readonly periodNumberOfUnits: number;
    readonly cycles: number;
    readonly price: number;
  } | null;
}

export interface PlanViewModel {
  readonly planId: PlanId;
  readonly productId: string;
  /** Gösterilecek fiyat — HER ZAMAN mağazadan gelen dize. */
  readonly priceLabel: string;
  /** "haftada" / "ayda" / "yılda" i18n anahtarı. */
  readonly periodKey: string;
  /** Karşılaştırma satırı ("haftada ~X" gibi); yoksa null. */
  readonly perWeekLabel: string | null;
  /** Haftalık plana kıyasla tasarruf yüzdesi (tam sayı); yoksa null. */
  readonly savingsPercent: number | null;
  /** Bu plan ücretsiz denemeyle mi başlıyor. */
  readonly hasFreeTrial: boolean;
  readonly trialDays: number;
  /** Öne çıkarılan plan (en iyi değer). */
  readonly highlighted: boolean;
}

export interface PaywallViewModel {
  readonly plans: readonly PlanViewModel[];
  readonly selectedPlanId: PlanId;
  /** Ana düğme metninin i18n anahtarı — deneme durumuna göre değişir. */
  readonly ctaKey: string;
  /**
   * CTA'nın HEMEN ALTINDA gösterilmesi zorunlu açıklama.
   * Guideline 3.1.2: süre, fiyat ve otomatik yenileme aynı ekranda,
   * satın alma düğmesine bitişik olmalıdır.
   */
  readonly disclosureKey: string;
  readonly disclosureParams: Readonly<Record<string, string | number>>;
  readonly restoreVisible: boolean;
  readonly termsUrl: string;
  readonly privacyUrl: string;
}

const PERIOD_KEY: Readonly<Record<PlanId, string>> = {
  weekly: 'paywall.period.week',
  monthly: 'paywall.period.month',
  annual: 'paywall.period.year',
};

/** Deneme süresini gün cinsine çevirir — farklı mağazalar farklı birim döner. */
export function trialDaysOf(info: StorePriceInfo): number {
  const offer = info.introOffer;
  if (!offer || offer.price > 0) return 0; // ücretli tanıtım fiyatı, deneme değil

  const daysPerUnit: Readonly<Record<IntroPeriodUnit, number>> = {
    DAY: 1,
    WEEK: 7,
    MONTH: 30,
    YEAR: 365,
  };
  return offer.periodNumberOfUnits * daysPerUnit[offer.periodUnit] * Math.max(1, offer.cycles);
}

/**
 * Haftalık plana kıyasla tasarruf yüzdesi.
 *
 * Mağazanın hesapladığı `pricePerWeek` kullanılır; kendi bölme işlemimizi
 * yapmak, farklı ay uzunlukları ve yerel vergi yuvarlamaları yüzünden
 * mağazanın gösterdiğinden farklı bir sayı üretir.
 *
 * Yuvarlama AŞAĞI yapılır: "%61 tasarruf" yazıp %60.4 tasarruf ettirmek,
 * abartılı iddia sayılır.
 */
export function savingsPercentVsWeekly(
  plan: StorePriceInfo,
  weekly: StorePriceInfo | undefined,
): number | null {
  if (!weekly || weekly.price <= 0) return null;
  if (plan.planId === 'weekly') return null;
  if (plan.pricePerWeek === null || plan.pricePerWeek <= 0) return null;
  // Farklı para birimlerini karşılaştırmak anlamsızdır.
  if (plan.currencyCode !== weekly.currencyCode) return null;

  const ratio = 1 - plan.pricePerWeek / weekly.price;
  if (ratio <= 0) return null;

  return Math.floor(ratio * 100);
}

export interface BuildPaywallInput {
  readonly products: readonly StorePriceInfo[];
  readonly selectedPlanId: PlanId;
  /** Kullanıcı daha önce deneme kullandıysa false — mağazadan sorulur. */
  readonly trialEligible: boolean;
  readonly termsUrl: string;
  readonly privacyUrl: string;
  readonly highlightPlanId?: PlanId;
}

export function buildPaywall(input: BuildPaywallInput): PaywallViewModel {
  const weekly = input.products.find((p) => p.planId === 'weekly');

  const plans: PlanViewModel[] = input.products.map((product) => {
    const trialDays = input.trialEligible ? trialDaysOf(product) : 0;

    return {
      planId: product.planId,
      productId: product.productId,
      priceLabel: product.priceString,
      periodKey: PERIOD_KEY[product.planId],
      // Haftalık planda "haftada X" satırı gereksiz tekrardır.
      perWeekLabel: product.planId === 'weekly' ? null : product.pricePerWeekString,
      savingsPercent: savingsPercentVsWeekly(product, weekly),
      hasFreeTrial: trialDays > 0,
      trialDays,
      highlighted: product.planId === (input.highlightPlanId ?? 'annual'),
    };
  });

  const selected =
    plans.find((p) => p.planId === input.selectedPlanId) ?? plans[0];

  const withTrial = selected?.hasFreeTrial === true;

  return {
    plans,
    selectedPlanId: selected?.planId ?? input.selectedPlanId,
    ctaKey: withTrial ? 'paywall.cta.startTrial' : 'paywall.cta.subscribe',
    // Deneme varken metin, denemeden sonra NE OLACAĞINI da söylemek
    // zorundadır; "1 gün ücretsiz" tek başına yanıltıcıdır.
    disclosureKey: withTrial ? 'paywall.disclosure.trial' : 'paywall.disclosure.standard',
    disclosureParams: {
      trialDays: selected?.trialDays ?? 0,
      price: selected?.priceLabel ?? '',
      periodKey: selected?.periodKey ?? '',
    },
    restoreVisible: true,
    termsUrl: input.termsUrl,
    privacyUrl: input.privacyUrl,
  };
}
