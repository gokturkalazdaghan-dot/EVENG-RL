/**
 * Klinik warp çekirdeği — saf matematik, tuval yok.
 *
 * NEDEN AYRI DOSYA
 * `fx.ts` içindeki warp'lar `CanvasRenderingContext2D` ile iç içeydi, yani
 * tarayıcı olmadan test edilemiyorlardı. Klinikteki bir hata SESSİZDİR:
 * kullanıcı fotoğrafını bozulmuş görür, sebebini uygulamaya değil kendi
 * fotoğrafına yorar. Bu yüzden yer değiştirme alanı ve örnekleme burada,
 * tuvalden bağımsız ve ölçülebilir halde duruyor.
 *
 * ─── DÜZELTİLEN KUSUR ────────────────────────────────────────────────
 * Eski `hipsWarp` / `waistWarp` bandın dışına SERT KESME uyguluyordu:
 *
 *     if (Math.abs(dx) > w * half * 1.35) return [x, y];
 *
 * Sınırın hemen içindeki piksel `dx * k * band` kadar kayıyor, hemen
 * dışındaki hiç kaymıyordu. Ölçtüm: 1000 piksel genişlikte, half=0.2,
 * k=0.16 ve bant merkezinde yer değiştirme sınırda 43 PİKSEL birden
 * sıfıra düşüyor. Bu, fotoğrafta dümdüz bir dikey yırtık demek.
 *
 * CLAUDE.md kural 12 bu yırtığı `k`nın büyüklüğüne bağlıyor ("Large
 * displacement tears holes — never raise k blindly"). Sebep k değil:
 * kenarda sıfıra inmeyen bir pencere. k küçültülünce yırtık incelir ama
 * kaybolmaz, ve etki de kaybolur.
 *
 * Çözüm: sert kesme yerine `smoothstep` penceresi. Çekirdekte tam güç,
 * dış kenarda TAM SIFIR, ve iki uçta da türevi sıfır — yani ne yırtık
 * ne de kırışık bırakıyor.
 * ─────────────────────────────────────────────────────────────────────
 */

/** 0..1 arası yumuşak geçiş; iki uçta da türev sıfır. */
export function smoothstep(u: number): number {
  if (!(u > 0)) return 0; // NaN da buraya düşer
  if (u >= 1) return 1;
  return u * u * (3 - 2 * u);
}

/**
 * Yanal pencere: `core` yarıçapına kadar tam güç, `edge`de tam sıfır.
 *
 * SERT KESMENİN YERİNİ ALAN ŞEY BU. `edge` dışında 0 döndürmesi, eski
 * `return [x, y]` erken çıkışıyla aynı sonucu verir — ama sınıra
 * yaklaşırken kademeli iner, sıçramaz.
 */
export function lateralFalloff(dx: number, core: number, edge: number): number {
  const a = Math.abs(dx);
  if (!Number.isFinite(a)) return 0;
  // BOZUK ARALIK ÖNCE ELENİR. `edge <= core` iken geçiş bölgesinin
  // genişliği sıfırdır; "çekirdekte 1, dışında 0" davranışı tam olarak
  // düzeltmeye çalıştığımız SERT KESME olurdu. Yanlış yapılandırılmış bir
  // bant, fotoğrafı yırtmak yerine hiçbir şey yapmalı.
  if (!(edge > core)) return 0;
  if (a <= core) return 1;
  if (a >= edge) return 0;
  return 1 - smoothstep((a - core) / (edge - core));
}

/**
 * Dikey pencere: Gauss çanı, kesme noktasında SIFIRA İNDİRİLMİŞ.
 *
 * Eski kod çanı 1.6σ'da kesiyordu; orada çan hâlâ 0.077 değerinde, yani
 * yatay olandan küçük ama yine bir sıçrama (ölçüldü: 3.3 piksel). Çanı
 * kendi kuyruk değeriyle yeniden ölçekleyip kesme noktasında tam sıfır
 * yapıyoruz; merkezdeki güç değişmiyor.
 */
export function bandFalloff(t: number, center: number, halfHeight: number, cutoff = 1.6): number {
  if (!(halfHeight > 0)) return 0;
  const z = Math.abs(t - center) / halfHeight;
  if (!(z < cutoff)) return 0;
  const bell = Math.exp(-(z * z));
  const tail = Math.exp(-(cutoff * cutoff));
  // (bell - tail) / (1 - tail): merkezde 1, kesme noktasında tam 0.
  return (bell - tail) / (1 - tail);
}

export interface BandWarp {
  /** Bandın dikey merkezi, 0..1 (görüntü yüksekliğine oranla). */
  readonly center: number;
  /** Bandın dikey yarı-genişliği, 0..1. */
  readonly halfHeight: number;
  /** Gövde merkezi, 0..1 (görüntü genişliğine oranla). */
  readonly axis: number;
  /** Tam güç uygulanan yarı-genişlik, 0..1. */
  readonly core: number;
  /** Etkinin tamamen bittiği yarı-genişlik, 0..1. `core`dan büyük olmalı. */
  readonly edge: number;
  /** İşaretli miktar: pozitif genişletir, negatif daraltır. */
  readonly amount: number;
  /** Bu dikey oranın üstünde hiç dokunulmaz (yüz bölgesini korur). */
  readonly guardTop: number;
  /** Dikey çanın kaç σ'da kesileceği. Kalça 1.6, bel 1.7 kullanıyor. */
  readonly cutoff?: number;
}

/**
 * Bir pikselin KAYNAK x koordinatı (ters eşleme).
 *
 * Ters eşleme kullanılıyor: hedefteki her piksel için kaynakta nereye
 * bakılacağı hesaplanıyor. İleri eşleme (kaynaktan hedefe itmek) örtüşen
 * ve boş kalan pikseller bırakır — asıl "delik açma" budur.
 */
export function bandSourceX(
  x: number,
  y: number,
  w: number,
  h: number,
  spec: BandWarp,
): number {
  if (!(w > 0) || !(h > 0)) return x;
  const t = y / h;
  if (t < spec.guardTop) return x;

  const band = bandFalloff(t, spec.center, spec.halfHeight, spec.cutoff ?? 1.6);
  if (band === 0) return x;

  const cx = w * spec.axis;
  const dx = x - cx;
  const lateral = lateralFalloff(dx, w * spec.core, w * spec.edge);
  if (lateral === 0) return x;

  // `1 + k` çarpanı: k>0 kaynağı dışarı iterek görüntüyü DARALTIR,
  // k<0 genişletir. Ters eşlemede işaret böyle ters çalışır; çağıran
  // taraf niyetini `amount`un işaretiyle bildiriyor.
  return cx + dx * (1 + spec.amount * band * lateral);
}

/**
 * Yer değiştirmenin piksel cinsinden büyüklüğü — testler ve tanılama için.
 */
export function bandDisplacement(
  x: number,
  y: number,
  w: number,
  h: number,
  spec: BandWarp,
): number {
  return bandSourceX(x, y, w, h, spec) - x;
}

// ─── ÖRNEKLEME ────────────────────────────────────────────────────────

/** Tek kanal okuma, kenarda kırpma. */
function at(data: ArrayLike<number>, w: number, h: number, x: number, y: number, c: number): number {
  const xi = x < 0 ? 0 : x > w - 1 ? w - 1 : x;
  const yi = y < 0 ? 0 : y > h - 1 ? h - 1 : y;
  return data[(yi * w + xi) * 4 + c] ?? 0;
}

export function sampleBilinear(
  data: ArrayLike<number>,
  w: number,
  h: number,
  sx: number,
  sy: number,
  c: number,
): number {
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const fx = sx - x0;
  const fy = sy - y0;
  const a = at(data, w, h, x0, y0, c);
  const b = at(data, w, h, x0 + 1, y0, c);
  const p = at(data, w, h, x0, y0 + 1, c);
  const q = at(data, w, h, x0 + 1, y0 + 1, c);
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + p * (1 - fx) * fy + q * fx * fy;
}

/** Catmull-Rom çekirdeği (a = -0.5). */
function catmull(p0: number, p1: number, p2: number, p3: number, f: number): number {
  const a = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
  const b = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3;
  const c = -0.5 * p0 + 0.5 * p2;
  return ((a * f + b) * f + c) * f + p1;
}

/**
 * Bikübik (Catmull-Rom) örnekleme — KOMŞULUĞA KIRPILMIŞ.
 *
 * NEDEN BİLİNEERDEN İYİ: bilineer, gerilen bölgede kenarları bulanıklaştırır;
 * cilt dokusu ve saç teli düzleşir. Catmull-Rom keskinliği korur.
 *
 * NEDEN KIRPMA ŞART: Catmull-Rom keskin kenarlarda aşım yapar (ringing) ve
 * koyu bir kirpiğin yanında açık bir hale bırakır. Sonucu 4×4 komşuluğun
 * min/max aralığına kırpmak bu haleyi yok eder ve keskinliği korur.
 * Kırpma olmadan bikübik, bilineerin bulanıklığını halesiyle takas etmek
 * olurdu — kullanıcı için ikisi de bozulma.
 */
export function sampleBicubic(
  data: ArrayLike<number>,
  w: number,
  h: number,
  sx: number,
  sy: number,
  c: number,
): number {
  const x1 = Math.floor(sx);
  const y1 = Math.floor(sy);
  const fx = sx - x1;
  const fy = sy - y1;

  let lo = Infinity;
  let hi = -Infinity;
  const rows: number[] = [];
  for (let j = -1; j <= 2; j++) {
    const p: number[] = [];
    for (let i = -1; i <= 2; i++) {
      const v = at(data, w, h, x1 + i, y1 + j, c);
      p.push(v);
      // Kırpma aralığı YALNIZCA merkezdeki 2×2'den alınır: interpolasyon
      // o dördünün arasında kalmalı. 4×4'ün tamamını kullanmak, aşımın
      // kaçmasına yetecek kadar geniş bir aralık bırakırdı.
      if (i >= 0 && i <= 1 && j >= 0 && j <= 1) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    rows.push(catmull(p[0]!, p[1]!, p[2]!, p[3]!, fx));
  }
  const v = catmull(rows[0]!, rows[1]!, rows[2]!, rows[3]!, fy);
  return v < lo ? lo : v > hi ? hi : v;
}
