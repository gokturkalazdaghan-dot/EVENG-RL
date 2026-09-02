import { CrystalButton } from "@/components/crystal-button";
import { IMAGE_ACCEPT, ingestImageFile, takeFile } from "@/lib/guard";
import { useApp } from "@/lib/store";
import { useRef, useState } from "react";

export function CreateSheet() {
  const open = useApp((s) => s.createOpen);
  const setCreateOpen = useApp((s) => s.setCreateOpen);
  const createProject = useApp((s) => s.createProject);
  const setAtelier = useApp((s) => s.setAtelier);
  const setCaption = useApp((s) => s.setCaption);
  const flash = useApp((s) => s.flash);
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  if (!open) return null;

  async function ingest(file: File | undefined) {
    setBusy(true);
    const result = await ingestImageFile(file);
    setBusy(false);
    if (!result.ok) {
      flash(result.error);
      return null;
    }
    setPicked(result.dataUrl);
    return result;
  }

  async function openStudio() {
    const file = fileRef.current?.files?.[0];
    const result = picked
      ? { ok: true as const, dataUrl: picked, name: "Oluştur" }
      : await ingest(file);
    if (!result || !("dataUrl" in result)) return;
    if (note.trim()) setCaption(note);
    setCreateOpen(false);
    createProject(result.name, result.dataUrl);
  }

  async function runEven() {
    const file = fileRef.current?.files?.[0];
    const result = picked
      ? { ok: true as const, dataUrl: picked, name: "Oluştur" }
      : await ingest(file);
    if (!result || !("dataUrl" in result)) return;
    if (note.trim()) setCaption(note);
    setCreateOpen(false);
    createProject(result.name, result.dataUrl);
    setAtelier("even");
  }

  return (
    <div className="lightbox" data-create-sheet role="dialog" aria-modal="true" aria-label="Oluştur">
      <button type="button" className="lightbox-dismiss" aria-label="Kapat" onClick={() => setCreateOpen(false)} />
      <div className="lightbox-card">
        <p className="text-xs font-semibold tracking-[0.16em] text-muted uppercase">Oluştur</p>
        <h2 className="font-display mt-1 text-2xl font-semibold">Fotoğraf + EVEN</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Prompt buluta gitmez. Görsel JPEG olarak cihazda yeniden kodlanır; SVG ve HTML reddedilir.
        </p>
        <CrystalButton
          tone="orange"
          className="mt-4"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          Galeriden seç
        </CrystalButton>
        <input
          ref={fileRef}
          type="file"
          accept={IMAGE_ACCEPT}
          className="sr-only"
          onChange={(e) => void ingest(takeFile(e.currentTarget))}
        />
        {picked ? <img src={picked} alt="Seçilen portre önizlemesi" className="lightbox-photo" /> : null}
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={60}
          placeholder="Not (isteğe bağlı, 60 karakter)"
          aria-label="Oluşturma notu"
          className="min-h-11 w-full rounded-2xl bg-inset px-3 text-sm outline-none ring-1 ring-line"
        />
        <div className="flex gap-2">
          <CrystalButton tone="ghost" className="flex-1" disabled={busy} onClick={() => void openStudio()}>
            Stüdyoda aç
          </CrystalButton>
          <CrystalButton tone="green" className="flex-1" disabled={busy} onClick={() => void runEven()}>
            EVEN stüdyo
          </CrystalButton>
        </div>
      </div>
    </div>
  );
}
