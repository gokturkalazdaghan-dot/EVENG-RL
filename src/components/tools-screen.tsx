import {
  CLINIC_AGENTS,
  CLINIC_BODY,
  CLINIC_FACE,
  CLINIC_GLOW,
  CLINIC_SKIN,
  CLINIC_SURGERY,
  CLINIC_FILLERS,
  HAIR_COLORS,
  HAIR_CUTS,
  HAIR_STYLES,
  LIP_FILLERS,
} from "@/lib/catalog";
import { IMAGE_ACCEPT, ingestImageFile } from "@/lib/guard";
import { useDropFile } from "@/lib/drop-file";
import { softNote } from "@/lib/soft-note";
import type { SkinReport } from "@/lib/clinic-vision";
import { startClinicSensors } from "@/lib/clinic-vision";
import { isPro, useApp } from "@/lib/store";
import { withTimeout } from "@/lib/timed";
import { cn, requestPaywall } from "@/lib/utils";
import { Lock } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const SEED = new Set(["proj-portre", "proj-sokak", "proj-adsiz"]);

function isUserImage(src?: string | null) {
  return Boolean(src && (src.startsWith("data:") || src.startsWith("blob:")));
}

type Chip = {
  id: string;
  name: string;
  on?: boolean;
  free?: boolean;
  run: () => void;
};

export function ToolsScreen() {
  const runClinic = useApp((s) => s.runClinic);
  const clinicSpot = useApp((s) => s.clinicSpot);
  const clinicStroke = useApp((s) => s.clinicStroke);
  const commitDraft = useApp((s) => s.commitDraft);
  const projects = useApp((s) => s.projects);
  const latestOf = useApp((s) => s.latestOf);
  const flash = useApp((s) => s.flash);
  const draftImage = useApp((s) => s.draftImage as string | null);
  const draftKey = useApp((s) => s.draftKey as string | null);
  const processing = useApp((s) => s.processing);
  const processHint = useApp((s) => s.processHint);
  const activeProjectId = useApp((s) => s.activeProjectId);
  const pro = isPro(useApp((s) => s.proUntil));
  const createProject = useApp((s) => s.createProject);
  const replaceActivePhoto = useApp((s) => s.replaceActivePhoto);
  const removeActivePhoto = useApp((s) => s.removeActivePhoto);
  const undoLast = useApp((s) => s.undoLast);
  const redoLast = useApp((s) => s.redoLast);
  const scanClinic = useApp((s) => s.scanClinic);
  const clinicSkin = useApp((s) => s.clinicSkin as SkinReport | null);
  const clinicMap = useApp((s) => s.clinicMap as { mesh?: boolean } | null);
  const fileRef = useRef<HTMLInputElement>(null);
  const viewRef = useRef<HTMLElement | null>(null);
  const zoomRef = useRef<HTMLDivElement | null>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const camRef = useRef({ s: 1, x: 0, y: 0 });
  const pinch0 = useRef({ dist: 0, s: 1, x: 0, y: 0, mx: 0, my: 0 });
  const lastPt = useRef({ x: 0, y: 0, t: 0 });
  const vel = useRef({ x: 0, y: 0 });
  const drag = useRef(0);
  const raf = useRef(0);
  const lastTap = useRef(0);
  const tapTimer = useRef(0);
  const stroke = useRef<{ nx: number; ny: number }[]>([]);
  const desk = useApp((s) => s.clinicDesk) || "cilt";
  const setDesk = useApp((s) => s.setClinicDesk);
  const [lipShape, setLipShape] = useState("natural");
  const [lipAmount, setLipAmount] = useState(55);
  const [bodyAmount, setBodyAmount] = useState(55);
  const [earAmount, setEarAmount] = useState(55);
  const [noseAmount, setNoseAmount] = useState(55);
  const [brush, setBrush] = useState<"off" | "magic">("off");
  const user = useMemo(() => {
    const ok = (p: (typeof projects)[number] | undefined) =>
      Boolean(p && !SEED.has(p.id) && isUserImage(latestOf(p)?.image));
    const active = projects.find((p) => p.id === activeProjectId);
    return ok(active) ? active : projects.find(ok);
  }, [projects, activeProjectId, latestOf]);
  const latest = latestOf(user);
  const face = (isUserImage(draftImage) ? draftImage : null) || (isUserImage(latest?.image) ? latest?.image : null) || null;

  useEffect(() => {
    useApp.setState({ processing: false, processHint: "" });
    startClinicSensors();
  }, []);

  useEffect(() => {
    if (latest?.image && isUserImage(latest.image)) void scanClinic(latest.image);
  }, [latest?.image, scanClinic]);

  useEffect(() => {
    camRef.current = { s: 1, x: 0, y: 0 };
    vel.current = { x: 0, y: 0 };
    if (zoomRef.current) zoomRef.current.style.transform = "translate3d(0,0,0) scale(1)";
  }, [face]);

  function camBounds(s: number) {
    const el = viewRef.current;
    if (!el) return { mx: 0, my: 0 };
    const r = el.getBoundingClientRect();
    return {
      mx: Math.max(0, (r.width * (s - 1)) / 2),
      my: Math.max(0, (r.height * (s - 1)) / 2),
    };
  }

  function paint(next: { s: number; x: number; y: number }) {
    const s = Math.min(4.5, Math.max(1, next.s));
    const b = camBounds(s);
    const v = {
      s,
      x: Math.max(-b.mx, Math.min(b.mx, next.x)),
      y: Math.max(-b.my, Math.min(b.my, next.y)),
    };
    camRef.current = v;
    const z = zoomRef.current;
    if (z) z.style.transform = `translate3d(${v.x}px,${v.y}px,0) scale(${v.s})`;
  }

  function glide() {
    const step = () => {
      vel.current.x *= 0.9;
      vel.current.y *= 0.9;
      if (Math.hypot(vel.current.x, vel.current.y) < 0.35) {
        raf.current = 0;
        return;
      }
      const c = camRef.current;
      paint({ s: c.s, x: c.x + vel.current.x, y: c.y + vel.current.y });
      raf.current = window.requestAnimationFrame(step);
    };
    if (raf.current) window.cancelAnimationFrame(raf.current);
    raf.current = window.requestAnimationFrame(step);
  }

  function toNorm(clientX: number, clientY: number) {
    const el = viewRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return null;
    const { s, x, y } = camRef.current;
    const nx = 0.5 + (clientX - (r.left + r.width / 2) - x) / (r.width * s);
    const ny = 0.5 + (clientY - (r.top + r.height / 2) - y) / (r.height * s);
    return {
      nx: Math.min(0.99, Math.max(0.01, nx)),
      ny: Math.min(0.99, Math.max(0.01, ny)),
    };
  }

  function zoomAt(clientX: number, clientY: number, ns: number) {
    const el = viewRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const c = camRef.current;
    const px = clientX - (r.left + r.width / 2);
    const py = clientY - (r.top + r.height / 2);
    const k = ns / c.s;
    paint({ s: ns, x: px - (px - c.x) * k, y: py - (py - c.y) * k });
  }

  async function onFile(file: File | undefined) {
    try {
      const result = await ingestImageFile(file);
      if (!result.ok) {
        softNote("Fotoğraf alınamadı", result.error);
        return;
      }
      if (user && latest && isUserImage(latest.image)) {
        replaceActivePhoto(result.dataUrl);
        useApp.setState({ tab: "tools", activeProjectId: user.id });
        return;
      }
      createProject(result.name, result.dataUrl, "tools");
    } catch {
      softNote("Fotoğraf alınamadı", "Ağ veya dosya hatası. Başka bir kare dene.");
    }
  }

  function needPhoto() {
    if (!user || !latest || !isUserImage(latest.image)) {
      flash("Önce klinikte fotoğraf ekle.");
      fileRef.current?.click();
      return false;
    }
    useApp.setState({ activeProjectId: user.id, tab: "tools", processing: false });
    return true;
  }

  async function treat(spec: {
    key: string;
    label: string;
    prompt: string;
    tools?: string[];
    free?: boolean;
    color?: string;
    intensity?: number;
    lipShape?: string;
  }) {
    if (!needPhoto()) return;
    if (spec.free === false && !pro) {
      requestPaywall();
      return;
    }
    await withTimeout(runClinic({ ...spec, desk }), 60_000);
  }

  function magicChip(): Chip {
    return {
      id: "magic",
      name: "Sihirli",
      on: brush === "magic",
      run: () => {
        if (!needPhoto()) return;
        const on = brush !== "magic";
        setBrush(on ? "magic" : "off");
        flash(on ? "Sihirli fırça: üzerini boya." : "Fırça kapandı.");
      },
    };
  }

  function lekeChip(): Chip {
    return {
      id: "leke",
      name: "Leke sil",
      on: draftKey === "clinic:leke",
      free: true,
      run: () =>
        void treat({
          key: "clinic:leke",
          label: "Leke sil",
          prompt: "remove blemishes, same person",
          tools: ["blemish", "skin"],
          free: true,
        }),
    };
  }

  const SIZE6 = [
    { n: -3, label: "−3" },
    { n: -2, label: "−2" },
    { n: -1, label: "−1" },
    { n: 1, label: "+1" },
    { n: 2, label: "+2" },
    { n: 3, label: "+3" },
  ] as const;
  const SIZE_INT = [0, 32, 58, 88];

  function sizeChips(prefix: string, title: string, shrink: string, grow: string, free = true): Chip[] {
    return SIZE6.map((step) => ({
      id: `${prefix}${step.n}`,
      name: `${title} ${step.label}`,
      on: draftKey === `clinic:${prefix}:${step.n}`,
      free,
      run: () =>
        void treat({
          key: `clinic:${prefix}:${step.n}`,
          label: `${title} ${step.label}`,
          prompt: `${title} step ${step.n}`,
          tools: [step.n < 0 ? shrink : grow],
          intensity: (["lip", "hips", "waist", "mento", "malar", "fchin"].includes(prefix) && step.n < 0 ? -1 : 1) * SIZE_INT[Math.abs(step.n)],
          free,
          lipShape: prefix === "lip" ? lipShape : undefined,
        }),
    }));
  }

  const chips: Chip[] = (() => {
    const head = [magicChip(), lekeChip()];
    if (desk === "cilt") {
      return [
        ...head,
        ...CLINIC_SKIN.filter((item) => item.id !== "leke").map((item) => ({
          id: item.id,
          name: item.name,
          on: draftKey === `clinic:${item.id}`,
          free: item.free,
          run: () =>
            void treat({
              key: `clinic:${item.id}`,
              label: item.name,
              prompt: item.prompt,
              tools: item.tools,
              free: item.free,
            }),
        })),
      ];
    }
    if (desk === "dudak") {
      return [
        ...head,
        ...sizeChips("lip", "Dudak", "plump", "plump"),
        ...LIP_FILLERS.map((item) => ({
          id: item.id,
          name: item.name,
          on: lipShape === item.id,
          free: item.free !== false,
          run: () => {
            if (item.free === false && !pro) {
              requestPaywall();
              return;
            }
            setLipShape(item.id);
            flash(`${item.name} form`);
          },
        })),
      ];
    }
    if (desk === "sac") {
      return [
        ...head,
        ...HAIR_STYLES.map((item) => ({
          id: item.id,
          name: item.name,
          on: draftKey === `clinic:${item.id}`,
          free: item.free,
          run: () =>
            void treat({
              key: `clinic:${item.id}`,
              label: item.name,
              prompt: `restyle hair to ${item.name}, keep the same face`,
              tools: item.steps,
              free: item.free,
              color: item.color,
            }),
        })),
        ...HAIR_CUTS.map((item) => ({
          id: item.id,
          name: item.name,
          on: draftKey === `clinic:${item.id}`,
          free: item.free,
          run: () =>
            void treat({
              key: `clinic:${item.id}`,
              label: item.name,
              prompt: `haircut ${item.name}, same person`,
              tools: item.steps,
              free: item.free,
            }),
        })),
        ...HAIR_COLORS.map((item) => ({
          id: item.id,
          name: item.label,
          on: draftKey === `clinic:hair:${item.id}`,
          run: () =>
            void treat({
              key: `clinic:hair:${item.id}`,
              label: item.label,
              prompt: `recolor hair to ${item.label}`,
              tools: ["hair"],
              color: item.color,
            }),
        })),
      ];
    }
    if (desk === "yuz") {
      return [
        ...head,
        ...CLINIC_FACE.filter((item) => !["eyesbig", "eyessmall"].includes(item.id)).map((item) => ({
          id: item.id,
          name: item.name,
          on: draftKey === `clinic:${item.id}`,
          free: item.free,
          run: () =>
            void treat({
              key: `clinic:${item.id}`,
              label: item.name,
              prompt: item.prompt,
              tools: item.tools,
              free: item.free,
              intensity: item.intensity,
            }),
        })),
        ...sizeChips("eye", "Göz", "eyessmall", "eyesbig", false),
        ...sizeChips("ear", "Kulak", "earsmall", "earbig"),
        ...sizeChips("nose", "Burun", "nosesmall", "nosebig"),
        ...CLINIC_GLOW.map((item) => ({
          id: item.id,
          name: item.name,
          on: draftKey === `clinic:${item.id}`,
          free: item.free,
          run: () =>
            void treat({
              key: `clinic:${item.id}`,
              label: item.name,
              prompt: item.prompt,
              tools: item.tools,
              free: item.free,
            }),
        })),
      ];
    }
    if (desk === "dolgu") {
      return [
        ...head,
        ...CLINIC_FILLERS.map((item) => ({
          id: item.id,
          name: item.name,
          on: draftKey === `clinic:${item.id}`,
          free: item.free,
          run: () =>
            void treat({
              key: `clinic:${item.id}`,
              label: item.name,
              prompt: item.prompt,
              tools: item.tools,
              free: item.free,
              intensity: 58,
              lipShape,
            }),
        })),
        ...sizeChips("lip", "Dudak", "plump", "plump"),
        ...sizeChips("malar", "Elmacık", "cheekfill", "cheekfill", false),
        ...sizeChips("fchin", "Çene", "chin", "chin", false),
        ...sizeChips("liq", "Rino", "nosesmall", "nosebig", false),
      ];
    }
    if (desk === "cerrahi") {
      return [
        ...head,
        ...CLINIC_SURGERY.map((item) => ({
          id: item.id,
          name: item.name,
          on: draftKey === `clinic:${item.id}`,
          free: item.free,
          run: () =>
            void treat({
              key: `clinic:${item.id}`,
              label: item.name,
              prompt: item.prompt,
              tools: item.tools,
              free: item.free,
              intensity: 58,
            }),
        })),
        ...sizeChips("rino", "Rino", "nosesmall", "nosebig", false),
        ...sizeChips("mento", "Çene", "chin", "chin", false),
        ...sizeChips("oto", "Kulak", "earsmall", "earbig"),
      ];
    }
    return [
      ...head,
      ...sizeChips("hips", "Kalça", "hips", "hips", false),
      ...sizeChips("waist", "Bel", "waist", "waist", false),
      ...CLINIC_BODY.filter((item) => item.id === "jaw" || item.id === "shape").map((item) => ({
        id: item.id,
        name: item.name,
        on: draftKey === `clinic:${item.id}`,
        free: item.free,
        run: () =>
          void treat({
            key: `clinic:${item.id}`,
            label: item.name,
            prompt: item.prompt,
            tools: item.tools,
            free: item.free,
            intensity: bodyAmount,
          }),
      })),
    ];
  })();

  const amount =
    desk === "dudak"
      ? { label: "Dolgusu", value: lipAmount, set: setLipAmount }
      : desk === "beden"
        ? { label: "Miktar", value: bodyAmount, set: setBodyAmount }
        : desk === "yuz"
          ? {
              label: "Kulak/Burun",
              value: Math.round((earAmount + noseAmount) / 2),
              set: (n: number) => {
                setEarAmount(n);
                setNoseAmount(n);
              },
            }
          : null;

  const drop = useDropFile((f) => void onFile(f));

  return (
    <div className="clinic clinic-live">
      <input
        ref={fileRef}
        type="file"
        accept={IMAGE_ACCEPT}
        className="sr-only"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          void onFile(file);
        }}
      />

      <div className="clinic-tabs">
        {CLINIC_AGENTS.map((a) => (
          <button
            key={a.id}
            type="button"
            className={cn("clinic-tab", desk === a.id && "on")}
            onClick={() => setDesk(a.id)}
          >
            {a.role}
          </button>
        ))}
      </div>
      {face && clinicMap?.mesh && clinicSkin?.symmetry ? (
        <aside className="clinic-sym" aria-label="Yüz simetrisi">
          <b>{clinicSkin.symmetry.score}</b>
          <div>
            <strong>Simetri · {clinicSkin.symmetry.bias}</strong>
            <p>
              {clinicSkin.symmetry.notes.length
                ? clinicSkin.symmetry.notes.map((n) => `${n.name}: ${n.side}`).join(" · ")
                : "Dengeli hat"}
            </p>
          </div>
        </aside>
      ) : null}

      <figure
        ref={(el) => {
          viewRef.current = el;
        }}
        className={cn("clinic-photo", !face && "is-blank", brush !== "off" && "is-brush", drop.over && "is-drop")}
        {...drop.bind}
        onTouchStart={(e) => {
          if (face) e.preventDefault();
        }}
        onPointerDown={(e) => {
          if (!face || (e.target as HTMLElement).closest("button,label,input")) return;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          if (raf.current) {
            window.cancelAnimationFrame(raf.current);
            raf.current = 0;
          }
          pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          lastPt.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
          vel.current = { x: 0, y: 0 };
          drag.current = 0;
          stroke.current = [];
          if (brush === "magic") {
            const p = toNorm(e.clientX, e.clientY);
            if (p) stroke.current.push(p);
          }
          if (pts.current.size === 2) {
            const [p, q] = [...pts.current.values()];
            const el = viewRef.current;
            const r = el?.getBoundingClientRect();
            pinch0.current = {
              dist: Math.hypot(p.x - q.x, p.y - q.y),
              s: camRef.current.s,
              x: camRef.current.x,
              y: camRef.current.y,
              mx: (p.x + q.x) / 2 - (r ? r.left + r.width / 2 : 0),
              my: (p.y + q.y) / 2 - (r ? r.top + r.height / 2 : 0),
            };
          }
        }}
        onPointerMove={(e) => {
          if (!pts.current.has(e.pointerId)) return;
          pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pts.current.size >= 2) {
            const [p, q] = [...pts.current.values()];
            const d = Math.hypot(p.x - q.x, p.y - q.y);
            const z = pinch0.current;
            const el = viewRef.current;
            const r = el?.getBoundingClientRect();
            if (z.dist > 10 && r) {
              const ns = z.s * (d / z.dist);
              const px = (p.x + q.x) / 2 - (r.left + r.width / 2);
              const py = (p.y + q.y) / 2 - (r.top + r.height / 2);
              const k = ns / z.s;
              paint({ s: ns, x: px - (z.mx - z.x) * k, y: py - (z.my - z.y) * k });
            }
            drag.current = 99;
            return;
          }
          const dt = Math.max(8, e.timeStamp - lastPt.current.t);
          const dx = e.clientX - lastPt.current.x;
          const dy = e.clientY - lastPt.current.y;
          drag.current += Math.hypot(dx, dy);
          vel.current = { x: dx * (16 / dt), y: dy * (16 / dt) };
          lastPt.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
          if (brush === "magic") {
            const p = toNorm(e.clientX, e.clientY);
            if (p) stroke.current.push(p);
          }
          if (camRef.current.s > 1.02 && brush !== "magic") {
            const c = camRef.current;
            paint({ s: c.s, x: c.x + dx, y: c.y + dy });
          }
        }}
        onPointerUp={(e) => {
          pts.current.delete(e.pointerId);
          if (pts.current.size > 0) return;
          if (drag.current > 14) {
            if (camRef.current.s > 1.02) glide();
            return;
          }
          const now = e.timeStamp;
          const dbl = now - lastTap.current < 280;
          lastTap.current = now;
          if (tapTimer.current) window.clearTimeout(tapTimer.current);
          if (dbl) {
            if (camRef.current.s > 1.2) paint({ s: 1, x: 0, y: 0 });
            else zoomAt(e.clientX, e.clientY, 2.4);
            return;
          }
          const p = toNorm(e.clientX, e.clientY);
          if (brush === "magic") {
            if (stroke.current.length > 2) void clinicStroke(stroke.current);
            else if (p && !processing) void clinicSpot(p.nx, p.ny, "blemish", desk);
            stroke.current = [];
          }
        }}
        onPointerCancel={() => pts.current.clear()}
        onWheel={(e) => {
          if (!face) return;
          e.preventDefault();
          zoomAt(e.clientX, e.clientY, camRef.current.s * (e.deltaY < 0 ? 1.1 : 0.9));
        }}
      >
        {face ? (
          <div ref={zoomRef} className="clinic-zoom">
            <img src={face} alt="Klinik tuval" draggable={false} key={draftKey || "orig"} />
          </div>
        ) : (
          <div className="clinic-blank" />
        )}
        {processing ? (
          <>
            <div className="skel-veil" aria-hidden />
            <b className="clinic-busy">{processHint || "Uygulanıyor…"}</b>
          </>
        ) : null}
        {face && clinicMap?.mesh ? <b className="clinic-lock">Yüz kilitlendi</b> : null}
        {face ? (
          <div className="studio-chrome">
            <button type="button" className="chrome-btn" onClick={() => undoLast()} aria-label="Geri">
              ‹
            </button>
            <button type="button" className="chrome-btn" onClick={() => redoLast()} aria-label="İleri">
              ›
            </button>
          </div>
        ) : null}
        {!face ? (
          <div className="canvas-cta">
            <button type="button" className="canvas-load" onClick={() => fileRef.current?.click()}>
              Yükle
            </button>
          </div>
        ) : null}
        {amount && face ? (
          <label className="clinic-live-amount">
            <span>{amount.label}</span>
            <input
              type="range"
              min={20}
              max={90}
              value={amount.value}
              onChange={(e) => amount.set(Number(e.target.value))}
            />
            <b>{amount.value}</b>
          </label>
        ) : null}
      </figure>

      <div className="clinic-dock">
        <div className="canvas-row">
          <button type="button" onClick={() => fileRef.current?.click()}>
            Değiştir
          </button>
          <button type="button" onClick={() => removeActivePhoto()} disabled={!face}>
            Kaldır
          </button>
          <button
            type="button"
            className={cn("save", draftImage && "on")}
            disabled={!draftImage || processing}
            onClick={() => commitDraft()}
          >
            Kaydet
          </button>
        </div>
        <div className="clinic-chips">
          {chips.map((c) => (
            <button key={c.id} type="button" className={cn("clinic-chip", c.on && "on")} onClick={c.run}>
              {c.name}
              {c.free === false ? <Lock className="size-2.5" /> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
