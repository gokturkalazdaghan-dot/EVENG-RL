import { useState, type DragEvent } from "react";

export function useDropFile(onFile: (file: File) => void) {
  const [over, setOver] = useState(false);

  function take(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    const list = e.dataTransfer?.files;
    if (!list?.length) return;
    const file = [...list].find(
      (f) => f.type.startsWith("image/") || /\.(hei[cf]|jpe?g|png|webp)$/i.test(f.name),
    );
    if (file) onFile(file);
  }

  return {
    over,
    bind: {
      onDragEnter: (e: DragEvent) => {
        e.preventDefault();
        setOver(true);
      },
      onDragOver: (e: DragEvent) => {
        e.preventDefault();
        setOver(true);
      },
      onDragLeave: (e: DragEvent) => {
        e.preventDefault();
        setOver(false);
      },
      onDrop: take,
    },
  };
}
