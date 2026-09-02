import { cn } from "@/lib/utils";

type Props = {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
  className?: string;
};

export function CrystalSwitch({ checked, onCheckedChange, label, className }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={cn("flex min-h-11 items-center justify-between gap-4 text-left", className)}
      onClick={() => onCheckedChange(!checked)}
    >
      <span className="text-sm font-medium text-fg">{label}</span>
      <span className="switch-track" data-on={checked ? "true" : "false"}>
        <span className="switch-knob" />
      </span>
    </button>
  );
}
