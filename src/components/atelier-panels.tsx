import { DragStrip } from "@/components/drag-strip";
import { gatedDownload } from "@/lib/download";
import {
  ADJUST_SLIDERS,
  BACKDROPS,
  COLLAGE_LAYOUTS,
  EVEN_BRUSH_TOOLS,
  EVEN_CORE_TOOLS,
  EVEN_SIGNATURE_TOOLS,
  EYE_COLORS,
  FRAME_STYLES,
  HAIR_COLORS,
  LIGHTS,
  LIP_COLORS,
  MOTION_STYLES,
  RATIOS,
  SHADOW_COLORS,
  STICKERS,
  TAKES,
  TEMPLATES,
  looksFor,
  templatesFor,
  toolsForAtelier,
} from "@/lib/catalog";
import { gradeCss } from "@/lib/templates";
import { isBrushTool } from "@/lib/fx";
import { isPro, useApp } from "@/lib/store";
import { applyOrder, cn, moveItem, requestPaywall } from "@/lib/utils";
import type { AtelierId, Template, ToolDef } from "@/lib/types";
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
import { useEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";

const ICONS: Partial<Record<ToolDef["id"], typeof Sparkles>> = {
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

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  gatedDownload(url, name);
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function Rail({ children }: { children: ReactNode }) {
  return <div className="studio-rail-track">{children}</div>;
}

const FX_TINT: Partial<Record<string, string>> = {
  auto: "#ff8ec8",
  even: "#e8c4a8",
  skin: "#f0c9b0",
  blemish: "#d4a078",
  erase: "#9aa4b2",
  dodge: "#ffe08a",
  lipstick: "#c1124a",
  blush: "#e07090",
  contour: "#8a5a48",
  hair: "#3a2a28",
  glow: "#ffd0e6",
  eyes: "#6ec4ff",
  teeth: "#f4f0e4",
  restore: "#c8b4ff",
  details: "#9ad4c8",
  denoise: "#8ab4d4",
  hd: "#b8e0ff",
  unblur: "#9cc4e8",
  colorize: "#ff9a4d",
  vintage: "#c4a070",
  frost: "#b8d4e8",
  tan: "#c48448",
  matte: "#c8b8b0",
  relight: "#ffd48a",
  smile: "#ffb0c8",
  plump: "#e06080",
};

function ribbonOf(id: string) {
  return FX_TINT[id] ?? "#ff4d9a";
}

function FilterThumb({
  tpl,
  active,
  onPick,
  index,
}: {
  tpl: Template;
  active: boolean;
  onPick: () => void;
  index: number;
}) {
  const face = useApp((s) => {
    const p = s.projects.find((x) => x.id === s.activeProjectId);
    const img = (s.draftImage as string | null) || s.latestOf(p)?.image || "";
    return img.startsWith("data:") || img.startsWith("blob:") ? img : "";
  });
  const tint = tpl.grade.warmth > 8 ? "#e8a060" : tpl.grade.warmth < -8 ? "#7aa0c8" : tpl.grade.saturate > 1.1 ? "#ff6eb4" : "#c4a888";
  return (
    <button type="button" data-drag-i={index} onClick={onPick} className={cn("filter-thumb", active && "on")}>
      <img src={face || tpl.preview} alt={tpl.name} style={{ filter: gradeCss(tpl.grade) }} />
      <span>{tpl.name}</span>
      <i className="fx-ribbon" style={{ background: tint, boxShadow: `0 0 8px ${tint}` }} />
    </button>
  );
}

function FeatureChip({
  label,
  hint,
  on,
  locked,
  onPick,
  icon: Icon,
  index,
  tint,
}: {
  label: string;
  hint?: string;
  on?: boolean;
  locked?: boolean;
  onPick: () => void;
  icon?: typeof Sparkles;
  index?: number;
  tint?: string;
}) {
  const Glyph = Icon ?? Sparkles;
  const color = tint || ribbonOf(label.toLowerCase());
  return (
    <button
      type="button"
      data-drag-i={index}
      onClick={onPick}
      className={cn("feature-chip", on && "on")}
    >
      <span className="feature-chip-ico">
        <Glyph className="size-3.5" strokeWidth={2.1} />
      </span>
      <span className="feature-chip-name">{label}</span>
      {hint || locked ? (
        <span className={cn("feature-chip-hint", locked && "pro")}>{locked ? "PRO" : hint}</span>
      ) : null}
      <i className="fx-ribbon" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
    </button>
  );
}

function Intensity() {
  const intensity = useApp((s) => s.intensity);
  const setIntensity = useApp((s) => s.setIntensity);
  return (
    <div className="flex items-center gap-2 px-0.5">
      <span className="shrink-0 text-[10px] font-semibold tracking-wide uppercase" style={{ color: "#2a141c" }}>Yoğunluk</span>
      <input
        type="range"
        min={10}
        max={100}
        value={intensity}
        onChange={(e) => setIntensity(Number(e.target.value))}
        className="range-crystal min-h-9 w-full"
      />
      <span className="w-7 shrink-0 text-right text-[11px] tabular-nums text-fg">{intensity}</span>
    </div>
  );
}

function BrushBar() {
  const brushSize = useApp((s) => s.brushSize);
  const setBrushSize = useApp((s) => s.setBrushSize);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 px-0.5">
        <span className="shrink-0 text-[10px] font-semibold tracking-wide text-muted uppercase">Fırça</span>
        <input
          type="range"
          min={12}
          max={90}
          value={brushSize}
          onChange={(e) => setBrushSize(Number(e.target.value))}
          className="range-crystal min-h-9 w-full"
        />
        <span className="w-7 shrink-0 text-right text-[11px] tabular-nums text-fg">{brushSize}</span>
      </div>
      <Intensity />
    </div>
  );
}

function ColorBoost() {
  const adjustments = useApp((s) => s.adjustments);
  const setAdjust = useApp((s) => s.setAdjust);
  const start = useRef({ x: 0, v: 0, live: false });
  const sat = adjustments.saturate;
  const pct = (sat + 50) / 100;

  function down(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    start.current = { x: e.clientX, v: sat, live: true };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }
  function move(e: ReactPointerEvent<HTMLDivElement>) {
    if (!start.current.live) return;
    e.preventDefault();
    const dx = e.clientX - start.current.x;
    const next = Math.max(-50, Math.min(50, start.current.v + dx * 0.55));
    setAdjust("saturate", Math.round(next));
  }
  function up() {
    start.current.live = false;
  }

  return (
    <div className="color-boost">
      <span className="color-boost-label">Renk</span>
      <div
        className="color-boost-track"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <span className="color-boost-knob" style={{ left: `${pct * 100}%` }} />
      </div>
      <span className="w-7 shrink-0 text-right text-[11px] tabular-nums text-fg">{sat}</span>
    </div>
  );
}

function ColorStrip() {
  const adjustments = useApp((s) => s.adjustments);
  const setAdjust = useApp((s) => s.setAdjust);
  const resetAdjust = useApp((s) => s.resetAdjust);
  return (
    <Rail>
      <button type="button" className="feature-chip" onClick={resetAdjust}>
        <span className="feature-chip-name">Sıfırla</span>
      </button>
      {ADJUST_SLIDERS.map((s) => (
        <label key={s.key} className="color-tile">
          <span>{s.label}</span>
          <input
            type="range"
            min={-50}
            max={50}
            value={adjustments[s.key]}
            onChange={(e) => setAdjust(s.key, Number(e.target.value))}
            className="range-crystal min-h-8 w-full"
          />
        </label>
      ))}
    </Rail>
  );
}

function SwatchRail({
  items,
  tool,
}: {
  items: { id: string; label: string; color: string }[];
  tool: ToolDef["id"];
}) {
  const tintColor = useApp((s) => s.tintColor);
  const setTintColor = useApp((s) => s.setTintColor);
  const runTool = useApp((s) => s.runTool);
  return (
    <Rail>
      {items.map((sw) => (
        <button
          key={sw.id}
          type="button"
          onClick={() => {
            setTintColor(sw.color);
            void runTool(tool);
          }}
          className={cn("swatch-chip", tintColor === sw.color && "on")}
        >
          <span style={{ background: sw.color }} />
          {sw.label}
        </button>
      ))}
    </Rail>
  );
}

function BackdropRail() {
  const applyAiBackdrop = useApp((s) => s.applyAiBackdrop);
  const backdropId = useApp((s) => s.backdropId);
  const processing = useApp((s) => s.processing);
  return (
    <Rail>
      <FeatureChip
        label="Yeni fon"
        hint="AI üret"
        icon={Sparkles}
        onPick={() => {
          const pool = BACKDROPS.filter((b) => b.id !== backdropId);
          const next = pool[Math.floor(Math.random() * pool.length)] ?? BACKDROPS[0];
          void applyAiBackdrop(next.id, true);
        }}
      />
      {BACKDROPS.map((b) => (
        <button
          key={b.id}
          type="button"
          disabled={processing}
          onClick={() => void applyAiBackdrop(b.id)}
          className={cn("filter-thumb", backdropId === b.id && "on")}
        >
          <img src={b.image} alt={b.name} />
          <span>{b.name}</span>
        </button>
      ))}
    </Rail>
  );
}

function FilterRail({ templates, orderKey }: { templates: Template[]; orderKey: string }) {
  const applyTemplate = useApp((s) => s.applyTemplate);
  const lastTemplateId = useApp((s) => s.lastTemplateId);
  const chipOrder = useApp((s) => s.chipOrder as Record<string, string[]>);
  const setChipOrder = useApp((s) => s.setChipOrder);
  const ordered = applyOrder(templates, chipOrder[orderKey]);
  return (
    <DragStrip
      className="studio-rail-track"
      onReorder={(from, to) => setChipOrder(orderKey, moveItem(ordered, from, to).map((t) => t.id))}
    >
      {ordered.map((tpl, i) => (
        <FilterThumb
          key={tpl.id}
          tpl={tpl}
          index={i}
          active={lastTemplateId === tpl.id}
          onPick={() => void applyTemplate(tpl.id)}
        />
      ))}
    </DragStrip>
  );
}

function ToolRail({
  tools,
  picked,
  onPick,
  orderKey,
}: {
  tools: ToolDef[];
  picked: string | null;
  onPick: (tool: ToolDef) => void;
  orderKey: string;
}) {
  const proUntil = useApp((s) => s.proUntil);
  const armedTool = useApp((s) => s.armedTool);
  const lastToolId = useApp((s) => s.lastToolId);
  const chipOrder = useApp((s) => s.chipOrder as Record<string, string[]>);
  const setChipOrder = useApp((s) => s.setChipOrder);
  const pro = isPro(proUntil);
  const ordered = applyOrder(tools, chipOrder[orderKey]);
  return (
    <DragStrip
      className="studio-rail-track"
      onReorder={(from, to) => setChipOrder(orderKey, moveItem(ordered, from, to).map((t) => t.id))}
    >
      {ordered.map((tool, i) => (
        <FeatureChip
          key={tool.id}
          index={i}
          label={tool.name}
          hint={tool.tap || isBrushTool(tool.id) ? "Fırça" : tool.hint}
          locked={!tool.free && !pro}
          on={picked === tool.id || armedTool === tool.id || lastToolId === tool.id}
          icon={ICONS[tool.id]}
          tint={ribbonOf(tool.id)}
          onPick={() => onPick(tool)}
        />
      ))}
    </DragStrip>
  );
}

function LookRail({ id }: { id: AtelierId }) {
  const applyMakeupLook = useApp((s) => s.applyMakeupLook);
  const lastLookId = useApp((s) => s.lastLookId);
  const proUntil = useApp((s) => s.proUntil);
  const chipOrder = useApp((s) => s.chipOrder as Record<string, string[]>);
  const setChipOrder = useApp((s) => s.setChipOrder);
  const pro = isPro(proUntil);
  const key = `look:${id}`;
  const looks = applyOrder(looksFor(id), chipOrder[key]);
  return (
    <DragStrip
      className="studio-rail-track"
      onReorder={(from, to) => setChipOrder(key, moveItem(looks, from, to).map((l) => l.id))}
    >
      {looks.map((look, i) => (
        <FeatureChip
          key={look.id}
          index={i}
          label={look.name}
          hint="Look"
          locked={!look.free && !pro}
          on={lastLookId === look.id}
          onPick={() => void applyMakeupLook(look.id)}
        />
      ))}
    </DragStrip>
  );
}

const LANES: Record<AtelierId, { id: string; label: string }[]> = {
  even: [
    { id: "filtre", label: "Filtre" },
    { id: "temel", label: "Temel" },
    { id: "fon", label: "Fon" },
    { id: "firca", label: "Fırça" },
    { id: "sablon", label: "Şablon" },
    { id: "yetenek", label: "Yeteneği" },
    { id: "isik", label: "Işık" },
    { id: "kenar", label: "Kenar" },
    { id: "renk", label: "Renk" },
  ],
  nura: [
    { id: "filtre", label: "Filtre" },
    { id: "sablon", label: "Şablon" },
    { id: "fon", label: "Fon" },
    { id: "ozellik", label: "Özellik" },
    { id: "firca", label: "Fırça" },
    { id: "far", label: "Far" },
    { id: "cikartma", label: "Çıkartma" },
    { id: "renk", label: "Renk" },
  ],
  cehra: [
    { id: "filtre", label: "Filtre" },
    { id: "sablon", label: "Şablon" },
    { id: "ozellik", label: "Özellik" },
    { id: "firca", label: "Fırça" },
    { id: "renk", label: "Renk" },
  ],
  relyn: [
    { id: "filtre", label: "Filtre" },
    { id: "sablon", label: "Şablon" },
    { id: "ozellik", label: "Özellik" },
    { id: "firca", label: "Fırça" },
    { id: "renk", label: "Renk" },
  ],
  reira: [
    { id: "filtre", label: "Filtre" },
    { id: "fon", label: "Fon" },
    { id: "sablon", label: "Şablon" },
    { id: "isik", label: "Işık" },
    { id: "ozellik", label: "Özellik" },
    { id: "kenar", label: "Kenar" },
  ],
  pacca: [
    { id: "filtre", label: "Filtre" },
    { id: "sablon", label: "Şablon" },
    { id: "ozellik", label: "Özellik" },
    { id: "kenar", label: "Kenar" },
    { id: "renk", label: "Renk" },
  ],
};

function LaneBody({
  atelier,
  lane,
  onPick,
  picked,
}: {
  atelier: AtelierId;
  lane: string;
  onPick: (tool: ToolDef) => void;
  picked: string | null;
}) {
  const applyTake = useApp((s) => s.applyTake);
  const setLightDir = useApp((s) => s.setLightDir);
  const lightDir = useApp((s) => s.lightDir);
  const runTool = useApp((s) => s.runTool);
  const applyAiBackdrop = useApp((s) => s.applyAiBackdrop);
  const backdropId = useApp((s) => s.backdropId);
  const ratio = useApp((s) => s.ratio);
  const setRatio = useApp((s) => s.setRatio);
  const frameStyle = useApp((s) => s.frameStyle);
  const setFrameStyle = useApp((s) => s.setFrameStyle);
  const addSticker = useApp((s) => s.addSticker);
  const addTextOverlay = useApp((s) => s.addTextOverlay);
  const motionStyle = useApp((s) => s.motionStyle);
  const setMotionStyle = useApp((s) => s.setMotionStyle);
  const makeMotion = useApp((s) => s.makeMotion);
  const makeCollage = useApp((s) => s.makeCollage);
  const collageLayout = useApp((s) => s.collageLayout);
  const setCollageLayout = useApp((s) => s.setCollageLayout);
  const processing = useApp((s) => s.processing);
  const proUntil = useApp((s) => s.proUntil);
  const pro = isPro(proUntil);
  const [textDraft, setTextDraft] = useState("PACCA");

  if (lane === "filtre") {
    return <FilterRail orderKey={`tpl:${atelier}`} templates={TEMPLATES} />;
  }
  if (lane === "temel")
    return <ToolRail orderKey={`tool:${atelier}:temel`} tools={EVEN_CORE_TOOLS} picked={picked} onPick={onPick} />;
  if (lane === "fon") return <BackdropRail />;
  if (lane === "firca")
    return <ToolRail orderKey={`tool:${atelier}:firca`} tools={EVEN_BRUSH_TOOLS} picked={picked} onPick={onPick} />;
  if (lane === "yetenek")
    return (
      <ToolRail orderKey={`tool:${atelier}:yetenek`} tools={EVEN_SIGNATURE_TOOLS} picked={picked} onPick={onPick} />
    );
  if (lane === "ozellik")
    return (
      <ToolRail orderKey={`tool:${atelier}:ozellik`} tools={toolsForAtelier(atelier)} picked={picked} onPick={onPick} />
    );
  if (lane === "sablon") {
    if (atelier === "even") {
      return (
        <div className="flex flex-col gap-1.5">
          <LookRail id="even" />
          <Rail>
            {TAKES.map((take) => (
              <FeatureChip
                key={take.id}
                label={take.name}
                hint={take.hint}
                locked={!take.free && !pro}
                onPick={() => void applyTake(take.id)}
              />
            ))}
            <FeatureChip label="HD onar" hint="RELYN" icon={Sparkles} onPick={() => void runTool("hd")} />
            <FeatureChip label="Bulanıklık gider" hint="RELYN" icon={Focus} onPick={() => void runTool("unblur")} />
            <FeatureChip label="Kolaj" hint="PACCA" icon={Layers} onPick={() => void makeCollage()} />
          </Rail>
        </div>
      );
    }
    if (atelier === "reira") {
      return (
        <Rail>
          {TAKES.map((take) => (
            <FeatureChip
              key={take.id}
              label={take.name}
              hint={take.hint}
              locked={!take.free && !pro}
              onPick={() => void applyTake(take.id)}
            />
          ))}
        </Rail>
      );
    }
    if (atelier === "relyn") {
      return (
        <Rail>
          <FeatureChip label="HD onar" hint="Tek dokunuş" icon={Sparkles} onPick={() => void runTool("hd")} />
          <FeatureChip label="Bulanıklık gider" hint="Net" icon={Focus} onPick={() => void runTool("unblur")} />
          <FeatureChip label="Renklendir" hint="Arşiv" icon={Blend} onPick={() => void runTool("colorize")} />
          <FeatureChip label="Pus gider" hint="Cam" icon={Wind} onPick={() => void runTool("dehaze")} />
        </Rail>
      );
    }
    if (atelier === "pacca") {
      return (
        <Rail>
          {MOTION_STYLES.map((s) => (
            <FeatureChip
              key={s.id}
              label={s.label}
              hint={s.hint}
              on={motionStyle === s.id}
              onPick={() => setMotionStyle(s.id)}
            />
          ))}
          {COLLAGE_LAYOUTS.map((l) => (
            <FeatureChip
              key={l.id}
              label={l.label}
              hint="Kolaj"
              on={collageLayout === l.id}
              onPick={() => setCollageLayout(l.id)}
            />
          ))}
          <FeatureChip
            label="10 dk klip"
            hint="Yaz"
            icon={Sparkles}
            onPick={async () => {
              const blob = await makeMotion(15);
              if (blob) downloadBlob(blob, "pacca-klip.webm");
            }}
          />
          <FeatureChip
            label={pro ? "15 dk klip" : "15 dk PRO"}
            hint="Yaz"
            locked={!pro}
            onPick={async () => {
              if (!pro) {
                requestPaywall();
                return;
              }
              if (processing) return;
              const blob = await makeMotion(15);
              if (blob) downloadBlob(blob, "pacca-klip.webm");
            }}
          />
          <FeatureChip
            label={pro ? "30 dk klip" : "30 dk PRO"}
            hint="Yaz"
            locked={!pro}
            onPick={async () => {
              if (!pro) {
                requestPaywall();
                return;
              }
              if (processing) return;
              const blob = await makeMotion(20);
              if (blob) downloadBlob(blob, "pacca-klip.webm");
            }}
          />
          <FeatureChip label="Kolaj" hint="Projeler" icon={Layers} onPick={() => void makeCollage()} />
        </Rail>
      );
    }
    return <LookRail id={atelier} />;
  }
  if (lane === "dudak") return <SwatchRail items={LIP_COLORS} tool="lipstick" />;
  if (lane === "far") return <SwatchRail items={SHADOW_COLORS} tool="eyeshadow" />;
  if (lane === "cikartma") {
    return (
      <Rail>
        {STICKERS.map((s) => (
          <FeatureChip key={s.id} label={s.label} hint="Sticker" onPick={() => addSticker(s.id)} />
        ))}
      </Rail>
    );
  }
  if (lane === "renk") {
    return (
      <div className="flex flex-col gap-1.5">
        <ColorStrip />
        <SwatchRail items={LIP_COLORS} tool="lipstick" />
        <SwatchRail items={EYE_COLORS} tool="eyecolor" />
        <SwatchRail items={HAIR_COLORS} tool="hair" />
      </div>
    );
  }
  if (lane === "isik") {
    return (
      <Rail>
        {LIGHTS.map((l) => (
          <FeatureChip
            key={l.id}
            label={l.label}
            hint="Işık"
            on={lightDir === l.id}
            icon={Lamp}
            onPick={() => {
              setLightDir(l.id);
              void runTool("relight");
            }}
          />
        ))}
        {BACKDROPS.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => void applyAiBackdrop(b.id)}
            className={cn("filter-thumb", backdropId === b.id && "on")}
          >
            <img src={b.image} alt={b.name} />
            <span>{b.name}</span>
          </button>
        ))}
      </Rail>
    );
  }
  if (lane === "kenar") {
    return (
      <Rail>
        {RATIOS.map((r) => (
          <FeatureChip key={r.id} label={r.label} hint={r.hint} on={ratio === r.id} icon={Frame} onPick={() => setRatio(r.id)} />
        ))}
        {FRAME_STYLES.map((f) => (
          <FeatureChip
            key={f.id}
            label={f.label}
            hint="Çerçeve"
            on={frameStyle === f.id}
            icon={Frame}
            onPick={() => {
              setFrameStyle(f.id);
              void runTool("frame");
            }}
          />
        ))}
        {STICKERS.map((s) => (
              <FeatureChip key={s.id} label={s.label} hint="Sticker" onPick={() => addSticker(s.id)} />
            ))}
        <label className="text-chip">
            <input
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              maxLength={48}
              placeholder="Yazı"
            />
            <button type="button" onClick={() => textDraft.trim() && addTextOverlay(textDraft.trim())}>
              Ekle
            </button>
          </label>
      </Rail>
    );
  }
  return <FilterRail orderKey={`tpl:${atelier}:more`} templates={templatesFor(atelier)} />;
}

export function AtelierPanels({
  id,
  onPick,
  picked,
}: {
  id: AtelierId;
  onPick: (tool: ToolDef) => void;
  picked: string | null;
}) {
  const base = LANES[id];
  const chipOrder = useApp((s) => s.chipOrder as Record<string, string[]>);
  const setChipOrder = useApp((s) => s.setChipOrder);
  const laneKey = `lane:${id}`;
  const lanes = applyOrder(base, chipOrder[laneKey]);
  const [lane, setLane] = useState(lanes[0].id);
  const armedTool = useApp((s) => s.armedTool);
  useEffect(() => {
    setLane(applyOrder(LANES[id], useApp.getState().chipOrder?.[laneKey])[0]?.id ?? LANES[id][0].id);
  }, [id, laneKey]);
  const brushing = Boolean(armedTool && isBrushTool(armedTool));
  const showIntensity =
    lane === "filtre" ||
    lane === "temel" ||
    lane === "ozellik" ||
    lane === "yetenek" ||
    lane === "sablon" ||
    lane === "firca" ||
    lane === "fon" ||
    lane === "isik";
  return (
    <div className="studio-desk">
      <DragStrip
        className="studio-lanes"
        onReorder={(from, to) => setChipOrder(laneKey, moveItem(lanes, from, to).map((l) => l.id))}
      >
        {lanes.map((item, i) => (
          <button
            key={item.id}
            type="button"
            data-drag-i={i}
            onClick={() => setLane(item.id)}
            className={cn("studio-lane", lane === item.id && "on")}
          >
            {item.label}
          </button>
        ))}
      </DragStrip>
      {brushing ? <BrushBar /> : showIntensity ? <Intensity /> : null}
      <ColorBoost />
      <LaneBody atelier={id} lane={lane} onPick={onPick} picked={picked} />
    </div>
  );
}
