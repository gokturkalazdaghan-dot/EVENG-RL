import { cn } from "@/lib/utils";
import type { ToolDef, ToolId } from "@/lib/types";
import {
  Aperture,
  Blend,
  Crosshair,
  Droplets,
  Eraser,
  Eye,
  FlipHorizontal2,
  Focus,
  Frame,
  Gem,
  Image as ImageIcon,
  Lamp,
  Layers,
  Pen,
  RotateCw,
  Scan,
  ScanLine,
  Scissors,
  Sparkles,
  Sun,
  SunMedium,
  Triangle,
  Wand2,
  Waves,
  Wind,
} from "lucide-react";

const ICONS: Partial<Record<ToolId, typeof Sparkles>> = {
  auto: Sparkles,
  even: Blend,
  skin: Droplets,
  blemish: Crosshair,
  shape: Scan,
  jaw: Focus,
  restore: Wand2,
  denoise: Waves,
  details: ScanLine,
  sharpen: Aperture,
  dodge: SunMedium,
  erase: Eraser,
  animate: Sun,
  eyes: Eye,
  teeth: Sparkles,
  lipstick: Pen,
  blush: Gem,
  contour: Triangle,
  hair: Wind,
  glow: Gem,
  relight: Lamp,
  bgblur: ImageIcon,
  backdrop: Layers,
  rotate: RotateCw,
  flip: FlipHorizontal2,
  hd: Sparkles,
  unblur: Focus,
  colorize: Blend,
  eyecolor: Eye,
  cutout: Scissors,
  frame: Frame,
  smile: Sparkles,
  brows: Pen,
  lashes: Eye,
  sparkle: Gem,
  vintage: Aperture,
  frost: Wind,
  shadow: Triangle,
  matte: Blend,
  tan: Sun,
  freckle: Gem,
  darkcircle: Eye,
  plump: Pen,
  eyeshadow: Gem,
  liner: Pen,
  letterbox: Frame,
  dehaze: Wind,
  clarity: Aperture,
};

export function ToolCard({
  tool,
  locked,
  active,
  onPick,
}: {
  tool: ToolDef;
  locked: boolean;
  active: boolean;
  onPick: () => void;
}) {
  const Icon = ICONS[tool.id] ?? Sparkles;
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        "panel flex min-h-16 flex-col items-start gap-1 rounded-2xl p-2.5 text-left",
        active && "shadow-[0_0_0_1px_rgb(30_230_160/0.45)]",
      )}
    >
      <span
        className={cn(
          "grid size-8 place-items-center rounded-lg",
          tool.tone === "green" && "bg-crystal/15 text-crystal",
          tool.tone === "orange" && "bg-ember/15 text-ember",
          tool.tone === "blue" && "bg-orbit/15 text-orbit",
        )}
      >
        <Icon className="size-4" strokeWidth={2.1} />
      </span>
      <p className="text-xs leading-tight font-medium">{tool.name}</p>
      <p className={cn("text-[10px] font-semibold tracking-wide uppercase", locked ? "text-ember" : "text-muted")}>
        {locked ? "Pro" : tool.tap ? "Dokun" : "Ücretsiz"}
      </p>
    </button>
  );
}
