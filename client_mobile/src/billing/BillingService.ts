/**
 * BillingService — satın alma akışının tek giriş kapısı.
 *
 * ALTYAPI SEÇİMİ
 * RevenueCat SDK'sı kullanılıyor. Bu, StoreKit 2 / Play Billing'in YERİNE
 * geçen bir ödeme sistemi DEĞİLDİR: SDK iOS'ta StoreKit 2'yi, Android'de
 * Play Billing Library'yi çağırır. Tüm tahsilat Apple ve Google üzerinden
 * yürür; harici ödeme yönlendirmesi yoktur (Guideline 3.1.1).
 *
 * Neden doğrudan native yerine bu katman:
 *   - Sunucu tarafı doğrulama ve webhook altyapısı bu repoda zaten kurulu
 *     (server/revenuecat-webhook.example.js). İkinci bir doğrulama hattı
 *     kurmak, iki farklı doğruluk kaynağı yaratır — en kötü seçenek.
 *   - Makbuz doğrulama, yenileme takibi ve grace period yönetimi elle
 *     yazıldığında sessiz gelir kaybı üreten klasik hata kaynağıdır.
 *
 * RevenueCat'in kapsamadığı mağazaya özgü işler (abonelik yönetim ekranı,
 * iade talebi, Play içi mesajlar) native köprüden yapılır:
 *   ios/EvenGirl/Billing/StoreKitBridge.swift
 *   android/.../billing/PlayBillingBridge.kt
 */
import { Platform } from 'react-native';
import Purchases, {
  INTRO_ELIGIBILITY_STATUS,
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
  type PurchasesStoreProduct,
} from 'react-native-purchases';

import { ENV } from '@/core/config/env';
import { createLogger } from '@/core/logging/Logger';
import { appError, Err, Ok, type Result } from '@/core/result/Result';
import {
  DEFAULT_OFFERING,
  PLANS,
  PRO_ENTITLEMENT,
  type PlanId,
} from '@/billing/Products';
import { Entitlements, reconcile, type EntitlementState } from '@/billing/Entitlements';
import { EntitlementSync } from '@/billing/EntitlementSync';
import type { StorePriceInfo, IntroPeriodUnit } from '@/billing/PricingPolicy';

const log = createLogger('BillingService');

declare const __DEV__: boolean;

/** productId -> plan eşlemesi; mağaza yanıtını plan modeline bağlar. */
const PLAN_BY_PRODUCT_ID = new Map<string, PlanId>(
  Object.values(PLANS).map((plan) => [plan.productId, plan.id]),
);

/**
 * Google Play'de ürün kimliği "com.evengirl.app.pro.annual:base-plan" biçiminde
 * base plan ekiyle gelebilir; eşlemede ekten önceki kısmı kullanıyoruz.
 */
function planIdOf(product: PurchasesStoreProduct): PlanId | null {
  const base = product.identifier.split(':')[0] ?? product.identifier;
  return PLAN_BY_PRODUCT_ID.get(base) ?? PLAN_BY_PRODUCT_ID.get(product.identifier) ?? null;
}

function normalizePeriodUnit(unit: string | null | undefined): IntroPeriodUnit {
  switch ((unit ?? '').toUpperCase()) {
    case 'DAY':
      return 'DAY';
    case 'WEEK':
      return 'WEEK';
    case 'MONTH':
      return 'MONTH';
    case 'YEAR':
      return 'YEAR';
    default:
      // Bilinmeyen birimde en kısa süreyi varsayıyoruz: deneme süresini
      // olduğundan uzun göstermek yanıltıcı beyandır.
      return 'DAY';
  }
}

/** Mağaza ürününü, saf fiyat mantığının anladığı sade veriye çevirir. */
export function toStorePriceInfo(pkg: PurchasesPackage): StorePriceInfo | null {
  const planId = planIdOf(pkg.product);
  if (!planId) return null;

  const intro = pkg.product.introPrice;

  return {
    planId,
    productId: pkg.product.identifier,
    priceString: pkg.product.priceString,
    price: pkg.product.price,
    currencyCode: pkg.product.currencyCode,
    pricePerWeekString: pkg.product.pricePerWeekString,
    pricePerWeek: pkg.product.pricePerWeek,
    pricePerMonthString: pkg.product.pricePerMonthString,
    introOffer: intro
      ? {
          periodUnit: normalizePeriodUnit(intro.periodUnit),
          periodNumberOfUnits: intro.periodNumberOfUnits,
          cycles: intro.cycles,
          price: intro.price,
        }
      : null,
  };
}

function entitlementFromCustomerInfo(info: CustomerInfo): EntitlementState {
  const entitlement = info.entitlements.active[PRO_ENTITLEMENT];

  if (!entitlement) {
    return {
      isPro: false,
      source: 'store',
      expiresAtMs: null,
      willRenew: false,
      inTrial: false,
      billingIssue: false,
      checkedAtMs: Date.now(),
    };
  }

  return {
    isPro: true,
    source: 'store',
    expiresAtMs: entitlement.expirationDateMillis,
    willRenew: entitlement.willRenew,
    // periodType 'TRIAL' | 'INTRO' | 'NORMAL' döner.
    inTrial: entitlement.periodType.toUpperCase() === 'TRIAL',
    billingIssue: entitlement.billingIssueDetectedAt !== null,
    checkedAtMs: Date.now(),
  };
}

class BillingServiceImpl {
  private configured = false;
  private cachedOffering: PurchasesOffering | null = null;

  /**
   * Açılışta bir kez çağrılır.
   *
   * `appUserID` VERİLMEZ: RevenueCat anonim bir kimlik üretir. Kendi
   * kimliğimizi vermek, "sıfır kişisel veri" ilkesini bozacak bir kullanıcı
   * hesabı gerektirirdi.
   */
  async configure(): Promise<Result<void>> {
    if (this.configured) return Ok(undefined);

    try {
      if (__DEV__) await Purchases.setLogLevel(LOG_LEVEL.WARN);

      Purchases.configure({
        apiKey:
          Platform.OS === 'ios'
            ? ENV.revenueCatPublicKeyIos
            : ENV.revenueCatPublicKeyAndroid,
      });

      // Abonelik durumu uygulama dışında da değişir (yenileme, iptal, iade).
      // Bu dinleyici olmadan kullanıcı, iptalinden sonra da Pro görünür.
      Purchases.addCustomerInfoUpdateListener((info) => {
        void this.applyCustomerInfo(info);
      });

      this.configured = true;
      return Ok(undefined);
    } catch (e) {
      log.error('RevenueCat yapılandırılamadı', e);
      return Err(appError('BILLING_UNAVAILABLE', 'configure failed', { retryable: true }));
    }
  }

  /** Paywall için ürünleri getirir. */
  async loadProducts(): Promise<Result<readonly StorePriceInfo[]>> {
    const configured = await this.configure();
    if (!configured.ok) return configured;

    try {
      const offerings = await Purchases.getOfferings();
      const offering = offerings.all[DEFAULT_OFFERING] ?? offerings.current;

      if (!offering) {
        return Err(
          appError('BILLING_UNAVAILABLE', 'offering bulunamadı', {
            i18nKey: 'paywall.error.productsUnavailable',
            retryable: true,
          }),
        );
      }

      this.cachedOffering = offering;

      const products = offering.availablePackages
        .map(toStorePriceInfo)
        .filter((p): p is StorePriceInfo => p !== null);

      if (products.length === 0) {
        // Mağaza yanıtı geldi ama hiçbir ürün eşleşmedi: ürün kimlikleri
        // yanlış yapılandırılmış demektir. Sessizce boş paywall göstermek,
        // hakemin "satın alma çalışmıyor" diyerek reddetmesine yol açar.
        return Err(
          appError('BILLING_UNAVAILABLE', 'ürün kimlikleri eşleşmedi', {
            i18nKey: 'paywall.error.productsUnavailable',
            retryable: true,
          }),
        );
      }

      return Ok(products);
    } catch (e) {
      log.warn('Ürünler yüklenemedi', e);
      return Err(
        appError('BILLING_UNAVAILABLE', 'getOfferings failed', {
          i18nKey: 'paywall.error.productsUnavailable',
          retryable: true,
        }),
      );
    }
  }

  /**
   * Kullanıcının tanıtım teklifine (1 gün deneme) hak kazanıp kazanmadığı.
   *
   * Daha önce deneme kullanmış bir kullanıcıya "1 gün ücretsiz" göstermek
   * yanıltıcı beyandır ve satın alma anında mağaza tam ücreti tahsil eder —
   * kullanıcı için en kötü sürpriz budur.
   */
  async isTrialEligible(): Promise<boolean> {
    const productIds = Object.values(PLANS).map((plan) => plan.productId);

    try {
      // Uygunluğu MAĞAZAYA sorduruyoruz. "Daha önce satın alma var mı"
      // şeklindeki kendi tahminimiz yanlıştır: aile paylaşımı, farklı ürün
      // ailesinden geçiş ve iade sonrası durumlarda mağazanın cevabı farklıdır.
      const result = await Purchases.checkTrialOrIntroductoryPriceEligibility(productIds);

      // Herhangi bir plan için uygunsa deneme rozetini gösteriyoruz; hangi
      // planın uygun olduğu plan bazında zaten introPrice ile belirlenir.
      return Object.values(result).some(
        (status) =>
          status.status === INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE,
      );
    } catch {
      // Bilinmiyorsa deneme GÖSTERİLMEZ. Olmayan bir teklifi vaat edip satın
      // alma anında tam ücret tahsil ettirmek, kullanıcı için en kötü
      // sürprizdir ve mağaza şikâyetlerinin klasik sebebidir.
      return false;
    }
  }

  /** Satın alma. */
  async purchase(planId: PlanId): Promise<Result<EntitlementState>> {
    const offering = this.cachedOffering;
    if (!offering) {
      return Err(appError('BILLING_UNAVAILABLE', 'offering yüklenmedi', { retryable: true }));
    }

    const target = offering.availablePackages.find((pkg) => planIdOf(pkg.product) === planId);
    if (!target) {
      return Err(appError('BILLING_UNAVAILABLE', `plan bulunamadı: ${planId}`));
    }

    try {
      const { customerInfo } = await Purchases.purchasePackage(target);
      const state = await this.applyCustomerInfo(customerInfo);
      return Ok(state);
    } catch (e) {
      const code = (e as { code?: string }).code;

      // İptal bir HATA DEĞİLDİR. Kullanıcıya hata diyaloğu göstermek,
      // bilinçli bir kararı arıza gibi sunmaktır.
      if (code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
        return Err(appError('BILLING_CANCELLED', 'kullanıcı iptal etti'));
      }

      log.warn('Satın alma başarısız', code);
      return Err(
        appError('BILLING_UNAVAILABLE', `purchase failed: ${code ?? 'unknown'}`, {
          i18nKey: 'paywall.error.purchaseFailed',
          retryable: true,
        }),
      );
    }
  }

  /**
   * Geri yükleme.
   *
   * Hakemler bunu HER İNCELEMEDE dener. Sessizce başarısız olması veya
   * hiçbir geri bildirim vermemesi tek başına ret sebebidir; bu yüzden
   * "hiçbir şey bulunamadı" durumu da açık bir sonuç olarak döner.
   */
  async restore(): Promise<Result<{ state: EntitlementState; restoredSomething: boolean }>> {
    const configured = await this.configure();
    if (!configured.ok) return configured;

    try {
      const info = await Purchases.restorePurchases();
      const state = await this.applyCustomerInfo(info);
      return Ok({ state, restoredSomething: state.isPro });
    } catch (e) {
      log.warn('Geri yükleme başarısız', e);
      return Err(
        appError('BILLING_UNAVAILABLE', 'restore failed', {
          i18nKey: 'paywall.error.restoreFailed',
          retryable: true,
        }),
      );
    }
  }

  /** Açılışta ve ön plana dönüşte mevcut durumu tazeler. */
  async refresh(): Promise<EntitlementState> {
    const configured = await this.configure();
    if (!configured.ok) return Entitlements.current;

    try {
      return await this.applyCustomerInfo(await Purchases.getCustomerInfo());
    } catch {
      return Entitlements.current;
    }
  }

  /**
   * Mağaza yanıtını uygular, ardından sunucu doğrulamasıyla uzlaştırır.
   * Sunucuya ulaşılamazsa mağaza yanıtı kullanılır (bkz. Entitlements.reconcile).
   */
  private async applyCustomerInfo(info: CustomerInfo): Promise<EntitlementState> {
    const storeState = entitlementFromCustomerInfo(info);
    Entitlements.update(storeState);

    const serverState = await EntitlementSync.fetch(info.originalAppUserId).catch(() => null);
    const finalState = reconcile(storeState, serverState);

    Entitlements.update(finalState);
    return finalState;
  }
}

export const BillingService = new BillingServiceImpl();
