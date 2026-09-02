/**
 * RewardRedemption — promosyon kodunun NATIVE ödeme sayfasında kullanılması.
 *
 * NEDEN UYGULAMA İÇİNDE "PRO AÇTIM" DEMİYORUZ
 * Ödül, backend'in kendi kaydına PRO yazmasıyla verilmez — bu, dijital malı
 * mağaza dışında dağıtmaktır (Apple 3.1.1 / Google Play Payments). Kullanıcı
 * o "PRO"yu Ayarlar > Abonelikler altında göremez, iptal edemez, geri
 * yükleyemez.
 *
 * Doğru yol: mağazanın kendi kod kullanım sayfası açılır, abonelik MAĞAZADA
 * oluşur. Sonrasında RevenueCat webhook'u backend'i günceller ve yetki
 * normal yoldan gelir.
 *
 * iOS     : `presentCodeRedemptionSheet` (StoreKit 2) — uygulamadan çıkmadan.
 * Android : Play Store kullanım bağlantısı açılır; Play uygulaması devralır.
 */
import { Linking, Platform } from 'react-native';

import { createLogger } from '@/core/logging/Logger';
import { appError, Err, Ok, type Result } from '@/core/result/Result';
import { pinnedRequest } from '@/security/SslPinning';
import { BillingService } from '@/billing/BillingService';

const log = createLogger('RewardRedemption');

interface NativeRedemptionBridge {
  /** iOS 14+: SKPaymentQueue.presentCodeRedemptionSheet */
  presentCodeRedemptionSheet(): Promise<void>;
  isSupported(): Promise<boolean>;
}

function bridge(): NativeRedemptionBridge | undefined {
  const { NativeModules } = require('react-native') as typeof import('react-native');
  return NativeModules.EvenGirlRedemption as NativeRedemptionBridge | undefined;
}

export interface PendingReward {
  readonly week: string;
  readonly rank: number;
  readonly days: number;
  /** Mağaza kullanım bağlantısı. Kodun kendisi istemcide TUTULMAZ. */
  readonly redemptionUrl: string;
  readonly expiresAtMs: number;
}

export const RewardRedemption = {
  /**
   * Bekleyen ödülleri sorgular.
   *
   * Push kaçırılmış olabilir (bildirim izni yok, cihaz kapalı). Ödülün
   * yalnızca push'a bağlı olması, kazanan kullanıcıların bir kısmını
   * ödülsüz bırakır.
   */
  async pending(): Promise<readonly PendingReward[]> {
    const result = await pinnedRequest<{ rewards: PendingReward[] }>({
      path: '/v1/rewards/pending',
    });
    if (!result.ok) return [];

    const now = Date.now();
    return result.value.rewards.filter((reward) => reward.expiresAtMs > now);
  },

  /**
   * Kodu kullanır.
   *
   * iOS'ta sistem sayfası uygulama İÇİNDE açılır; Android'de Play Store
   * devralır ve kullanıcı geri döner. Her iki durumda da dönüşte yetki
   * tazelenir — mağaza abonelik oluşturmuş olabilir.
   */
  async redeem(reward: PendingReward): Promise<Result<void>> {
    try {
      const native = bridge();

      if (Platform.OS === 'ios' && native && (await native.isSupported())) {
        await native.presentCodeRedemptionSheet();
      } else {
        const opened = await Linking.canOpenURL(reward.redemptionUrl);
        if (!opened) {
          return Err(
            appError('BILLING_UNAVAILABLE', 'kullanım sayfası açılamadı', {
              i18nKey: 'reward.redeemFailed',
              retryable: true,
            }),
          );
        }
        await Linking.openURL(reward.redemptionUrl);
      }

      // Mağaza abonelik oluşturmuş olabilir; yetkiyi tazele. Kullanıcının
      // Pro olduğunu görmesi için uygulamayı yeniden başlatması gerekmemeli.
      void BillingService.refresh();
      return Ok(undefined);
    } catch (e) {
      log.warn('Kod kullanımı başarısız', e);
      return Err(
        appError('BILLING_UNAVAILABLE', 'redemption failed', {
          i18nKey: 'reward.redeemFailed',
          retryable: true,
        }),
      );
    }
  },

  /** Kullanıcı kodu kullandığını bildirir; sunucu mağaza kaydıyla doğrular. */
  async acknowledge(week: string): Promise<void> {
    await pinnedRequest<{ ok: boolean }>({
      path: '/v1/rewards/acknowledge',
      method: 'POST',
      body: { week },
    });
  },
};
