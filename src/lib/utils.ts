import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { FeedbackKind } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uid(prefix = "id"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;
}

export function formatMb(mb: number): string {
  if (mb >= 1000) {
    const gb = mb / 1000;
    return `${gb.toLocaleString("tr-TR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} GB`;
  }
  return `${Math.round(mb)} MB`;
}

export function formatPoints(n: number): string {
  return n.toLocaleString("tr-TR").replace(/\./g, " ");
}

export function clamp(n: number, min = 0, max = 255): number {
  return n < min ? min : n > max ? max : n;
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function applyOrder<T extends { id: string }>(items: T[], order?: string[] | null): T[] {
  if (!order?.length) return items;
  const map = new Map(items.map((i) => [i.id, i]));
  const out: T[] = [];
  for (const id of order) {
    const it = map.get(id);
    if (it) {
      out.push(it);
      map.delete(id);
    }
  }
  for (const it of items) if (map.has(it.id)) out.push(it);
  return out;
}

export const FEEDBACK_MAIL = "gokturkalazdaghan@gmail.com";
export const LEGAL_TERMS = "/legal/kullanici-politikasi.pdf";
export const LEGAL_PRIVACY = "/legal/gizlilik-politikasi.pdf";

export function openLegalPdf(href: string) {
  if (typeof window === "undefined") return href;
  window.open(href, "_blank", "noopener,noreferrer");
  return href;
}

const MAIL_KIND: Record<FeedbackKind, string> = {
  geri: "Geri bildirim",
  istek: "İstek",
  sikayet: "Şikayet",
};

export function feedbackMailto(kind: FeedbackKind = "geri", text = ""): string {
  const subject = encodeURIComponent(`EVENGIRL · ${MAIL_KIND[kind]}`);
  const body = encodeURIComponent(text);
  const q = body ? `?subject=${subject}&body=${body}` : `?subject=${subject}`;
  return `mailto:${FEEDBACK_MAIL}${q}`;
}

export function openFeedbackMail(kind: FeedbackKind = "geri", text = ""): string {
  const href = feedbackMailto(kind, text);
  if (typeof window === "undefined") return href;
  try {
    void navigator.clipboard.writeText(FEEDBACK_MAIL);
  } catch {
    /* ignore */
  }
  try {
    const a = document.createElement("a");
    a.href = href;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    window.location.href = href;
  }
  return href;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function bumpDeny(target?: EventTarget | null) {
  if (typeof document === "undefined") return;
  const el = (target instanceof Element ? target : document.activeElement) as HTMLElement | null;
  if (!el) return;
  const btn = el.closest("button") ?? el;
  btn.classList.remove("is-deny");
  void btn.offsetWidth;
  btn.classList.add("is-deny");
  window.setTimeout(() => btn.classList.remove("is-deny"), 240);
}

export function requestPaywall() {
  if (typeof window === "undefined") return;
  bumpDeny();
  const wait = prefersReducedMotion() ? 0 : 90;
  window.setTimeout(() => window.dispatchEvent(new Event("even:paywall")), wait);
}
