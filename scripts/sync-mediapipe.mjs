/**
 * Klinik (Araçlar) yüz ağı varlıklarını public/mediapipe/ altına koyar.
 *
 * NEDEN GEREKLİ
 * `src/lib/clinic-vision.ts`, FaceLandmarker'ı `/mediapipe/wasm` ve
 * `/mediapipe/face_landmarker.task` yollarından yükler. İkisi de yoksa
 * `getLandmarker()` catch bloğuna düşer, `meshFailed = true` olur ve klinik
 * SESSİZCE yüz ağı olmadan çalışır — dudak/göz/çene işlemleri kabaca
 * konumlanır, kullanıcı sebebini asla göremez. Konsolda tek satır hata bile
 * yok. Bu yüzden varlıklar derleme öncesi buraya senkronlanıyor.
 *
 * WASM node_modules'tan kopyalanır (sürüm paketle kilitli kalsın diye).
 * Model dosyası Google'ın MediaPipe CDN'inden çekilir; SHA-256 yazdırılır ki
 * bir sonraki çalıştırma aynı ikiliyi aldığını doğrulayabilsin.
 */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "mediapipe");
const wasmSrc = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const modelUrl =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const modelOut = join(outDir, "face_landmarker.task");

mkdirSync(outDir, { recursive: true });

if (!existsSync(wasmSrc)) {
  console.error("[mediapipe] node_modules/@mediapipe/tasks-vision/wasm yok — önce npm install");
  process.exit(1);
}
cpSync(wasmSrc, join(outDir, "wasm"), { recursive: true });
console.log("[mediapipe] wasm kopyalandı ← node_modules");

if (existsSync(modelOut)) {
  const sum = createHash("sha256").update(readFileSync(modelOut)).digest("hex");
  console.log(`[mediapipe] model zaten var — sha256 ${sum.slice(0, 16)}…`);
} else {
  const res = await fetch(modelUrl);
  if (!res.ok) {
    console.error(`[mediapipe] model indirilemedi: HTTP ${res.status}`);
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(modelOut, buf);
  const sum = createHash("sha256").update(buf).digest("hex");
  console.log(`[mediapipe] model indirildi — ${(buf.length / 1024 / 1024).toFixed(1)} MB, sha256 ${sum.slice(0, 16)}…`);
}
