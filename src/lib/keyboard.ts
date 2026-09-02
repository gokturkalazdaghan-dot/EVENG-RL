import { useEffect, useState } from "react";

function fieldEl() {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
    ? el
    : null;
}

function readKeyboard() {
  if (typeof window === "undefined") return { kb: 0, vvH: 0, vvTop: 0, overlap: 0 };
  const vv = window.visualViewport;
  const layoutH = window.innerHeight;
  const vvH = vv ? vv.height : layoutH;
  const vvTop = vv ? vv.offsetTop : 0;
  const fromVv = Math.max(0, Math.round(layoutH - vvH));
  const fromTop = Math.round(vvTop);
  let overlap = 0;
  const field = fieldEl();
  if (field && vv) {
    const r = field.getBoundingClientRect();
    const visibleBottom = vv.offsetTop + vv.height;
    overlap = Math.max(0, Math.round(r.bottom + 16 - visibleBottom));
  }
  const raw = Math.max(fromVv, fromTop, overlap);
  const focused = Boolean(field);
  const kb = focused && raw > 80 ? raw : 0;
  return { kb, vvH: Math.round(vvH), vvTop: Math.round(vvTop), overlap };
}

export function useKeyboardInset() {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;
    let until = 0;

    const paint = () => {
      const { kb, vvH, vvTop, overlap } = readKeyboard();
      setInset(kb);
      root.style.setProperty("--kb-inset", `${Math.max(0, kb)}px`);
      root.style.setProperty("--kb-overlap", `${Math.max(0, overlap)}px`);
      if (vvH >= 240) root.style.setProperty("--vv-h", `${vvH}px`);
      root.style.setProperty("--vv-top", `${Math.max(0, vvTop)}px`);
      root.classList.toggle("is-kb", kb > 80);
    };

    const chase = () => {
      paint();
      if (performance.now() < until) {
        frame = window.requestAnimationFrame(chase);
      } else {
        frame = 0;
      }
    };

    const kick = () => {
      until = performance.now() + 520;
      paint();
      if (!frame) frame = window.requestAnimationFrame(chase);
    };

    const vv = window.visualViewport;
    const onBlur = () => window.setTimeout(kick, 50);
    vv?.addEventListener("resize", kick);
    vv?.addEventListener("scroll", kick);
    window.addEventListener("resize", kick);
    window.addEventListener("orientationchange", kick);
    window.addEventListener("focusin", kick);
    window.addEventListener("focusout", onBlur);
    paint();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      vv?.removeEventListener("resize", kick);
      vv?.removeEventListener("scroll", kick);
      window.removeEventListener("resize", kick);
      window.removeEventListener("orientationchange", kick);
      window.removeEventListener("focusin", kick);
      window.removeEventListener("focusout", onBlur);
      root.classList.remove("is-kb");
      root.style.removeProperty("--kb-inset");
      root.style.removeProperty("--kb-overlap");
    };
  }, []);

  return inset;
}
