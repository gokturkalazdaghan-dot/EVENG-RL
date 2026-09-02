/**
 * CreatorSubscriptions — kullanıcılar arası VIP abonelik.
 *
 * MAĞAZA KURALI: Bir kullanıcının başka bir kullanıcıya dijital içerik için
 * ödeme yapması, uygulama içi satın alma (IAP) kapsamındadır. Harici ödeme
 * (Stripe, IBAN, "DM'den anlaşalım") Guideline 3.1.1 ihlalidir ve doğrudan
 * ret sebebidir.
 *
 * Bu yüzden creator abonelikleri de StoreKit 2 / Play Billing üzerinden,
 * ÖNCEDEN TANIMLI fiyat kademeleriyle satılır. Creator, kademe seçer;
 * serbest fiyat giremez — mağazalar dinamik fiyat tanımına izin vermez.
 *
 * GELİR PAYI: Mağaza kesintisinden sonra kalan tutarın paylaşımı SUNUCUDA
 * hesaplanır ve creator'a platform dışı ödeme yöntemiyle (banka havalesi)
 * aktarılır. Bu, mağaza kurallarına aykırı DEĞİLDİR: kullanıcıdan tahsilat
 * IAP ile yapılır, creator'a ödeme ayrı bir ticari ilişkidir.
 */
import Purchases, { type PurchasesPackage } from 'react-native-purchases';

import { createLogger } from '@/core/logging/Logger';
import { appError, Err, Ok, type Result } from '@/core/result/Result';
import { pinnedRequest } from '@/security/SslPinning';
import { AgeGate } from '@/age/AgeGate';

const log = createLogger('CreatorSubs');

/**
 * Önceden tanımlı kademeler. Mağaza konsollarında bu kimliklerle ürün
 * oluşturulur; creator yalnızca hangi kademede olacağını seçer.
 */
export type CreatorTierId = 'tier1' | 'tier2' | 'tier3';

export const CREATOR_TIERS: Readonly<
  Record<CreatorTierId, { readonly productId: string; readonly referenceUsd: number }>
> = {
  tier1: { productId: 'com.evengirl.app.creator.tier1', referenceUsd: 2.99 },
  tier2: { productId: 'com.evengirl.app.creator.tier2', referenceUsd: 6.99 },
  tier3: { productId: 'com.evengirl.app.creator.tier3', referenceUsd: 14.99 },
};

export interface CreatorOffer {
  readonly creatorId: string;
  readonly creatorHandle: string;
  readonly tier: CreatorTierId;
  /** Mağazadan gelen yerelleştirilmiş fiyat — sabit kodlanmaz. */
  readonly priceLabel: string;
  readonly perks: readonly string[];
}

export interface CreatorSubscriptionState {
  readonly creatorId: string;
  readonly active: boolean;
  readonly expiresAtMs: number | null;
  readonly willRenew: boolean;
}

class CreatorSubscriptionsImpl {
  /**
   * Creator'ın teklifini getirir.
   *
   * Fiyat mağazadan okunur; sunucudan gelen `referenceUsd` yalnızca hangi
   * ürünün sorgulanacağını belirler. Sunucudan gelen bir fiyatı göstermek,
   * gösterilen ile tahsil edilenin ayrışmasına ve Guideline 3.1.2 ihlaline
   * yol açar.
   */
  async offerFor(creatorId: string): Promise<Result<CreatorOffer>> {
    // Reşit olmayan kullanıcı creator aboneliği satın alabilir (ebeveyn onayı
    // mağazada), ama yetişkin içerik üreten creator'ların teklifleri kalkan
    // tarafından zaten listelenmez.
    if (!AgeGate.isVerified) {
      return Err(appError('ENTITLEMENT_REQUIRED', 'yaş doğrulanmadı'));
    }

    const meta = await pinnedRequest<{
      creatorHandle: string;
      tier: CreatorTierId;
      perks: string[];
    }>({ path: `/v1/creators/${encodeURIComponent(creatorId)}/offer` });

    if (!meta.ok) return Err(appError('BILLING_UNAVAILABLE', 'creator offer alınamadı'));

    const pkg = await this.packageForTier(meta.value.tier);
    if (!pkg.ok) return pkg;

    return Ok({
      creatorId,
      creatorHandle: meta.value.creatorHandle,
      tier: meta.value.tier,
      // Fiyat MAĞAZADAN, yerelleştirilmiş dize olarak. Kendi kur
      // dönüşümümüzü yapmak hem yanlış hem Guideline 3.1.2 ihlalidir.
      priceLabel: pkg.value.product.priceString,
      perks: meta.value.perks,
    });
  }

  /**
   * Kademe için mağaza paketini bulur.
   *
   * TEK YERDE: bu arama hem teklifi göstermek hem satın almak için gerekli.
   * İki yerde ayrı ayrı yapmak, gösterilen paket ile satın alınan paketin
   * ayrışabilmesi demekti — kullanıcı bir fiyat görüp başka bir ürünü satın
   * alırdı.
   */
  private async packageForTier(tier: CreatorTierId): Promise<Result<PurchasesPackage>> {
    const productId = CREATOR_TIERS[tier].productId;
    try {
      const offerings = await Purchases.getOfferings();
      const pkg = Object.values(offerings.all)
        .flatMap((offering) => offering.availablePackages)
        .find((candidate) => candidate.product.identifier.startsWith(productId));

      if (!pkg) {
        return Err(
          appError('BILLING_UNAVAILABLE', `creator ürünü bulunamadı: ${productId}`, {
            i18nKey: 'creator.productUnavailable',
          }),
        );
      }
      return Ok(pkg);
    } catch (e) {
      log.warn('Creator teklifi yüklenemedi', e);
      return Err(appError('BILLING_UNAVAILABLE', 'offerings failed', { retryable: true }));
    }
  }

  /**
   * Teklifin kendisinden satın alır — arayüzün paketi ayrıca çözmesine
   * gerek kalmadan.
   *
   * Paket araması `packageForTier` ile AYNI yerden geçer; arayüzün kendi
   * aramasını yapması, gösterilen fiyatla tahsil edilenin ayrışma riskini
   * her çağrı yerine dağıtırdı.
   */
  async subscribeToOffer(offer: CreatorOffer): Promise<Result<CreatorSubscriptionState>> {
    const pkg = await this.packageForTier(offer.tier);
    if (!pkg.ok) return pkg;
    return this.subscribe(offer.creatorId, pkg.value);
  }

  /**
   * Creator aboneliği satın alır.
   *
   * Satın alma mağaza üzerinden yapılır; sunucuya YALNIZCA hangi creator'a
   * ait olduğu bildirilir. Yetkinin gerçekten verilip verilmeyeceğine
   * RevenueCat webhook'u ile beslenen backend karar verir — istemcinin
   * "satın aldım" demesi yeterli değildir.
   */
  async subscribe(creatorId: string, pkg: PurchasesPackage): Promise<Result<CreatorSubscriptionState>> {
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);

      // Satın almayı creator'a bağlamak sunucunun işidir; istemci yalnızca
      // ilişkilendirme isteği gönderir ve sonucu okur.
      const linked = await pinnedRequest<CreatorSubscriptionState>({
        path: '/v1/creators/link-subscription',
        method: 'POST',
        body: { creatorId, appUserId: customerInfo.originalAppUserId },
      });

      return linked.ok ? Ok(linked.value) : Err(appError('BILLING_UNAVAILABLE', 'link failed'));
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'PURCHASE_CANCELLED') {
        return Err(appError('BILLING_CANCELLED', 'kullanıcı iptal etti'));
      }
      return Err(appError('BILLING_UNAVAILABLE', 'creator purchase failed', { retryable: true }));
    }
  }

  /** Kullanıcının aktif creator abonelikleri. */
  async active(): Promise<readonly CreatorSubscriptionState[]> {
    const result = await pinnedRequest<{ subscriptions: CreatorSubscriptionState[] }>({
      path: '/v1/creators/subscriptions',
    });
    return result.ok ? result.value.subscriptions : [];
  }
}

export const CreatorSubscriptions = new CreatorSubscriptionsImpl();
