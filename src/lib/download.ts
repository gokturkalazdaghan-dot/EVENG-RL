import { emitEven } from "@/lib/play-store";
import { isPro, useApp } from "@/lib/store";
import { prefersReducedMotion, bumpDeny } from "@/lib/utils";

type Pending = { src: string; name: string };
let pending: Pending | null = null;

type Bridge = {
  saveImage?: (d: string, n: string) => void;
  saveVideo?: (d: string, n: string) => void;
  saveMedia?: (d: string, n: string) => void;
};

function bridge(): Bridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { EvenBridge?: Bridge }).EvenBridge;
}

function nativeSave(src: string, name: string): boolean {
  const b = bridge();
  if (!b) return false;
  if (b.saveMedia) {
    b.saveMedia(src, name);
    return true;
  }
  if (/\.(mp4|webm|mov)$/i.test(name) && b.saveVideo) {
    b.saveVideo(src, name);
    return true;
  }
  if (b.saveImage && src.startsWith("data:")) {
    b.saveImage(src, name);
    return true;
  }
  return false;
}

function iosLike() {
  return typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function anchorSave(src: string, name: string) {
  const a = document.createElement("a");
  a.href = src;
  a.download = name;
  a.rel = "noopener";
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function toBlob(src: string): Promise<Blob> {
  if (src.startsWith("data:")) {
    const res = await fetch(src);
    return res.blob();
  }
  if (src.startsWith("blob:")) {
    const res = await fetch(src);
    return res.blob();
  }
  const res = await fetch(src);
  return res.blob();
}

async function shareOrSave(src: string, name: string) {
  try {
    const blob = await toBlob(src);
    const type = blob.type || (/\.webm$/i.test(name) ? "video/webm" : /\.mp4$/i.test(name) ? "video/mp4" : "image/jpeg");
    const file = new File([blob], name, { type });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      useApp.getState().flash("Kaydedildi.");
      return;
    }
    const url = URL.createObjectURL(blob);
    if (iosLike()) {
      window.open(url, "_blank", "noopener");
      useApp.getState().flash("Açıldı. Basılı tutup kaydedin.");
      window.setTimeout(() => URL.revokeObjectURL(url), 20_000);
      return;
    }
    if (nativeSave(src.startsWith("data:") ? src : url, name)) {
      useApp.getState().flash("Galeriye kaydedildi.");
      return;
    }
    anchorSave(url, name);
    useApp.getState().flash("İndirildi.");
    window.setTimeout(() => URL.revokeObjectURL(url), 8000);
  } catch {
    if (nativeSave(src, name)) {
      useApp.getState().flash("Galeriye kaydedildi.");
      return;
    }
    anchorSave(src, name);
    useApp.getState().flash("İndirildi.");
  }
}

function deliver(src: string, name: string): boolean {
  if (typeof document === "undefined") return false;
  void shareOrSave(src, name);
  return true;
}

export function gatedDownload(src: string, name: string): boolean {
  const s = useApp.getState();
  if (!isPro(s.proUntil)) {
    pending = { src, name };
    bumpDeny();
    const wait = prefersReducedMotion() ? 0 : 90;
    window.setTimeout(() => emitEven("paywall"), wait);
    s.flash("İndirmek için Google Play PRO gerekir.");
    return false;
  }
  pending = null;
  return deliver(src, name);
}

export function flushPendingDownload(): boolean {
  if (!pending) return false;
  const next = pending;
  pending = null;
  return gatedDownload(next.src, next.name);
}
