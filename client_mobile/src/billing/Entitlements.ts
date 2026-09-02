/**
 * Entitlements — "kullanıcı Pro mu?" sorusunun tek cevabı.
 *
 * İKİ KATMANLI DOĞRULUK
 *   1. Mağaza/RevenueCat yanıtı — hızlı, çevrimdışı çalışır, UI'ı anında açar.
 *   2. Sunucu doğrulaması      — tek gerçek kaynak (source of truth).
 *
 * Neden iki katman: İstemcideki hiçbir değer güvenilir değildir. Rootlu bir
 * cihazda `isPro = true` yapmak dakikalar sürer. Bu yüzden UI'ı istemci
 * yanıtıyla açıyoruz (kullanıcı deneyimi için), ama PARA MALİYETİ OLAN her
 * sunucu çağrısı (uzak AI çıkarımı) backend'in kendi entitlement kaydına
 * bakar — istemcinin iddiasına değil.
 *
 * Backend, RevenueCat webhook'uyla beslenir:
 *   server/revenuecat-webhook.example.js
 *
 * Sonuç: istemci kilidi tamamen kırılsa bile ücretli sunucu özelliği açılmaz.
 * Kırılan tek şey, cihaz üstünde zaten çalışabilen yerel araçlardır.
 */
import { createLogger } from '@/core/logging/Logger';
import { PRO_ENTITLEMENT } from '@/billing/Products';

const log = createLogger('Entitlements');

export type EntitlementSource = 'store' | 'server' | 'none';

export interface EntitlementState {
  readonly isPro: boolean;
  readonly source: EntitlementSource;
  /** Abonelik bitiş zamanı (ms); süresiz/bilinmiyorsa null. */
  readonly expiresAtMs: number | null;
  readonly willRenew: boolean;
  /** Deneme süresi içinde mi. */
  readonly inTrial: boolean;
  /** Ödeme sorunu tespit edildi mi (grace period). */
  readonly billingIssue: boolean;
  readonly checkedAtMs: number;
}

export const ANONYMOUS_STATE: EntitlementState = {
  isPro: false,
  source: 'none',
  expiresAtMs: null,
  willRenew: false,
  inTrial: false,
  billingIssue: false,
  checkedAtMs: 0,
};

type Listener = (state: EntitlementState) => void;

class EntitlementsImpl {
  private state: EntitlementState = ANONYMOUS_STATE;
  private readonly listeners = new Set<Listener>();

  get current(): EntitlementState {
    return this.state;
  }

  /** UI kilitleri bunu okur. Sunucu çağrıları OKUMAZ — orada backend karar verir. */
  get isPro(): boolean {
    return this.state.isPro;
  }

  get entitlementId(): string {
    return PRO_ENTITLEMENT;
  }

  update(next: EntitlementState): void {
    const changed =
      next.isPro !== this.state.isPro ||
      next.source !== this.state.source ||
      next.billingIssue !== this.state.billingIssue;

    this.state = next;
    if (!changed) return;

    log.info(`Yetki: ${next.isPro ? 'pro' : 'ücretsiz'} (${next.source})`);
    this.listeners.forEach((listener) => listener(next));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  reset(): void {
    this.update(ANONYMOUS_STATE);
  }
}

export const Entitlements = new EntitlementsImpl();

/**
 * Sunucu ve istemci yanıtını birleştirir.
 *
 * ÇAKIŞMA KURALI: Sunucu "hayır" diyorsa sonuç HAYIR'dır — istemci "evet"
 * dese bile. Tersi de doğru değil: sunucu "evet" derken istemci henüz
 * senkronize olmamış olabilir (satın alma yeni yapılmış), o durumda sunucuya
 * güveniriz. Yani sunucu her iki yönde de kazanır.
 *
 * Sunucuya ULAŞILAMIYORSA istemci yanıtı kullanılır: uçaktaki bir aboneye
 * "aboneliğiniz yok" demek, kaçak kullanıma izin vermekten daha kötüdür.
 */
export function reconcile(
  store: EntitlementState,
  server: EntitlementState | null,
): EntitlementState {
  if (!server) return store;
  return { ...server, source: 'server' };
}
