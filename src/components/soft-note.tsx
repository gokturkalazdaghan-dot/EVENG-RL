import { CrystalButton } from "@/components/crystal-button";
import type { SoftNote } from "@/lib/soft-note";
import { useEffect, useState } from "react";

export function SoftNoteHost() {
  const [note, setNote] = useState<SoftNote | null>(null);

  useEffect(() => {
    function on(e: Event) {
      const d = (e as CustomEvent<SoftNote>).detail;
      if (d?.title) setNote(d);
    }
    window.addEventListener("even:note", on);
    return () => window.removeEventListener("even:note", on);
  }, []);

  if (!note) return null;

  return (
    <div className="soft-note" role="alertdialog" aria-labelledby="soft-note-t">
      <div className="soft-note-card glass">
        <h2 id="soft-note-t">{note.title}</h2>
        <p>{note.body}</p>
        <CrystalButton pill onClick={() => setNote(null)}>
          Tamam
        </CrystalButton>
      </div>
    </div>
  );
}
