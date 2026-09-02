import { AGENTS } from "@/lib/catalog";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";

const DURATION = 10000;

export function AgentRunOverlay() {
  const run = useApp((s) => s.agentRun);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!run) return;
    let raf = 0;
    const tick = () => {
      setNow(Date.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run]);

  const agent = run ? AGENTS.find((a) => a.id === run.id) : undefined;
  const beats = useMemo(() => {
    if (!agent) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const stage of agent.stages) {
      const name = stage.hint.split(" · ")[0]?.trim();
      if (name && !seen.has(name)) {
        seen.add(name);
        out.push(name);
      }
    }
    return out;
  }, [agent]);

  if (!run) return null;
  const elapsed = Math.min(DURATION, Math.max(0, now - run.startedAt));
  const pct = Math.round((elapsed / DURATION) * 100);
  const remain = Math.max(0, Math.ceil((DURATION - elapsed) / 1000));
  const currentBeat = run.stage.split(" · ")[0]?.trim() ?? "";

  return (
    <div className="agent-run" data-agent-run={run.id} role="status" aria-live="polite">
      <div className="agent-run-card">
        <p className="text-xs font-semibold tracking-[0.18em] text-muted uppercase">
          {agent?.kicker ?? "Ajan"} · 10 sn
        </p>
        <h2 className="font-display mt-1 text-2xl font-semibold tracking-tight">
          {agent?.name ?? "EVEN"}
        </h2>
        <p className="mt-1 text-xs text-subtle">{agent?.line}</p>
        <div className="agent-run-frame">
          <img src={run.preview} alt="" />
          <span className="pulse-crystal agent-run-pulse" />
          <span className="scan-bar agent-run-scan" />
        </div>
        <p className="mt-3 text-sm font-medium" data-agent-stage>
          {run.stage}
        </p>
        <p className="mt-1 text-xs text-muted">
          {run.index}/{run.total} · cihazda · sunucu yok
        </p>
        {beats.length ? (
          <div className="agent-run-beats" aria-hidden>
            {beats.map((beat) => (
              <span key={beat} className={cn(beat === currentBeat && "on")}>
                {beat}
              </span>
            ))}
          </div>
        ) : null}
        <div className="agent-run-bar" aria-hidden>
          <span style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 font-display text-3xl font-semibold tabular-nums" data-agent-remain>
          {remain}s
        </p>
      </div>
    </div>
  );
}
