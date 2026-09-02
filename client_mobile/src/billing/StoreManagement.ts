/**
 * StoreManagement — mağazaya özgü yönetim işlemleri (native köprü önyüzü).
 *
 * Neden ayrı: `BillingService` satın alma akışını yönetir; burada satın alma
 * SONRASI işler var — iptal/yönetim sayfası, iade talebi, Play içi mesajlar.
 * Bunlar mağaza politikalarının gerektirdiği ama SDK'nın sunmadığı parçalardır.
 */
import { NativeModules, Platform } from 'react-native';

import { createLogger } from '@/core/logging/Logger';

const log = createLogger('StoreManagement');

interface StoreKitBridgeSpec {
  startTransactionListener(): void;
  stopTransactionListener(): void;
  showManageSubscriptions(): Promise<void>;
  beginRefundRequest(transactionId: number): Promise<'submitted' | 'cancelled'>;
  isEligibleForIntroOffer(productId: string): Promise<boolean>;
}

interface PlayBillingBridgeSpec {
  showInAppMessages(): Promise<boolean>;
  openSubscriptionManagement(sku: string | null): Promise<void>;
}

const storeKit = NativeModules.EvenGirlStoreKit as StoreKitBridgeSpec | undefined;
const playBilling = NativeModules.EvenGirlPlayBilling as PlayBillingBridgeSpec | undefined;

export const StoreManagement = {
  /** Açılışta çağrılır (iOS). Uygulama kapalıyken onaylanan işlemleri yakalar. */
  startListening(): void {
    if (Platform.OS === 'ios') storeKit?.startTransactionListener();
  },

  stopListening(): void {
    if (Platform.OS === 'ios') storeKit?.stopTransactionListener();
  },

  /** İptal/yönetim sayfasını açar — her iki mağaza da kolay erişim ister. */
  async openManagement(productId?: string): Promise<void> {
    try {
      if (Platform.OS === 'ios') {
        await storeKit?.showManageSubscriptions();
        return;
      }
      await playBilling?.openSubscriptionManagement(productId ?? null);
    } catch (e) {
      log.warn('Abonelik yönetimi açılamadı', e);
    }
  },

  /**
   * Play içi mesajlar (ödeme sorunu kurtarma). Ön plana her dönüşte
   * çağrılır; iOS'ta karşılığı yoktur (sistem kendi uyarısını gösterir).
   *
   * `true` dönerse kullanıcı ödemesini düzeltmiştir — yetki DERHAL
   * tazelenmelidir, aksi halde ödeme yapmış kullanıcı kilitli kalır.
   */
  async showPaymentRecoveryMessages(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
      return (await playBilling?.showInAppMessages()) ?? false;
    } catch {
      return false;
    }
  },

  /** Uygulama içi iade talebi (yalnızca iOS 15+). */
  async requestRefund(transactionId: number): Promise<'submitted' | 'cancelled' | 'unsupported'> {
    if (Platform.OS !== 'ios' || !storeKit) return 'unsupported';
    try {
      return await storeKit.beginRefundRequest(transactionId);
    } catch (e) {
      log.warn('İade talebi başlatılamadı', e);
      return 'cancelled';
    }
  },
};
