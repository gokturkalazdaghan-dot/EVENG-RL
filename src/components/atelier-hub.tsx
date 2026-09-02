import { CrystalButton } from "@/components/crystal-button";
import { ATELIERS, TEMPLATES } from "@/lib/catalog";
import { IMAGE_ACCEPT, ingestImageFile, takeFile } from "@/lib/guard";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useRef } from "react";

export function AtelierHub() {
  const setAtelier = useApp((s) => s.setAtelier);
  const createProject = useApp((s) => s.createProject);
  const projects = useApp((s) => s.projects);
  const activeProjectId = useApp((s) => s.activeProjectId);
  const latestOf = useApp((s) => s.latestOf);
  const flash = useApp((s) => s.flash);
  const fileRef = useRef<HTMLInputElement>(null);
  const project = projects.find((p) => p.id === activeProjectId) ?? projects[0];
  const latest = latestOf(project);

  async function onFile(file: File | undefined) {
    const result = await ingestImageFile(file);
    if (!result.ok) {
      flash(result.error);
      return;
    }
    createProject(result.name, result.dataUrl);
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-[0.18em] text-muted">EVENGIRL · ATÖLYE</p>
          <h1 className="font-display text-[1.7rem] font-semibold leading-none tracking-tight">
            Beş stüdyo
          </h1>
          <p className="mt-2 max-w-[20rem] text-sm leading-relaxed text-muted">
            {TEMPLATES.length} orijinal şablon. Fotoğraf cihazında kalır.
          </p>
        </div>
        <CrystalButton size="sm" tone="orange" pill onClick={() => fileRef.current?.click()}>
          Yeni
        </CrystalButton>
      </header>

      {latest ? (
        <button
          type="button"
          className="panel flex items-center gap-3 rounded-3xl p-3 text-left"
          onClick={() => setAtelier("nura")}
        >
            <img src={latest.image} alt={`${project?.title ?? "Aktif proje"} önizlemesi`} className="size-14 rounded-2xl object-cover" />
          <div className="min-w-0">
            <p className="truncate font-semibold">{project?.title}</p>
            <p className="text-xs text-muted">Aktif kare · atölye seç</p>
          </div>
        </button>
      ) : null}

      <div className="grid grid-cols-1 gap-3">
        {ATELIERS.map((a) => (
          <button
            key={a.id}
            type="button"
            data-atelier={a.id}
            onClick={() => setAtelier(a.id)}
            className="atelier-card group relative overflow-hidden rounded-[1.65rem] text-left"
          >
            <img src={a.cover} alt={`${a.name} atölye kapağı`} className="absolute inset-0 h-full w-full object-cover opacity-55" />
            <span className="atelier-card-veil" />
            <span className="relative z-10 flex min-h-[7.2rem] flex-col justify-end p-4">
              <span className={cn("text-[11px] font-semibold tracking-[0.16em] uppercase", a.tone === "orange" ? "text-ember" : a.tone === "azure" ? "text-azure" : a.tone === "green" ? "text-crystal" : "text-orbit")}>
                {a.kicker}
              </span>
              <span className="font-display mt-1 text-2xl font-semibold tracking-tight">{a.name}</span>
              <span className="mt-1 text-sm text-fg/85">{a.line}</span>
            </span>
          </button>
        ))}
      </div>

      <p className="text-center text-[11px] leading-relaxed text-subtle">
        NURA güzellik · CEHRA çehre look · RELYN netlik · REIRA yeniden çekim · PACCA klip ve şablon.
        Kimlik, yaş veya cinsiyet değişmez.
      </p>
      <input ref={fileRef} type="file" accept={IMAGE_ACCEPT} className="sr-only" onChange={(e) => void onFile(takeFile(e.currentTarget))} />
    </div>
  );
}
