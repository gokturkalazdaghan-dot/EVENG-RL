import { useFastTap } from "@/lib/fast-tap";
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type Tone = "green" | "orange" | "blue" | "azure" | "ghost";
type Size = "sm" | "md" | "lg" | "xl";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: Tone;
  size?: Size;
  pill?: boolean;
};

const toneClass: Record<Tone, string> = {
  green: "",
  orange: "ember",
  blue: "orbit",
  azure: "azure",
  ghost: "ghost",
};

export function CrystalButton({
  tone = "green",
  size = "md",
  pill,
  className,
  type = "button",
  children,
  onClick,
  disabled,
  ...props
}: Props) {
  const tap = useFastTap(onClick as ((e: { preventDefault?: () => void }) => void) | undefined, disabled);
  return (
    <button
      type={type}
      disabled={disabled}
      className={cn("btn-3d", size, toneClass[tone], pill && "pill", className)}
      {...props}
      {...tap}
    >
      {children}
    </button>
  );
}
