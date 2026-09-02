const TAGS = /<\/?[^>]+>/g;
const CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const HANDLE_OK = /[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ._]/g;

const MAGIC = {
  jpeg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47],
  webp: [0x52, 0x49, 0x46, 0x46],
} as const;

export const IMAGE_ACCEPT =
  "image/*,image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,.jpg,.jpeg,.png,.webp";

const MAX_BYTES = 28 * 1024 * 1024;
const MAX_EDGE = 1920;

const hits = new Map<string, number[]>();

export function sanitizeText(raw: unknown, max = 180): string {
  const s = String(raw ?? "")
    .replace(TAGS, "")
    .replace(CONTROLS, "")
    .replace(/javascript:/gi, "")
    .replace(/data:/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return s.slice(0, max);
}

export function sanitizeHandle(raw: unknown): string {
  const s = String(raw ?? "")
    .replace(TAGS, "")
    .replace(CONTROLS, "")
    .replace(HANDLE_OK, "")
    .slice(0, 18);
  return s || "sen";
}

export function allowAction(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const next = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (next.length >= max) return false;
  next.push(now);
  hits.set(key, next);
  return true;
}

function sniff(buf: Uint8Array): "jpeg" | "png" | "webp" | null {
  if (buf.length < 12) return null;
  if (MAGIC.jpeg.every((b, i) => buf[i] === b)) return "jpeg";
  if (MAGIC.png.every((b, i) => buf[i] === b)) return "png";
  if (
    MAGIC.webp.every((b, i) => buf[i] === b) &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

function isHeic(file: File) {
  const mime = (file.type || "").toLowerCase();
  return mime.includes("heic") || mime.includes("heif") || /\.hei[cf]$/i.test(file.name);
}

function drawToJpeg(img: HTMLImageElement | ImageBitmap): string {
  const w0 = "width" in img && typeof img.width === "number" ? img.width : (img as ImageBitmap).width;
  const h0 = "height" in img && typeof img.height === "number" ? img.height : (img as ImageBitmap).height;
  const scale = Math.min(1, MAX_EDGE / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas yok.");
  ctx.drawImage(img as CanvasImageSource, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.9);
}

async function decodeFile(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    if (typeof createImageBitmap === "function") {
      try {
        const bmp = await createImageBitmap(file);
        const jpeg = drawToJpeg(bmp);
        bmp.close();
        return jpeg;
      } catch {
        /* fall through to Image */
      }
    }
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode"));
      el.src = url;
    });
    return drawToJpeg(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function ingestImageFile(
  file: File | undefined | null,
): Promise<{ ok: true; dataUrl: string; name: string } | { ok: false; error: string }> {
  if (!file) return { ok: false, error: "Dosya seçilmedi." };
  if (file.size < 24) return { ok: false, error: "Dosya boş veya bozuk." };
  if (file.size > MAX_BYTES) return { ok: false, error: "En fazla 28 MB görsel." };

  const mime = (file.type || "").toLowerCase();
  if (mime.startsWith("video/")) return { ok: false, error: "Şimdilik fotoğraf seçin." };

  let buf: ArrayBuffer;
  try {
    buf = await file.arrayBuffer();
  } catch {
    return { ok: false, error: "Dosya okunamadı." };
  }

  const kind = sniff(new Uint8Array(buf));
  const heic = isHeic(file);
  if (!kind && !heic && mime && !mime.startsWith("image/")) {
    return { ok: false, error: "Yalnızca fotoğraf (JPEG, PNG, WebP, HEIC)." };
  }

  try {
    const blob = new Blob([buf], {
      type: kind === "png" ? "image/png" : kind === "webp" ? "image/webp" : mime || "image/jpeg",
    });
    const asFile = new File([blob], file.name || "photo.jpg", { type: blob.type });
    const dataUrl = await decodeFile(asFile);
    const name = sanitizeText(file.name.replace(/\.[^.]+$/, ""), 40) || "Adsız";
    return { ok: true, dataUrl, name };
  } catch {
    return { ok: false, error: "Bu kare okunamadı. Başka bir fotoğraf deneyin." };
  }
}

export function takeFile(input: HTMLInputElement | null): File | undefined {
  const file = input?.files?.[0];
  if (input) input.value = "";
  return file;
}
