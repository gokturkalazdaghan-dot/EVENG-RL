import { AGENTS } from "@/lib/catalog";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { AgentDef } from "@/lib/types";
import { ChevronLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";

const IDLE_MS = 20_000;

export function AgentDock() {
  const tab = useApp((s) => s.tab);
  const atelier = useApp((s) => s.atelier);
  const dismissed = useApp((s) => s.dismissedAgents);
  const hidden = useApp((s) => s.agentsHidden);
  const setAgentsHidden = useApp((s) => s.setAgentsHidden);
  const colRef = useRef<HTMLDivElement>(null);
  const idle = useRef(0);
  const edge = useRef({ x: 0, y: 0, moved: false });
  const [slide, setSlide] = useState(0);

  const visible = AGENTS.filter((a) => !dismissed.includes(a.id));
  const open = !hidden && tab !== "settings" && tab !== "storage";

  function bump() {
    window.clearTimeout(idle.current);
    if (!hidden) {
      idle.current = window.setTimeout(() => setAgentsHidden(true), IDLE_MS);
    }
  }

  useEffect(() => {
    if (open) bump();
    return () => window.clearTimeout(idle.current);
  }, [open]);

  if (tab === "settings" || tab === "storage" || tab === "tools") return null;

  function openDock() {
    setAgentsHidden(false);
    setSlide(0);
    bump();
  }

  function onEdgeDown(e: ReactPointerEvent<HTMLButtonElement>) {
    edge.current = { x: e.clientX, y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onEdgeMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const dx = e.clientX - edge.current.x;
    if (Math.abs(dx) > 8) edge.current.moved = true;
    setSlide(Math.min(0, dx));
  }
  function onEdgeUp() {
    const d = edge.current;
    if (d.moved && slide < -36) openDock();
    else if (!d.moved) openDock();
    edge.current = { x: 0, y: 0, moved: false };
    setSlide(0);
  }

  if (!open) {
    return (
      <div className="agent-edge" data-agent-dock="edge">
        <button
          type="button"
          className="agent-edge-tab"
          aria-label="Atölye şeridini aç. Sağdan sola kaydır."
          onPointerDown={onEdgeDown}
          onPointerMove={onEdgeMove}
          onPointerUp={onEdgeUp}
          onPointerCancel={onEdgeUp}
          style={{ transform: slide ? `translateX(${slide}px)` : undefined }}
        >
          <ChevronLeft className="agent-edge-arrow" strokeWidth={2.6} />
        </button>
      </div>
    );
  }

  return (
    <div
      className="agent-dock"
      data-agent-dock="open"
      onPointerDown={bump}
      onClick={bump}
    >
      <button
        type="button"
        className="agent-handle"
        aria-label="Şeridi kapat"
        onClick={() => setAgentsHidden(true)}
      >
        <span />
      </button>
      <p className="agent-hint">Atölye</p>
      <div ref={colRef} className="agent-row">
        {visible.map((agent) => (
          <AgentOrb
            key={agent.id}
            agent={agent}
            colRef={colRef}
            active={tab === "studio" && (atelier === agent.atelier || atelier === agent.id)}
            onUsed={bump}
          />
        ))}
      </div>
    </div>
  );
}

function AgentOrb({
  agent,
  colRef,
  active,
  onUsed,
}: {
  agent: AgentDef;
  colRef: RefObject<HTMLDivElement | null>;
  active: boolean;
  onUsed: () => void;
}) {
  const setAtelier = useApp((s) => s.setAtelier);
  const flash = useApp((s) => s.flash);
  const gesture = useRef({
    x: 0,
    y: 0,
    mode: null as "h" | "v" | null,
    dx: 0,
    swiped: false,
  });
  const [dx, setDx] = useState(0);

  function onDown(e: ReactPointerEvent<HTMLButtonElement>) {
    gesture.current = { x: e.clientX, y: e.clientY, mode: null, dx: 0, swiped: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const g = gesture.current;
    const moveX = e.clientX - g.x;
    const moveY = e.clientY - g.y;
    if (!g.mode) {
      if (Math.hypot(moveX, moveY) < 12) return;
      g.mode = Math.abs(moveX) > Math.abs(moveY) * 1.1 ? "h" : "v";
    }
    if (g.mode === "h") {
      e.preventDefault();
      g.dx = moveX;
      setDx(g.dx);
    } else if (colRef.current) {
      colRef.current.scrollTop -= e.movementY;
    }
  }
  function onUp() {
    const g = gesture.current;
    setDx(0);
    g.dx = 0;
  }
  function onClick() {
    const g = gesture.current;
    if (g.mode === "h" && Math.abs(g.dx) > 28) return;
    onUsed();
    setAtelier(agent.atelier);
    flash(`${agent.name} altta. Bir araç seç.`);
  }

  return (
    <button
      type="button"
      data-agent={agent.id}
      aria-label={`${agent.name} atölyesi`}
      className={cn(
        "agent-orb",
        agent.id === "even" && "hero",
        agent.tone === "orange" && "ember",
        agent.tone === "blue" && "orbit",
        agent.tone === "azure" && "azure",
        active && "on",
      )}
      style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onClick={onClick}
    >
      <span className="agent-orb-face">
        <img src={agent.cover} alt="" />
      </span>
      <span className="agent-orb-name">{agent.name}</span>
    </button>
  );
}
