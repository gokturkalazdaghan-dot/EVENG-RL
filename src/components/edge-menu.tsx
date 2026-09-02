import { CLINIC_AGENTS } from "@/lib/catalog";
import { useApp } from "@/lib/store";
import { useFastTap } from "@/lib/fast-tap";
import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

const ITEMS = [
  ...CLINIC_AGENTS.map((a) => ({ id: a.id, label: a.role, kind: "clinic" as const })),
  { id: "filtre", label: "Filtre", kind: "studio" as const },
  { id: "firca", label: "Fırça", kind: "studio" as const },
  { id: "generate", label: "Oluştur", kind: "tab" as const },
  { id: "oracle", label: "Fal", kind: "tab" as const },
];

export function EdgeMenu() {
  const legalOpen = useApp((s) => s.legalOpen);
  const setTab = useApp((s) => s.setTab);
  const setClinicDesk = useApp((s) => s.setClinicDesk);
  const setAtelier = useApp((s) => s.setAtelier);
  const [open, setOpen] = useState(false);
  const start = useRef(0);
  const idle = useRef(0);

  useEffect(() => {
    if (!open) return;
    idle.current = window.setTimeout(() => setOpen(false), 20_000);
    return () => window.clearTimeout(idle.current);
  }, [open]);

  if (legalOpen) return null;

  function pick(item: (typeof ITEMS)[number]) {
    if (item.kind === "clinic") setClinicDesk(item.id);
    else if (item.kind === "studio") {
      setAtelier("even");
      setTab("studio");
    } else setTab(item.id === "generate" ? "generate" : "oracle");
    setOpen(false);
  }

  function onDown(e: ReactPointerEvent<HTMLButtonElement>) {
    start.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onUp(e: ReactPointerEvent<HTMLButtonElement>) {
    const dx = e.clientX - start.current;
    if (dx > 28) setOpen(true);
    else setOpen((v) => !v);
  }

  return (
    <>
      <button
        type="button"
        className="edge-tab"
        aria-label="İşlem menüsü"
        onPointerDown={onDown}
        onPointerUp={onUp}
      >
        <ChevronRight strokeWidth={2.8} />
      </button>
      {open ? (
        <div className="edge-menu" role="menu">
          <p className="edge-kicker">Tuvale yerleştir</p>
          {ITEMS.map((item) => (
            <EdgeItem key={item.id} label={item.label} onPick={() => pick(item)} />
          ))}
        </div>
      ) : null}
      {open ? <button type="button" className="edge-scrim" aria-label="Kapat" onClick={() => setOpen(false)} /> : null}
    </>
  );
}

function EdgeItem({ label, onPick }: { label: string; onPick: () => void }) {
  const tap = useFastTap(onPick);
  return (
    <button type="button" className="edge-item" role="menuitem" {...tap}>
      {label}
    </button>
  );
}
