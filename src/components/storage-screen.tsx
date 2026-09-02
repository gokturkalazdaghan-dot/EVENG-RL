import { CrystalButton } from "@/components/crystal-button";
import { gatedDownload } from "@/lib/download";
import { useApp } from "@/lib/store";
import { formatMb } from "@/lib/utils";

export function StorageScreen() {
  const storage = useApp((s) => s.storage);
  const cleanTemp = useApp((s) => s.cleanTemp);
  const backupActive = useApp((s) => s.backupActive);
  const projects = useApp((s) => s.projects);
  const latestOf = useApp((s) => s.latestOf);
  const activeProjectId = useApp((s) => s.activeProjectId);

  const used = storage.temp + storage.previews + storage.models;
  const cap = 4000;
  const pct = Math.min(100, Math.round((used / cap) * 100));
  const project = projects.find((p) => p.id === activeProjectId) ?? projects[0];

  return (
    <div className="flex flex-col gap-4 pb-8">
      <h1 className="font-display text-[1.85rem] font-semibold tracking-tight">Depolama</h1>

      <div className="panel rounded-3xl p-5">
        <p className="font-display text-4xl font-semibold tracking-tight tabular-nums">
          {formatMb(used)}
        </p>
        <p className="mt-1 text-sm text-muted">
          4 GB sınırın %{pct}
          {"'"}i
        </p>
        <div className="progress-crystal mt-4">
          <span style={{ width: `${pct}%` }} />
        </div>
        <dl className="mt-5 space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Geçici render dosyaları</dt>
            <dd className="tabular-nums">{formatMb(storage.temp)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Önizlemeler</dt>
            <dd className="tabular-nums">{formatMb(storage.previews)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Çevrimdışı AI modelleri</dt>
            <dd className="tabular-nums">{formatMb(storage.models)}</dd>
          </div>
        </dl>
      </div>

      <CrystalButton
        tone="ghost"
        size="lg"
        onClick={() => {
          const src = backupActive();
          const latest = latestOf(project);
          if (src && latest) {
            gatedDownload(src, `even-ai-${project?.title ?? "yedek"}.jpg`);
          }
        }}
      >
        Bu projeyi yedekle
      </CrystalButton>

      <CrystalButton tone="orange" size="xl" onClick={cleanTemp}>
        Geçici dosyaları temizle
      </CrystalButton>

      <p className="text-center text-sm text-subtle">
        Projeleriniz bu temizlikten etkilenmez.
      </p>
    </div>
  );
}
