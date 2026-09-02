/**
 * StoreCompliance — paywall'ın mağaza yönergelerine uygunluğunu ÇALIŞMA
 * ZAMANINDA denetleyen saf kontrol.
 *
 * NEDEN KOD, NEDEN KONTROL LİSTESİ DEĞİL: "Paywall uyumludur" bir iddiadır;
 * kontrol listesi maddeleri sürüm telaşında atlanır. Burada her zorunlu unsur
 * bir kurala bağlanmıştır; eksikse DEBUG build'de ekran hata verir, testte
 * kırmızıya döner. Reddi App Store incelemesinden değil, kendi testimizden
 * öğrenmek istiyoruz.
 *
 * Kaynaklar:
 *   - App Store Review Guideline 3.1.2 (Subscriptions)
 *   - App Store Review Guideline 3.1.1 (In-App Purchase — harici ödeme yok)
 *   - Google Play Subscriptions policy (fiyat/dönem şeffaflığı)
 */
import type { PaywallViewModel } from '@/billing/PricingPolicy';

export type ViolationCode =
  | 'MISSING_PRICE'
  | 'MISSING_PERIOD'
  | 'MISSING_DISCLOSURE'
  | 'MISSING_RESTORE'
  | 'MISSING_TERMS_LINK'
  | 'MISSING_PRIVACY_LINK'
  | 'TRIAL_WITHOUT_RENEWAL_TERMS'
  | 'EXTERNAL_PAYMENT_LINK'
  | 'NO_PLANS_AVAILABLE'
  | 'SAVINGS_WITHOUT_BASELINE';

export interface Violation {
  readonly code: ViolationCode;
  readonly detail: string;
}

/** Harici ödeme yönlendirmesi taraması — Guideline 3.1.1 ihlali. */
const EXTERNAL_PAYMENT_PATTERNS = [
  /stripe\.com/i,
  /paypal\.(com|me)/i,
  /checkout\./i,
  /\/subscribe\?/i,
  /buy\.[a-z]/i,
];

export function auditPaywall(model: PaywallViewModel): readonly Violation[] {
  const violations: Violation[] = [];

  if (model.plans.length === 0) {
    violations.push({
      code: 'NO_PLANS_AVAILABLE',
      detail:
        'Ürün listesi boş. Hakem bu ekranı boş görürse "satın alma çalışmıyor" ' +
        'diyerek reddeder; mağaza yanıtı gelmediğinde yeniden deneme sunulmalıdır.',
    });
  }

  for (const plan of model.plans) {
    // Fiyat, mağazadan gelen yerelleştirilmiş dize olmalı — boşsa ekranda
    // "undefined" veya boşluk görünür.
    if (!plan.priceLabel || plan.priceLabel.trim().length === 0) {
      violations.push({
        code: 'MISSING_PRICE',
        detail: `${plan.planId}: fiyat dizesi boş (mağaza yanıtı eksik olabilir).`,
      });
    }
    if (!plan.periodKey) {
      violations.push({
        code: 'MISSING_PERIOD',
        detail: `${plan.planId}: faturalama dönemi belirtilmemiş.`,
      });
    }
    // "%61 tasarruf" iddiası, karşılaştırma yapılan planın da ekranda
    // görünmesini gerektirir; aksi halde doğrulanamaz bir iddiadır.
    if (plan.savingsPercent !== null && !model.plans.some((p) => p.planId === 'weekly')) {
      violations.push({
        code: 'SAVINGS_WITHOUT_BASELINE',
        detail: `${plan.planId}: tasarruf iddiası var ama karşılaştırma planı ekranda yok.`,
      });
    }
  }

  if (!model.disclosureKey) {
    violations.push({
      code: 'MISSING_DISCLOSURE',
      detail:
        'Otomatik yenileme açıklaması yok. Guideline 3.1.2 bunun satın alma ' +
        'düğmesine bitişik olmasını şart koşar.',
    });
  }

  // Deneme sunuluyorsa, denemeden SONRA ne olacağı aynı ekranda yazmalıdır.
  const offersTrial = model.plans.some((p) => p.hasFreeTrial);
  if (offersTrial && model.disclosureKey !== 'paywall.disclosure.trial') {
    violations.push({
      code: 'TRIAL_WITHOUT_RENEWAL_TERMS',
      detail:
        'Ücretsiz deneme sunuluyor ama açıklama metni deneme sürümüne ait değil. ' +
        '"1 gün ücretsiz" tek başına yanıltıcıdır; sonrasındaki ücret yazılmalıdır.',
    });
  }

  if (!model.restoreVisible) {
    violations.push({
      code: 'MISSING_RESTORE',
      detail:
        'Geri yükleme düğmesi görünmüyor. Hakemler bunu her zaman dener; ' +
        'eksikliği tek başına ret sebebidir.',
    });
  }

  if (!isUsableUrl(model.termsUrl)) {
    violations.push({ code: 'MISSING_TERMS_LINK', detail: 'Abonelik koşulları bağlantısı geçersiz.' });
  }
  if (!isUsableUrl(model.privacyUrl)) {
    violations.push({ code: 'MISSING_PRIVACY_LINK', detail: 'Gizlilik politikası bağlantısı geçersiz.' });
  }

  for (const url of [model.termsUrl, model.privacyUrl]) {
    if (EXTERNAL_PAYMENT_PATTERNS.some((pattern) => pattern.test(url))) {
      violations.push({
        code: 'EXTERNAL_PAYMENT_LINK',
        detail: `Harici ödeme yönlendirmesi tespit edildi: ${url} (Guideline 3.1.1).`,
      });
    }
  }

  return violations;
}

function isUsableUrl(url: string): boolean {
  if (!url || !url.startsWith('https://')) return false;
  try {
    // Yalnızca şema yeterli değil: "https://" tek başına geçerli sayılmamalı.
    return new URL(url).hostname.includes('.');
  } catch {
    return false;
  }
}

/**
 * DEBUG build'de ihlalleri gürültülü biçimde bildirir. Release'te sessizdir:
 * kullanıcıya teknik uyarı göstermek fayda sağlamaz, asıl kapı testtir.
 */
declare const __DEV__: boolean;

export function assertPaywallCompliance(model: PaywallViewModel): readonly Violation[] {
  const violations = auditPaywall(model);
  if (__DEV__ && violations.length > 0) {
    const lines = violations.map((v) => `  • [${v.code}] ${v.detail}`).join('\n');
    console.error(`[StoreCompliance] Paywall uyumluluk ihlali:\n${lines}`);
  }
  return violations;
}
