/**
 * Cihaz üstü Kahin.
 *
 * BU TESTLERİN ASIL İŞİ: okumanın fotoğrafa BAĞLI olduğunu kanıtlamak.
 * Rastgele metin üreten bir "fal", olmayan bir özelliği var göstermek
 * olurdu — hiç okumamaktan kötü. Aşağıdaki testler farklı fincanların
 * farklı, aynı fincanın aynı okumayı verdiğini ölçüyor.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  analyzePalm,
  analyzePlate,
  coffeeReading,
  dreamReading,
  matchCoffeeSign,
  matchDreamSigns,
  palmReading,
  PLATE_NAMES,
  trStem,
  type PlateFeatures,
} from "./oracle-local.ts";

const W = 64;
const H = 64;

/** RGBA tuval; `f(x,y)` true ise koyu (telve). */
function plate(f: (x: number, y: number) => boolean, w = W, h = H): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const v = f(x, y) ? 24 : 232;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
  return d;
}

// ─── ÖLÇÜM ────────────────────────────────────────────────────────────

test("boş fincan: telve yok", () => {
  const f = analyzePlate(plate(() => false), W, H);
  assert.equal(f.coverage, 0);
  assert.equal(f.blobArea, 0);
});

test("bozuk girdi çökertmez", () => {
  assert.equal(analyzePlate(new Uint8ClampedArray(0), 0, 0).coverage, 0);
  assert.equal(analyzePlate(new Uint8ClampedArray(16), W, H).coverage, 0);
});

test("kaplama gerçekten ölçülüyor", () => {
  const quarter = analyzePlate(plate((x, y) => x < W / 2 && y < H / 2), W, H);
  assert.ok(Math.abs(quarter.coverage - 0.25) < 0.02, `${quarter.coverage}`);
});

test("ağırlık merkezi telvenin bulunduğu yeri gösterir", () => {
  const left = analyzePlate(plate((x) => x < W * 0.25), W, H);
  const right = analyzePlate(plate((x) => x > W * 0.75), W, H);
  assert.ok(left.centroidX < 0.3, `sol ${left.centroidX}`);
  assert.ok(right.centroidX > 0.7, `sağ ${right.centroidX}`);
});

test("en büyük leke bulunuyor, küçük noktalar değil", () => {
  // Bir büyük kare + birkaç tek piksel.
  const f = analyzePlate(
    plate((x, y) => (x > 10 && x < 40 && y > 10 && y < 40) || (y === 60 && x % 7 === 0)),
    W,
    H,
  );
  const expected = (29 * 29) / (W * H);
  assert.ok(Math.abs(f.blobArea - expected) < 0.02, `${f.blobArea} vs ${expected}`);
});

test("en/boy oranı yatık ve dikey lekeyi ayırır", () => {
  const wide = analyzePlate(plate((x, y) => y > 30 && y < 34 && x > 5 && x < 58), W, H);
  const tall = analyzePlate(plate((x, y) => x > 30 && x < 34 && y > 5 && y < 58), W, H);
  assert.ok(wide.blobAspect > 3, `yatık ${wide.blobAspect}`);
  assert.ok(tall.blobAspect < 0.35, `dikey ${tall.blobAspect}`);
});

test("dağınıklık: yayılmış toz topaktan ayrılır", () => {
  const clump = analyzePlate(plate((x, y) => x > 26 && x < 38 && y > 26 && y < 38), W, H);
  const dust = analyzePlate(plate((x, y) => (x * 7 + y * 13) % 23 === 0), W, H);
  assert.ok(dust.scatter > clump.scatter, `toz ${dust.scatter} topak ${clump.scatter}`);
});

test("boşluk: açık dikey şerit ölçülüyor", () => {
  // Sol üçte bir telve, geri kalanı boş.
  const f = analyzePlate(plate((x) => x < W / 3), W, H);
  assert.ok(f.gap > 0.55, `${f.gap}`);
});

/**
 * POZLAMA BAĞIMSIZLIĞI. Sabit eşik olsaydı karanlıkta çekilmiş bir fincan
 * baştan aşağı "telve dolu" görünür, kullanıcı fincanını değil ışığını
 * okumuş olurdu.
 */
test("aynı desen, HER pozlamada aynı kaplamayı verir", () => {
  // Ölçüldü: 0.45 çarpanı yeterince ayırt edici DEĞİLDİ — sabit eşikli bir
  // mutasyon bile o parlaklıkta doğru sonuç veriyor ve test yeşil kalıyordu.
  // 0.30'da fincanın en açık pikseli 70'e iner; sabit eşik (ör. 96) o
  // görüntünün TAMAMINI telve sayar ve kaplama %100 çıkar.
  const pattern = (x: number, y: number) => x > 16 && x < 48 && y > 16 && y < 48;
  const bright = plate(pattern);
  const base = analyzePlate(bright, W, H);

  for (const exposure of [0.3, 0.45, 0.7, 1.4]) {
    const shifted = new Uint8ClampedArray(bright);
    for (let i = 0; i < shifted.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        shifted[i + c] = Math.max(0, Math.min(255, Math.round(shifted[i + c]! * exposure)));
      }
    }
    const f = analyzePlate(shifted, W, H);
    assert.ok(
      Math.abs(base.coverage - f.coverage) < 0.01,
      `pozlama ${exposure}: ${f.coverage} ≠ ${base.coverage}`,
    );
  }
});

// ─── SEMBOL EŞLEME ────────────────────────────────────────────────────

function feat(over: Partial<PlateFeatures> = {}): PlateFeatures {
  return {
    coverage: 0.15, centroidX: 0.5, centroidY: 0.5,
    blobArea: 0.12, blobAspect: 1, blobX: 0.5, blobY: 0.5,
    scatter: 0.5, gap: 0.1, ...over,
  };
}

test("neredeyse boş fincan → beyaz boşluk", () => {
  assert.match(matchCoffeeSign(feat({ coverage: 0.01 })).sign, /beyaz boşluk/);
});

test("uzun yatık leke → yol", () => {
  assert.match(matchCoffeeSign(feat({ blobAspect: 3.5 })).sign, /yol/);
});

test("uzun dikey leke → ağaç", () => {
  assert.match(matchCoffeeSign(feat({ blobAspect: 0.3 })).sign, /ağaç/);
});

test("büyük tek topak → kalın kara topak", () => {
  assert.match(matchCoffeeSign(feat({ blobArea: 0.3, scatter: 0.3 })).sign, /kalın kara topak/);
});

test("yayılmış ince telve → ince toz", () => {
  assert.match(matchCoffeeSign(feat({ scatter: 0.7, blobArea: 0.05 })).sign, /ince toz/);
});

/**
 * BELİRGİN İŞARET BOŞLUKTAN ÖNCE GELİR.
 *
 * Uçtan uca ölçüldü: boşluk kuralı önce gelirken üç FARKLI fincan karesi
 * (uzun iz, topak, ince toz) üçü birden "beyaz boşluk" okunuyordu —
 * fotoğrafta kenarda beyaz alan bırakan her kare böyle çıkıyordu. Farklı
 * fincanların aynı falı vermesi, falı süse çevirir.
 */
test("kenardaki boşluk BELİRGİN işareti ezmez", () => {
  const wide = feat({ gap: 0.5, coverage: 0.14, blobAspect: 3.5 });
  const clump = feat({ gap: 0.5, coverage: 0.26, blobArea: 0.26, scatter: 0.3 });
  const dust = feat({ gap: 0.5, coverage: 0.09, scatter: 0.7, blobArea: 0.05 });
  assert.match(matchCoffeeSign(wide).sign, /yol/);
  assert.match(matchCoffeeSign(clump).sign, /kalın kara topak/);
  assert.match(matchCoffeeSign(dust).sign, /ince toz/);
  // Üçü birbirinden farklı olmalı.
  const signs = new Set([wide, clump, dust].map((f) => matchCoffeeSign(f).sign));
  assert.equal(signs.size, 3, [...signs].join(" / "));
});

test("belirgin işaret yoksa geniş boşluk kapıdır", () => {
  assert.match(
    matchCoffeeSign(feat({ gap: 0.5, coverage: 0.06, blobArea: 0.12, blobAspect: 1, scatter: 0.5 })).sign,
    /beyaz boşluk/,
  );
});

test("her eşleşme külliyattan gerçek bir okuma taşır", () => {
  for (const f of [
    feat({ coverage: 0.01 }), feat({ blobAspect: 3.5 }), feat({ blobAspect: 0.3 }),
    feat({ blobArea: 0.3, scatter: 0.3 }), feat({ scatter: 0.7, blobArea: 0.05 }),
    feat({ blobY: 0.2 }), feat({ blobY: 0.8 }), feat(),
  ]) {
    const m = matchCoffeeSign(f);
    assert.ok(m.sign.length > 2, JSON.stringify(f));
    assert.ok(m.reading.length > 8, `${m.sign} okuması boş`);
  }
});

// ─── KAHVE OKUMASI ────────────────────────────────────────────────────

test("üç açı üç bölge olarak okunur", () => {
  const l = coffeeReading([
    feat({ blobAspect: 3.5 }),
    feat({ blobArea: 0.3, scatter: 0.3 }),
    feat({ coverage: 0.01 }),
  ]);
  assert.ok(l.love.includes("yol"), l.love);
  assert.ok(l.path.includes("kalın kara topak"), l.path);
  assert.ok(l.near.includes("beyaz boşluk"), l.near);
  assert.equal(l.agent, "SAFIYE");
  assert.ok(l.sources.length > 10);
});

/** Fal fotoğrafa bağlı olmalı — yoksa okuma değil, süs. */
test("FARKLI fincan FARKLI okuma verir", () => {
  const a = coffeeReading([feat({ blobAspect: 3.5 }), feat(), feat()]);
  const b = coffeeReading([feat({ blobAspect: 0.3 }), feat(), feat()]);
  assert.notEqual(a.love, b.love);
  assert.notEqual(a.title, b.title);
});

/** Aynı fincan aynı okuma — kullanıcı ekranı kapatınca falı değişmemeli. */
test("AYNI fincan AYNI okuma verir", () => {
  const f = [feat({ blobAspect: 3.5 }), feat({ blobY: 0.8 }), feat({ scatter: 0.7, blobArea: 0.05 })];
  assert.deepEqual(coffeeReading(f), coffeeReading(f));
});

test("eksik kare boş kare sayılır, çökertmez", () => {
  const l = coffeeReading([feat()]);
  assert.ok(l.omen.length > 10);
  assert.equal(PLATE_NAMES.length, 3);
});

test("en dolu kare öne çıkarılır", () => {
  const l = coffeeReading([
    feat({ coverage: 0.05 }),
    feat({ coverage: 0.05 }),
    feat({ coverage: 0.44 }),
  ]);
  assert.ok(l.omen.includes(PLATE_NAMES[2]!), l.omen);
});

// ─── EL FALI ──────────────────────────────────────────────────────────

test("düz avuçta çizgi yok", () => {
  const flat = plate(() => false, 48, 48);
  const f = analyzePalm(flat, 48, 48);
  assert.equal(f.density, 0);
});

test("yatay çizgiler bulundukları bölgede ölçülür", () => {
  // Yalnızca üst üçte bir: kalp bölgesi.
  const top = analyzePalm(plate((_x, y) => y % 4 === 0 && y < 16, 48, 48), 48, 48);
  assert.ok(top.heart > top.life, `kalp ${top.heart} hayat ${top.life}`);
  // Yalnızca alt üçte bir: hayat bölgesi.
  const bot = analyzePalm(plate((_x, y) => y % 4 === 0 && y > 32, 48, 48), 48, 48);
  assert.ok(bot.life > bot.heart, `hayat ${bot.life} kalp ${bot.heart}`);
});

test("el falı okuması baskın çizgiyi adlandırır", () => {
  const l = palmReading({ heart: 0.8, head: 0.2, life: 0.2, continuity: 0.7, density: 0.5 });
  assert.match(l.title, /Kalp/);
  assert.equal(l.agent, "CHEIRO");
  assert.ok(l.love.length > 20);
});

test("FARKLI avuç FARKLI okuma", () => {
  const a = palmReading({ heart: 0.8, head: 0.2, life: 0.2, continuity: 0.7, density: 0.5 });
  const b = palmReading({ heart: 0.1, head: 0.9, life: 0.2, continuity: 0.2, density: 0.5 });
  assert.notEqual(a.title, b.title);
  assert.notEqual(a.omen, b.omen);
  assert.notEqual(a.love, b.love);
});

/**
 * KESİNTİLİ AVUÇ, KESİNTİ ŞIKKINI SEÇMELİ.
 *
 * Külliyatın tamamını dökmek yerine ölçüme uyan şıkkı seçmenin ölçülebilir
 * hali bu: süreklilik düşükken "zincirli / ada / kopuk" ailesinden bir şık
 * gelmeli, "derin ve düz" değil.
 */
test("süreklilik düşükse KESİNTİ şıkkı seçilir", () => {
  const chained = palmReading({ heart: 0.5, head: 0.5, life: 0.5, continuity: 0.1, density: 0.5 });
  const clean = palmReading({ heart: 0.5, head: 0.5, life: 0.5, continuity: 0.9, density: 0.5 });
  const joined = (l: typeof chained) => [l.love, l.path, l.near].join(" ").toLocaleLowerCase("tr");
  assert.match(joined(chained), /zincirli|ada|kopuk|kısa/);
  assert.doesNotMatch(joined(chained), /derin ve düz/);
  assert.match(joined(clean), /derin ve düz|uzun düz|geniş yay/);
});

/**
 * SÖZLÜK SAYFASI DEĞİL. Külliyat girdisinin tamamı ("Derin ve düz = ...
 * Zincirli = ... Kısa = ...") kullanıcıya dökülürse bu fal değil, olası
 * anlamlar listesi olur. Okuma tek şık taşımalı.
 */
test("okuma külliyatın TAMAMINI dökmez", () => {
  const l = palmReading({ heart: 0.8, head: 0.2, life: 0.2, continuity: 0.8, density: 0.5 });
  for (const field of [l.love, l.path, l.near]) {
    const eqCount = (field.match(/=/g) ?? []).length;
    assert.ok(eqCount === 0, `şıklar ham haliyle dökülmüş: ${field}`);
    const dashCount = (field.match(/—/g) ?? []).length;
    assert.ok(dashCount <= 1, `birden çok şık: ${field}`);
  }
});

test("el falı hastalık ya da ölüm yılı söylemez", () => {
  for (const c of [0.1, 0.5, 0.9]) {
    const l = palmReading({ heart: c, head: c, life: c, continuity: c, density: c });
    const all = [l.title, l.omen, l.seen, l.love, l.path, l.near].join(" ").toLocaleLowerCase("tr");
    // "ölüm yılı DEĞİL" külliyatın KENDİ uyarısı — onu yasak sayma.
    // Aranan: kehanet olarak sunulan bir ölüm/hastalık ifadesi.
    assert.ok(!/ölecek|kanser|teşhis|kaç yıl yaşa/.test(all), all);
    assert.ok(!/ölüm yılı(?! değil)/.test(all), all);
  }
});

// ─── RÜYA ─────────────────────────────────────────────────────────────

test("rüyadaki imge külliyatla eşleşir", () => {
  const m = matchDreamSigns("Rüyamda büyük bir denizde yüzüyordum, su bulanıktı.");
  assert.ok(m.length > 0);
  assert.ok(m[0]!.sign.rule.includes("su"), m[0]!.sign.rule);
});

test("çok eşleşen imge öne çıkar", () => {
  const m = matchDreamSigns("yılan, yılan, su");
  assert.ok(m[0]!.sign.keys.includes("yılan"), JSON.stringify(m[0]!.sign.keys));
});

test("İngilizce anahtar da tutar", () => {
  assert.ok(matchDreamSigns("I dreamt of a snake in the water").length > 0);
});

test("rüya tabiri gerçek kuralları taşır", () => {
  const l = dreamReading("Rüyamda dişim döküldü ve evimiz yıkılmıştı.");
  assert.ok(l);
  assert.equal(l!.agent, "SİRİN");
  assert.ok(l!.omen.length > 20, l!.omen);
  assert.ok(/diş|ev/i.test(l!.seen), l!.seen);
});

/**
 * HİÇBİR İMGE TUTMAZSA UYDURMA YOK. Boş bir metne "büyük bir değişim
 * yaklaşıyor" demek, tam da bu modülün kaçındığı şey.
 */
test("tanınan imge yoksa okuma DÖNMEZ", () => {
  assert.equal(dreamReading(""), null);
  assert.equal(dreamReading("zzz qqq"), null);
  assert.equal(dreamReading("...."), null);
});

test("FARKLI rüya FARKLI tabir", () => {
  const a = dreamReading("denizde yüzdüm");
  const b = dreamReading("dişim döküldü");
  assert.ok(a && b);
  assert.notEqual(a!.omen, b!.omen);
  assert.notEqual(a!.title, b!.title);
});

test("AYNI rüya AYNI tabir", () => {
  const t = "evde bir yılan gördüm ve kapı kilitliydi";
  assert.deepEqual(dreamReading(t), dreamReading(t));
});

// ─── TÜRKÇE KÖK EŞLEME ────────────────────────────────────────────────

test("kök bulucu yaygın ekleri soyar", () => {
  const cases: [string, string][] = [
    ["evimizde", "ev"], ["evde", "ev"], ["kapıyı", "kapı"], ["kapılar", "kapı"],
    ["yılanlar", "yılan"], ["denizde", "deniz"], ["suyu", "su"],
  ];
  for (const [given, want] of cases) {
    assert.equal(trStem(given), want, given);
  }
});

/**
 * KÖK ÜÇ HARFTEN KISA OLAMAZ. Aksi halde "diş" → "d" gibi her şeye uyan
 * çöp kökler çıkar ve tabir alakasız kurallarla eşleşir.
 */
test("kök bulucu kısa kelimeleri KIRPMAZ", () => {
  for (const w of ["diş", "ev", "su", "göz", "ay"]) {
    assert.ok(trStem(w).length >= Math.min(w.length, 3) || w.length < 3, w);
  }
  assert.equal(trStem("diş"), "diş");
  assert.equal(trStem("göz"), "göz");
});

test("kök bulucu bozuk girdide çökmez", () => {
  assert.equal(trStem(""), "");
  assert.equal(trStem("   "), "   ");
});

/** Bu testin engellediği kayıp: "evimizde yılan" → "ev içi kıskançlık". */
test("çekimli biçim doğru ŞIKKI bulur", () => {
  const l = dreamReading("Rüyamda evimizde kocaman bir yılan gördüm.");
  assert.ok(l);
  const all = [l!.omen, l!.love, l!.path].join(" ").toLocaleLowerCase("tr");
  assert.match(all, /ev içi kıskançlık/, all);
});

test("çekimli anahtar imgeyi de yakalar", () => {
  assert.ok(matchDreamSigns("kapıları kilitlediler").length > 0);
  assert.ok(matchDreamSigns("denizde yüzüyordum").length > 0);
});
