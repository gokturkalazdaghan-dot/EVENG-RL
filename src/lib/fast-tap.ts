import { useMemo, useRef } from "react";

type TapEvent = {
  button?: number;
  pointerType?: string;
  preventDefault?: () => void;
};

/** Fire on pointerdown so iOS never waits 300ms for click. Click is fallback only. */
export function useFastTap(fn?: (e: TapEvent) => void, disabled?: boolean) {
  const last = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  return useMemo(() => {
    const run = (e: TapEvent) => {
      if (disabled || !fnRef.current) return;
      const n = performance.now();
      if (n - last.current < 180) return;
      last.current = n;
      fnRef.current(e);
    };
    return {
      onPointerDown: (e: TapEvent) => {
        if (e.pointerType === "mouse" && e.button && e.button !== 0) return;
        run(e);
      },
      onClick: (e: TapEvent) => run(e),
    };
  }, [disabled]);
}
