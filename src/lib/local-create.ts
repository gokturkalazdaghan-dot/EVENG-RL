import { exportMotion, loadImage, makeCanvas, toJpeg } from "@/lib/fx";

const BASES = [
  "/media/portrait-elif.jpg",
  "/media/portrait-zeynep.jpg",
  "/media/portrait-arda.jpg",
  "/media/prism.jpg",
  "/media/loft.jpg",
];

function ratioSize(ratio: string) {
  if (ratio === "1:1") return { w: 1024, h: 1024 };
  if (ratio === "9:16") return { w: 768, h: 1365 };
  if (ratio === "16:9") return { w: 1365, h: 768 };
  return { w: 768, h: 1024 };
}

export async function localStill(prompt: string, ratio = "3:4"): Promise<string> {
  const pick = BASES[Math.abs(prompt.length + prompt.charCodeAt(0)) % BASES.length];
  const img = await loadImage(pick);
  const { w, h } = ratioSize(ratio);
  const src = makeCanvas(img, 1400);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas yok");
  const cover = Math.max(w / src.width, h / src.height) * 1.08;
  const dw = src.width * cover;
  const dh = src.height * cover;
  ctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
  const warm = /altın|gold|amber|saat/i.test(prompt);
  const cold = /buz|blue|gece|night|cam/i.test(prompt);
  ctx.fillStyle = warm ? "rgba(255,140,60,0.12)" : cold ? "rgba(40,90,180,0.14)" : "rgba(30,230,160,0.08)";
  ctx.fillRect(0, 0, w, h);
  return toJpeg(canvas, 0.9);
}

export async function localClip(src: string, seconds: number, caption = ""): Promise<string> {
  const blob = (await exportMotion(src, caption, seconds, "zoom")) as Blob;
  return URL.createObjectURL(blob);
}
