/**
 * Uygulamanın kendi kaynağını paketler: public/kod/EVENGIRL-KOD.zip
 *
 * NEDEN AYRI DOSYA, GÖMÜLÜ BASE64 DEĞİL
 * Önceki tasarım kaynağı `src/lib/kod-zip.ts` içinde base64 dizesi olarak
 * tutuyordu (o dosya devir zip'inde yoktu ve tip denetimini kırıyordu).
 * Base64 ikili veriyi %33 şişirir ve dize JS paketinin parçası olduğu için
 * UYGULAMAYI AÇAN HERKES onu indiriyordu — düğmeye hiç dokunmayanlar dahil.
 * Ayrı dosya olarak yalnızca basan indirir.
 *
 * NEDEN `zip` DEĞİL, fflate
 * `zip` ikilisi bu makinede var ama derleme ortamında (Vercel) garanti
 * değil. Eksikse derleme, sebebi anlaşılmaz bir ENOENT ile düşerdi.
 * fflate zaten bağımlılık listesinde.
 *
 * Çıktı git'e girmez (.gitignore); `npm run build` öncesi üretilir.
 */
import { zipSync } from "fflate";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "kod");
const outFile = join(outDir, "EVENGIRL-KOD.zip");

/** Paylaşılan kaynağa GİRMEYECEKLER: sırlar, anahtarlar, çıktılar. */
const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", ".output", ".vercel", ".nitro",
  ".gradle", "build", "kod", "mediapipe",
]);
const SKIP_FILE = /(^\.env)|(\.jks$)|(\.keystore$)|(^banuba\.properties$)|(\.p12$)|(\.pepk$)/;

/** @type {Record<string, Uint8Array>} */
const files = {};
let bytes = 0;

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(join(dir, entry.name));
      continue;
    }
    if (!entry.isFile()) continue;
    if (SKIP_FILE.test(entry.name)) continue;
    const full = join(dir, entry.name);
    // 5 MB üstü ikilileri dışarıda tut: model ağırlıkları ve benzerleri
    // kaynak paylaşımının konusu değil, paylaşımı da kullanılamaz kılar.
    if (statSync(full).size > 5 * 1024 * 1024) continue;
    const rel = relative(root, full).split(sep).join("/");
    files[rel] = new Uint8Array(readFileSync(full));
    bytes += files[rel].length;
  }
}

walk(root);
mkdirSync(outDir, { recursive: true });
const zipped = zipSync(files, { level: 6 });
writeFileSync(outFile, zipped);
console.log(
  `[make-kod-zip] ${Object.keys(files).length} dosya, ` +
    `${(bytes / 1024).toFixed(0)} KB → ${(zipped.length / 1024).toFixed(0)} KB`,
);
