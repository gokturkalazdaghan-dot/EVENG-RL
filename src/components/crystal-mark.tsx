import { cn } from "@/lib/utils";
import type { CrystalId } from "@/lib/types";
import { useId } from "react";

const SIZE: Record<"xs" | "sm" | "md" | "lg", string> = {
  xs: "1.55rem",
  sm: "2.15rem",
  md: "4.1rem",
  lg: "6.8rem",
};

export function CrystalMark({
  id,
  size = "md",
  className,
  burst = false,
}: {
  id: CrystalId;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  burst?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const g = `cg-${id}-${uid}`;
  const shine = `cs-${id}-${uid}`;
  const spark = `sp-${id}-${uid}`;
  const girl = id === "girl";
  return (
    <span
      className={cn("crystal-mark", id, burst && "refract", className)}
      style={{ width: SIZE[size], height: SIZE[size] }}
      aria-hidden
    >
      {burst ? <span className="crystal-facet" /> : null}
      <svg viewBox="0 0 80 80" className="size-full">
        <defs>
          <linearGradient id={g} x1="12%" y1="0%" x2="92%" y2="100%">
            {girl ? (
              <>
                <stop offset="0%" stopColor="#fff6fb" />
                <stop offset="22%" stopColor="#ffc1e2" />
                <stop offset="48%" stopColor="#ff6aad" />
                <stop offset="72%" stopColor="#9adfff" />
                <stop offset="100%" stopColor="#3aa6ff" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="#f4fbff" />
                <stop offset="20%" stopColor="#9ed4ff" />
                <stop offset="48%" stopColor="#3d8cff" />
                <stop offset="78%" stopColor="#1548c8" />
                <stop offset="100%" stopColor="#06102e" />
              </>
            )}
          </linearGradient>
          <linearGradient id={shine} x1="30%" y1="0%" x2="70%" y2="100%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.95" />
            <stop offset="42%" stopColor="#fff" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <radialGradient id={spark} cx="34%" cy="28%" r="42%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <path
          d="M40 4 L71 22 L64 74 L16 74 L9 22 Z"
          fill={`url(#${g})`}
          stroke="rgba(255,255,255,.72)"
          strokeWidth="1.15"
        />
        <path d="M40 4 L71 22 L40 30 L9 22 Z" fill={`url(#${shine})`} />
        <path d="M40 4 L46 30 L40 74 L34 30 Z" fill="rgba(255,255,255,.38)" />
        <path d="M9 22 L34 30 L16 74 Z" fill="rgba(255,255,255,.14)" />
        <path d="M71 22 L46 30 L64 74 Z" fill="rgba(6,16,46,.22)" />
        <path d="M16 74 L40 42 L64 74 Z" fill="rgba(4,12,36,.32)" />
        <ellipse cx="32" cy="22" rx="7" ry="4.2" fill={`url(#${spark})`} />
        <path d="M58 18 L60.2 23 L65 24.2 L60.2 25.4 L58 30.4 L55.8 25.4 L51 24.2 L55.8 23 Z" fill="#fff" opacity="0.85" />
        <path d="M22 48 L23.2 51 L26.2 51.6 L23.2 52.2 L22 55.2 L20.8 52.2 L17.8 51.6 L20.8 51 Z" fill="#fff" opacity="0.7" />
      </svg>
    </span>
  );
}
