/**
 * Google Play Faturalandırma — istemci tarafı sözleşmesi.
 *
 * ─── NEYİN YERİNE GELDİ ──────────────────────────────────────────────
 * Eski `purchasePlaySku` şunu yapıyordu:
 *
 *     set({ proUntil: Date.now() + plan.days * 24 * 3600_000 });
 *
 * Google Play'e hiç gitmiyordu. Ne satın alma token'ı, ne doğrulama, ne
 * BillingClient — depoda `purchaseToken` kelimesi bile geçmiyordu. Sonuç:
 * kimse ödeme YAPAMIYOR, ve "satın al"a basan herkes bedava PRO oluyordu.
 * Kullanıcıya da "Google Play üzerinden açıldı" yazıyordu — olmamış bir
 * satın almayı olmuş göstermek, bu dosyanın yapabileceği en zararlı şey.
 *
 * ─── BURASI SAF ──────────────────────────────────────────────────────
 * Yetki hesabı (`entitlementFrom`) satın alma KAYITLARINDAN türetiliyor,
 * serbest gezen bir zaman damgasından değil. Bu ayrım sayesinde kural
 * tarayıcısız test edilebiliyor — para yolundaki bir hata sessizdir:
 * ya ödeyen kişi kilitli kalır ya ödemeyen bedava kullanır, ikisi de
 * çalışma anında hata vermez.
 *
 * ─── NATIVE TARAFA DÜŞEN ─────────────────────────────────────────────
 * Bu modül `window.EvenBilling` köprüsünü çağırır. Köprünün Kotlin
 * karşılığı `android/` içinde yazılmalı (bkz. docs/BILLING.md). Köprü
 * YOKSA satın alma BAŞARISIZ olur — sessizce PRO açılmaz.
 */

import { PLAY_SKUS, type PlaySku } from "./play-store.ts";

/** Play Billing `Purchase` nesnesinin bu uygulamanın kullandığı alanları. */
export interface PlayPurchase {
  readonly productId: string;
  readonly purchaseToken: string;
  readonly purchaseTimeMs: number;
  /** Play `Purchase.PurchaseState`: 1 = PURCHASED, 2 = PENDING. */
  readonly state: "purchased" | "pending" | "unspecified";
  /** Onaylanmamış satın alma Play tarafından 3 gün sonra İADE EDİLİR. */
  readonly acknowledged: boolean;
  readonly autoRenewing: boolean;
}

export type EntitlementSource = "play" | "none";

export interface Entitlement {
  readonly pro: boolean;
  /** PRO'nun bittiği an (epoch ms). PRO değilse 0. */
  readonly untilMs: number;
  readonly source: EntitlementSource;
  /** Onay bekleyen token'lar — çağıranın `acknowledge` etmesi gerekir. */
  readonly needsAcknowledge: readonly string[];
}

const DAY_MS = 24 * 3600_000;

/** productId → gün sayısı. Bilinmeyen ürün yetki VERMEZ. */
const DAYS_BY_PRODUCT: ReadonlyMap<string, number> = new Map(
  PLAY_SKUS.map((s) => [s.productId, s.days]),
);

function isUsable(p: unknown): p is PlayPurchase {
  if (!p || typeof p !== "object") return false;
  const q = p as Partial<PlayPurchase>;
  return (
    typeof q.productId === "string" &&
    typeof q.purchaseToken === "string" &&
    q.purchaseToken.length > 0 &&
    typeof q.purchaseTimeMs === "number" &&
    Number.isFinite(q.purchaseTimeMs)
  );
}

/**
 * Satın alma kayıtlarından yetkiyi hesaplar.
 *
 * KURALLAR, HER BİRİ BİR HATAYI ENGELLİYOR:
 *
 * · `state !== "purchased"` yetki VERMEZ. Play'de PENDING, kullanıcının
 *   "mağazada nakit ödeyeceğim" dediği durumdur. Bunu kabul etmek,
 *   parayı hiç almadan PRO açmak demek — bu yolun klasik hatası budur.
 *
 * · Token'sız kayıt yok sayılır. Token, satın almanın tek kanıtıdır;
 *   token'sız bir kayıt ya bozuk ya uydurma.
 *
 * · Bilinmeyen `productId` yetki VERMEZ. Fiyat listesinden kaldırılmış
 *   ya da yanlış yazılmış bir ürün, "kaç gün" sorusuna cevap veremez;
 *   tahmin etmek yerine reddediliyor.
 *
 * · Birden çok geçerli satın almada EN GEÇ biten kazanır. Abonelik
 *   yenilendiğinde Play yeni bir kayıt döndürür; en büyüğü almak,
 *   yenilemeyi kendiliğinden doğru işler.
 *
 * · Süresi geçmiş kayıt yetki vermez, ama `needsAcknowledge` listesinden
 *   düşmez: onaylanmamış her satın alma onaylanmalıdır, yoksa Play
 *   parayı iade eder.
 */
export function entitlementFrom(
  purchases: readonly unknown[],
  nowMs: number = Date.now(),
): Entitlement {
  let untilMs = 0;
  const needsAcknowledge: string[] = [];

  for (const raw of purchases) {
    if (!isUsable(raw)) continue;
    if (raw.state !== "purchased") continue;

    const days = DAYS_BY_PRODUCT.get(raw.productId);
    if (days === undefined) continue;

    if (!raw.acknowledged) needsAcknowledge.push(raw.purchaseToken);

    const end = raw.purchaseTimeMs + days * DAY_MS;
    if (end > untilMs) untilMs = end;
  }

  const pro = untilMs > nowMs;
  return {
    pro,
    untilMs: pro ? untilMs : 0,
    source: pro ? "play" : "none",
    needsAcknowledge,
  };
}

// ─── NATIVE KÖPRÜ ─────────────────────────────────────────────────────

export interface BillingBridge {
  /** BillingClient bağlandı mı. */
  isReady?: () => boolean;
  /** Mevcut satın almalar, JSON dizi dizesi (Play `queryPurchasesAsync`). */
  queryPurchases?: () => string;
  /** Satın alma akışını başlatır. Sonuç `onPurchases` ile geri döner. */
  launchPurchase?: (productId: string) => void;
  /** Play iade etmesin diye onaylar (`acknowledgePurchase`). */
  acknowledge?: (purchaseToken: string) => void;
}

type BillingWindow = Window & {
  EvenBilling?: BillingBridge;
  /** Native taraf satın alma sonucunu buraya yazar. */
  onEvenPurchases?: (json: string) => void;
};

export function billingBridge(): BillingBridge | null {
  if (typeof window === "undefined") return null;
  const b = (window as BillingWindow).EvenBilling;
  return b && typeof b === "object" ? b : null;
}

/** Faturalandırma gerçekten kullanılabilir mi (köprü var VE hazır). */
export function billingAvailable(): boolean {
  const b = billingBridge();
  if (!b) return false;
  // `isReady` yoksa köprünün varlığı yeterli sayılır; varsa sözüne bakılır.
  return typeof b.isReady === "function" ? b.isReady() === true : true;
}

export type PurchaseFailure =
  /** Köprü yok — uygulama tarayıcıda ya da WebView kabuğu eski. */
  | "no-bridge"
  /** BillingClient bağlanamadı (Play Store yok / güncel değil). */
  | "not-ready"
  /** Bilinmeyen SKU. */
  | "unknown-sku"
  /** Native taraf `launchPurchase` sunmuyor. */
  | "unsupported"
  /** Akış başladı ama kullanıcı tamamlamadı / Play hata döndürdü. */
  | "not-completed";

export type PurchaseResult =
  | { readonly ok: true; readonly entitlement: Entitlement }
  | { readonly ok: false; readonly reason: PurchaseFailure };

/** JSON'u güvenle diziye çevirir. Bozuksa BOŞ dizi — yetki vermez. */
export function parsePurchases(json: unknown): readonly unknown[] {
  if (typeof json !== "string" || json.trim().length === 0) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Bozuk JSON'u "satın alma yok" saymak FAIL-CLOSED: ödeyen kullanıcı
    // bir kez daha "geri yükle"ye basar. Ters varsayım bedava PRO dağıtırdı.
    return [];
  }
}

/**
 * Cihazdaki mevcut satın almaları okuyup yetkiyi döndürür.
 *
 * UYGULAMA HER AÇILIŞTA BUNU ÇAĞIRMALI. Play, aboneliği kendi tarafında
 * tutar; uygulama yeniden kurulduğunda localStorage silinir ama satın alma
 * durur. Bu çağrı olmadan ödeyen kullanıcı, telefonunu değiştirdiğinde
 * PRO'sunu kaybeder ve haklı olarak iade ister.
 */
export function restoreEntitlement(nowMs: number = Date.now()): Entitlement {
  const b = billingBridge();
  if (!b || typeof b.queryPurchases !== "function") {
    return { pro: false, untilMs: 0, source: "none", needsAcknowledge: [] };
  }
  let json: string;
  try {
    json = b.queryPurchases();
  } catch {
    return { pro: false, untilMs: 0, source: "none", needsAcknowledge: [] };
  }
  const ent = entitlementFrom(parsePurchases(json), nowMs);
  acknowledgeAll(ent.needsAcknowledge);
  return ent;
}

/** Onaylanmamış satın almaları onaylar — yoksa Play 3 gün sonra iade eder. */
export function acknowledgeAll(tokens: readonly string[]): void {
  const b = billingBridge();
  if (!b || typeof b.acknowledge !== "function") return;
  for (const t of tokens) {
    try {
      b.acknowledge(t);
    } catch {
      // Onay başarısızsa satın alma geçerliliğini yitirmez; bir sonraki
      // açılışta `restoreEntitlement` yeniden dener.
    }
  }
}

/**
 * Satın alma akışını başlatır ve sonucu bekler.
 *
 * KÖPRÜ YOKSA HATA DÖNER, PRO AÇILMAZ. Eski kodun yaptığı buydu ve
 * uygulamanın gelir modelini yok ediyordu.
 */
export function purchase(
  sku: PlaySku,
  timeoutMs = 180_000,
): Promise<PurchaseResult> {
  const b = billingBridge();
  if (!b) return Promise.resolve({ ok: false, reason: "no-bridge" });
  if (!billingAvailable()) return Promise.resolve({ ok: false, reason: "not-ready" });
  if (typeof b.launchPurchase !== "function") {
    return Promise.resolve({ ok: false, reason: "unsupported" });
  }
  const plan = PLAY_SKUS.find((s) => s.id === sku);
  if (!plan) return Promise.resolve({ ok: false, reason: "unknown-sku" });

  return new Promise<PurchaseResult>((resolve) => {
    const w = window as BillingWindow;
    const previous = w.onEvenPurchases;
    let settled = false;

    const finish = (result: PurchaseResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      w.onEvenPurchases = previous;
      resolve(result);
    };

    // Kullanıcı Play sayfasını açık bırakıp geri dönmezse süresiz
    // beklemeyelim: zaman aşımı, ekranın sonsuza kadar "yükleniyor"
    // kalmasını engelliyor.
    const timer = window.setTimeout(() => finish({ ok: false, reason: "not-completed" }), timeoutMs);

    w.onEvenPurchases = (json: string) => {
      const ent = entitlementFrom(parsePurchases(json));
      acknowledgeAll(ent.needsAcknowledge);
      finish(ent.pro ? { ok: true, entitlement: ent } : { ok: false, reason: "not-completed" });
    };

    try {
      b.launchPurchase!(plan.productId);
    } catch {
      finish({ ok: false, reason: "not-completed" });
    }
  });
}

/** Kullanıcıya gösterilecek hata metni. */
export function purchaseFailureText(reason: PurchaseFailure): string {
  switch (reason) {
    case "no-bridge":
      return "Satın alma yalnızca Google Play'den kurulan uygulamada yapılabilir.";
    case "not-ready":
      return "Google Play Faturalandırma bağlanamadı. Play Store'u güncelleyip tekrar deneyin.";
    case "unknown-sku":
      return "Bu paket şu anda satışta değil.";
    case "unsupported":
      return "Uygulamanın bu sürümü satın almayı desteklemiyor. Play Store'dan güncelleyin.";
    case "not-completed":
      return "Satın alma tamamlanmadı. Ücret alınmadıysa tekrar deneyebilirsiniz.";
  }
}
