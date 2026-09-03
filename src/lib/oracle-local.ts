/**
 * Cihaz üstü Kahin — anahtar gerektirmeyen fal okuyucusu.
 *
 * ─── NEDEN VAR ───────────────────────────────────────────────────────
 * `readOracle` (oracle.ts) `XAI_API_KEY` olmadan tek satır döndürüyordu:
 * "Reading is closed right now." Yani anahtar tanımlı değilse kahve falı,
 * el falı ve rüya tabirinin ÜÇÜ BİRDEN ölüydü — uygulamanın PRO ile
 * satılan ana özelliği.
 *
 * CLAUDE.md'nin kendi kuralı: "always keep on-device fallback." Üretim ve
 * video tarafında o yedek var; falda hiç yoktu.
 *
 * ─── NE YAPMIYOR ─────────────────────────────────────────────────────
 * RASTGELE METİN ÜRETMİYOR. Rastgele bir okuma, olmayan bir özelliği var
 * göstermek olurdu — hiç okumamaktan kötü. Buradaki her cümle iki şeyden
 * türüyor:
 *
 *   1. Fotoğraftan GERÇEKTEN ÖLÇÜLEN nicelikler (telve yoğunluğu, en
 *      büyük lekenin konumu ve biçimi, boşluk oranı, çizgi sürekliliği),
 *   2. `oracle-canon.ts` içindeki geleneksel külliyat.
 *
 * Aynı fincan aynı okumayı verir. Bu, uzak modelden DAHA tutarlı: kullanıcı
 * ekranı kapatıp açtığında falı değişmez.
 *
 * ─── SAF ─────────────────────────────────────────────────────────────
 * Tuval yok, ağ yok. Çağıran taraf piksel verisini çıkarır, buradaki
 * fonksiyonlar yalnızca sayı ve metinle çalışır — tarayıcısız test edilir.
 */

import {
  COFFEE_SIGN_TABLE,
  DREAM_SIGNS,
  ORACLE_AGENTS,
  PALM_SIGN_TABLE,
  WAIT_BOOKS,
} from "./oracle-canon.ts";
import type { OracleKind, OracleLetter } from "./oracle.ts";
import type { Temperament } from "./natal.ts";

// ─── ÖLÇÜM ────────────────────────────────────────────────────────────

/** Bir fincan karesinden çıkarılan nicelikler. */
export interface PlateFeatures {
  /** Koyu (telve) piksellerin oranı, 0..1. */
  readonly coverage: number;
  /** Telve ağırlık merkezi, 0..1 (0 = sol/üst). */
  readonly centroidX: number;
  readonly centroidY: number;
  /** En büyük bağlı lekenin karenin alanına oranı. */
  readonly blobArea: number;
  /** En büyük lekenin en/boy oranı. >1 = yatık, <1 = dikey. */
  readonly blobAspect: number;
  /** En büyük lekenin merkezi. */
  readonly blobX: number;
  readonly blobY: number;
  /** Telve kütlesinin dağınıklığı, 0..1. Yüksek = ince toz, düşük = topak. */
  readonly scatter: number;
  /** En büyük kesintisiz açık alanın oranı. */
  readonly gap: number;
}

const EMPTY_PLATE: PlateFeatures = {
  coverage: 0,
  centroidX: 0.5,
  centroidY: 0.5,
  blobArea: 0,
  blobAspect: 1,
  blobX: 0.5,
  blobY: 0.5,
  scatter: 0,
  gap: 1,
};

/**
 * RGBA piksel dizisinden fincan niceliklerini çıkarır.
 *
 * Eşik SABİT DEĞİL, görüntünün kendi parlaklık ortalamasından türetiliyor:
 * sabit eşik, karanlıkta çekilmiş bir fincanı baştan aşağı "telve dolu"
 * gösterir ve okuma fotoğrafın pozlamasına göre değişir — kullanıcı
 * fincanını değil ışığını okumuş olurdu.
 */
export function analyzePlate(
  data: ArrayLike<number>,
  w: number,
  h: number,
): PlateFeatures {
  if (!(w > 0) || !(h > 0) || data.length < w * h * 4) return EMPTY_PLATE;

  // 1. Ortalama parlaklık → uyarlanır eşik.
  let sum = 0;
  const n = w * h;
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const v = (data[p] ?? 0) * 0.299 + (data[p + 1] ?? 0) * 0.587 + (data[p + 2] ?? 0) * 0.114;
    lum[i] = v;
    sum += v;
  }
  const mean = sum / n;
  // Ortalamanın %72'si: telve, fincan porselenine göre belirgin biçimde
  // koyudur; bu oran hem açık hem koyu pozlamada işareti ayırıyor.
  const threshold = mean * 0.72;

  // 2. Kaplama, ağırlık merkezi, dağınıklık.
  let dark = 0;
  let cx = 0;
  let cy = 0;
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (lum[i]! < threshold) {
      mask[i] = 1;
      dark++;
      cx += i % w;
      cy += (i / w) | 0;
    }
  }
  if (dark === 0) return EMPTY_PLATE;
  cx /= dark;
  cy /= dark;

  let spread = 0;
  for (let i = 0; i < n; i++) {
    if (!mask[i]) continue;
    const dx = (i % w) - cx;
    const dy = ((i / w) | 0) - cy;
    spread += Math.sqrt(dx * dx + dy * dy);
  }
  const maxSpread = Math.sqrt(w * w + h * h) / 2;
  const scatter = Math.min(1, spread / dark / maxSpread);

  // 3. En büyük bağlı leke — yığın tabanlı dolgu (özyineleme yığını taşırdı).
  const seen = new Uint8Array(n);
  const stack: number[] = [];
  let best = { area: 0, x0: 0, y0: 0, x1: 0, y1: 0 };
  for (let start = 0; start < n; start++) {
    if (!mask[start] || seen[start]) continue;
    let area = 0;
    let x0 = w;
    let y0 = h;
    let x1 = 0;
    let y1 = 0;
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i / w) | 0;
      area++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x > 0 && mask[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1); }
      if (x < w - 1 && mask[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1); }
      if (y > 0 && mask[i - w] && !seen[i - w]) { seen[i - w] = 1; stack.push(i - w); }
      if (y < h - 1 && mask[i + w] && !seen[i + w]) { seen[i + w] = 1; stack.push(i + w); }
    }
    if (area > best.area) best = { area, x0, y0, x1, y1 };
  }

  const bw = Math.max(1, best.x1 - best.x0 + 1);
  const bh = Math.max(1, best.y1 - best.y0 + 1);

  // 4. En büyük açık dikey şerit — "beyaz boşluk: açılmış kapı".
  let gapRun = 0;
  let gapBest = 0;
  for (let x = 0; x < w; x++) {
    let colDark = 0;
    for (let y = 0; y < h; y++) if (mask[y * w + x]) colDark++;
    if (colDark / h < 0.04) {
      gapRun++;
      if (gapRun > gapBest) gapBest = gapRun;
    } else gapRun = 0;
  }

  return {
    coverage: dark / n,
    centroidX: cx / w,
    centroidY: cy / h,
    blobArea: best.area / n,
    blobAspect: bw / bh,
    blobX: (best.x0 + best.x1) / 2 / w,
    blobY: (best.y0 + best.y1) / 2 / h,
    scatter,
    gap: gapBest / w,
  };
}

// ─── KÜLLİYAT ŞIKLARI ─────────────────────────────────────────────────

/**
 * Külliyat girdisi = bir öz + koşullu şıklar.
 *
 * Örnek (el falı):
 *   "gönlün nasıl harcandığı. Derin ve düz = sakin bağlılık.
 *    Zincirli = kesik iş. Kısa = duygunun çabuk kapanması."
 *
 * NEDEN AYRIŞTIRIYORUZ: girdinin tamamını kullanıcıya dökmek, ona SÖZLÜK
 * SAYFASI göstermek demek — "şu olabilir, bu olabilir, şu da olabilir".
 * Gerçek bir falcı avuca bakar ve HANGİ şıkkın geçtiğini söyler. Ölçüm
 * zaten elimizde; doğru şıkkı seçebiliyoruz.
 */
export interface CanonEntry {
  /** Girdinin ne hakkında olduğu (ilk cümle). */
  readonly gist: string;
  /** Koşul → anlam çiftleri. */
  readonly clauses: readonly { readonly when: string; readonly means: string }[];
}

export function parseCanonEntry(reading: string): CanonEntry {
  const parts = String(reading ?? "")
    .split(/(?<=[.!?])\s+|\s+—\s+/)
    .map((x) => x.trim())
    .filter(Boolean);

  const clauses: { when: string; means: string }[] = [];
  const rest: string[] = [];
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq > 0) {
      const when = part.slice(0, eq).trim();
      // Bir cümlede birden çok "=" olabilir ("Üst diş = erkek hısım, alt =
      // kadın hısım"). İkinci koşul, birincinin anlamının içinde kalıp
      // okumayı bozuyordu; virgülden kesiliyor.
      let means = part.slice(eq + 1).replace(/[.]$/, "").trim();
      const second = means.indexOf("=");
      if (second > 0) {
        const cut = means.lastIndexOf(",", second);
        if (cut > 0) means = means.slice(0, cut).trim();
      }
      if (when && means) {
        clauses.push({ when, means });
        continue;
      }
    }
    rest.push(part);
  }
  return { gist: (rest[0] ?? "").replace(/[.]$/, ""), clauses };
}

/**
 * Ölçüme uyan şıkkı seçer.
 *
 * `wanted` sırayla denenir; hiçbiri tutmazsa ilk şık, o da yoksa öz döner.
 * SESSİZCE BOŞ DÖNMEZ: fal ekranında boş bir satır, kullanıcının okumayı
 * yarım sanmasına yol açar.
 */
export function pickClause(reading: string, wanted: readonly string[]): string {
  const entry = parseCanonEntry(reading);
  for (const key of wanted) {
    const hit = entry.clauses.find((c) => c.when.toLocaleLowerCase("tr").includes(key.toLocaleLowerCase("tr")));
    if (hit) return `${hit.when} — ${hit.means}`;
  }
  if (entry.clauses[0]) return `${entry.clauses[0].when} — ${entry.clauses[0].means}`;
  return entry.gist || String(reading ?? "");
}

// ─── SEMBOL EŞLEME ────────────────────────────────────────────────────

/**
 * Külliyattaki bir sembolü adıyla bulur; yoksa null.
 *
 * KONUM ADDAN AYRILIYOR. İki külliyat girdisi konumu adının içinde taşıyor
 * ("kalın kara topak kulpta", "ince toz karşı ağızda"). O ad başka bir
 * kareye düştüğünde okuma kendisiyle çelişiyordu: "en dolu yeri DUVAR …
 * kalın kara topak KULPTA". Konum ifadesi ayrılıyor, ölçümün söylediği
 * kare geçerli kalıyor.
 */
const POSITION_SUFFIX = /\s+(kulpta|karşı ağızda|dipte|duvarda)$/;

function sign(name: string) {
  const found = COFFEE_SIGN_TABLE.find((s) => s.sign.startsWith(name));
  if (!found) return null;
  const bare = found.sign.replace(POSITION_SUFFIX, "");
  return bare === found.sign ? found : { sign: bare, reading: found.reading };
}

/**
 * Ölçülen biçimden külliyat sembolüne geçiş.
 *
 * Eşleme KURALLI: her ölçüm aralığı belli bir sembole gider ve tablo
 * dışına çıkmaz. Rastgele sembol seçmek, fotoğrafı hiç okumamakla aynı
 * şey olurdu.
 */
export function matchCoffeeSign(f: PlateFeatures): { sign: string; reading: string } {
  const fallback = { sign: "beyaz boşluk", reading: "açılmış kapı" };

  // Çok az telve: fincan gerçekten boş — açılmış kapı.
  if (f.coverage < 0.04) return sign("beyaz boşluk") ?? fallback;

  // ─────────────────────────────────────────────────────────────────
  // BELİRGİN İŞARET, BOŞLUKTAN ÖNCE GELİR.
  //
  // Eskiden `gap > 0.28` kuralı buradaydı ve her şeyi eziyordu: fincanın
  // kenarında beyaz alan bırakan HER fotoğraf "beyaz boşluk" okunuyordu.
  // Uçtan uca ölçtüm — üç ayrı fincan karesi (uzun iz, topak, ince toz)
  // ÜÇÜ BİRDEN "beyaz boşluk: açılmış kapı" verdi. Farklı fincanların aynı
  // falı vermesi, falı süse çevirir.
  //
  // Boşluk kuralı en sona, üstelik düşük kaplama koşuluyla alındı.
  // ─────────────────────────────────────────────────────────────────

  // Büyük tek topak: "kalın kara topak".
  if (f.blobArea > 0.22 && f.scatter < 0.42) return sign("kalın kara topak") ?? fallback;
  // Uzun yatık leke: yol.
  if (f.blobAspect > 2.2) return sign("yol") ?? fallback;
  // Uzun dikey leke: ağaç.
  if (f.blobAspect < 0.45) return sign("ağaç") ?? fallback;
  // Yayılmış ince telve: "ince toz".
  if (f.scatter > 0.55 && f.blobArea < 0.10) return sign("ince toz") ?? fallback;
  // Belirgin işaret yok ve fincan büyük ölçüde açık: kapı.
  if (f.gap > 0.28 && f.coverage < 0.10) return sign("beyaz boşluk") ?? fallback;
  // Üstte toplanmış yuvarlak kütle: kuş (haber).
  if (f.blobY < 0.4 && f.blobAspect > 0.8 && f.blobAspect < 1.6) return sign("kuş") ?? fallback;
  // Altta oturan geniş kütle: dağ.
  if (f.blobY > 0.62) return sign("dağ") ?? fallback;
  // Ortada halka benzeri orta boy leke: yüzük.
  if (f.blobArea > 0.06 && f.blobArea < 0.18) return sign("yüzük") ?? fallback;
  // Kırık, parçalı: kırık çizgi.
  return sign("kırık çizgi") ?? fallback;
}

/** Fincanın üç açısının geleneksel adı. */
export const PLATE_NAMES = ["kulp · ev", "duvar · yürüyen günler", "karşı ağız · dünya"] as const;

// ─── OKUMALAR ─────────────────────────────────────────────────────────

function books(kind: OracleKind, count: number): string {
  const list = WAIT_BOOKS[kind] ?? [];
  return list.slice(0, Math.max(3, Math.min(count, list.length))).join(" · ");
}

type LetterCore = Omit<
  OracleLetter,
  "agent" | "sources" | "canon" | "body" | "counsel" | "character"
>;

/**
 * KISALTMA — okuma sade ve vurgulu olmalı.
 *
 * Külliyat girdileri akademik yazılmış: "Kalp çizgisi (Venüs→Merkür)".
 * Kullanıcı falcıdan cümle bekler, dipnot değil. Parantez içi teknik
 * ekler ve fazla uzun kuyruklar burada düşüyor.
 */
function plain(text: string, max = 130): string {
  let t = String(text ?? "")
    // Parantez içi teknik açıklama: "(Venüs→Merkür)", "(klasik tabir)"
    .replace(/\s*\([^)]*\)/g, "")
    // Kaynak adı sızmışsa at: "İbn Sirin: su kalbin hali" → "su kalbin hali".
    // YALNIZCA BİLİNEN kitap/yazar adları. İlk halinde iki nokta öncesi her
    // şeyi siliyordum ve ÖLÇTÜM: "Kulpta yol / patika: seçim veya yolculuk"
    // → "seçim veya yolculuk" oluyordu, yani okumanın asıl maddesi olan
    // işaret adı uçuyordu.
    .replace(
      /^(?:İbn Sirin|Ibn Sirin|Artemidorus|Cheiro|Agrippa|Zhou Gong|Macrobius|Achmet|Samudrika|Tabirname)\s*:\s*/i,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
  if (t.length <= max) return t;
  // Cümle sınırında kes — yarım kelimeyle bitmesin.
  const cut = t.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  t = stop > max * 0.5 ? cut.slice(0, stop + 1) : cut.slice(0, cut.lastIndexOf(" "));
  return t.trim().replace(/[,;:—-]$/, "");
}

/**
 * Huyun okumadaki payı — HEDEF %30, SEZGİ DEĞİL HESAP.
 *
 * İki sezgisel deneme ölçüldü, ikisi de ıskaladı:
 *   · her satıra huy eklemek        → %41,2 (rüyada %45'e kadar)
 *   · "yarıdan uzunsa ekleme" eşiği → %17,3 (çoğu huy tamamen düşüyordu)
 *
 * Sebep aynı: külliyat satırlarının uzunluğu okuma türüne göre çok
 * değişiyor (rüya kısa, kahve uzun), o yüzden sabit bir kural her türde
 * farklı oran veriyor.
 *
 * Şimdi bütçe hesaplanıyor. Külliyatın toplam uzunluğu C ise, huy payının
 * T/(C+T) = 0,30 olması için T = C × 0,30/0,70 ≈ 0,43·C olmalı. Huy
 * cümleleri bu bütçe dolana kadar sırayla ekleniyor.
 *
 * SIRA ÖNEMLİ: `character` (kişinin özü) her zaman ilk sırada — bütçe
 * ne kadar küçük olursa olsun hiçbir okuma kişiliksiz kalmasın diye.
 * Sonra gönül, yol, kapanış.
 */
const TEMPER_SHARE = 0.3;

export interface TemperPlan {
  readonly character: string;
  readonly love: string;
  readonly path: string;
  readonly near: string;
}

export function planTemper(
  canonFields: readonly string[],
  temper: Temperament,
  share = TEMPER_SHARE,
): TemperPlan {
  const canonChars = canonFields.reduce((n, f) => n + String(f ?? "").length, 0);
  let budget = canonChars * (share / (1 - share));

  const take = (text: string): string => {
    const t = String(text ?? "").trim();
    if (t.length === 0) return "";
    // Küçük taşmaya izin var (%35): tam sığmayan son cümleyi tamamen
    // atmak ortalamayı hedefin belirgin altına düşürüyordu — ölçüldü,
    // toleranssız hali %26,3 veriyor. Yarım cümle göstermek yerine ya
    // tamamı alınıyor ya hiç.
    if (t.length > budget * 1.35) return "";
    budget -= t.length;
    return t;
  };

  /*
   * KARAKTERE BÜTÇE TAVANI.
   *
   * Ölçüldü: sıra `character` ile başlayınca kişinin özü bütçenin
   * çoğunu yiyor ve okuma satırlarına pay kalmıyordu — el falında huy
   * YALNIZCA BİR satıra dokunuyordu. Oran doğru çıkıyordu ama istenen
   * bu değil: huy okumanın içine DAĞILMALI, ayrı bir paragrafa
   * yığılmamalı.
   *
   * Karaktere bütçenin en fazla üçte biri; kalanı okuma satırlarına.
   */
  const characterBudget = budget / 3;
  const full = budget;
  budget = characterBudget;
  const character = take(temper.core);
  budget = full - (characterBudget - budget);

  return {
    character,
    love: take(temper.heart),
    path: take(temper.choice),
    near: take(temper.strain),
  };
}

/** Külliyat satırına planlanan huy cümlesini ekler. */
function weave(canon: string, trait: string): string {
  const base = String(canon ?? "").trim();
  const add = String(trait ?? "").trim();
  if (add.length === 0) return base;
  if (base.length === 0) return add;
  return `${endStop(base)} ${add}`;
}

/** Cümleyi noktalar; zaten noktalıysa dokunmaz. */
function endStop(text: string): string {
  const t = String(text ?? "").trim();
  if (t.length === 0) return t;
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

/**
 * Mektup — kadim külliyat ağırlıklı, kişinin huyu az payla harmanlı.
 *
 * AĞIRLIK: beş alanın dördü (işaret, görülen, gönül, yol) doğrudan
 * külliyattan ve fotoğraftan gelir. Huy yalnızca `character` alanını ve
 * `near` satırının kapanışını besler. Külliyat baskın, huy tamamlayıcı.
 *
 * `sources` doldurulur ama EKRANDA BASILMAZ: okumanın hangi külliyata
 * dayandığı kayıtta kalsın diye.
 */
function letter(
  kind: OracleKind,
  parts: LetterCore,
  temper?: Temperament | null,
): OracleLetter {
  const short: LetterCore = {
    title: plain(parts.title, 46),
    omen: plain(parts.omen, 120),
    seen: plain(parts.seen, 150),
    love: plain(parts.love, 120),
    path: plain(parts.path, 120),
    near: plain(parts.near, 120),
  };
  return {
    ...short,
    /*
     * HUY TEK BLOKTA TOPLANMAZ, OKUMANIN İÇİNE DAĞILIR.
     *
     * Önceki halinde kişilik yalnızca `character` bölümündeydi ve okuma
     * ikiye bölünüyordu: önce külliyat, sonra ayrı bir "sen böylesin"
     * paragrafı. Falcı böyle konuşmaz — kişiyi anlatırken fincanı da
     * anlatır, ikisi tek nefestir.
     *
     * Dağılım alanlara göre:
     *   omen  · seen        yalnızca külliyat (kanca ve ölçüm bozulmasın)
     *   love                gönül satırı  + huyun gönüldeki hali
     *   path                yol satırı    + huyun karar verirkenki hali
     *   near                kapanış       + huyun zorlandığındaki hali
     *   character           kişinin özü, tek cümle
     *
     * Pay ölçülüyor, iddia edilmiyor: `natal.test.ts` içinde huylu ve
     * huysuz okuma karşılaştırılıp huyun katkı oranı hesaplanıyor ve
     * %30 bandında olması şart koşuluyor.
     */
    ...(temper
      ? (() => {
          const plan = planTemper(
            [short.title, short.omen, short.seen, short.love, short.path, short.near],
            temper,
          );
          return {
            love: weave(short.love, plan.love),
            path: weave(short.path, plan.path),
            near: weave(short.near, plan.near),
            character: plan.character || undefined,
          };
        })()
      : {}),
    body: "",
    counsel: "",
    canon: "",
    sources: books(kind, 4),
    agent: ORACLE_AGENTS[kind].name,
  };
}

/**
 * Kahve falı — üç açı, üç bölge.
 *
 * Geleneksel bölümleme: kulp = ev ve ben, duvarlar = yürüyen günler,
 * karşı ağız = dış dünya. Her kareden ölçülen en belirgin işaret o
 * bölgenin okumasına dönüşüyor.
 */
export function coffeeReading(
  plates: readonly PlateFeatures[],
  temper?: Temperament | null,
): OracleLetter {
  const three = [plates[0] ?? EMPTY_PLATE, plates[1] ?? EMPTY_PLATE, plates[2] ?? EMPTY_PLATE];
  const marks = three.map(matchCoffeeSign);

  const [home, days, world] = marks as [typeof marks[0], typeof marks[0], typeof marks[0]];
  const heaviest = three.reduce((a, b, i) => (b.coverage > three[a]!.coverage ? i : a), 0);

  const seen = three
    .map((f, i) => `${PLATE_NAMES[i]}: ${marks[i]!.sign} (telve ${(f.coverage * 100).toFixed(0)}%)`)
    .join(" · ");

  return letter("coffee", {
    title: `${home.sign} — ${PLATE_NAMES[0]}`,
    omen: `Fincanın en dolu yeri ${PLATE_NAMES[heaviest]}; ilk söz oradan geliyor: ${marks[heaviest]!.sign}.`,
    seen,
    // Konum, külliyattaki şıkkı seçiyor: "kulpa yakınsa eve gelir,
    // karşı ağızdaysa yabancıdan gelir" — hangisi olduğunu ÖLÇÜM söylüyor.
    love: `Kulpta ${home.sign}: ${pickClause(home.reading, ["kulp", "dip"])}`,
    path: `Duvarda ${days.sign}: ${pickClause(days.reading, ["duvar", "büyüme", "zaman"])}`,
    near: `Karşı ağızda ${world.sign}: ${pickClause(world.reading, ["karşı", "yabancı", "dış"])}`,
  }, temper);
}

// ─── EL FALI ──────────────────────────────────────────────────────────

/** Avuçtan ölçülen çizgi nicelikleri. */
export interface PalmFeatures {
  /** Üç yatay bölgede bulunan çizgi yoğunluğu, 0..1. */
  readonly heart: number;
  readonly head: number;
  readonly life: number;
  /** Çizgilerin sürekliliği, 0..1. Düşük = zincirli/kesik. */
  readonly continuity: number;
  /** Genel çizgi bolluğu. */
  readonly density: number;
}

function palmSign(name: string) {
  return PALM_SIGN_TABLE.find((s) => s.name.startsWith(name));
}

/**
 * Kenar (gradyan) yoğunluğundan avuç çizgilerini ölçer.
 *
 * Üçe bölünüyor: üst üçte bir kalp çizgisi bölgesi, orta baş çizgisi,
 * alt hayat çizgisi bölgesi. Bu, gerçek el falının anatomik bölümlemesi.
 *
 * ÖLÇÜM SINIRI AÇIK: bu, çizgileri isimlendirilmiş biçimde ayırt eden bir
 * el okuyucu değil; bölgesel çizgi yoğunluğu ve sürekliliği ölçüyor.
 * Külliyattaki okuma o niceliğe göre seçiliyor. Uydurmuyor ama bir
 * uzmandan daha kaba.
 */
export function analyzePalm(data: ArrayLike<number>, w: number, h: number): PalmFeatures {
  if (!(w > 2) || !(h > 2) || data.length < w * h * 4) {
    return { heart: 0, head: 0, life: 0, continuity: 0, density: 0 };
  }
  const lum = (x: number, y: number) => {
    const p = (y * w + x) * 4;
    return (data[p] ?? 0) * 0.299 + (data[p + 1] ?? 0) * 0.587 + (data[p + 2] ?? 0) * 0.114;
  };
  const bands = [0, 0, 0];
  const counts = [0, 0, 0];
  let edges = 0;
  let runs = 0;
  let inRun = false;
  for (let y = 1; y < h - 1; y++) {
    const band = y < h / 3 ? 0 : y < (2 * h) / 3 ? 1 : 2;
    inRun = false;
    for (let x = 1; x < w - 1; x++) {
      // Dikey gradyan: avuç çizgileri ağırlıkla yataydır.
      const g = Math.abs(lum(x, y + 1) - lum(x, y - 1));
      const isEdge = g > 14;
      bands[band]! += isEdge ? 1 : 0;
      counts[band]!++;
      if (isEdge) {
        edges++;
        if (!inRun) { runs++; inRun = true; }
      } else inRun = false;
    }
  }
  const norm = (i: number) => (counts[i]! > 0 ? Math.min(1, bands[i]! / counts[i]! * 4) : 0);
  const total = (w - 2) * (h - 2);
  return {
    heart: norm(0),
    head: norm(1),
    life: norm(2),
    // Uzun kesintisiz kenar dizileri = süreklilik. Çok sayıda kısa dizi
    // "zincirli / kesik" demek.
    continuity: edges > 0 ? Math.max(0, Math.min(1, 1 - runs / edges * 2.2)) : 0,
    density: Math.min(1, (edges / total) * 6),
  };
}

export function palmReading(f: PalmFeatures, temper?: Temperament | null): OracleLetter {
  const heart = palmSign("Kalp çizgisi")!;
  const head = palmSign("Baş çizgisi")!;
  const life = palmSign("Hayat çizgisi")!;
  const strong = (v: number) => v > 0.34;

  const chained = f.continuity < 0.35;
  const dominant =
    f.heart >= f.head && f.heart >= f.life ? "kalp" : f.head >= f.life ? "baş" : "hayat";

  const omen =
    dominant === "kalp"
      ? "Avucunda en okunaklı iz kalp çizgisi — bu mevsim gönül işi öne geçiyor."
      : dominant === "baş"
        ? "Baş çizgisi diğerlerini bastırıyor — kararı akıl veriyor, gönül sonra geliyor."
        : "Hayat çizgisi en belirgin olan — bu dönem beden ve ev düzeni konuşuyor.";

  return letter("palm", {
    title: `${dominant === "kalp" ? "Kalp" : dominant === "baş" ? "Baş" : "Hayat"} çizgisi baskın`,
    omen,
    seen: `Kalp bölgesi ${(f.heart * 100).toFixed(0)}%, baş ${(f.head * 100).toFixed(0)}%, hayat ${(f.life * 100).toFixed(0)}% çizgi yoğunluğu; süreklilik ${(f.continuity * 100).toFixed(0)}%.`,
    // Külliyatın TAMAMI değil, ölçüme uyan ŞIK. Sözlük sayfası göstermek
    // fal değildir; okuyucu hangi şıkkın geçtiğini söyler.
    love: `${heart.name} · ${pickClause(
      heart.reading,
      chained ? ["zincirli", "kısa"] : strong(f.heart) ? ["derin", "düz"] : ["kısa", "çatal"],
    )}`,
    path: `${head.name} · ${pickClause(
      head.reading,
      chained ? ["ada", "çatal"] : strong(f.head) ? ["uzun düz"] : ["eğik"],
    )}`,
    near: `${life.name} · ${pickClause(
      life.reading,
      chained ? ["kopuk", "ada"] : strong(f.life) ? ["geniş yay"] : ["sıkı", "ihtiyat"],
    )}`,
  }, temper);
}

// ─── TÜRKÇE KÖK EŞLEME ────────────────────────────────────────────────

/**
 * Yaygın Türkçe çekim eklerini soyar.
 *
 * NEDEN GEREKLİ: külliyat "Evde yılan" diyor, kullanıcı "evimizde bir
 * yılan gördüm" yazıyor. Düz alt dize karşılaştırması bu ikisini
 * eşleştiremiyor ve tabir, doğru şıkkı bulamayıp genel öze düşüyordu.
 * Ölçüldü — bu eşleşme olmadan "evimizde yılan" rüyası "ev içi
 * kıskançlık" şıkkını kaçırıyordu.
 *
 * TAM BİR BİÇİMBİLİM ÇÖZÜMLEYİCİSİ DEĞİL, olduğunu da iddia etmiyor.
 * Yalnızca en sık ekleri, kökü kısaltmayacak kadar temkinli soyuyor:
 * üç harften kısa kök bırakacak bir soyma yapılmıyor, yoksa "diş" → "d"
 * gibi her şeye uyan çöp kökler çıkardı.
 */
/**
 * Ekler İKİ SINIFA ayrılıyor.
 *
 * Ölçüldü: tek listeyle iki geçiş yapınca "kapıyı" → "kapı" → "kap"
 * oluyordu (ikinci geçiş tek harfli "ı" ekini de soyuyor) ve "evde" →
 * "evd" çıkıyordu (minimum kök 3 harf olduğu için "de" soyulamıyor,
 * yerine "e" soyuluyordu). İkisi de kökü bozuyor ve tabir alakasız
 * kurallarla eşleşiyordu.
 *
 * GÜÇLÜ ekler (≥2 harf) iki geçişte de soyulur: "evimizde" → "evimiz" → "ev".
 * ZAYIF ekler (tek ünlü) yalnızca ilk geçişte, çünkü tek harfli ek çoğu
 * kelimenin doğal sonuyla karışır.
 *
 * Minimum kök 2 harf: "ev" ve "su" gerçek köklerdir, kırpılmamalı.
 */
const TR_SUFFIX_STRONG = [
  "larımızda", "lerimizde", "larımız", "lerimiz", "larında", "lerinde",
  "ımızda", "imizde", "umuzda", "ümüzde", "larda", "lerde", "ların", "lerin",
  "ımız", "imiz", "umuz", "ümüz", "ında", "inde", "unda", "ünde",
  "dan", "den", "tan", "ten", "lar", "ler", "nın", "nin", "nun", "nün",
  "da", "de", "ta", "te", "ın", "in", "un", "ün", "ım", "im", "um", "üm",
  "yı", "yi", "yu", "yü", "ya", "ye", "sı", "si", "su", "sü",
];
const TR_SUFFIX_WEAK = ["ı", "i", "u", "ü", "a", "e"];
const MIN_STEM = 2;

export function trStem(word: string): string {
  let w = String(word ?? "").toLocaleLowerCase("tr");
  const strip = (list: readonly string[]): boolean => {
    for (const suf of list) {
      if (w.length - suf.length >= MIN_STEM && w.endsWith(suf)) {
        w = w.slice(0, -suf.length);
        return true;
      }
    }
    return false;
  };
  // İlk geçiş: güçlü ek yoksa zayıf eke bakılır.
  if (!strip(TR_SUFFIX_STRONG)) strip(TR_SUFFIX_WEAK);
  // İkinci geçiş: YALNIZCA güçlü ek. ("kapı" burada "kap" olmuyor.)
  else strip(TR_SUFFIX_STRONG);
  return w;
}

/** Metindeki kelimelerin kökleri. */
export function trStems(text: string): Set<string> {
  return new Set(
    String(text ?? "")
      .toLocaleLowerCase("tr")
      .split(/[^\p{L}]+/u)
      .filter((w) => w.length > 2)
      .map(trStem),
  );
}

// ─── RÜYA ─────────────────────────────────────────────────────────────

/** Rüya metnine düşen külliyat kuralları, en çok eşleşenden başlayarak. */
export function matchDreamSigns(text: string) {
  const q = String(text ?? "").toLocaleLowerCase("tr");
  /**
   * Anahtarın KAÇ KEZ geçtiğini sayar, sadece geçip geçmediğini değil.
   *
   * Ölçüldü: "yılan, yılan, su" metninde varlık sayımı iki girdiye de 1
   * veriyordu ve tabloda önce gelen "su" kazanıyordu — oysa rüyada
   * tekrarlanan imge vurgulanan imgedir. Rüya anlatısının kendi vurgusu
   * tabloya yenilmemeli.
   */
  const occurrences = (needle: string): number => {
    if (needle.length === 0) return 0;
    let count = 0;
    let at = q.indexOf(needle);
    while (at !== -1) {
      count++;
      at = q.indexOf(needle, at + needle.length);
    }
    return count;
  };

  // Anahtar sözcük ya düz metinde geçer ya da KÖK olarak tutar.
  // "yılanlar" / "kapıyı" / "evimizde" gibi çekimli biçimler böyle
  // yakalanıyor; düz alt dize araması bunları kaçırıyordu.
  const stems = trStems(q);
  return DREAM_SIGNS.map((s) => ({
    sign: s,
    hits: s.keys.reduce(
      (total, k) => total + occurrences(k) + (stems.has(trStem(k)) && !q.includes(k) ? 1 : 0),
      0,
    ),
  }))
    .filter((m) => m.hits > 0)
    .sort((a, b) => b.hits - a.hits);
}

/**
 * Rüya tabiri.
 *
 * Burada uzak modele en az ihtiyaç var: külliyat ZATEN tabirin kendisi.
 * İbn Sirin, Artemidorus ve Zhou Gong'un kuralları metindeki imgelerle
 * eşleşiyor ve okuma o kurallardan kuruluyor.
 *
 * HİÇBİR İMGE TUTMAZSA uydurma yapılmıyor: kullanıcıya rüyayı biraz daha
 * anlatması söyleniyor. Boş bir metne "büyük bir değişim yaklaşıyor" demek,
 * tam da bu dosyanın kaçındığı şey.
 */
export function dreamReading(text: string, temper?: Temperament | null): OracleLetter | null {
  const matches = matchDreamSigns(text);
  if (matches.length === 0) return null;

  /**
   * Kuralın TAMAMINI değil, rüyada geçen şıkkı seç.
   *
   * "Kapı = fırsat. Kilitli = tutulmuş mesele. Anahtar = yetki." satırının
   * tamamını göstermek, kullanıcıya sözlük sayfası vermek olur. Seçim
   * sinyali rüyanın KENDİ metni: "kapı kilitliydi" diyorsa "Kilitli"
   * şıkkı geçiyor demektir.
   *
   * Şık tutmazsa kuralın özü gösteriliyor — boş satır bırakılmıyor.
   */
  const q = String(text ?? "").toLocaleLowerCase("tr");
  const words = (t: string) =>
    t.toLocaleLowerCase("tr").split(/[^\p{L}]+/u).filter((w) => w.length > 2);
  const textStems = trStems(text);

  const clauseFor = (rule: string): string => {
    const entry = parseCanonEntry(rule);
    // Özde zaten geçen kelimeler AYIRT EDİCİ DEĞİL. "diş" hem özde hem
    // "Üst diş" şıkkında geçiyor; onunla eşleştirmek, rüyada hiç geçmeyen
    // bir alt durumu ("üst diş") seçmek olurdu. Şık ancak KENDİNE ÖZGÜ bir
    // kelimesi rüyada geçtiğinde kazanır.
    const gistWords = new Set(words(entry.gist).map(trStem));
    let best: { when: string; means: string; score: number } | null = null;
    for (const c of entry.clauses) {
      let score = 0;
      for (const w of words(c.when)) {
        const stem = trStem(w);
        if (gistWords.has(stem)) continue;
        // Hem düz metin hem KÖK karşılaştırması: "evde" ↔ "evimizde".
        if ((q.includes(w) || textStems.has(stem)) && w.length > score) score = w.length;
      }
      // En UZUN eşleşen kelime kazanır: "kilitli" (7) genel "kapı"yı (4)
      // geçer, yani rüyanın söylediği ayrıntı genel başlığa yenilmez.
      if (score > 0 && (!best || score > best.score)) best = { ...c, score };
    }
    if (best) return `${best.when} — ${best.means}`;
    if (entry.gist) return entry.gist;
    return rule;
  };

  const top = matches.slice(0, 3).map((m) => clauseFor(m.sign.rule));
  const imagery = matches
    .slice(0, 3)
    .map((m) => m.sign.keys[0])
    .filter((k): k is string => typeof k === "string");

  return letter("dream", {
    title: imagery.length ? imagery.map((k) => k[0]!.toLocaleUpperCase("tr") + k.slice(1)).join(" · ") : "Rüya",
    omen: top[0] ?? "",
    seen: `Rüyanda tuttuğum imgeler: ${imagery.join(", ")}.`,
    love: top[1] ?? "",
    path: top[2] ?? "",
    near: `Rüyanın merkezinde ${imagery[0] ?? "bu imge"} duruyor.`,
  }, temper);
}
