import { clinicTilt } from "@/lib/clinic-vision";
import { useEffect } from "react";

export function useParallax() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.documentElement;
    let px = 0;
    let py = 0;
    let tx = 0;
    let ty = 0;
    let raf = 0;
    let lastPtr = 0;

    const loop = () => {
      const tilt = clinicTilt();
      if (tilt.ready && Date.now() - lastPtr > 420) {
        tx = Math.max(-1, Math.min(1, tilt.gamma / 26));
        ty = Math.max(-1, Math.min(1, (tilt.beta - 45) / 40));
      }
      px += (tx - px) * 0.07;
      py += (ty - py) * 0.07;
      root.style.setProperty("--px", String(+px.toFixed(3)));
      root.style.setProperty("--py", String(+py.toFixed(3)));
      raf = window.requestAnimationFrame(loop);
    };

    const onMove = (e: PointerEvent) => {
      lastPtr = Date.now();
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      tx = (e.clientX / w) * 2 - 1;
      ty = (e.clientY / h) * 2 - 1;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    raf = window.requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.cancelAnimationFrame(raf);
      root.style.removeProperty("--px");
      root.style.removeProperty("--py");
    };
  }, []);
}
