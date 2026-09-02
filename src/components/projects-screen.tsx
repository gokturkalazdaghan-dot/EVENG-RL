import { BearPair } from "@/components/mascots";
import { CrystalButton } from "@/components/crystal-button";
import { IMAGE_ACCEPT, ingestImageFile, takeFile } from "@/lib/guard";
import { shareKodZip } from "@/lib/share-zip";
import { useApp } from "@/lib/store";
import { useFastTap } from "@/lib/fast-tap";
import { useRef, useState } from "react";

export function ProjectsScreen() {
  const projects = useApp((s) => s.projects).filter(
    (p) => p && p.id !== "proj-portre" && p.id !== "proj-sokak" && p.id !== "proj-adsiz",
  );
  const openProject = useApp((s) => s.openProject);
  const createProject = useApp((s) => s.createProject);
  const createBlank = useApp((s) => s.createBlank);
  const duplicateProject = useApp((s) => s.duplicateProject);
  const deleteProject = useApp((s) => s.deleteProject);
  const latestOf = useApp((s) => s.latestOf);
  const flash = useApp((s) => s.flash);
  const fileRef = useRef<HTMLInputElement>(null);
  const tapLogo = useFastTap(() => createBlank());
  const [busy, setBusy] = useState(false);
  const tapZip = useFastTap(() => {
    if (busy) return;
    setBusy(true);
    void shareKodZip()
      .then(() => flash("Paylaş → Dosyalar’a Kaydet"))
      .catch(() => flash("Paylaş menüsü açılmadı, tekrar dene."))
      .finally(() => setBusy(false));
  });

  async function onFile(file: File | undefined) {
    const result = await ingestImageFile(file);
    if (!result.ok) {
      flash(result.error);
      return;
    }
    createProject(result.name, result.dataUrl);
  }

  return (
    <div className="home-logo">
      <button type="button" className="home-mark" aria-label="EVENGIRL" {...tapLogo}>
        <BearPair size={78} />
        <p className="mascot-kicker">EVENGIRL</p>
      </button>
      <div className="home-actions">
        <CrystalButton size="md" tone="ghost" pill onClick={() => fileRef.current?.click()}>
          Fotoğraf
        </CrystalButton>
        <CrystalButton size="md" tone="orange" pill onClick={() => createBlank()}>
          Boş tuval
        </CrystalButton>
      </div>
      <button type="button" className="zip-dl" {...tapZip}>
        {busy ? "Hazırlanıyor…" : "ZIP İNDİR"}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept={IMAGE_ACCEPT}
        className="sr-only"
        onChange={(e) => onFile(takeFile(e.currentTarget))}
      />
      {projects.length ? (
        <ul className="home-list">
          {projects.map((project) => {
            const latest = latestOf(project);
            const original = project.versions.find((v) => v.kind === "original");
            return (
              <li key={project.id} className="home-item">
                <button type="button" className="home-open" onClick={() => openProject(project.id)}>
                  <img src={latest?.image ?? original?.image} alt="" />
                  <span>{project.title}</span>
                </button>
                <div className="home-item-ops">
                  <CrystalButton size="sm" tone="ghost" pill onClick={() => duplicateProject(project.id)}>
                    Kopyala
                  </CrystalButton>
                  <CrystalButton size="sm" tone="ghost" pill onClick={() => deleteProject(project.id)}>
                    Sil
                  </CrystalButton>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
