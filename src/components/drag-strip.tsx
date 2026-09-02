import { cn, prefersReducedMotion } from "@/lib/utils";
import { useRef, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";

type Props = {
  className?: string;
  onReorder: (from: number, to: number) => void;
  children: ReactNode;
};

export function DragStrip({ className, onReorder, children }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<{ from: number; x: number; y: number; live: boolean } | null>(null);
  const hold = useRef<number>(0);
  const skipped = useRef(false);

  function indexAt(target: EventTarget | null) {
    const el = root.current;
    if (!el || !(target instanceof Element)) return -1;
    const item = target.closest("[data-drag-i]");
    if (!item || !el.contains(item)) return -1;
    const n = Number(item.getAttribute("data-drag-i"));
    return Number.isFinite(n) ? n : -1;
  }

  function snapshot() {
    const map = new Map<Element, DOMRect>();
    root.current?.querySelectorAll("[data-drag-i]").forEach((node) => {
      map.set(node, node.getBoundingClientRect());
    });
    return map;
  }

  function playFlip(first: Map<Element, DOMRect>) {
    if (prefersReducedMotion()) return;
    requestAnimationFrame(() => {
      first.forEach((rect, el) => {
        if (!el.isConnected) return;
        const last = el.getBoundingClientRect();
        const dx = rect.left - last.left;
        const dy = rect.top - last.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
        el.getAnimations().forEach((a) => a.cancel());
        el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], {
          duration: 220,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        });
      });
    });
  }

  function armLive() {
    const d = drag.current;
    if (!d || d.live) return;
    d.live = true;
    skipped.current = true;
  }

  function onDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    if (e.target instanceof Element && e.target.closest("input, textarea, label, .color-tile, .color-boost, .range-crystal")) return;
    const from = indexAt(e.target);
    if (from < 0) return;
    skipped.current = false;
    drag.current = { from, x: e.clientX, y: e.clientY, live: false };
    window.clearTimeout(hold.current);
    hold.current = window.setTimeout(armLive, 260);
  }

  function onMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    if (!d.live) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 40) return;
      armLive();
      try {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    const to = indexAt(e.target);
    if (to < 0 || to === d.from) return;
    const first = snapshot();
    onReorder(d.from, to);
    d.from = to;
    playFlip(first);
  }

  function onUp() {
    window.clearTimeout(hold.current);
    hold.current = 0;
    drag.current = null;
  }

  function onClickCapture(e: React.MouseEvent<HTMLDivElement>) {
    if (!skipped.current) return;
    skipped.current = false;
    e.preventDefault();
    e.stopPropagation();
  }

  return (
    <div
      ref={root}
      className={cn(className)}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onClickCapture={onClickCapture}
    >
      {children}
    </div>
  );
}
