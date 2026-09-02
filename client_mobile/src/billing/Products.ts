/**
 * Ürün ve abonelik katmanı tanımları.
 *
 * FİYATLAR BURADA GÖSTERİLMEZ. Aşağıdaki USD değerleri yalnızca App Store
 * Connect / Play Console'da hangi fiyat kademesinin seçileceğini belgeler.
 * Kullanıcıya gösterilen her fiyat, mağazanın döndürdüğü YERELLEŞTİRİLMİŞ
 * dizedir (`priceString`) — Apple ve Google her ülke için kendi kur ve
 * vergi dönüşümünü uygular.
 *
 * Sabit kodlanmış "$2.99" göstermek üç sorunu birden yaratır:
 *   1. Türkiye'de TL, Japonya'da JPY gösterilmesi gerekirken dolar görünür,
 *   2. Mağaza fiyatı güncellendiğinde uygulama yalan söyler,
 *   3. Apple Guideline 3.1.2 ihlali (gösterilen fiyat ile tahsil edilen
 *      fiyatın uyuşmaması) — doğrudan ret sebebi.
 */

/** RevenueCat entitlement kimliği — backend webhook'u ile aynı olmalıdır. */
export const PRO_ENTITLEMENT = 'pro';

/** RevenueCat offering kimliği (Dashboard > Offerings). */
export const DEFAULT_OFFERING = 'default';

export type PlanId = 'weekly' | 'monthly' | 'annual';

export interface PlanDefinition {
  readonly id: PlanId;
  /** App Store Connect / Play Console ürün kimliği. */
  readonly productId: string;
  /** Referans fiyat kademesi (USD). Gösterim için DEĞİL, yapılandırma için. */
  readonly referenceUsd: number;
  /** Faturalama dönemi (ISO 8601 süre). */
  readonly period: 'P1W' | 'P1M' | 'P1Y';
  /** Kaç gün ücretsiz deneme sunuluyor (0 = deneme yok). */
  readonly trialDays: number;
}

export const PLANS: Readonly<Record<PlanId, PlanDefinition>> = {
  weekly: {
    id: 'weekly',
    productId: 'com.evengirl.app.pro.weekly',
    referenceUsd: 2.99,
    period: 'P1W',
    trialDays: 1,
  },
  monthly: {
    id: 'monthly',
    productId: 'com.evengirl.app.pro.monthly',
    referenceUsd: 6.99,
    period: 'P1M',
    trialDays: 1,
  },
  annual: {
    id: 'annual',
    productId: 'com.evengirl.app.pro.annual',
    referenceUsd: 39.99,
    period: 'P1Y',
    trialDays: 1,
  },
};

export const PLAN_ORDER: readonly PlanId[] = ['weekly', 'monthly', 'annual'];

/** Paywall'da önceden seçili gelen plan. */
export const DEFAULT_SELECTED_PLAN: PlanId = 'annual';

/** Yasal metin bağlantıları — paywall'da GÖRÜNÜR olmak zorundadır. */
export const LEGAL_LINKS = {
  terms: 'https://armanalabs.com/legal/terms',
  privacy: 'https://armanalabs.com/legal/privacy',
  /** Apple'ın standart EULA'sı kullanılıyorsa bu bağlantı zorunludur. */
  eula: 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/',
} as const;
