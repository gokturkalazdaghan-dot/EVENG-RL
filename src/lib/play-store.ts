export const PLAY = {
  packageId: "com.evenaistudio.app",
  developer: "armanalabs",
  appName: "EVENGIRL",
  web: "https://play.google.com/store/apps/details?id=com.evenaistudio.app",
  market: "market://details?id=com.evenaistudio.app",
  intent:
    "intent://details?id=com.evenaistudio.app#Intent;scheme=market;package=com.android.vending;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.evenaistudio.app;end",
  review:
    "https://play.google.com/store/apps/details?id=com.evenaistudio.app&showAllReviews=true",
} as const;

export type PlaySku = "weekly" | "monthly" | "yearly";

export const PLAY_SKUS: {
  id: PlaySku;
  productId: string;
  title: string;
  period: string;
  price: string;
  note: string;
  days: number;
}[] = [
  {
    id: "weekly",
    productId: "even_pro_weekly",
    title: "Haftalık PRO",
    period: "7 gün",
    price: "$3.99",
    note: "İstediğiniz an iptal. Play Faturalandırma.",
    days: 7,
  },
  {
    id: "monthly",
    productId: "even_pro_monthly",
    title: "Aylık PRO",
    period: "30 gün",
    price: "$9.99",
    note: "En çok seçilen. Google Play faturalandırır.",
    days: 30,
  },
  {
    id: "yearly",
    productId: "even_pro_yearly",
    title: "Yıllık PRO",
    period: "12 ay",
    price: "$49.99",
    note: "2 ay hediye. Otomatik yenilenir.",
    days: 365,
  },
];

export const PLAY_SHOTS = [
  { src: "/media/portrait-zeynep.jpg", alt: "Portre stüdyo" },
  { src: "/media/street-night.jpg", alt: "Sokak gece" },
  { src: "/media/loft.jpg", alt: "İç mekân" },
  { src: "/media/forest.jpg", alt: "Doğa look" },
] as const;

export function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    nav.standalone === true
  );
}

/** True inside the Android WebView shell (EVEN AI APK). */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as Window & { EVEN_NATIVE?: boolean; EvenBridge?: unknown };
  if (w.EVEN_NATIVE === true || w.EvenBridge) return true;
  const ua = navigator.userAgent || "";
  return /; wv\)/i.test(ua) || /WebView/i.test(ua);
}

export function cameFromPlay(): boolean {
  if (typeof window === "undefined") return false;
  const q = new URLSearchParams(window.location.search);
  const src = (q.get("utm_source") ?? q.get("referrer") ?? "").toLowerCase();
  return src.includes("google-play") || src.includes("playstore") || q.get("play") === "installed";
}

export type PlayOpenTarget = "listing" | "review";

/** Opens the real Play Store on Android; returns false so the in-app listing can take over in preview. */
export function tryOpenPlayStore(target: PlayOpenTarget = "listing"): boolean {
  if (typeof window === "undefined") return false;
  const url = target === "review" ? PLAY.review : PLAY.web;
  if (!isAndroid()) return false;
  try {
    const gone = window.open(PLAY.market, "_blank", "noopener");
    if (!gone) {
      window.location.href = PLAY.intent;
    }
    window.setTimeout(() => {
      if (!document.hidden) window.open(url, "_blank", "noopener");
    }, 700);
    return true;
  } catch {
    try {
      window.open(url, "_blank", "noopener");
      return true;
    } catch {
      return false;
    }
  }
}

export function emitEven(name: "play" | "paywall" | "feedback") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(`even:${name}`));
}

export function skuById(id: PlaySku) {
  return PLAY_SKUS.find((s) => s.id === id) ?? PLAY_SKUS[1];
}
