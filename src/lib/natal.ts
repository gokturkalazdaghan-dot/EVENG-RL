/**
 * Doğum tarihinden mizaç — KULLANICIYA HİÇ SÖYLENMEZ.
 *
 * ─── NE İŞE YARIYOR ──────────────────────────────────────────────────
 * Fal okuması iki kaynaktan besleniyor: ağırlıklı olarak kadim külliyat
 * (fincandaki işaret, avuçtaki çizgi, rüyadaki imge) ve daha küçük bir
 * payla kişinin doğum zamanından gelen mizaç. Ürün kararı: kullanıcı
 * ikinci kaynağı GÖRMEYECEK — ne adı, ne "şuradan yola çıktık" cümlesi.
 *
 * Bu yüzden buradaki hiçbir çıktı metni o alanın sözcüklerini içermiyor
 * ve `natal.test.ts` bunu kelime kelime doğruluyor. Sızıntı SESSİZ olur:
 * kod çalışır, testler yeşildir, kullanıcı ürünün vaat etmediği bir şey
 * okur.
 *
 * ─── KAYNAK KADİM ────────────────────────────────────────────────────
 * Mizaç ayrımı modern gazete köşesi değil, klasik külliyat:
 *   · Batlamyus, Tetrabiblos (2. yy) — dört unsur; sıcak/soğuk ve
 *     kuru/nemli eşleşmesi
 *   · Vettius Valens, Anthologiae (2. yy) — öncü / sabit / değişken
 *     nitelik ayrımı
 *   · Ebu Maşer, Kitâbü'l-Medhal (9. yy) — mizacın huya çevrilmesi
 *   · William Lilly, Christian Astrology (1647) — huy tarifleri
 *
 * Metinler bu dörtlünün ORTAK mizaç tarifinden yazıldı; hiçbirinde
 * gökcismi, sembol ya da tarih aralığı geçmiyor — yalnızca huy.
 */

/** İç kimlik. Kullanıcıya ASLA gösterilmez, arayüze hiç geçmez. */
export type TemperId =
  | "kor" | "ates" | "kivilcim"      // sıcak-kuru: öncü, sabit, değişken
  | "toprak" | "kaya" | "tarla"      // soğuk-kuru
  | "ruzgar" | "gok" | "esinti"      // sıcak-nemli
  | "pinar" | "derin" | "sis";       // soğuk-nemli

export interface Temperament {
  readonly id: TemperId;
  /** Karakterin özü — bir cümle, sade dil. */
  readonly core: string;
  /** Gönül işlerindeki huy. */
  readonly heart: string;
  /** Karar verirken huy. */
  readonly choice: string;
  /** Zorlandığında ne yapar. */
  readonly strain: string;
}

const TEXT: Record<TemperId, Omit<Temperament, "id">> = {
  kor: {
    core: "Önce başlarsın, sonra düşünürsün. Beklemek sana ceza gibi gelir.",
    heart: "Sevdiğini hemen belli edersin; oyalanmayı sevmezsin.",
    choice: "Kararı hızlı alır, arkasında durursun.",
    strain: "Sıkışınca sesin yükselir, sonra çabuk geçer.",
  },
  ates: {
    core: "Verdiğin sözü tutarsın. Kolay kolay yön değiştirmezsin.",
    heart: "Bağlandığında kalıcısın; güvenini kırana zor dönersin.",
    choice: "Ağır karar verir, verdikten sonra tartışmazsın.",
    strain: "Zorlanınca inatlaşır, kapıyı kapatırsın.",
  },
  kivilcim: {
    core: "Aklın hızlı, ilgin çabuk kayar. Aynı anda birkaç şey taşırsın.",
    heart: "Her şey sohbetle başlar sende; sıkıldığın an biter.",
    choice: "Seçenek çoğaldıkça karar zorlaşır.",
    strain: "Bunalınca konuyu değiştirir, uzaklaşırsın.",
  },
  toprak: {
    core: "Somut olanı seversin. Söz değil, yapılanı sayarsın.",
    heart: "Yavaş ısınır, ısındıktan sonra emek verirsin.",
    choice: "Hesabını yapmadan adım atmazsın.",
    strain: "Zorlanınca daha çok çalışır, derdini söylemezsin.",
  },
  kaya: {
    core: "Rahatını ve düzenini korursun. Ani değişiklik seni yorar.",
    heart: "Sadıksın; sahiplenirsin, bırakmakta zorlanırsın.",
    choice: "Bir kez karar verdin mi geri dönmezsin.",
    strain: "Sıkışınca susar, içine atarsın.",
  },
  tarla: {
    core: "Detayı görürsün. Kimsenin fark etmediği eksiği sen bulursun.",
    heart: "Sevgini iş yaparak gösterirsin, sözle değil.",
    choice: "Karardan önce her ihtimali çevirirsin kafanda.",
    strain: "Zorlanınca kendini eleştirir, kusur ararsın.",
  },
  ruzgar: {
    core: "İnsanları buluşturursun. Yalnız kalmak sana ağır gelir.",
    heart: "Dengeyi ararsın; kavgadan çok uzlaşmayı seçersin.",
    choice: "Karar verirken başkasının ne diyeceğini tartarsın.",
    strain: "Sıkışınca kararsız kalır, ertelersin.",
  },
  gok: {
    core: "Bildiğini savunursun. Fikrini kolay değiştirmezsin.",
    heart: "Derin bağlanır, paylaşmakta zorlanırsın.",
    choice: "İlkeye göre karar verirsin, duruma göre değil.",
    strain: "Zorlanınca haklılığını ispatlamaya çalışırsın.",
  },
  esinti: {
    core: "Meraklısın. Yeni olan seni her zaman çeker.",
    heart: "Özgürlüğünün kısıtlanmasına dayanamazsın.",
    choice: "Kapıları açık tutmayı seversin.",
    strain: "Bunalınca kaçmak istersin, konuşmak değil.",
  },
  pinar: {
    core: "Sezgin kuvvetli. Söylenmeyeni duyarsın.",
    heart: "Korumacısın; sevdiğinin derdini kendi derdin sayarsın.",
    choice: "İçine doğana güvenirsin, listeye değil.",
    strain: "Zorlanınca geri çekilir, kabuğuna girersin.",
  },
  derin: {
    core: "Kolay açılmazsın. Az kişiye çok yer verirsin.",
    heart: "Ya tamamen varsın ya hiç; arası yok sende.",
    choice: "Kararını içinde çoktan verir, sonra açıklarsın.",
    strain: "Sıkışınca hesaplaşırsın, unutmazsın.",
  },
  sis: {
    core: "Yumuşaksın ama teslim olmazsın — suyun taşı aşındırması gibi.",
    heart: "Kendinden çok karşındakini düşünürsün.",
    choice: "Net karardansa akışa bırakmayı seçersin.",
    strain: "Zorlanınca içine kapanır, kimseye yük olmak istemezsin.",
  },
};

/**
 * On iki bölüm, KLASİK SIRAYLA — 21 Mart'tan başlayarak.
 *
 * Sıra rastgele değil: dört unsur ile üç nitelik dönüşümlü ilerler
 * (sıcak-kuru öncü · soğuk-kuru sabit · sıcak-nemli değişken ·
 * soğuk-nemli öncü · sıcak-kuru sabit · …). Bu dönüşüm külliyatın kendi
 * yapısı.
 *
 * İlk yazdığımda unsurları üçerli bloklar halinde sıralamıştım; o sıra
 * takvimle uyuşmuyordu ve ÖLÇTÜM: on iki tarihin neredeyse hepsi tek bir
 * mizaca düşüyordu.
 */
const ORDER: readonly TemperId[] = [
  "kor", "kaya", "esinti", "pinar", "ates", "tarla",
  "ruzgar", "derin", "kivilcim", "toprak", "gok", "sis",
];

/** Bölüm başlangıçları, `ORDER` ile birebir aynı sırada. */
const CUTS: readonly [number, number][] = [
  [3, 21], [4, 20], [5, 21], [6, 22], [7, 23], [8, 23],
  [9, 23], [10, 23], [11, 22], [12, 22], [1, 20], [2, 19],
];

/** Artık yıl olmayan bir referansta yılın kaçıncı günü. */
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const ordinal = (month: number, day: number) => (MONTH_START[month - 1] ?? 0) + day;

/** Başlangıçlar TAKVİM sırasına dizilmiş hali. */
const SEGMENTS = CUTS
  .map((cut, i) => ({ at: ordinal(cut[0], cut[1]), id: ORDER[i]! }))
  .sort((a, b) => a.at - b.at);

function build(id: TemperId): Temperament {
  return { id, ...TEXT[id] };
}

/**
 * Doğum tarihinden mizaç.
 *
 * GEÇERSİZ TARİH null DÖNER — varsayılan bir mizaç atanmıyor. Rastgele
 * bir huy tarifi, kullanıcının kendisi hakkında yanlış bir şey okuması
 * demek; okumanın o kısmı hiç görünmesin daha iyi.
 */
export function temperamentFor(month: number, day: number): Temperament | null {
  if (!Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const at = ordinal(month, day);
  let found: TemperId | null = null;
  for (const seg of SEGMENTS) {
    if (seg.at <= at) found = seg.id;
  }
  // Yılın ilk günleri (1–19 Ocak) hiçbir başlangıcın üstünde değil:
  // önceki yılın SON bölümüne düşerler. Bu sarma olmadan boşta kalırlardı.
  return build(found ?? SEGMENTS[SEGMENTS.length - 1]!.id);
}

/** `YYYY-MM-DD` girdisinden mizaç. Bozuk girdi null. */
export function temperamentFromDate(iso: string): Temperament | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? "").trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1900 || year > 2100) return null;
  // Ay/gün tutarlılığı: 31 Şubat gibi tarihler elenir.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return temperamentFor(month, day);
}
