import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  tall?: boolean;
};

export function Sheet({ open, onClose, title, children, tall }: Props) {
  return (
    <div
      className={cn(
        "absolute inset-0 z-40",
        open ? "pointer-events-auto" : "pointer-events-none",
      )}
    >
      <button
        type="button"
        aria-label="Kapat"
        className={cn(
          "absolute inset-0 bg-bg-deep/70 transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 panel-elevated rounded-t-3xl px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-3",
          "transition-transform duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          tall ? "max-h-[88%]" : "max-h-[78%]",
          open ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-fg/20" />
        {title ? (
          <h2 className="mb-4 font-display text-xl font-semibold tracking-tight text-fg">
            {title}
          </h2>
        ) : null}
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
