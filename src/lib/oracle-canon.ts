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

const COFFEE_SIGNS = [
  "kuş: haber, mektup, gelen söz — kulpa yakınsa eve gelir, karşı ağızdaysa yabancıdan gelir",
  "yol / patika: seçim veya yolculuk — kırık yol gecikme, çift yol iki irade",
  "yüzük: bağ, söz, akit — kulpta evlilik/ev işi, dipte çoktan kurulmuş bağ",
  "yılan: haset veya gizli sınav — kulpta ev içi kıskançlık, karşıda dış dil",
  "ağaç: soy ve yavaş bereket — dipte kök, duvarda büyüme",
  "dağ: tırmanılır engel — sivriyse sıkışma, yumuşaksa zaman",
  "köprü: bağlayan kişi — kulpta aile, karşıda aracı",
  "balık: rızık — sürü halinde bolluk, tek balık tek kapı",
  "taç: onur, görünürlük",
  "harf / sayı: bir ad veya tarih — gördüğün şekli aynen söyle",
  "köpek: vefa — dişliyorsa ihanet korkusu, yatıksa sadık eşlik",
  "at: hızlı haber",
  "kalp: gönül işi — çatlak kalp kırık söz",
  "anahtar: açılan kapı, yetki",
  "kilit / kapı: tutulmuş mesele",
  "göz: nazar veya uyanış",
  "ay: kadın, gece işi, döngü",
  "güneş: erkek, açık şan",
  "çocuk: yeni iş veya haber",
  "gemi: uzak iş, beklenen dönüş",
  "kalın kara topak kulpta: evde oturan mesele",
  "ince toz karşı ağızda: henüz eve girmemiş laf",
  "beyaz boşluk: açılmış kapı",
  "kırık çizgi: erteleme",
].join("\n");

const PALM_SIGNS = [
  "Kalp çizgisi (Venüs→Merkür): gönlün nasıl harcandığı. Derin ve düz = sakin bağlılık. Zincirli = kesik iş. Çatallı uç = iki gönül. Kısa = duygunun çabuk kapanması. Baş çizgisine yapışık başlangıç = akıl kalbi yönetir.",
  "Baş çizgisi: akıl ve tasa. Uzun düz = soğuk muhakeme. Eğik Luna'ya = hayal. Ada = bir mevsim yorgunluk. Çatal = irade bölünmesi.",
  "Hayat çizgisi: dirilik ve ev değişimi — ölüm yılı DEĞİL. Geniş yay = nefes. Sıkı başparmağa yapışık = ihtiyat. Kopuk = ev/iş kırılması. Ada = bitkin mevsim.",
  "Kader / Satürn çizgisi: işin kişiyi bulması. Avuçtan yükselen = kendi emeği. Ay'dan = dış yardım. Kopuk = meslek değişimi.",
  "Güneş / Apollon çizgisi: tanınma, sanat, şans. Yokluğu felaket değil; varlığı görünür iş.",
  "Merkür çizgisi: söz ve ticaret. Çok kırık = dağınık konuşma.",
  "Venüs tepesi (başparmak kökü): iştah, sevgi, beden ısısı. Dolgun = canlı gönül. Düz = çekingen.",
  "Jüpiter tepesi (işaret kökü): onur, gurur. Yıldız = ani paye. Izgara = dağınık hırs.",
  "Satürn tepesi: vazife, yalnızlık.",
  "Apollon tepesi: zevk, şans.",
  "Merkür tepesi: zeka, ticaret.",
  "Luna tepesi: rüya, yol, su.",
  "Mars: öfke ve cesaret — iç Mars (başparmak içi) savunu, dış Mars (perküsyon) saldırı.",
  "Yıldız: ani iz. Haç: sınav. Üçgen: korunmuş akıl. Kare: siper. Ada: yorgunluk. Izgara: dağılma. Zincir: kesinti. Çatal: iki yol.",
].join("\n");

const DREAM_SIGNS: { keys: string[]; rule: string }[] = [
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
