/**
 * 3B LUT (.cube) renk motoru.
 *
 * NEDEN ÖNCE BU
 * Filtreler, model dosyası GEREKTİRMEYEN tek gerçek düzenleme özelliği.
 * Yapay zeka ağırlıkları gelmeden de kullanıcı bugün fotoğrafına bir
 * bakış uygulayıp dışa aktarabilir.
 *
 * BURASI SAF: dosya okuma ve GPU çizimi yok. `.cube` metnini ayrıştırır,
 * kafesi doğrular ve tek bir rengin dönüşümünü hesaplar. Bu ayrım, renk
 * matematiğini native GPU yolundan bağımsız test edilebilir kılıyor —
 * yanlış bir interpolasyon fotoğrafın rengini sessizce kaydırır ve
 * kullanıcı sebebini asla bulamaz.
 *
 * TRİLİNEER İNTERPOLASYON
 * 33³ bir kafes 35 937 nokta tutar; 16,7 milyon olası renk yok. Aradaki
 * renkler sekiz komşudan ağırlıklı ortalamayla bulunur. En yakın noktayı
 * seçmek (nearest) bant (posterization) üretir — gökyüzü gibi yumuşak
 * geçişlerde hemen görünür.
 */

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface CubeLut {
  readonly title: string;
  /** Kenar başına nokta sayısı (tipik 17, 32, 33, 64). */
  readonly size: number;
  /** Girdi aralığı — çoğu LUT 0..1 ama HDR LUT'ları farklı olabilir. */
  readonly domainMin: Rgb;
  readonly domainMax: Rgb;
  /** size³ uzunluğunda, R en hızlı değişen eksen (.cube standardı). */
  readonly table: Float32Array;
}

export type LutError =
  | 'empty'
  | 'missing-size'
  | 'invalid-size'
  | 'bad-entry'
  | 'entry-count-mismatch'
  | 'invalid-domain';

export type LutResult =
  | { readonly ok: true; readonly lut: CubeLut }
  | { readonly ok: false; readonly reason: LutError; readonly line?: number };

/** Adobe Cube spesifikasyonunun izin verdiği aralık. */
const MIN_SIZE = 2;
const MAX_SIZE = 256;

/**
 * `.cube` metnini ayrıştırır.
 *
 * HATALI DOSYA SESSİZCE KABUL EDİLMEZ. Eksik satırlı bir LUT'u kalan
 * verisiyle uygulamak, fotoğrafın bir bölümünün rengini bozar ve
 * kullanıcı bunu filtreye değil fotoğrafına yorar.
 */
export function parseCube(text: string): LutResult {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return { ok: false, reason: 'empty' };
  }

  let title = 'Untitled';
  let size = 0;
  let domainMin: Rgb = { r: 0, g: 0, b: 0 };
  let domainMax: Rgb = { r: 1, g: 1, b: 1 };
  const values: number[] = [];

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? '';
    // Yorum ve boş satırlar atlanır. `#` satır ortasında da yorum başlatır.
    const line = raw.split('#')[0]?.trim() ?? '';
    if (line.length === 0) continue;

    const parts = line.split(/\s+/);
    const head = (parts[0] ?? '').toUpperCase();

    if (head === 'TITLE') {
      title = line.slice(line.indexOf(' ') + 1).replace(/^"|"$/g, '').trim() || 'Untitled';
      continue;
    }
    if (head === 'LUT_3D_SIZE') {
      size = Number(parts[1]);
      continue;
    }
    if (head === 'LUT_1D_SIZE') {
      // 1B LUT bu motorda desteklenmiyor; sessizce 3B sanmak yerine
      // açıkça reddediliyor.
      return { ok: false, reason: 'invalid-size', line: i + 1 };
    }
    if (head === 'DOMAIN_MIN' || head === 'DOMAIN_MAX') {
      const rgb = readRgb(parts.slice(1));
      if (!rgb) return { ok: false, reason: 'invalid-domain', line: i + 1 };
      if (head === 'DOMAIN_MIN') domainMin = rgb;
      else domainMax = rgb;
      continue;
    }

    // Veri satırı: üç kayan nokta.
    const rgb = readRgb(parts);
    if (!rgb) return { ok: false, reason: 'bad-entry', line: i + 1 };
    values.push(rgb.r, rgb.g, rgb.b);
  }

  if (size === 0) return { ok: false, reason: 'missing-size' };
  if (!Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE) {
    return { ok: false, reason: 'invalid-size' };
  }

  const expected = size * size * size * 3;
  if (values.length !== expected) {
    return { ok: false, reason: 'entry-count-mismatch' };
  }

  if (
    domainMax.r <= domainMin.r ||
    domainMax.g <= domainMin.g ||
    domainMax.b <= domainMin.b
  ) {
    // Ters ya da sıfır genişlikte alan, sıfıra bölme demektir.
    return { ok: false, reason: 'invalid-domain' };
  }

  return {
    ok: true,
    lut: { title, size, domainMin, domainMax, table: Float32Array.from(values) },
  };
}

function readRgb(parts: readonly string[]): Rgb | null {
  if (parts.length < 3) return null;
  const r = Number(parts[0]);
  const g = Number(parts[1]);
  const b = Number(parts[2]);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null;
  return { r, g, b };
}

/**
 * 0..1'e kırpar. NaN DA 0'a düşer: `v > 0` karşılaştırması NaN için
 * yanlıştır. Bu kasıtlı — bozuk tek bir piksel değeri NaN olarak geçerse
 * trilineer interpolasyonun sekiz komşusunu da NaN yapar ve o piksel dışa
 * aktarımda tanımsız renge dönüşür.
 */
const clamp01 = (v: number): number => (v > 0 ? (v > 1 ? 1 : v) : 0);

/** Kafesteki (ri, gi, bi) noktasının rengi. R en hızlı değişen eksen. */
function sample(lut: CubeLut, ri: number, gi: number, bi: number): Rgb {
  const n = lut.size;
  const index = (ri + gi * n + bi * n * n) * 3;
  return {
    r: lut.table[index] ?? 0,
    g: lut.table[index + 1] ?? 0,
    b: lut.table[index + 2] ?? 0,
  };
}

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Tek bir rengi LUT'tan geçirir — trilineer interpolasyonla.
 *
 * Girdi alan (domain) dışındaysa KIRPILIR, sarmalanmaz: sarmalama, aşırı
 * pozlanmış bir gökyüzünü aniden koyu yapar.
 */
export function applyLut(lut: CubeLut, color: Rgb): Rgb {
  const n = lut.size;
  const last = n - 1;

  const normalize = (value: number, min: number, max: number): number =>
    clamp01((value - min) / (max - min));

  const x = normalize(color.r, lut.domainMin.r, lut.domainMax.r) * last;
  const y = normalize(color.g, lut.domainMin.g, lut.domainMax.g) * last;
  const z = normalize(color.b, lut.domainMin.b, lut.domainMax.b) * last;

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  // Üst komşu son noktayı AŞMAMALI. Kenarda ağırlık (fx) zaten 0 olduğu
  // için bu matematiksel olarak fark yaratmaz; ancak kırpma olmadan
  // `sample` kafesin BİR SONRAKİ satırını okur — yani doğru sonuç
  // "0 ile çarpılan yanlış veri"ye dayanır. Kırpma bu bağımlılığı
  // kaldırıyor: dizinin dışına ya da yanlış hücreye hiç bakılmıyor.
  const x1 = x0 < last ? x0 + 1 : last;
  const y1 = y0 < last ? y0 + 1 : last;
  const z1 = z0 < last ? z0 + 1 : last;

  const fx = x - x0;
  const fy = y - y0;
  const fz = z - z0;

  const c000 = sample(lut, x0, y0, z0);
  const c100 = sample(lut, x1, y0, z0);
  const c010 = sample(lut, x0, y1, z0);
  const c110 = sample(lut, x1, y1, z0);
  const c001 = sample(lut, x0, y0, z1);
  const c101 = sample(lut, x1, y0, z1);
  const c011 = sample(lut, x0, y1, z1);
  const c111 = sample(lut, x1, y1, z1);

  const lerpAxis = (a: Rgb, b: Rgb, t: number): Rgb => ({
    r: mix(a.r, b.r, t),
    g: mix(a.g, b.g, t),
    b: mix(a.b, b.b, t),
  });

  const c00 = lerpAxis(c000, c100, fx);
  const c10 = lerpAxis(c010, c110, fx);
  const c01 = lerpAxis(c001, c101, fx);
  const c11 = lerpAxis(c011, c111, fx);

  const c0 = lerpAxis(c00, c10, fy);
  const c1 = lerpAxis(c01, c11, fy);

  return lerpAxis(c0, c1, fz);
}

/**
 * Filtre şiddeti: özgün renk ile LUT sonucu arasında karışım.
 *
 * `strength` 0..1 dışına ÇIKAMAZ. 1'in üstüne izin vermek, LUT'un
 * ötesine extrapolasyon yapıp doygunluğu patlatır — kullanıcı kaydırıcıyı
 * sonuna kadar itince fotoğrafın bozulduğunu görür.
 */
export function blend(original: Rgb, graded: Rgb, strength: number): Rgb {
  const t = Number.isFinite(strength) ? clamp01(strength) : 1;
  return {
    r: mix(original.r, graded.r, t),
    g: mix(original.g, graded.g, t),
    b: mix(original.b, graded.b, t),
  };
}

/**
 * Kimlik LUT'u — hiçbir şeyi değiştirmeyen kafes.
 *
 * Testler ve "filtre yok" durumu için. Bir filtrenin gerçekten kimlik
 * olup olmadığını ölçmek, LUT boru hattının doğru kablolandığını
 * kanıtlamanın en kısa yolu.
 */
export function identityLut(size = 17): CubeLut {
  const table = new Float32Array(size * size * size * 3);
  const last = size - 1;
  let i = 0;
  for (let b = 0; b < size; b += 1) {
    for (let g = 0; g < size; g += 1) {
      for (let r = 0; r < size; r += 1) {
        table[i] = r / last;
        table[i + 1] = g / last;
        table[i + 2] = b / last;
        i += 3;
      }
    }
  }
  return {
    title: 'Identity',
    size,
    domainMin: { r: 0, g: 0, b: 0 },
    domainMax: { r: 1, g: 1, b: 1 },
    table,
  };
}
