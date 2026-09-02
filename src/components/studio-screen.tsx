import { t } from "@/lib/i18n";
import { AtelierPanels } from "@/components/atelier-panels";
import { CrystalButton } from "@/components/crystal-button";
import { isDirty, TOOL_LABEL } from "@/lib/catalog";
import { cssAdjust, isBrushTool, loadImage, makeCanvas, paintStroke, toJpeg } from "@/lib/fx";
import { IMAGE_ACCEPT, ingestImageFile, takeFile } from "@/lib/guard";
import { gatedDownload } from "@/lib/download";
import { isPro, useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Overlay, ToolDef, ToolId } from "@/lib/types";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

function download(src: string, name: string) {
  gatedDownload(src, name);
}

function StickerMark({ sticker, size }: { sticker: string; size: number }) {
  const px = Math.max(28, size);
  if (sticker === "orbit") {
    return <span className="block rounded-full border-2 border-orbit" style={{ width: px, height: px }} />;
  }
  if (sticker === "spark" || sticker === "flash" || sticker === "sun") {
    return <span className="block rotate-45 border-2 border-ember" style={{ width: px * 0.7, height: px * 0.7 }} />;
  }
  if (sticker === "frame" || sticker === "glass" || sticker === "tape") {
    return <span className="block border-2 border-crystal" style={{ width: px, height: px }} />;
  }
  if (sticker === "heart") {
    return <span className="block rounded-full bg-ember" style={{ width: px * 0.55, height: px * 0.55 }} />;
  }
  if (sticker === "moon" || sticker === "stamp") {
    return <span className="block rounded-full border-2 border-orbit" style={{ width: px * 0.7, height: px * 0.7 }} />;
  }
  if (sticker === "leaf" || sticker === "wave") {
    return <span className="block rotate-12 rounded-full bg-crystal" style={{ width: px * 0.35, height: px * 0.6 }} />;
  }
  return (
    <span
      className="block border-x-transparent border-b-crystal"
      style={{
        width: 0,
        height: 0,
        borderLeftWidth: px * 0.45,
        borderRightWidth: px * 0.45,
        borderBottomWidth: px * 0.75,
        borderLeftStyle: "solid",
        borderRightStyle: "solid",
        borderBottomStyle: "solid",
        borderLeftColor: "transparent",
        borderRightColor: "transparent",
      }}
    />
  );
}

function normPoint(el: HTMLElement, clientX: number, clientY: number) {
  const rect = el.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width))),
    y: Math.min(1, Math.max(0, (clientY - rect.top) / Math.max(1, rect.height))),
  };
}

export function StudioScreen() {
  const projects = useApp((s) => s.projects);
  const activeProjectId = useApp((s) => s.activeProjectId);
  const latestOf = useApp((s) => s.latestOf);
  const originalOf = useApp((s) => s.originalOf);
  const processing = useApp((s) => s.processing);
  const processHint = useApp((s) => s.processHint);
  const armedTool = useApp((s) => s.armedTool);
  const runTool = useApp((s) => s.runTool);
  const saveLatest = useApp((s) => s.saveLatest);
  const commitDraft = useApp((s) => s.commitDraft);
  const draftImage = useApp((s) => s.draftImage as string | null);
  const createProject = useApp((s) => s.createProject);
  const replaceActivePhoto = useApp((s) => s.replaceActivePhoto);
  const removeActivePhoto = useApp((s) => s.removeActivePhoto);
  const flash = useApp((s) => s.flash);
  const setActiveVersion = useApp((s) => s.setActiveVersion);
  const bakeDemoVersions = useApp((s) => s.bakeDemoVersions);
  const atelier = useApp((s) => s.atelier);
  const setAtelier = useApp((s) => s.setAtelier);
  const comparing = useApp((s) => s.comparing);
  const adjustments = useApp((s) => s.adjustments);
  const overlays = useApp((s) => s.overlays);
  const removeOverlay = useApp((s) => s.removeOverlay);
  const moveOverlay = useApp((s) => s.moveOverlay);
  const ratio = useApp((s) => s.ratio);
  const bakeCurrent = useApp((s) => s.bakeCurrent);
  const undoLast = useApp((s) => s.undoLast);
  const redoLast = useApp((s) => s.redoLast);
  const motionStyle = useApp((s) => s.motionStyle);
  const commitBrush = useApp((s) => s.commitBrush);
  const setArmedTool = useApp((s) => s.setArmedTool);
  const brushSize = useApp((s) => s.brushSize);
  const intensity = useApp((s) => s.intensity);
  const tintColor = useApp((s) => s.tintColor);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const paintRef = useRef<HTMLCanvasElement>(null);
  const workRef = useRef<HTMLCanvasElement | null>(null);
  const paintingRef = useRef(false);
  const lastPtRef = useRef<{ x: number; y: number } | null>(null);
  const selfCommitRef = useRef(false);
  const [picked, setPicked] = useState<ToolId | null>(null);
  const [spotAsk, setSpotAsk] = useState<"blemish" | "erase" | null>(null);
  const [brushMode, setBrushMode] = useState<"ai" | "manual" | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const [split, setSplit] = useState(52);
  const [imgW, setImgW] = useState(360);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [peeking, setPeeking] = useState(false);
  const [settling, setSettling] = useState(false);
  const [rings, setRings] = useState<{ id: number; x: number; y: number; size: number }[]>([]);
  const peekTimer = useRef<number | null>(null);
  const settleTick = useApp((s) => s.settleTick as number);

  const project = projects.find((p) => p.id === activeProjectId);
  const latest = latestOf(project);
  const original = originalOf(project);
  const liveSrc = comparing ? original?.image ?? latest?.image : draftImage || latest?.image;
  const shown = liveSrc ? { image: liveSrc } : latest;
  const emptyCanvas = !project || !latest || !shown || !(String(shown.image || "").startsWith("data:") || String(shown.image || "").startsWith("blob:"));
  const versions = useMemo(
    () => (project ? [...project.versions].sort((a, b) => b.createdAt - a.createdAt) : []),
    [project],
  );
  const pending = isDirty(adjustments) || overlays.length > 0 || ratio !== "original";
  const brushing = Boolean(armedTool && isBrushTool(armedTool) && !comparing && !processing);

  useEffect(() => {
    void bakeDemoVersions();
  }, [bakeDemoVersions]);

  useEffect(() => {
    if (atelier !== "even") setAtelier("even");
  }, [atelier, setAtelier]);

  useEffect(() => {
    if (armedTool === "blemish" || armedTool === "erase") setSpotAsk(armedTool);
  }, [armedTool]);

  useEffect(() => {
    const el = imgRef.current ?? paintRef.current;
    if (!el) return;
    const sync = () => setImgW(el.clientWidth || 360);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [latest?.id, ratio, brushing]);

  useEffect(() => {
    if (!brushing || !latest) {
      workRef.current = null;
      return;
    }
    let cancelled = false;
    if (selfCommitRef.current) {
      selfCommitRef.current = false;
      return;
    }
    void (async () => {
      try {
        const img = await loadImage(draftImage || latest.image);
        if (cancelled) return;
        const work = makeCanvas(img, 1024);
        workRef.current = work;
        const view = paintRef.current;
        if (!view) return;
        view.width = work.width;
        view.height = work.height;
        const ctx = view.getContext("2d");
        ctx?.drawImage(work, 0, 0);
      } catch {
        /* keep photo */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [brushing, latest, latest?.id, latest?.image, draftImage]);

  useEffect(() => {
    if (!settleTick) return;
    setSettling(true);
    const t = window.setTimeout(() => setSettling(false), 220);
    return () => window.clearTimeout(t);
  }, [settleTick]);

  function spawnInk(pt: { x: number; y: number }) {
    const id = Date.now() + Math.random();
    const size = Math.max(22, (brushSize / 1024) * imgW * 1.2);
    setRings((list) => [...list.slice(-2), { id, x: pt.x, y: pt.y, size }]);
    window.setTimeout(() => setRings((list) => list.filter((r) => r.id !== id)), 320);
  }

  function onPeekDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (brushing || comparing || processing || !original) return;
    if ((e.target as HTMLElement).closest("button, input, canvas")) return;
    e.preventDefault();
    peekTimer.current = window.setTimeout(() => setPeeking(true), 160);
  }

  function onPeekUp() {
    if (peekTimer.current) {
      window.clearTimeout(peekTimer.current);
      peekTimer.current = null;
    }
    setPeeking(false);
  }

  function blit() {
    const work = workRef.current;
    const view = paintRef.current;
    if (!work || !view) return;
    const ctx = view.getContext("2d");
    ctx?.drawImage(work, 0, 0);
  }

  function onPaintDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!brushing || !armedTool) return;
    e.preventDefault();
    const pt = normPoint(e.currentTarget, e.clientX, e.clientY);
    setCursor(pt);
    spawnInk(pt);
    if (brushMode === "ai" && (armedTool === "blemish" || armedTool === "erase")) {
      void runTool(armedTool, pt);
      return;
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const work = workRef.current;
    const ctx = work?.getContext("2d", { willReadFrequently: true });
    if (!work || !ctx) return;
    paintingRef.current = true;
    lastPtRef.current = pt;
    paintStroke(ctx, armedTool, [pt], { radius: brushSize, intensity, color: tintColor });
    blit();
  }

  function onPaintMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    const pt = normPoint(e.currentTarget, e.clientX, e.clientY);
    setCursor(pt);
    if (!paintingRef.current || !armedTool) return;
    const work = workRef.current;
    const ctx = work?.getContext("2d", { willReadFrequently: true });
    if (!work || !ctx) return;
    const last = lastPtRef.current;
    if (last && Math.hypot(pt.x - last.x, pt.y - last.y) < 0.003) return;
    paintStroke(ctx, armedTool, last ? [last, pt] : [pt], { radius: brushSize, intensity, color: tintColor });
    lastPtRef.current = pt;
    blit();
  }

  function onPaintUp(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!paintingRef.current) return;
    paintingRef.current = false;
    const pt = lastPtRef.current ?? normPoint(e.currentTarget, e.clientX, e.clientY);
    lastPtRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const work = workRef.current;
    if (!work || !armedTool) return;
    selfCommitRef.current = true;
    commitBrush(armedTool, toJpeg(work, 0.9));
    spawnInk(pt);
  }

  function dragOverlay(e: ReactPointerEvent<HTMLButtonElement>, id: string) {
    e.stopPropagation();
    e.preventDefault();
    const img = imgRef.current ?? paintRef.current;
    if (!img) return;
    const move = (ev: globalThis.PointerEvent) => {
      const rect = img.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height));
      moveOverlay(id, x, y);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function pickTool(tool: ToolDef) {
    if (emptyCanvas) {
      flash("Önce görsel ekle.");
      fileRef.current?.click();
      return;
    }
    if (tool.id === "blemish" || tool.id === "erase") {
      setSpotAsk(tool.id);
      setPicked(tool.id);
      return;
    }
    if (isBrushTool(tool.id) && armedTool === tool.id) {
      setArmedTool(null);
      setPicked(null);
      setBrushMode(null);
      return;
    }
    if (
      tool.id === "lipstick" ||
      tool.id === "blush" ||
      tool.id === "contour" ||
      tool.id === "eyeshadow" ||
      tool.id === "liner" ||
      tool.id === "plump" ||
      tool.id === "freckle" ||
      tool.id === "tan" ||
      tool.id === "matte" ||
      tool.id === "darkcircle" ||
      tool.id === "brows" ||
      tool.id === "lashes" ||
      tool.id === "dodge"
    ) {
      setBrushMode("manual");
      setPicked(tool.id);
      setArmedTool(tool.id);
      flash("Parmağınızla sürün. Kaydet ile kalır.");
      return;
    }
    setBrushMode(null);
    setPicked(tool.id);
    void runTool(tool.id);
  }

  async function saveOut() {
    commitDraft();
    if (!isPro(useApp.getState().proUntil)) {
      flash("Efekt kaydedildi. İndirmek için PRO.");
      return;
    }
    if (pending) {
      const src = await bakeCurrent("design", "jpeg");
      if (src) download(src, `${(project?.title || "evengirl").replace(/\s+/g, "-")}.jpg`);
      return;
    }
    saveLatest();
  }

  async function onFile(file: File | undefined) {
    const result = await ingestImageFile(file);
    if (!result.ok) {
      flash(result.error);
      return;
    }
    if (project && latest && String(latest.image || "").startsWith("data:")) {
      replaceActivePhoto(result.dataUrl);
      return;
    }
    createProject(result.name, result.dataUrl);
  }

  if (!atelier) {
    return null;
  }

  const cursorPx = Math.max(18, (brushSize / 1024) * imgW * 1.15);

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col gap-1">
      <div
        className={cn(
          "studio-stage relative min-h-0 flex-1 overflow-hidden rounded-3xl",
          brushing && "ring-2 ring-ember ring-offset-2 ring-offset-bg",
          settling && "fx-settle",
        )}
      >
        {emptyCanvas ? (
          <div className="studio-blank">
            <button type="button" className="add-photo-btn" onClick={() => fileRef.current?.click()}>
              Görsel ekle
            </button>
          </div>
        ) : (
        <>
        <div
          className={cn("studio-photo absolute inset-0 overflow-hidden", atelier === "pacca" && !comparing && !peeking && `ken-${motionStyle}`)}
          onPointerDown={onPeekDown}
          onPointerUp={onPeekUp}
          onPointerCancel={onPeekUp}
          onPointerLeave={onPeekUp}
        >
          <img
            ref={imgRef}
            src={liveSrc}
            alt={project.title}
            className={cn("h-full w-full object-cover", brushing && "opacity-0")}
            style={{ filter: comparing || brushing || peeking ? undefined : cssAdjust(adjustments) }}
          />
          {original && !brushing ? (
            <img
              src={original.image}
              alt=""
              className={cn("studio-peek", peeking && "on")}
            />
          ) : null}
          {brushing ? (
            <canvas
              ref={paintRef}
              className="paint-canvas"
              onPointerDown={onPaintDown}
              onPointerMove={onPaintMove}
              onPointerUp={onPaintUp}
              onPointerCancel={onPaintUp}
            />
          ) : null}
          {!comparing && !brushing && adjustments.vignette ? (
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                boxShadow: `inset 0 0 ${40 + adjustments.vignette}px rgb(0 0 0 / ${0.15 + adjustments.vignette / 80})`,
              }}
            />
          ) : null}
          {!comparing && !brushing && adjustments.grain ? (
            <div className="pointer-events-none absolute inset-0 mix-blend-overlay" style={{ opacity: adjustments.grain / 80 }}>
              <div className="grain absolute inset-0" />
            </div>
          ) : null}
          {comparing && original ? (
            <>
              <img
                src={original.image}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
              />
              <div className="absolute inset-y-0 w-0.5 bg-fg" style={{ left: `${split}%` }} />
              <input
                type="range"
        aria-label={t("slider_amount")}
                min={8}
                max={92}
                value={split}
                onChange={(e) => setSplit(Number(e.target.value))}
                onClick={(e) => e.stopPropagation()}
                className="range-crystal absolute inset-x-3 bottom-14"
              />
            </>
          ) : null}
          <div className="studio-chrome">
            <button
              type="button"
              className="chrome-btn"
              aria-label="Geri al"
              onClick={(e) => {
                e.stopPropagation();
                undoLast();
                setPicked(null);
              }}
            >
              <ChevronLeft strokeWidth={2.6} />
            </button>
            <button
              type="button"
              className="chrome-btn"
              aria-label="İleri al"
              onClick={(e) => {
                e.stopPropagation();
                redoLast();
                setPicked(null);
              }}
            >
              <ChevronRight strokeWidth={2.6} />
            </button>
          </div>
        </div>
        {!comparing && !peeking
          ? overlays.map((o) => (
              <OverlayNode key={o.id} overlay={o} baseWidth={imgW} onDrag={dragOverlay} onRemove={removeOverlay} />
            ))
          : null}
        {processing ? (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-bg/45">
            <div className="pulse-crystal absolute size-32 rounded-full bg-crystal/40" />
            <p className="relative font-display text-base font-medium">{processHint}</p>
            <p className="relative mt-1 text-xs text-muted">cihazda · sunucu yok</p>
          </div>
        ) : null}
        {brushing && cursor ? (
          <span
            className="brush-cursor"
            style={{
              left: `${cursor.x * 100}%`,
              top: `${cursor.y * 100}%`,
              width: cursorPx,
              height: cursorPx,
            }}
          />
        ) : null}
        {rings.map((ring) => (
          <span
            key={ring.id}
            className="ink-ring"
            style={{
              left: `${ring.x * 100}%`,
              top: `${ring.y * 100}%`,
              width: ring.size,
              height: ring.size,
            }}
          />
        ))}
        {brushing ? (
          <div className="pointer-events-none absolute inset-x-0 top-10 z-10 flex justify-center">
            <span className="rounded-full bg-bg/80 px-3 py-1 text-xs">
              {TOOL_LABEL[armedTool as ToolId] ?? "Fırça"} · {brushMode === "ai" ? "dokun" : "sürün"}
            </span>
          </div>
        ) : null}

        </>
        )}
      </div>

      <div className="studio-toolbar">
        <div className="studio-versions">
          {versions.slice(0, 6).map((ver) => (
            <button
              key={ver.id}
              type="button"
              onClick={() => project && setActiveVersion(project.id, ver.id)}
              className={cn("studio-ver", ver.id === latest.id && !draftImage && "on")}
            >
              <img src={ver.image} alt={ver.label} />
            </button>
          ))}
        </div>
        <div className="studio-swap">
          <button type="button" onClick={() => removeActivePhoto()}>
            Kaldır
          </button>
          <button type="button" onClick={() => fileRef.current?.click()}>
            Değiştir
          </button>
          <button
            type="button"
            className={cn("save", draftImage && "on")}
            disabled={processing || !draftImage}
            onClick={() => void saveOut()}
          >
            Kaydet
          </button>
        </div>
      </div>

      <div className="studio-desk-wrap">
        <AtelierPanels key={atelier} id={atelier} onPick={pickTool} picked={picked} />
      </div>
      <input ref={fileRef} type="file"
        aria-label={t("photo_pick")} accept={IMAGE_ACCEPT} className="sr-only" onChange={(e) => onFile(takeFile(e.currentTarget))} />
      {plusOpen ? (
        <div className="absolute inset-0 z-40 flex flex-col justify-end bg-bg-deep/70 p-4" data-plus-sheet>
          <div className="panel-elevated rounded-3xl p-4">
            <p className="text-xs font-semibold tracking-[0.16em] text-muted">YENİ PROJE</p>
            <h2 className="font-display mt-1 text-xl font-semibold">Fotoğraf oluştur</h2>
            <div className="mt-3 flex flex-col gap-2">
              <CrystalButton onClick={() => { setPlusOpen(false); fileRef.current?.click(); }}>Galeriden seç</CrystalButton>
              <CrystalButton tone="ghost" onClick={() => setPlusOpen(false)}>Vazgeç</CrystalButton>
            </div>
          </div>
        </div>
      ) : null}
      {spotAsk ? (
        <div className="absolute inset-0 z-40 flex flex-col justify-end bg-bg-deep/70 p-4" data-spot-ask>
          <div className="panel-elevated rounded-3xl p-4">
            <p className="text-xs font-semibold tracking-[0.16em] text-muted">LEKE</p>
            <h2 className="font-display mt-1 text-xl font-semibold">{spotAsk === "blemish" ? "Leke sil" : "Silgi"}</h2>
            <p className="mt-1 text-sm text-muted">AI dokunduğun noktayı düzeltir. Manuel fırça sende kalır.</p>
            <div className="mt-3 flex flex-col gap-2">
              <CrystalButton
                onClick={() => {
                  setBrushMode("ai");
                  setArmedTool(spotAsk);
                  setSpotAsk(null);
                  flash("Lekeye dokun — AI düzeltir.");
                }}
              >
                AI dokunuş
              </CrystalButton>
              <CrystalButton
                tone="ghost"
                onClick={() => {
                  setBrushMode("manual");
                  setArmedTool(spotAsk);
                  setSpotAsk(null);
                  flash("Fırçayla sürün.");
                }}
              >
                Manuel fırça
              </CrystalButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OverlayNode({
  overlay,
  baseWidth,
  onDrag,
  onRemove,
}: {
  overlay: Overlay;
  baseWidth: number;
  onDrag: (e: ReactPointerEvent<HTMLButtonElement>, id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${overlay.x * 100}%`, top: `${overlay.y * 100}%` }}
      onPointerDown={(e) => onDrag(e, overlay.id)}
      onDoubleClick={() => onRemove(overlay.id)}
    >
      {overlay.kind === "text" ? (
        <span
          className="font-display font-semibold tracking-tight whitespace-nowrap"
          style={{
            fontSize: `${Math.max(18, overlay.size * baseWidth)}px`,
            color: overlay.color,
            textShadow: "0 2px 8px rgb(0 0 0 / 0.5)",
          }}
        >
          {overlay.text}
        </span>
      ) : (
        <StickerMark sticker={overlay.sticker} size={overlay.scale * baseWidth * 0.14} />
      )}
    </button>
  );
}
