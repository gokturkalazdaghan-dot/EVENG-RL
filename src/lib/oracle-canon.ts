export type OracleAgentId = "safiye" | "cheiro" | "sirin";

export const WAIT_BOOKS: Record<"coffee" | "palm" | "dream", string[]> = {
  coffee: [
    "Osmanlı fincan usulü",
    "Tasseography · marc de café",
    "Lettura del fondo",
    "Anadolu telve defterleri",
  ],
  palm: [
    "Cheiro · Language of the Hand",
    "Agrippa",
    "Samudrika Shastra",
    "手相 · Çin el falı",
  ],
  dream: [
    "İbn Sirin · Ta'bir al-Ru'ya",
    "Artemidorus · Oneirocritica",
    "周公解梦 · Zhou Gong",
    "Tabirname",
    "Macrobius · Somnium Scipionis",
    "Achmet Oneirocriticon",
  ],
};

export const ORACLE_AGENTS: Record<
  "coffee" | "palm" | "dream",
  { id: OracleAgentId; name: string; book: string; line: string }
> = {
  coffee: {
    id: "safiye",
    name: "SAFIYE",
    book: "Osmanlı fincan · tasseography",
    line: "Fincanın üç açısını ev, dünya ve köke ayırır.",
  },
  palm: {
    id: "cheiro",
    name: "CHEIRO",
    book: "Cheiro · Agrippa · Samudrika · 手相",
    line: "Çizgi ve tepeleri adlandırır, görünmeyeni uydurmaz.",
  },
  dream: {
    id: "sirin",
    name: "SİRİN",
    book: "İbn Sirin · Artemidorus · Zhou Gong · Tabirname",
    line: "Gördüğün resmi alıntılar, sonra kadim kuralı söyler.",
  },
};

/**
 * Kahve sembol külliyatı — YAPISAL.
 *
 * Eskiden yalnızca `join("\n")` edilmiş bir metin bloğuydu ve tek
 * müşterisi uzak modelin istem metniydi. Cihaz üstü okuyucu
 * (`oracle-local.ts`) aynı külliyatı ölçülen işaretlerle eşleştirebilsin
 * diye yapısal hale getirildi. İstem metni (`coffeeCanon`) aynı veriden
 * türetiliyor — iki kopya tutulmuyor, biri güncellenip diğeri unutulamıyor.
 */
export interface CoffeeSign {
  readonly sign: string;
  readonly reading: string;
}

export const COFFEE_SIGN_TABLE: readonly CoffeeSign[] = [
  { sign: "kuş", reading: "haber, mektup, gelen söz — kulpa yakınsa eve gelir, karşı ağızdaysa yabancıdan gelir" },
  { sign: "yol / patika", reading: "seçim veya yolculuk — kırık yol gecikme, çift yol iki irade" },
  { sign: "yüzük", reading: "bağ, söz, akit — kulpta evlilik/ev işi, dipte çoktan kurulmuş bağ" },
  { sign: "yılan", reading: "haset veya gizli sınav — kulpta ev içi kıskançlık, karşıda dış dil" },
  { sign: "ağaç", reading: "soy ve yavaş bereket — dipte kök, duvarda büyüme" },
  { sign: "dağ", reading: "tırmanılır engel — sivriyse sıkışma, yumuşaksa zaman" },
  { sign: "köprü", reading: "bağlayan kişi — kulpta aile, karşıda aracı" },
  { sign: "balık", reading: "rızık — sürü halinde bolluk, tek balık tek kapı" },
  { sign: "taç", reading: "onur, görünürlük" },
  { sign: "harf / sayı", reading: "bir ad veya tarih — gördüğün şekli aynen söyle" },
  { sign: "köpek", reading: "vefa — dişliyorsa ihanet korkusu, yatıksa sadık eşlik" },
  { sign: "at", reading: "hızlı haber" },
  { sign: "kalp", reading: "gönül işi — çatlak kalp kırık söz" },
  { sign: "anahtar", reading: "açılan kapı, yetki" },
  { sign: "kilit / kapı", reading: "tutulmuş mesele" },
  { sign: "göz", reading: "nazar veya uyanış" },
  { sign: "ay", reading: "kadın, gece işi, döngü" },
  { sign: "güneş", reading: "erkek, açık şan" },
  { sign: "çocuk", reading: "yeni iş veya haber" },
  { sign: "gemi", reading: "uzak iş, beklenen dönüş" },
  { sign: "kalın kara topak kulpta", reading: "evde oturan mesele" },
  { sign: "ince toz karşı ağızda", reading: "henüz eve girmemiş laf" },
  { sign: "beyaz boşluk", reading: "açılmış kapı" },
  { sign: "kırık çizgi", reading: "erteleme" },
];

const COFFEE_SIGNS = COFFEE_SIGN_TABLE.map((s) => `${s.sign}: ${s.reading}`).join("\n");


export interface PalmSign {
  readonly name: string;
  readonly reading: string;
}

export const PALM_SIGN_TABLE: readonly PalmSign[] = [
  { name: "Kalp çizgisi (Venüs→Merkür)", reading: "gönlün nasıl harcandığı. Derin ve düz = sakin bağlılık. Zincirli = kesik iş. Çatallı uç = iki gönül. Kısa = duygunun çabuk kapanması. Baş çizgisine yapışık başlangıç = akıl kalbi yönetir." },
  { name: "Baş çizgisi", reading: "akıl ve tasa. Uzun düz = soğuk muhakeme. Eğik Luna'ya = hayal. Ada = bir mevsim yorgunluk. Çatal = irade bölünmesi." },
  { name: "Hayat çizgisi", reading: "dirilik ve ev değişimi — ölüm yılı DEĞİL. Geniş yay = nefes. Sıkı başparmağa yapışık = ihtiyat. Kopuk = ev/iş kırılması. Ada = bitkin mevsim." },
  { name: "Kader / Satürn çizgisi", reading: "işin kişiyi bulması. Avuçtan yükselen = kendi emeği. Ay'dan = dış yardım. Kopuk = meslek değişimi." },
  { name: "Güneş / Apollon çizgisi", reading: "tanınma, sanat, şans. Yokluğu felaket değil; varlığı görünür iş." },
  { name: "Merkür çizgisi", reading: "söz ve ticaret. Çok kırık = dağınık konuşma." },
  { name: "Venüs tepesi (başparmak kökü)", reading: "iştah, sevgi, beden ısısı. Dolgun = canlı gönül. Düz = çekingen." },
  { name: "Jüpiter tepesi (işaret kökü)", reading: "onur, gurur. Yıldız = ani paye. Izgara = dağınık hırs." },
  { name: "Satürn tepesi", reading: "vazife, yalnızlık." },
  { name: "Apollon tepesi", reading: "zevk, şans." },
  { name: "Merkür tepesi", reading: "zeka, ticaret." },
  { name: "Luna tepesi", reading: "rüya, yol, su." },
  { name: "Mars", reading: "öfke ve cesaret — iç Mars (başparmak içi) savunu, dış Mars (perküsyon) saldırı." },
  { name: "Yıldız", reading: "ani iz. Haç: sınav. Üçgen: korunmuş akıl. Kare: siper. Ada: yorgunluk. Izgara: dağılma. Zincir: kesinti. Çatal: iki yol." },
];

const PALM_SIGNS = PALM_SIGN_TABLE.map((s) => `${s.name}: ${s.reading}`).join("\n");


export interface DreamSign {
  readonly keys: readonly string[];
  readonly rule: string;
}

export const DREAM_SIGNS: readonly DreamSign[] = [
  { keys: ["su", "deniz", "ırmak", "yağmur", "göl", "water", "sea", "rain"], rule: "İbn Sirin: su kalbin hali. Durgun berrak = gönül rahatı. Bulanık/taşkın = tasa. Deniz = büyük iş veya korku; sahil = sınır." },
  { keys: ["yılan", "snake"], rule: "İbn Sirin: yılan düşman veya gizli söz. Öldürmek = düşmanı yenmek. Evde yılan = ev içi kıskançlık." },
  { keys: ["diş", "teeth"], rule: "Diş dökümü tıp tablosu değil: soy, itibar veya bir yakının haberi korkusu. Üst diş = erkek hısım, alt = kadın hısım (klasik tabir)." },
  { keys: ["ev", "oda", "house", "room"], rule: "Ev = nefs. Yıkık ev = sarsılan benlik. Yeni ev = yeni hal. Kilitli oda = saklanan iş." },
  { keys: ["ölü", "dead", "cenaze"], rule: "Ölü konuşursa bitmemiş öğüt. Ölüye bir şey vermek = kayıp. Diriltmek = eski işin dönüşü. Ölüm kehaneti YOK." },
  { keys: ["uç", "uçmak", "uçuş", "fly", "flight"], rule: "Uçmak: kurtuluş veya kaçış. Alçaktan = kısa ferahlık. Yüksek ve düşmeden = yükün kalkması." },
  { keys: ["kapı", "kilit", "anahtar", "door", "key", "lock"], rule: "Kapı = fırsat. Kilitli = tutulmuş mesele. Anahtar = yetki. Artemidorus: hangi kapı (ev, cami, iş) bağlamı değiştirir." },
  { keys: ["bebek", "çocuk", "doğum", "baby", "child"], rule: "Çocuk: yeni iş, haber veya yük. Ağlayan bebek = tasalı başlangıç." },
  { keys: ["düğün", "gelin", "evlilik", "wedding"], rule: "Düğün: bağ. Kendi düğünü = yeni ortaklık. Başkasınınki = tanık olunan birleşme." },
  { keys: ["para", "altın", "money", "gold"], rule: "Altın: fitne veya ağır nimet — İbn Sirin'de altın çoğu kez tasa. Gümüş daha yumuşak rızık." },
  { keys: ["ateş", "yangın", "fire"], rule: "Ateş: fitne, öfke, sınav. Sönmüş ateş = geçen kriz. Kontrollü ocak = ev bereketi." },
  { keys: ["yol", "sokak", "road", "street"], rule: "Yol: gidişat. Islak/karanlık sokak = bulanık dönem. Aydınlık yol = açık seçim." },
  { keys: ["köpek", "dog"], rule: "Köpek: vefa veya düşman — evcilse dost, saldırgansa hasım." },
  { keys: ["kedi", "cat"], rule: "Kedi: ev içi kadın işi veya sinsi söz (klasik tabir, cinsiyet klişesi olarak dayatma)." },
  { keys: ["kuş", "bird"], rule: "Kuş: haber. Kafeste = tutulmuş söz. Uçan sürü = çok haber." },
  { keys: ["düş", "falling", "yükseklik"], rule: "Düşmek: kontrol kaygısı, makam korkusu — kesin felaket değil." },
  { keys: ["sınav", "okul", "exam", "school"], rule: "Sınav: ölçüye çekilme. Geçmek = görünür onay. Kalmak = hazırlıksız his." },
  { keys: ["saç", "hair"], rule: "Saç uzamak: güç. Dökülmek: itibar kaygısı." },
  { keys: ["ayna", "mirror"], rule: "Ayna: nefsin yüzü. Kırık ayna = bölünmüş benlik, ölüm değil." },
  { keys: ["araba", "tren", "uçak", "car", "train", "plane"], rule: "Taşıt: hayatın temposu. Kaçırılan taşıt = kaçan fırsat. Kullanmak = irade." },
  { keys: ["anne", "baba", "mother", "father"], rule: "Ebeveyn: kök ve yetki. Kavga = iç çatışma. Kucak = sığınak." },
  { keys: ["kan", "blood"], rule: "Kan: akrabalık veya hayat gücü. Akmak = güç kaybı korkusu, tıp tanısı değil." },
  { keys: ["çiçek", "gül", "flower", "rose"], rule: "Çiçek: geçici güzellik ve söz. Solmuş = biten mevsim." },
  { keys: ["kitap", "book"], rule: "Kitap: sır veya öğreti. Açık kitap = açılan bilgi." },
];

export function coffeeCanon() {
  return [
    "Ajan SAFIYE. Osmanlı kahve falı + Avrupa tasseography. Burç yazmazsın.",
    "Kulp = ev ve ben. Karşı ağız = dış dünya. Dip = kök ve karar. Duvarlar = yürüyen günler.",
    "Sadece fotoğrafta gördüğün işareti oku. Kısa, çarpıcı, karmaşık deneme değil.",
    "Kitap adlarını metin içinde tekrarlama; kaynakları yalnızca sources dizisine koy.",
    "Sembol külliyatı:",
    COFFEE_SIGNS,
  ].join("\n");
}

export function palmCanon() {
  return [
    "Ajan CHEIRO. Cheiro, Agrippa, Hindu Samudrika Shastra, Çin 手相. Panayır falcısı değilsin.",
    "Yalnızca görünür çizgi ve tepeleri adlandır. Hastalık teşhisi yok. Ölüm yılı yok.",
    "Kısa konuş. Kitap adlarını metinde sayma; sources dizisine yaz.",
    "Sembol külliyatı:",
    PALM_SIGNS,
  ].join("\n");
}

export function dreamCanon(text: string) {
  const q = text.toLocaleLowerCase("tr");
  const hit = DREAM_SIGNS.filter((s) => s.keys.some((k) => q.includes(k)));
  const rules = (hit.length ? hit : DREAM_SIGNS.slice(0, 8)).map((s) => s.rule).join("\n");
  return [
    "Ajan SİRİN. Doğu ve Batı rüya külliyatı: İbn Sirin, Osmanlı Tabirname, Artemidorus Oneirocritica, Macrobius, Achmet, Zhou Gong (周公解梦), klasik Japon yumeuranai.",
    "Rüyadaki imgeleri al. En gerçekçi, bu kişiye oturan tek okumayı seç — ansiklopedi dökme.",
    "Kitap adlarını paragraf içinde tekrarlama. sources dizisine 3–5 kitap koy.",
    "Tıp, hukuk, ölüm kehaneti yok. Karmaşık deneme yok. İlgi çeken cümleyi öne al.",
    "Bu rüyaya düşen tabirler:",
    rules,
  ].join("\n");
}

export function agentCanon(kind: "coffee" | "palm" | "dream", dream = "") {
  if (kind === "palm") return palmCanon();
  if (kind === "dream") return dreamCanon(dream);
  return coffeeCanon();
}
