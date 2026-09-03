/**
 * Doğum tarihinden mizaç — ve mizacın GİZLİ kalması.
 *
 * Bu dosyadaki en önemli test sınıflandırma değil SIZINTI testi. Ürün
 * kararı net: kullanıcı burç adı görmeyecek, burçtan yola çıkıldığını
 * bilmeyecek. Sızıntı sessiz olur — kod çalışır, testler yeşildir,
 * kullanıcı ürünün vaat etmediği bir şey okur.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { temperamentFor, temperamentFromDate } from "./natal.ts";
import { coffeeReading, dreamReading, palmReading } from "./oracle-local.ts";
import type { OracleLetter } from "./oracle.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * ─── İKİ AYRI LİSTE, ÇÜNKÜ TÜRKÇEDE HER BURÇ ADI SIRADAN BİR KELİME ──
 *
 * İlk yazdığımda hepsini tek listeye koydum ve ÖLÇTÜM: "Geniş yay —
 * nefes" (avuç çizgisinin klasik tarifi) alarm verdi. "Yay" hem yay hem
 * bir burç adı. Aynısı "balık" (gerçek bir telve sembolü), "koç",
 * "boğa", "aslan", "terazi", "akrep", "kova", "başak", "yengeç",
 * "oğlak", "ikizler" için geçerli — hepsi külliyatta doğal olarak geçer.
 *
 * Tek listeyle giden bir kapı, düzeltilecek şey yokken sürekli alarm
 * verir ve kaçınılmaz olarak susturulur. O yüzden ayrıldı:
 *
 *   ALAN SÖZCÜKLERİ — masum anlamı yok, her yerde yasak.
 *   BURÇ ADLARI     — yalnızca BURÇ OLARAK kullanıldığında yasak;
 *                     yani bir alan sözcüğünün yanında ya da kimlik
 *                     ekiyle ("Aslansın", "Balığım").
 */
const DOMAIN_WORDS = [
  "burç", "burcu", "burcun", "burcum", "burçlar", "burcunuz",
  "zodyak", "zodiac", "astroloji", "astrology", "astrolojik",
  "yükselen", "ascendant", "horoscope", "horoskop",
  "yıldız haritası", "natal harita", "doğum haritası", "gökyüzü haritası",
];

const SIGN_NAMES = [
  "koç", "boğa", "ikizler", "yengeç", "aslan", "başak", "terazi",
  "akrep", "yay", "oğlak", "kova", "balık",
  "aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra",
  "scorpio", "sagittarius", "capricorn", "aquarius", "pisces",
];

/** Sert ünsüzün ünlü öncesi yumuşamış hali. */
const SOFTEN: Record<string, string> = { k: "ğ", ç: "c", p: "b", t: "d" };

/** Kimlik ekli kullanımı yakalayan desen ("aslansın", "balığım"). */
function SUFFIX_RE(sign: string): RegExp {
  const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const last = sign.slice(-1);
  const soft = SOFTEN[last];
  const stems = soft ? [esc(sign), esc(sign.slice(0, -1) + soft)] : [esc(sign)];
  return new RegExp(
    `(?<!\\p{L})(?:${stems.join("|")})(?:sın|sin|sun|sün|ım|im|um|üm|yım|yim|yum|yüm)(?!\\p{L})`,
    "u",
  );
}

/** Kelime sınırında arar — alt dize olarak değil. */
function hasWord(haystack: string, word: string): boolean {
  const e = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // \p{L} = herhangi bir harf. Türkçe karakterler için \b yetersiz.
  return new RegExp(`(?<!\\p{L})${e}(?!\\p{L})`, "u").test(haystack);
}

/**
 * Yasak kullanımları döndürür.
 *
 * Burç adı YALNIZCA şu iki durumda sayılır:
 *   1. Yakınında bir alan sözcüğü var ("Yay burcu", "burcun Aslan"),
 *   2. Kimlik ekiyle kullanılmış ("Aslansın", "Balığım", "Koçsun").
 * İkisi de yoksa kelime kendi olağan anlamındadır ve serbesttir.
 */
function scan(text: string): string[] {
  const q = String(text).toLocaleLowerCase("tr");
  const hits = DOMAIN_WORDS.filter((w) => hasWord(q, w));

  for (const sign of SIGN_NAMES) {
    if (!hasWord(q, sign)) {
      // Kimlik eki: "aslansın", "balığım".
      //
      // TÜRKÇE ÜNSÜZ YUMUŞAMASI hesaba katılıyor: ünlüyle başlayan ek
      // gelince sondaki sert ünsüz yumuşar — "balık" + "ım" → "balığım",
      // "balıkım" DEĞİL. Ölçtüm: yumuşama olmadan "Ben Balığım" cümlesi
      // kapıdan geçiyordu, yani en açık sızıntı biçimi yakalanmıyordu.
      if (SUFFIX_RE(sign).test(q)) hits.push(sign);
      continue;
    }
    // Kelime geçiyor: alan sözcüğüyle aynı cümlede mi?
    const near = q
      .split(/[.!?\n]/)
      .some((sentence) => hasWord(sentence, sign) && DOMAIN_WORDS.some((w) => hasWord(sentence, w)));
    if (near) hits.push(sign);
  }
  return hits;
}

test("mizaç metinlerinin HİÇBİRİNDE burç sözcüğü geçmez", () => {
  const seen = new Set<string>();
  for (let m = 1; m <= 12; m++) {
    for (const d of [1, 10, 15, 20, 21, 22, 23, 28]) {
      const t = temperamentFor(m, d);
      if (!t) continue;
      const all = [t.core, t.heart, t.choice, t.strain].join(" ");
      const hits = scan(all);
      assert.deepEqual(hits, [], `${m}/${d} → yasak kelime: ${hits.join(", ")}`);
      seen.add(t.id);
    }
  }
  assert.equal(seen.size, 12, "on iki mizacın hepsi üretilmedi");
});

test("mizaç KİMLİKLERİ de burç adı değil", () => {
  for (let m = 1; m <= 12; m++) {
    const t = temperamentFor(m, 15);
    assert.ok(t);
    assert.deepEqual(scan(t!.id), [], `kimlik sızdırıyor: ${t!.id}`);
  }
});

/** Yorumları söker — çalışma anında hiçbir yoruma erişilmez. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

/**
 * KAYNAKTAKİ VERİ taranıyor — yorumlar hariç.
 *
 * İlk halinde dosyanın tamamını tarıyordum ve test KIRMIZIYDI: kuralın
 * kendisini açıklayan yorum satırlarım ("burç adı geçmemeli") yasak
 * kelimeleri içeriyordu. Kuralı yazmak için adını anmak gerekiyor;
 * kullanıcıya giden şey ise yalnızca çalışma anındaki dizeler.
 *
 * Yorumlar sökülüyor ama VERİ taranmaya devam ediyor: bir sabit listeye
 * ya da metne sızan tek kelime yine yakalanır.
 */
test("natal.ts VERİSİNDE burç adı geçmez (yorumlar hariç)", () => {
  const src = stripComments(readFileSync(join(HERE, "natal.ts"), "utf8"));
  const hits = scan(src);
  assert.deepEqual(hits, [], `natal.ts sızdırıyor: ${hits.join(", ")}`);
});

test("yorum sökücü gerçekten söküyor — kapı boş kalmasın", () => {
  // Sökücü her şeyi silseydi yukarıdaki test hiçbir şey ölçmezdi.
  const sample = 'const a = "koç";\n// koç\n/* koç */';
  const stripped = stripComments(sample);
  assert.ok(stripped.includes('"koç"'), "veri de silinmiş");
  assert.equal((stripped.match(/koç/g) ?? []).length, 1, "yorumlar sökülmemiş");
});

test("her tarih bir mizaca düşer, hiçbiri boşta kalmaz", () => {
  for (let m = 1; m <= 12; m++) {
    const last = new Date(Date.UTC(2024, m, 0)).getUTCDate();
    for (let d = 1; d <= last; d++) {
      assert.ok(temperamentFor(m, d), `${m}/${d} boşta`);
    }
  }
});

test("kesim günleri klasik bölümlemeye uyar", () => {
  // 20 Mart ile 21 Mart farklı mizaca düşmeli (bölümlemenin başlangıcı).
  assert.notEqual(temperamentFor(3, 20)!.id, temperamentFor(3, 21)!.id);
  assert.equal(temperamentFor(3, 21)!.id, temperamentFor(4, 19)!.id);
  assert.notEqual(temperamentFor(4, 19)!.id, temperamentFor(4, 20)!.id);
  // Yıl sonunu aşan kesim.
  assert.equal(temperamentFor(12, 25)!.id, temperamentFor(1, 15)!.id);
  assert.notEqual(temperamentFor(1, 19)!.id, temperamentFor(1, 20)!.id);
});

test("aynı tarih hep aynı mizacı verir", () => {
  assert.equal(temperamentFor(7, 4)!.id, temperamentFor(7, 4)!.id);
  assert.deepEqual(temperamentFor(11, 3), temperamentFor(11, 3));
});

test("geçersiz tarih null döner — varsayılan mizaç ATANMAZ", () => {
  // Rastgele bir huy tarifi, kullanıcının kendisi hakkında yanlış bir şey
  // okuması demek. Okumanın o kısmı hiç görünmesin daha iyi.
  assert.equal(temperamentFor(0, 5), null);
  assert.equal(temperamentFor(13, 5), null);
  assert.equal(temperamentFor(5, 0), null);
  assert.equal(temperamentFor(5, 32), null);
  assert.equal(temperamentFor(1.5, 5), null);
  assert.equal(temperamentFor(Number.NaN, 5), null);
});

test("ISO tarih ayrıştırma", () => {
  assert.equal(temperamentFromDate("1994-07-04")!.id, temperamentFor(7, 4)!.id);
  assert.equal(temperamentFromDate("2000-01-01")!.id, temperamentFor(1, 1)!.id);
});

test("bozuk ISO tarih null döner", () => {
  for (const bad of ["", "  ", "1994-7-4", "94-07-04", "1994/07/04", "abc", "1994-02-31", "1899-05-05", "2200-01-01", "1994-13-01"]) {
    assert.equal(temperamentFromDate(bad), null, bad);
  }
});

// ─── ÇIKTI SIZINTI KAPISI ─────────────────────────────────────────────

/**
 * KULLANICININ GÖRDÜĞÜ METİN taranıyor — kaynak dosya değil.
 *
 * Kaynağı taramak yanlış soruyu sorar. `oracle-canon.ts` içinde
 * "Kalp çizgisi (Venüs→Merkür)" yazıyor ve bu KASITLI: klasik el falında
 * avuç tepeleri gerçekten o adlarla anılır, Cheiro ve Agrippa böyle
 * yazar. Sorun o veri değil, o verinin EKRANA çıkması — ve `plain()`
 * parantez içi teknik ekleri zaten söküyor.
 *
 * Bu yüzden test gerçek okumaları ÜRETİP çıktıyı tarıyor. Ölçtüğü şey
 * ürün vaadinin ta kendisi: kullanıcı o alanın adını görmeyecek.
 */
test("üretilen okumaların HİÇBİRİNDE yasak kelime geçmez", () => {
  const feat = (over: Record<string, number> = {}) => ({
    coverage: 0.15, centroidX: 0.5, centroidY: 0.5, blobArea: 0.12,
    blobAspect: 1, blobX: 0.5, blobY: 0.5, scatter: 0.5, gap: 0.1, ...over,
  });

  const letters: (OracleLetter | null)[] = [];
  // Her mizaçla, her okuma türünde.
  for (let m = 1; m <= 12; m++) {
    const temper = temperamentFor(m, 15);
    letters.push(coffeeReading([feat({ blobAspect: 3.5 }), feat({ blobArea: 0.3, scatter: 0.3 }), feat()], temper));
    letters.push(palmReading({ heart: 0.8, head: 0.3, life: 0.6, continuity: 0.2, density: 0.5 }, temper));
    letters.push(palmReading({ heart: 0.1, head: 0.9, life: 0.2, continuity: 0.9, density: 0.5 }, temper));
    letters.push(dreamReading("Rüyamda evimizde bir yılan gördüm, kapı kilitliydi, dişim döküldü.", temper));
  }

  let checked = 0;
  for (const l of letters) {
    if (!l) continue;
    // `sources` KASITLI olarak dışarıda: kayıtta duruyor, ekrana basılmıyor.
    const shown = [l.title, l.omen, l.seen, l.love, l.path, l.near, l.character ?? ""].join(" ");
    const hits = scan(shown);
    assert.deepEqual(hits, [], `okumada yasak kelime: ${hits.join(", ")} → ${shown.slice(0, 160)}`);
    checked++;
  }
  assert.ok(checked >= 40, `yalnızca ${checked} okuma tarandı — kapı boş`);
});

/**
 * TARAYICININ DİŞİ VAR MI. Yasak kelimeyi bilerek koyup yakalandığını
 * görmezsek, yukarıdaki testin hep yeşil kalması hiçbir şey kanıtlamaz.
 */
test("tarayıcı gerçekten yakalıyor", () => {
  // Alan sözcüğü: her zaman yakalanır.
  assert.deepEqual(scan("Bugün burcun için güzel bir gün"), ["burcun"]);
  assert.deepEqual(scan("zodiac reading"), ["zodiac"]);
  assert.ok(scan("Yükselen etkisi güçlü").includes("yükselen"));

  // Burç adı + alan sözcüğü aynı cümlede: yakalanır.
  assert.ok(scan("Yay burcu için bu hafta").includes("yay"));
  assert.ok(scan("burcun Aslan olduğu için").includes("aslan"));

  // Kimlik eki: yakalanır.
  assert.ok(scan("Sen bir Aslansın").includes("aslan"));
  assert.ok(scan("Ben Balığım").includes("balık"));
});

/**
 * MASUM KULLANIM YAKALANMAMALI. Külliyat bu kelimeleri kendi olağan
 * anlamıyla kullanıyor ve okuma onları göstermeye devam etmeli.
 */
test("tarayıcı masum kelimelere alarm vermez", () => {
  assert.deepEqual(scan("Geniş yay — nefes"), []);          // avuç çizgisi
  assert.deepEqual(scan("balık: rızık, sürü halinde bolluk"), []); // telve sembolü
  assert.deepEqual(scan("kova ve kapı işareti"), []);
  assert.deepEqual(scan("kaleidoscope leopar"), []);
  assert.deepEqual(scan("balıkçı teknesi"), []);
  assert.deepEqual(scan("terazi gibi tartarsın"), []);
});

test("doğum tarihi girilmemişse huy bölümü HİÇ çıkmaz", () => {
  const l = dreamReading("Rüyamda evde bir yılan gördüm.");
  assert.ok(l);
  assert.equal(l!.character, undefined);
});

test("doğum tarihi girilmişse huy bölümü gelir", () => {
  const l = dreamReading("Rüyamda evde bir yılan gördüm.", temperamentFor(7, 4));
  assert.ok(l);
  // Eşik 20'den 8'e indi: huy cümleleri KASITLI olarak kısaldı. Uzun
  // cümleler bütçeyi yiyip okumanın diğer satırlarına pay bırakmıyordu
  // ve huy tek yere yığılıyordu — istenen dağılımın tersi.
  assert.ok((l!.character ?? "").length >= 8, l!.character);
  assert.ok(!/\s{2}|^\s|\s$/.test(l!.character ?? ""), "boşluk sorunu");
});

// ─── HUYUN PAYI ───────────────────────────────────────────────────────

/**
 * Ürün kararı: okuma AĞIRLIKLA kadim külliyattan gelsin, huy yaklaşık
 * %30 pay alsın. Bu oran iddia değil ÖLÇÜM — huylu ve huysuz okumanın
 * uzunluk farkı, huyun katkısının ta kendisi.
 *
 * İki sezgisel deneme ıskaladı ve ikisi de burada yakalandı:
 *   her satıra huy eklemek        → %41,2
 *   "yarıdan uzunsa ekleme" eşiği → %17,3
 * Sebep: külliyat satırlarının uzunluğu okuma türüne göre çok değişiyor
 * (rüya kısa, kahve uzun), sabit kural her türde farklı oran veriyor.
 * Şimdi bütçe hesaplanıyor: T = C × 0,30/0,70.
 */
function shownText(l: OracleLetter): string {
  return [l.title, l.omen, l.seen, l.love, l.path, l.near, l.character ?? ""].join(" ");
}

const FEAT = (over: Record<string, number> = {}) => ({
  coverage: 0.15, centroidX: 0.5, centroidY: 0.5, blobArea: 0.12,
  blobAspect: 1, blobX: 0.5, blobY: 0.5, scatter: 0.5, gap: 0.1, ...over,
});

const READINGS: [string, (t: ReturnType<typeof temperamentFor>) => OracleLetter | null][] = [
  ["kahve", (t) => coffeeReading([FEAT({ blobAspect: 3.5 }), FEAT({ blobArea: 0.3, scatter: 0.3 }), FEAT()], t)],
  ["el", (t) => palmReading({ heart: 0.8, head: 0.3, life: 0.6, continuity: 0.2, density: 0.5 }, t)],
  ["rüya", (t) => dreamReading("Rüyamda evimizde bir yılan gördüm, kapı kilitliydi, dişim döküldü.", t)],
];

test("huyun payı %30 bandında — her okuma türü, her mizaç", () => {
  const all: number[] = [];
  for (const [name, make] of READINGS) {
    const bare = shownText(make(null)!).length;
    for (let m = 1; m <= 12; m++) {
      const withTemper = shownText(make(temperamentFor(m, 15))!).length;
      const share = (withTemper - bare) / withTemper;
      all.push(share);
      assert.ok(
        share >= 0.18 && share <= 0.38,
        `${name} · ay ${m}: huy payı %${(share * 100).toFixed(1)} — %30 bandının dışında`,
      );
    }
  }
  const mean = all.reduce((a, b) => a + b, 0) / all.length;
  assert.ok(
    mean >= 0.26 && mean <= 0.34,
    `ortalama %${(mean * 100).toFixed(1)} — hedef %30`,
  );
  assert.equal(all.length, 36);
});

/**
 * HUY TEK BLOKTA TOPLANMAMALI, DAĞILMALI. Payın doğru olması yetmez:
 * hepsi `character` alanında olsaydı oran yine %30 çıkardı ama okuma
 * ikiye bölünürdü — önce külliyat, sonra ayrı bir "sen böylesin"
 * paragrafı. Falcı böyle konuşmaz.
 */
test("huy okumanın İÇİNE dağılır, tek bölüme yığılmaz", () => {
  for (const [name, make] of READINGS) {
    const bare = make(null)!;
    const withT = make(temperamentFor(7, 4))!;
    const touched = (["love", "path", "near"] as const).filter(
      (k) => (withT[k] ?? "") !== (bare[k] ?? ""),
    );
    assert.ok(touched.length >= 2, `${name}: huy yalnızca ${touched.length} satıra dokundu`);
    assert.ok((withT.character ?? "").length > 10, `${name}: karakter satırı boş`);
  }
});

test("doğum tarihi yoksa okuma tamamen külliyattan gelir", () => {
  for (const [name, make] of READINGS) {
    const l = make(null)!;
    assert.equal(l.character, undefined, name);
  }
});
