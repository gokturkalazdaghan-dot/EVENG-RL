/**
 * Fal okumasının cihaz üstü yolu — tuvalden piksele, oradan `oracle-local`e.
 *
 * SIRA: önce sunucu (`readOracle`, XAI_API_KEY ile daha zengin okuma),
 * başarısızsa cihaz. CLAUDE.md kuralı: "always keep on-device fallback."
 * Üretim ve video tarafında o yedek vardı; falda hiç yoktu ve anahtar
 * tanımlı değilken kahve falı, el falı ve rüya tabirinin üçü birden
 * "Reading is closed right now." diyordu.
 *
 * Bu dosya TUVALE dokunan tek katman. Okuma kuralları `oracle-local.ts`
 * içinde saf ve tarayıcısız test edilebilir halde duruyor.
 */

import {
  analyzePalm,
  analyzePlate,
  coffeeReading,
  dreamReading,
  palmReading,
} from "./oracle-local.ts";
import type { OracleKind, OracleLetter } from "./oracle.ts";

/**
 * Analiz çözünürlüğü.
 *
 * Telefon fotoğrafı 12 megapiksel olabilir; her pikseli taramak ana iş
 * parçacığını saniyelerce kilitler ve kullanıcı uygulamanın donduğunu
 * sanır. 256 kenar, işaretin biçimini ve konumunu ölçmeye fazlasıyla
 * yetiyor — telve lekesi zaten kaba bir şekil.
 */
const ANALYSIS_EDGE = 256;

async function toImageData(src: string): Promise<{ data: Uint8ClampedArray; w: number; h: number } | null> {
  if (typeof document === "undefined") return null;
  if (typeof src !== "string" || src.length === 0) return null;
  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => resolve(null);
    el.src = src;
  });
  if (!img || !img.width || !img.height) return null;

  const scale = Math.min(1, ANALYSIS_EDGE / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  try {
    const d = ctx.getImageData(0, 0, w, h);
    return { data: d.data, w, h };
  } catch {
    // Kirlenmiş tuval (çapraz kaynak görsel). Kullanıcının kendi
    // fotoğrafı `data:` URL olduğu için normalde olmaz.
    return null;
  }
}

export type DeviceReadInput = {
  readonly kind: OracleKind;
  readonly images?: readonly string[];
  readonly dream?: string;
};

export type DeviceReadResult =
  | { readonly ok: true; readonly letter: OracleLetter }
  | { readonly ok: false; readonly error: string };

/**
 * Cihaz üstü okuma.
 *
 * HER BAŞARISIZLIK SEBEBİNİ SÖYLER. "Okuma kapalı" gibi tek bir genel
 * hata, kullanıcıya ne yapması gerektiğini söylemez: fincanın üç açısı mı
 * eksik, rüya mı çok kısa, fotoğraf mı okunamadı — hepsi ayrı mesaj.
 */
export async function readOracleOnDevice(input: DeviceReadInput): Promise<DeviceReadResult> {
  const kind = input.kind;

  if (kind === "dream") {
    const text = String(input.dream ?? "").trim();
    if (text.length < 12) {
      return { ok: false, error: "Rüyayı birkaç cümleyle anlat." };
    }
    const letter = dreamReading(text);
    if (!letter) {
      // UYDURMA YOK: tanınan imge yoksa okuma üretilmiyor. Boş bir metne
      // "büyük bir değişim yaklaşıyor" demek, falı süse çevirir.
      return {
        ok: false,
        error: "Rüyanda tuttuğum bir imge çıkmadı. Gördüğün nesneleri de yazar mısın?",
      };
    }
    return { ok: true, letter };
  }

  const sources = (input.images ?? []).filter((s): s is string => typeof s === "string" && s.length > 0);

  if (kind === "palm") {
    if (sources.length < 1) return { ok: false, error: "Avuç içinin net bir fotoğrafı gerekli." };
    const img = await toImageData(sources[0]!);
    if (!img) return { ok: false, error: "Fotoğraf okunamadı. Yeniden çek." };
    const f = analyzePalm(img.data, img.w, img.h);
    if (f.density < 0.02) {
      return { ok: false, error: "Avuçta çizgi seçilmedi. Işığı artırıp eli düz tut." };
    }
    return { ok: true, letter: palmReading(f) };
  }

  if (sources.length < 3) {
    return { ok: false, error: "Fincanın üç açısı gerekli: üst, kulp ve karşı ağız." };
  }
  const plates = [];
  for (const src of sources.slice(0, 3)) {
    const img = await toImageData(src);
    if (!img) return { ok: false, error: "Fincan fotoğrafı okunamadı. Yeniden çek." };
    plates.push(analyzePlate(img.data, img.w, img.h));
  }
  if (plates.every((p) => p.coverage < 0.01)) {
    return { ok: false, error: "Fincanda telve görünmüyor. Işığı artırıp içini çek." };
  }
  return { ok: true, letter: coffeeReading(plates) };
}
