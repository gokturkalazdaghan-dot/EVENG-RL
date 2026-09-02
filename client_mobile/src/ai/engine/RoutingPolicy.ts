/**
 * RoutingPolicy — "bu iş nerede çalışacak?" kararının SAF mantığı.
 *
 * Platform API'si import edilmez; girdi sade veri, çıktı sade karar.
 * Bu mantıktaki hata iki yönde de sessizdir:
 *   - Yanlışlıkla sunucuya yönlendirmek: çevrimdışı çalışabilecek bir iş
 *     "internet gerekli" der ve kullanıcı özelliği kayıp sanır.
 *   - Yanlışlıkla yerele yönlendirmek: cihaz kaldıramaz, işlem yarıda
 *     ölür ve kullanıcı bunu "uygulama çöküyor" olarak yaşar.
 */
export type ExecutionSite = 'local' | 'remote';

export type RoutingRefusal =
  | 'offline-and-no-local-model'
  | 'device-too-weak-and-offline'
  | 'no-execution-path'
  | 'entitlement-required'
  | 'consent-required';

export type RoutingDecision =
  | { readonly kind: 'run'; readonly site: ExecutionSite }
  | { readonly kind: 'refuse'; readonly reason: RoutingRefusal };

export interface RoutingInput {
  /** Cihaz üstünde çalıştırılabilir mi (model kurulu + RAM yeterli). */
  readonly localSupported: boolean;
  /** Bu yetenek için sunucu ucu tanımlı mı. */
  readonly hasRemoteEndpoint: boolean;
  readonly isOnline: boolean;
  /** Cihaz kritik termal durumda mı. */
  readonly thermalCritical: boolean;
  /** Kullanıcı açıkça "sunucuda çalıştır (daha kaliteli)" dedi mi. */
  readonly preferRemote: boolean;
  /** Ücretli yetenek için abonelik var mı. */
  readonly entitled: boolean;
  /** Üretken/yüz araçları için etik onayı alındı mı. */
  readonly consentGranted: boolean;
  /** Yerel çalıştırma yeteneğin ücretsiz katmanında mı. */
  readonly isFree: boolean;
}

export function decideRoute(input: RoutingInput): RoutingDecision {
  // 1) Yetki — para maliyeti olan her yol buradan geçer.
  if (!input.isFree && !input.entitled) {
    return { kind: 'refuse', reason: 'entitlement-required' };
  }

  // 2) Etik onayı — üretken ve yüz araçları için zorunlu.
  if (!input.consentGranted) {
    return { kind: 'refuse', reason: 'consent-required' };
  }

  const remoteUsable = input.hasRemoteEndpoint && input.isOnline;

  // 3) Kritik termal durumda UZAK tercih edilir: cihazı daha fazla ısıtmak,
  //    işlemi yavaşlatmakla kalmaz, sistemin uygulamayı kısıtlamasına yol açar.
  if ((input.preferRemote || input.thermalCritical) && remoteUsable) {
    return { kind: 'run', site: 'remote' };
  }

  // 4) Varsayılan yerel: veri cihazdan çıkmaz, gecikme yok, bant genişliği yok.
  if (input.localSupported) {
    return { kind: 'run', site: 'local' };
  }

  if (remoteUsable) {
    return { kind: 'run', site: 'remote' };
  }

  // 5) Reddetme sebebini AYIRT EDİYORUZ: kullanıcıya gösterilecek mesaj
  //    "internete bağlanın" ile "cihazınız yetersiz" arasında değişir ve
  //    yanlışını göstermek kullanıcıyı boş yere uğraştırır.
  if (!input.isOnline) {
    return {
      kind: 'refuse',
      reason: input.hasRemoteEndpoint ? 'offline-and-no-local-model' : 'device-too-weak-and-offline',
    };
  }
  return { kind: 'refuse', reason: 'no-execution-path' };
}

/**
 * Yerel çalıştırma cihaz gücü yüzünden başarısız olduğunda sunucuya
 * düşülebilir mi.
 *
 * Yalnızca ağ varsa ve sunucu ucu tanımlıysa. Aksi halde kullanıcıya iki kez
 * beklettikten sonra yine hata göstermiş oluruz.
 */
export function canFallbackToRemote(input: {
  hasRemoteEndpoint: boolean;
  isOnline: boolean;
}): boolean {
  return input.hasRemoteEndpoint && input.isOnline;
}

/** Reddetme sebebini kullanıcı mesajının i18n anahtarına çevirir. */
export function refusalI18nKey(reason: RoutingRefusal): string {
  switch (reason) {
    case 'offline-and-no-local-model':
      return 'errors.offlineFeatureUnavailable';
    case 'device-too-weak-and-offline':
      return 'errors.deviceTooWeak';
    case 'entitlement-required':
      return 'paywall.requiredForFeature';
    case 'consent-required':
      return 'ethics.consentRequired';
    case 'no-execution-path':
      return 'errors.MODEL_UNAVAILABLE';
  }
}
