// @ts-nocheck
import type {
  AgentDef,
  AgentId,
  AgentStage,
  AtelierId,
  Adjustments,
  FeedPost,
  MakeupLook,
  Story,
  TakeDef,
  Template,
  TemplatePack,
  ToolDef,
  ToolId,
} from "./types";
import { TEMPLATES } from "./templates";

export const TOOL_LABEL = {
  original: "Orijinal",
  template: "Şablon",
  adjust: "Renk ayarı",
  design: "Tasarım",
  look: "Look",
  take: "Çekim",
  restore: "Yüz onarımı",
  shape: "Hacim",
  jaw: "Çene hattı",
  skin: "Cilt yumuşatma",
  sharpen: "HD netleştir",
  erase: "Sihirli silgi",
  animate: "Işık canlandır",
  auto: "Tek dokunuş",
  blemish: "Leke kapat",
  eyes: "Bakış aç",
  teeth: "Diş aydınlat",
  lipstick: "Dudak sır",
  blush: "Allık",
  contour: "Kontür",
  hair: "Saç sır",
  relight: "Yeniden ışık",
  bgblur: "Fon yumuşat",
  denoise: "Gürültü azalt",
  glow: "Cilt ışıltısı",
  even: "Ton dengele",
  details: "Mikro netlik",
  dodge: "Açık nokta",
  backdrop: "Stüdyo fon",
  rotate: "Döndür",
  flip: "Çevir",
  hd: "HD onar",
  unblur: "Bulanıklık gider",
  colorize: "Renklendir",
  eyecolor: "Göz tonu",
  cutout: "Kesip al",
  frame: "Çerçeve",
  smile: "Gülümseme",
  brows: "Kaş",
  lashes: "Kirpik",
  sparkle: "Işıltı",
  vintage: "Arşiv",
  frost: "Kırağı",
  shadow: "Çene gölgesi",
  matte: "Mat ten",
  tan: "Bronz",
  freckle: "Çil",
  darkcircle: "Gözaltı",
  plump: "Dudak dolgun",
  eyeshadow: "Göz farı",
  liner: "Eyeliner",
  letterbox: "Şerit",
  dehaze: "Pus gider",
  clarity: "Net iz",
  hips: "Kalça",
  waist: "Bel",
  eyesbig: "Göz büyüt",
  eyessmall: "Göz küçült",
  almond: "Çekik göz",
  eyein: "Göz yakın",
  eyeout: "Göz uzak",
  lift: "Yüz germe",
};
export const DEFAULT_ADJUST = {
  exposure: 0,
  contrast: 0,
  saturate: 0,
  warmth: 0,
  fade: 0,
  vignette: 0,
  grain: 0,
  highlights: 0,
  shadows: 0,
};
export const ADJUST_SLIDERS: { key: keyof Adjustments; label: string }[] = [
  {
    key: "exposure",
    label: "Pozlama",
  },
  {
    key: "highlights",
    label: "Parlaklar",
  },
  {
    key: "shadows",
    label: "Gölgeler",
  },
  {
    key: "contrast",
    label: "Kontrast",
  },
  {
    key: "saturate",
    label: "Doygunluk",
  },
  {
    key: "warmth",
    label: "Sıcaklık",
  },
  {
    key: "fade",
    label: "Soluk",
  },
  {
    key: "vignette",
    label: "Vinyet",
  },
  {
    key: "grain",
    label: "Gren",
  },
];
export const RATIOS = [
  {
    id: "original",
    label: "Serbest",
    hint: "Orijinal",
  },
  {
    id: "1:1",
    label: "Kare",
    hint: "1:1",
  },
  {
    id: "4:5",
    label: "Gönderi",
    hint: "4:5",
  },
  {
    id: "9:16",
    label: "Hikaye",
    hint: "9:16",
  },
  {
    id: "16:9",
    label: "Kapak",
    hint: "16:9",
  },
  {
    id: "4:3",
    label: "Klasik",
    hint: "4:3",
  },
];
export const STICKERS = [
  {
    id: "kristal",
    label: "Kristal",
  },
  {
    id: "orbit",
    label: "Yörünge",
  },
  {
    id: "spark",
    label: "Kıvılcım",
  },
  {
    id: "frame",
    label: "Çerçeve",
  },
  {
    id: "star",
    label: "Yıldız",
  },
  {
    id: "heart",
    label: "Kalp",
  },
  {
    id: "glass",
    label: "Cam",
  },
  {
    id: "flash",
    label: "Flaş",
  },
  {
    id: "moon",
    label: "Ay",
  },
  {
    id: "leaf",
    label: "Yaprak",
  },
  {
    id: "tape",
    label: "Bant",
  },
  {
    id: "sun",
    label: "Güneş",
  },
  {
    id: "wave",
    label: "Dalga",
  },
  {
    id: "stamp",
    label: "Damga",
  },
];
export const CAPTION_PRESETS = [
  "EVENGIRL · cihazda",
  "Portre, net, kalıcı",
  "NURA · nur gibi",
  "CEHRA · look senin",
  "RELYN · net kalsın",
  "REIRA · bir kare daha",
  "PACCA · şeritte",
  "Orbit · hikaye",
  "Cihazda kaldı",
  "Orijinal duruyor",
];
export const NURA_LOOKS: MakeupLook[] = [
  {
    id: "dogal",
    name: "Doğal",
    steps: ["auto", "blush"],
    free: true,
    tone: "green",
  },
  {
    id: "gunisigi",
    name: "Günışığı",
    steps: ["even", "eyes", "blush"],
    free: true,
    tone: "orange",
  },
  {
    id: "dew",
    name: "Dew",
    steps: ["glow", "eyes", "blush"],
    free: true,
    tone: "green",
  },
  {
    id: "ipek-look",
    name: "İpek",
    steps: ["skin", "matte", "blush"],
    free: true,
    tone: "green",
  },
  {
    id: "spa",
    name: "Spa",
    steps: ["skin", "even", "glow"],
    free: true,
    tone: "green",
  },
  {
    id: "seftali",
    name: "Şeftali",
    steps: ["tan", "blush", "plump"],
    free: true,
    tone: "orange",
  },
  {
    id: "cam-ten",
    name: "Cam ten",
    steps: ["skin", "darkcircle", "glow"],
    free: false,
    tone: "blue",
  },
  {
    id: "mat-ten",
    name: "Mat ten",
    steps: ["matte", "even", "blemish"],
    free: true,
    tone: "green",
  },
  {
    id: "cil",
    name: "Çil",
    steps: ["freckle", "blush", "tan"],
    free: true,
    tone: "orange",
  },
  {
    id: "porselen",
    name: "Porselen",
    steps: ["skin", "teeth", "glow"],
    free: false,
    tone: "green",
  },
  {
    id: "balm",
    name: "Balsam",
    steps: ["plump", "blush", "glow"],
    free: true,
    tone: "orange",
  },
  {
    id: "sabah",
    name: "Sabah",
    steps: ["even", "darkcircle", "blush"],
    free: true,
    tone: "green",
  },
  {
    id: "inci",
    name: "İnci",
    steps: ["skin", "frost", "teeth"],
    free: true,
    tone: "blue",
  },
  {
    id: "sahnepro",
    name: "Sahne Pro",
    steps: ["relight", "glow", "lashes", "lipstick"],
    free: false,
    tone: "orange",
  },
];
export const CEHRA_LOOKS: MakeupLook[] = [
  {
    id: "aksam",
    name: "Akşam",
    steps: ["contour", "lipstick", "eyes"],
    free: true,
    tone: "blue",
  },
  {
    id: "kadife",
    name: "Kadife",
    steps: ["contour", "lipstick", "shadow"],
    free: true,
    tone: "orange",
  },
  {
    id: "bakis",
    name: "Bakış",
    steps: ["eyes", "lashes", "brows"],
    free: true,
    tone: "blue",
  },
  {
    id: "gulumse",
    name: "Açık çehre",
    steps: ["smile", "teeth", "blush"],
    free: true,
    tone: "green",
  },
  {
    id: "editorial",
    name: "Editorial",
    steps: ["contour", "brows", "liner"],
    free: true,
    tone: "green",
  },
  {
    id: "kedi",
    name: "Kedi göz",
    steps: ["liner", "lashes", "eyeshadow"],
    free: true,
    tone: "blue",
  },
  {
    id: "duman",
    name: "Duman",
    steps: ["eyeshadow", "liner", "contour"],
    free: true,
    tone: "blue",
  },
  {
    id: "guldudak",
    name: "Gül dudak",
    steps: ["lipstick", "plump", "blush"],
    free: true,
    tone: "orange",
  },
  {
    id: "bronz-look",
    name: "Bronz",
    steps: ["tan", "contour", "blush"],
    free: true,
    tone: "orange",
  },
  {
    id: "sahne",
    name: "Sahne",
    steps: ["relight", "glow", "lipstick"],
    free: true,
    tone: "orange",
  },
  {
    id: "softsmile",
    name: "Yumuşak gülümse",
    steps: ["smile", "blush", "eyes"],
    free: true,
    tone: "green",
  },
  {
    id: "studioface",
    name: "Stüdyo",
    steps: ["even", "brows", "teeth"],
    free: true,
    tone: "green",
  },
];
export const MAKEUP_LOOKS = [...NURA_LOOKS, ...CEHRA_LOOKS];
export const TAKES: TakeDef[] = [
  {
    id: "studio",
    name: "Stüdyo",
    hint: "Ön ışık, dengeli",
    steps: ["relight", "even"],
    free: true,
  },
  {
    id: "gunisigi",
    name: "Gün ışığı",
    hint: "Sıcak, açık",
    steps: ["relight", "even", "blush"],
    free: true,
  },
  {
    id: "aksam",
    name: "Akşam",
    hint: "Kenar ışık",
    steps: ["relight", "contour", "details"],
    free: true,
  },
  {
    id: "sinema",
    name: "Sinematik",
    hint: "Fon yumuşak",
    steps: ["bgblur", "relight", "details"],
    free: true,
  },
  {
    id: "yakin",
    name: "Yakın çekim",
    hint: "Bakış önde",
    steps: ["eyes", "details", "even"],
    free: true,
  },
  {
    id: "kristal",
    name: "Kristal",
    hint: "Soğuk parıltı",
    steps: ["hd", "glow", "relight"],
    free: false,
  },
  {
    id: "pencere",
    name: "Pencere",
    hint: "Yan ışık, yumuşak",
    steps: ["relight", "frost", "even"],
    free: true,
  },
  {
    id: "fener",
    name: "Sokak feneri",
    hint: "Sıcak kenar",
    steps: ["relight", "vintage", "shadow"],
    free: true,
  },
  {
    id: "altinsaat",
    name: "Altın saat",
    hint: "Sıcak, açık",
    steps: ["relight", "glow", "even"],
    free: true,
  },
  {
    id: "mavi",
    name: "Mavi saat",
    hint: "Soğuk tül",
    steps: ["relight", "frost", "bgblur"],
    free: true,
  },
  {
    id: "loftampul",
    name: "Loft ampul",
    hint: "Tungsten",
    steps: ["relight", "even", "details"],
    free: true,
  },
  {
    id: "retake2",
    name: "İkinci kare",
    hint: "Aynı yüz, yeni ışık",
    steps: ["relight", "hd", "even"],
    free: true,
  },
  {
    id: "softbox",
    name: "Yumuşak kutu",
    hint: "Ön, düz",
    steps: ["relight", "even", "matte"],
    free: true,
  },
  {
    id: "tavan",
    name: "Tavan",
    hint: "Üstten düşen",
    steps: ["relight", "shadow", "even"],
    free: true,
  },
  {
    id: "bounce",
    name: "Yansıyan",
    hint: "Dolgu ışık",
    steps: ["relight", "glow", "darkcircle"],
    free: true,
  },
  {
    id: "flascek",
    name: "Flaş",
    hint: "Anlık pop",
    steps: ["relight", "hd", "clarity"],
    free: true,
  },
  {
    id: "golgecek",
    name: "Gölge",
    hint: "Düşük anahtar",
    steps: ["relight", "contour", "shadow"],
    free: true,
  },
  {
    id: "disgece",
    name: "Gece dış",
    hint: "Sokak, kenar",
    steps: ["relight", "bgblur", "dehaze"],
    free: true,
  },
];
export const TAKE_LIGHT = {
  studio: "front",
  gunisigi: "left",
  aksam: "rim",
  sinema: "right",
  yakin: "front",
  kristal: "rim",
  pencere: "left",
  fener: "right",
  altinsaat: "left",
  mavi: "rim",
  loftampul: "front",
  retake2: "right",
  softbox: "front",
  tavan: "top",
  bounce: "left",
  flascek: "front",
  golgecek: "rim",
  disgece: "right",
};
export const HAIR_COLORS = [
  {
    id: "raven",
    label: "Kuzgun",
    color: "#1c1c22",
  },
  {
    id: "copper",
    label: "Bakır",
    color: "#8b3a1a",
  },
  {
    id: "champagne",
    label: "Şampanya",
    color: "#c4a574",
  },
  {
    id: "ink",
    label: "Mürekkep",
    color: "#1a3355",
  },
  {
    id: "rose",
    label: "Gül",
    color: "#a24a62",
  },
  {
    id: "honey",
    label: "Bal",
    color: "#c48a3a",
  },
  {
    id: "silver",
    label: "Gümüş",
    color: "#c8c2cc",
  },
  {
    id: "auburn",
    label: "Kestane",
    color: "#6b2b16",
  },
  {
    id: "ash",
    label: "Kül",
    color: "#8a8e96",
  },
  {
    id: "gold",
    label: "Hasır",
    color: "#d4b46a",
  },
  {
    id: "wine",
    label: "Şarap",
    color: "#5a1830",
  },
];
export const LIP_COLORS = [
  {
    id: "nude",
    label: "Nude",
    color: "#c4a08a",
  },
  {
    id: "rose",
    label: "Gül",
    color: "#c45c6a",
  },
  {
    id: "crimson",
    label: "Bordo",
    color: "#9e1c28",
  },
  {
    id: "berry",
    label: "Böğürtlen",
    color: "#5c1a32",
  },
  {
    id: "coral",
    label: "Mercan",
    color: "#d4654a",
  },
  {
    id: "wine",
    label: "Şarap",
    color: "#6e1428",
  },
  {
    id: "peach",
    label: "Şeftali",
    color: "#d4896a",
  },
  {
    id: "brick",
    label: "Tuğla",
    color: "#a63a28",
  },
];
export const EYE_COLORS = [
  {
    id: "forest",
    label: "Orman",
    color: "#2f6b4a",
  },
  {
    id: "ocean",
    label: "Okyanus",
    color: "#2a5f8a",
  },
  {
    id: "amber",
    label: "Kehribar",
    color: "#8a5a22",
  },
  {
    id: "smoke",
    label: "Duman",
    color: "#5a6570",
  },
  {
    id: "hazel",
    label: "Ela",
    color: "#6a5a2a",
  },
  {
    id: "ice",
    label: "Buz",
    color: "#7aa0b8",
  },
];
export const SHADOW_COLORS = [
  {
    id: "taupe",
    label: "Taupe",
    color: "#8a7060",
  },
  {
    id: "bronze",
    label: "Bronz",
    color: "#8a5a2a",
  },
  {
    id: "plum",
    label: "Erik",
    color: "#5a2a48",
  },
  {
    id: "slate",
    label: "Arduvaz",
    color: "#3a4a5a",
  },
  {
    id: "gold",
    label: "Altın",
    color: "#c4a050",
  },
  {
    id: "smoke",
    label: "Duman",
    color: "#4a5058",
  },
];
export const FRAME_STYLES = [
  {
    id: "crystal",
    label: "Kristal",
  },
  {
    id: "ember",
    label: "Kor",
  },
  {
    id: "orbit",
    label: "Yörünge",
  },
  {
    id: "thin",
    label: "İnce",
  },
  {
    id: "polaroid",
    label: "Kart",
  },
];
export const LIGHTS = [
  {
    id: "left",
    label: "Sol",
  },
  {
    id: "front",
    label: "Ön",
  },
  {
    id: "right",
    label: "Sağ",
  },
  {
    id: "rim",
    label: "Kenar",
  },
  {
    id: "top",
    label: "Tavan",
  },
];
export const BACKDROPS = [
  {
    id: "navy",
    name: "Kristal",
    image: "/media/prism.jpg",
    prompt: "luxury crystal glass atrium, prism rainbow flares, marble floor, fashion editorial lighting",
  },
  {
    id: "loft",
    name: "Loft",
    image: "/media/loft.jpg",
    prompt: "cream beige photography loft, linen curtain, north window light, Vogue studio",
  },
  {
    id: "forest",
    name: "Orman",
    image: "/media/forest.jpg",
    prompt: "misty pine forest at dawn, god rays through trees, cinematic landscape, 35mm",
  },
  {
    id: "night",
    name: "Gece",
    image: "/media/street-night.jpg",
    prompt: "rain-soaked city street at night, neon bokeh, wet asphalt reflections, Blade Runner warmth",
  },
  {
    id: "cafe",
    name: "Kafe",
    image: "/media/cafe.jpg",
    prompt: "sunlit Paris cafe, brass espresso machine, warm wood, window bokeh, editorial portrait",
  },
  {
    id: "altin",
    name: "Altın saat",
    image: "/media/loft.jpg",
    prompt: "golden hour rooftop, honey sunlight, city skyline bokeh, luxury campaign",
  },
  {
    id: "bahce",
    name: "Bahçe",
    image: "/media/forest.jpg",
    prompt: "English rose garden, peonies in bloom, soft daylight, romantic fashion plate",
  },
  {
    id: "sahil",
    name: "Sahil",
    image: "/media/prism.jpg",
    prompt: "minimal Mediterranean beach, turquoise water, white sand, clean noon light",
  },
  {
    id: "otel",
    name: "Otel",
    image: "/media/cafe.jpg",
    prompt: "five-star hotel lobby, champagne marble, chandelier bokeh, quiet luxury",
  },
  {
    id: "kuzey",
    name: "Kuzey",
    image: "/media/prism.jpg",
    prompt: "glass cabin in snow, pale nordic light, mountains beyond, calm cinematic still",
  },
];
export const STUDIO_ARKS = [
  { id: "loft", name: "Bej stüdyo", image: "/media/loft.jpg", free: true },
  { id: "cafe", name: "Pembe tül", image: "/media/cafe.jpg", free: true },
  { id: "navy", name: "Kristal cam", image: "/media/prism.jpg", free: true },
];
export const HAIR_STYLES: (MakeupLook & { color: string })[] = [
  { id: "hs-ipek", name: "İpek düz", steps: ["hair", "glow"], free: true, tone: "green", color: "#2a1c16" },
  { id: "hs-dalga", name: "Dalga", steps: ["hair", "contour"], free: true, tone: "orange", color: "#4a2a1c" },
  { id: "hs-balayage", name: "Balayage", steps: ["hair", "tan"], free: true, tone: "orange", color: "#c4a06a" },
  { id: "hs-platin", name: "Platin", steps: ["hair", "frost"], free: true, tone: "blue", color: "#d9d3ca" },
  { id: "hs-bakir", name: "Bakır", steps: ["hair", "tan"], free: true, tone: "orange", color: "#b4522a" },
  { id: "hs-kakao", name: "Kakao", steps: ["hair", "matte"], free: true, tone: "orange", color: "#3a2218" },
];
export const HAIR_CUTS: MakeupLook[] = [
  { id: "hc-bob", name: "Bob", steps: ["hair", "shape"], free: true, tone: "green" },
  { id: "hc-lob", name: "Lob", steps: ["hair", "even"], free: true, tone: "green" },
  { id: "hc-kahkul", name: "Kahkül", steps: ["hair", "shadow"], free: true, tone: "blue" },
  { id: "hc-slick", name: "Slick", steps: ["hair", "matte"], free: true, tone: "blue" },
  { id: "hc-pony", name: "Toplu", steps: ["hair", "contour"], free: true, tone: "orange" },
  { id: "hc-wolf", name: "Wolf", steps: ["hair", "details"], free: true, tone: "orange" },
];
export const LIP_FILLERS = [
  { id: "natural", name: "Natural", hint: "Doğal hacim", prompt: "subtle natural lip filler, soft hydrated lips, same person", free: true },
  { id: "heart", name: "Heart", hint: "Kalp form", prompt: "heart-shaped lips with a defined cupid bow, natural filler, same person", free: false },
  { id: "russian", name: "Russian", hint: "Dikey lift", prompt: "Russian lip filler technique, lifted vertical volume, same person, natural", free: false },
  { id: "pillow", name: "Pillow", hint: "Yastık dolgun", prompt: "pillow-soft plump lips, even volume, same person, photoreal", free: false },
  { id: "cupid", name: "Cupid", hint: "Yay hat", prompt: "pronounced cupid's bow lip filler, elegant shape, same person", free: false },
];
export const CLINIC_SKIN = [
  { id: "leke", name: "Leke sil", hint: "Tek dokunuş", prompt: "remove acne blemishes redness while keeping pores and identity", tools: ["blemish", "skin"], free: true },
  { id: "puruz", name: "Pürüzsüz", hint: "Klinik cilt", prompt: "smooth complexion, keep pores, no plastic skin, same person", tools: ["skin", "even"], free: true },
  { id: "halka", name: "Gözaltı", hint: "Gölge", prompt: "reduce dark under-eye circles naturally, same person", tools: ["darkcircle"], free: true },
  { id: "parlak", name: "Işıltı", hint: "Dew ten", prompt: "healthy dewy skin glow, not oily, same person", tools: ["glow"], free: true },
];
export const CLINIC_AGENTS = [
  { id: "cilt", name: "Dr. NURA", role: "Cilt", line: "Leke ve kusur, tek dokunuş." },
  { id: "dudak", name: "Dr. CEHRA", role: "Dudak", line: "Şekil ve miktarı sen seç." },
  { id: "sac", name: "Dr. EVEN", role: "Saç", line: "Stil, kesim ve renk şablonları." },
  { id: "yuz", name: "Dr. REIRA", role: "Yüz", line: "Göz, gülüş, germe." },
  { id: "dolgu", name: "Dr. NIVA", role: "Dolgu", line: "İğnesiz yüz dolgu simülasyonu." },
  { id: "cerrahi", name: "Dr. ARMA", role: "Cerrahi", line: "Estetik simülasyon, tıbbi vaat yok." },
  { id: "beden", name: "Dr. RELYN", role: "Vücut", line: "Bel, kalça, hat." },
];
export const CLINIC_FACE = [
  { id: "smile", name: "Gülüş", hint: "Gülmeyen kare", prompt: "natural genuine smile, same person, keep identity, photoreal", tools: ["smile"], free: true },
  { id: "teeth1", name: "Diş 1", hint: "Doğal beyaz", prompt: "subtle natural teeth whitening, same person", tools: ["teeth"], intensity: 34, free: true },
  { id: "teeth2", name: "Diş 2", hint: "Parlak", prompt: "bright natural teeth, same person, no fake veneer", tools: ["teeth"], intensity: 68, free: true },
  { id: "teeth3", name: "Diş 3", hint: "Klinik beyaz", prompt: "clinical white teeth, same person, still photoreal", tools: ["teeth"], intensity: 100, free: true },
  { id: "gums", name: "Diş eti", hint: "Sağlıklı pembe", prompt: "healthy even pink gums, same person, keep teeth and lips", tools: ["gums"], free: true },
  { id: "lift", name: "Yüz germe", hint: "Sıkı hat", prompt: "subtle facelift, tighter jawline, same person, natural", tools: ["lift"], free: false },
  { id: "eyesbig", name: "Göz büyüt", hint: "Açık bakış", prompt: "slightly larger eyes, same person, keep iris color", tools: ["eyesbig"], free: false },
  { id: "eyessmall", name: "Göz küçült", hint: "Yumuşak bakış", prompt: "slightly smaller eyes, same person, natural lids", tools: ["eyessmall"], free: false },
  { id: "almond", name: "Çekik göz", hint: "Badem hat", prompt: "almond elongated eye shape, lifted outer corner, same person", tools: ["almond"], free: false },
  { id: "eyein", name: "Göz yakın", hint: "İç mesafe", prompt: "eyes slightly closer together, same person, keep identity", tools: ["eyein"], free: false },
  { id: "eyeout", name: "Göz uzak", hint: "Dış mesafe", prompt: "eyes slightly farther apart, same person, keep identity", tools: ["eyeout"], free: false },
];
export const CLINIC_BODY = [
  { id: "hips", name: "Kalça büyüt", hint: "Alt hat", prompt: "subtly fuller hips, same person", tools: ["hips"], free: false },
  { id: "waist", name: "Bel incelt", hint: "İnce bel", prompt: "subtly slimmer waist, same person", tools: ["waist"], free: false },
  { id: "shape", name: "Hat sıkı", hint: "Bel + kalça", prompt: "hourglass balance, same person", tools: ["waist", "hips"], free: false },
  { id: "jaw", name: "Çene hat", hint: "Keskin çene", prompt: "defined jawline, same person", tools: ["jaw", "chin"], free: false },
];
export const CLINIC_FILLERS = [
  { id: "f-lip", name: "Dudak dolgu", hint: "Hyaluron sim", prompt: "subtle lip filler, same person", tools: ["plump"], free: true },
  { id: "f-tear", name: "Gözyaşı oluğu", hint: "Gözaltı", prompt: "tear trough filler, same person", tools: ["darkcircle"], free: true },
  { id: "f-malar", name: "Elmacık dolgu", hint: "Malar", prompt: "cheek filler, same person", tools: ["cheekfill"], free: false },
  { id: "f-naso", name: "Nazolabial", hint: "Gülme çizgisi", prompt: "soften nasolabial folds, same person", tools: ["nasolabial"], free: false },
  { id: "f-mario", name: "Marionet", hint: "Ağız kenarı", prompt: "soften marionette lines, same person", tools: ["marionette"], free: false },
  { id: "f-chin", name: "Çene dolgu", hint: "Uç hacim", prompt: "chin filler, same person", tools: ["chin"], free: false },
  { id: "f-jaw", name: "Jawline dolgu", hint: "Çene hat", prompt: "jawline filler, same person", tools: ["jaw"], free: false },
  { id: "f-liquid", name: "Likit rino", hint: "Burun dolgu", prompt: "liquid rhinoplasty filler, same person", tools: ["nosebig"], free: false },
  { id: "f-temple", name: "Şakak dolgu", hint: "Üst yan", prompt: "temple filler, same person", tools: ["temple"], free: false },
];
export const CLINIC_SURGERY = [
  { id: "rino", name: "Rinoplasti", hint: "Burun hat", prompt: "subtle rhinoplasty, slimmer bridge, same person", tools: ["nosesmall"], free: false },
  { id: "blefaro", name: "Blefaroplasti", hint: "Göz kapağı", prompt: "subtle eyelid lift, same person", tools: ["almond", "darkcircle"], free: false },
  { id: "browlift", name: "Kaş germe", hint: "Üst bakış", prompt: "subtle brow lift, same person", tools: ["browlift"], free: false },
  { id: "facelift", name: "Yüz germe", hint: "SMAS sim", prompt: "subtle facelift, same person", tools: ["lift"], free: false },
  { id: "neck", name: "Boyun germe", hint: "Çene altı", prompt: "tighter neck, same person", tools: ["neck"], free: false },
  { id: "chin", name: "Mentoplasti", hint: "Çene uç", prompt: "subtle chin implant look, same person", tools: ["chin"], free: false },
  { id: "vline", name: "V-line", hint: "Çene oval", prompt: "V-line jaw, same person", tools: ["jaw", "chin"], free: false },
  { id: "malar", name: "Elmacık", hint: "Malar dolgu", prompt: "lifted cheekbones, same person", tools: ["cheekfill"], free: false },
  { id: "buccal", name: "Bukkal", hint: "İnce yanak", prompt: "slight buccal hollow, same person", tools: ["buccal"], free: false },
  { id: "liplift", name: "Lip lift", hint: "Philtrum", prompt: "subtle lip lift, shorter philtrum, same person", tools: ["liplift"], free: false },
  { id: "oto", name: "Otoplasti", hint: "Kulak yatık", prompt: "subtly smaller ears, same person", tools: ["earsmall"], free: false },
];
export const CLINIC_GLOW = [
  { id: "glow", name: "Dew ışıltı", hint: "Cam ten", prompt: "dewy glass skin highlight, same person, not oily", tools: ["glow"], free: true },
  { id: "sparkle", name: "Kristal ton", hint: "Işık zerre", prompt: "subtle crystal highlight on cheekbones, same person", tools: ["sparkle", "glow"], free: false },
  { id: "tan", name: "Bronz", hint: "Sıcak ten", prompt: "healthy sun-kissed tan, same person, even", tools: ["tan"], free: true },
  { id: "frost", name: "Porselen", hint: "Serin ten", prompt: "porcelain cool skin tone, same person, keep pores", tools: ["frost"], free: true },
];
export const MOTION_STYLES = [
  {
    id: "zoom",
    label: "Yaklaş",
    hint: "Yavaş zoom",
  },
  {
    id: "pull",
    label: "Uzaklaş",
    hint: "Geri çek",
  },
  {
    id: "pan",
    label: "Kaydır",
    hint: "Yatay pan",
  },
  {
    id: "drift",
    label: "Süzül",
    hint: "Hafif yüksel",
  },
  {
    id: "reel",
    label: "Şerit",
    hint: "Klip dizisi",
  },
  {
    id: "punch",
    label: "Punch",
    hint: "Keskin giriş",
  },
  {
    id: "fade",
    label: "Tül",
    hint: "Yumuşak soluk",
  },
];
export const COLLAGE_LAYOUTS = [
  {
    id: "split",
    label: "İkili",
  },
  {
    id: "trio",
    label: "Üçlü",
  },
  {
    id: "grid4",
    label: "4'lü",
  },
  {
    id: "wide",
    label: "Şerit",
  },
];
export const STORIES: Story[] = [
  {
    id: "s1",
    handle: "zeynep",
    image: "/media/portrait-zeynep.jpg",
    seen: false,
  },
  {
    id: "s2",
    handle: "arda",
    image: "/media/portrait-arda.jpg",
    seen: false,
  },
  {
    id: "s3",
    handle: "elif",
    image: "/media/portrait-elif.jpg",
    seen: false,
  },
  {
    id: "s4",
    handle: "deniz",
    image: "/media/street-night.jpg",
    seen: false,
  },
];
export const FEED_SEED = [
  {
    id: "p1",
    handle: "zeynep",
    caption: "Konsept portre",
    time: "2 sa",
    likes: 248,
    liked: false,
    image: "/media/portrait-zeynep.jpg",
    templateId: "porselen",
    reported: false,
    sensitive: false,
  },
  {
    id: "p2",
    handle: "arda",
    caption: "Sokak · gece",
    time: "5 sa",
    likes: 181,
    liked: false,
    image: "/media/street-night.jpg",
    templateId: "yörünge",
    reported: false,
    sensitive: false,
  },
  {
    id: "p3",
    handle: "elif",
    caption: "Stüdyo ışığı",
    time: "1 g",
    likes: 412,
    liked: false,
    image: "/media/portrait-elif.jpg",
    templateId: "amber",
    reported: false,
    sensitive: false,
  },
  {
    id: "p4",
    handle: "deniz",
    caption: "Kuzey sisi",
    time: "2 g",
    likes: 96,
    liked: false,
    image: "/media/forest.jpg",
    templateId: "aurora",
    reported: false,
    sensitive: true,
  },
  {
    id: "p5",
    handle: "merve",
    caption: "NURA · dew",
    time: "3 sa",
    likes: 156,
    liked: false,
    image: "/media/portrait-elif.jpg",
    templateId: "dew",
    reported: false,
    sensitive: false,
  },
  {
    id: "p6",
    handle: "kaan",
    caption: "PACCA · neon iz",
    time: "6 sa",
    likes: 203,
    liked: false,
    image: "/media/street-night.jpg",
    templateId: "neon-iz",
    reported: false,
    sensitive: false,
  },
  {
    id: "p7",
    handle: "selin",
    caption: "Orbit · kale",
    time: "8 sa",
    likes: 274,
    liked: false,
    image: "/media/portrait-zeynep.jpg",
    templateId: "kale",
    reported: false,
    sensitive: false,
  },
  {
    id: "p8",
    handle: "efe",
    caption: "REIRA · altın saat",
    time: "12 sa",
    likes: 119,
    liked: false,
    image: "/media/loft.jpg",
    templateId: "altin-saat",
    reported: false,
    sensitive: false,
  },
];

const FEED_AGE: Record<string, number> = {
  p1: 2, p2: 5, p3: 24, p4: 48, p5: 3, p6: 6, p7: 8, p8: 12,
};

const FEED_NOTES: Record<string, { handle: string; text: string }[]> = {
  p1: [
    { handle: "elif", text: "Ten ipek kalmış, bakış duruyor." },
    { handle: "selin", text: "Porselen look cihazda mı bitti?" },
  ],
  p2: [{ handle: "kaan", text: "Gece sokak net. RELYN hissi var." }],
  p3: [{ handle: "zeynep", text: "Işık yumuşak, kimlik duruyor." }],
  p5: [{ handle: "merve", text: "Dew tam NURA." }],
  p8: [{ handle: "arda", text: "Altın saat, aynı yüz." }],
};

export function modelOfTemplate(templateId: string): string {
  const tpl = TEMPLATES.find((t) => t.id === templateId);
  if (!tpl?.pack) return "EVEN";
  if (tpl.pack === "orbit") return "PACCA";
  return tpl.pack.toUpperCase();
}

export function feedAlt(post: { handle: string; caption: string; model?: string; templateId?: string }): string {
  const model = post.model || (post.templateId ? modelOfTemplate(post.templateId) : "EVEN");
  return `${post.handle} tarafından ${model} modeliyle oluşturulan ${post.caption}`;
}

const FEED_T0 = Date.now();

export const FEED: FeedPost[] = FEED_SEED.map((p) => ({
  ...p,
  bookmarked: false,
  comments: (FEED_NOTES[p.id] ?? []).map((c, i) => ({
    id: `${p.id}-c${i}`,
    handle: c.handle,
    text: c.text,
    createdAt: FEED_T0 - (FEED_AGE[p.id] ?? 2) * 3600_000 + (i + 1) * 420_000,
  })),
  model: modelOfTemplate(p.templateId),
  createdAt: FEED_T0 - (FEED_AGE[p.id] ?? 2) * 3600_000,
  durationSec: 8 + (p.likes % 5),
}));

export const BOARD_RIVALS = [
  {
    handle: "deniz",
    points: 2410,
  },
  {
    handle: "arda",
    points: 2105,
  },
  {
    handle: "elif",
    points: 1702,
  },
  {
    handle: "kaan",
    points: 1540,
  },
  {
    handle: "merve",
    points: 1328,
  },
];
export const NURA_TOOLS: ToolDef[] = [
  {
    id: "auto",
    name: "Nur dokunuş",
    hint: "Tek sefer güzellik",
    free: true,
    tone: "green",
  },
  {
    id: "skin",
    name: "Cilt ipek",
    hint: "Gözenek yumuşak",
    free: true,
    tone: "green",
  },
  {
    id: "blemish",
    name: "Leke kapat",
    hint: "Dokunarak",
    free: true,
    tone: "green",
    tap: true,
  },
  {
    id: "erase",
    name: "Silgi",
    hint: "Fırça",
    free: true,
    tone: "blue",
    tap: true,
  },
  {
    id: "dodge",
    name: "Aydınlat",
    hint: "Fırça",
    free: true,
    tone: "orange",
    tap: true,
  },
  {
    id: "even",
    name: "Ten denge",
    hint: "Renk eşitler",
    free: true,
    tone: "green",
  },
  {
    id: "matte",
    name: "Mat ten",
    hint: "Yağ kontrol",
    free: true,
    tone: "green",
  },
  {
    id: "darkcircle",
    name: "Gözaltı",
    hint: "Hafif açar",
    free: true,
    tone: "blue",
  },
  {
    id: "freckle",
    name: "Çil",
    hint: "Doğal serpiştir",
    free: true,
    tone: "orange",
  },
  {
    id: "tan",
    name: "Bronz",
    hint: "Güneş öpücüğü",
    free: true,
    tone: "orange",
  },
  {
    id: "shape",
    name: "Hacim",
    hint: "Ilımlı hat",
    free: true,
    tone: "green",
  },
  {
    id: "glow",
    name: "Çiğ ışıltı",
    hint: "Highlight",
    free: true,
    tone: "orange",
  },
  {
    id: "blush",
    name: "Allık",
    hint: "Fırça",
    free: true,
    tone: "orange",
    tap: true,
  },
  {
    id: "lipstick",
    name: "Dudak sır",
    hint: "Fırça",
    free: true,
    tone: "orange",
    tap: true,
  },
  {
    id: "plump",
    name: "Dolgun dudak",
    hint: "Ilımlı parlak",
    free: true,
    tone: "orange",
  },
  {
    id: "eyes",
    name: "Bakış",
    hint: "Işık",
    free: true,
    tone: "blue",
  },
  {
    id: "eyeshadow",
    name: "Göz farı",
    hint: "Seçili ton",
    free: true,
    tone: "blue",
  },
  {
    id: "sparkle",
    name: "Işıltı",
    hint: "Nokta parıltı",
    free: true,
    tone: "orange",
  },
];
export const CEHRA_TOOLS: ToolDef[] = [
  {
    id: "smile",
    name: "Gülümseme",
    hint: "Ağız aydınır",
    free: true,
    tone: "green",
  },
  {
    id: "plump",
    name: "Dudak dolgun",
    hint: "Ilımlı",
    free: true,
    tone: "orange",
  },
  {
    id: "brows",
    name: "Kaş",
    hint: "Hafif dolgun",
    free: true,
    tone: "blue",
  },
  {
    id: "lashes",
    name: "Kirpik",
    hint: "Çizgi koyu",
    free: true,
    tone: "blue",
  },
  {
    id: "liner",
    name: "Eyeliner",
    hint: "İnce hat",
    free: true,
    tone: "blue",
  },
  {
    id: "eyeshadow",
    name: "Göz farı",
    hint: "Seçili ton",
    free: true,
    tone: "blue",
  },
  {
    id: "eyes",
    name: "Bakış aç",
    hint: "Işık",
    free: true,
    tone: "blue",
  },
  {
    id: "eyecolor",
    name: "Göz tonu",
    hint: "Seçili renk",
    free: true,
    tone: "blue",
  },
  {
    id: "teeth",
    name: "Diş aydınlat",
    hint: "Doğal",
    free: true,
    tone: "green",
  },
  {
    id: "hair",
    name: "Saç sır",
    hint: "Seçili ton",
    free: true,
    tone: "blue",
  },
  {
    id: "contour",
    name: "Kontür",
    hint: "Hafif gölge",
    free: true,
    tone: "green",
  },
  {
    id: "shadow",
    name: "Çene gölgesi",
    hint: "Kimlik değişmez",
    free: true,
    tone: "green",
  },
  {
    id: "tan",
    name: "Bronz",
    hint: "Ten ısınır",
    free: true,
    tone: "orange",
  },
  {
    id: "lipstick",
    name: "Dudak",
    hint: "Seçili renk",
    free: true,
    tone: "orange",
  },
];
export const RELYN_TOOLS: ToolDef[] = [
  {
    id: "hd",
    name: "HD onar",
    hint: "Net, temiz",
    free: false,
    tone: "blue",
  },
  {
    id: "unblur",
    name: "Bulanıklık gider",
    hint: "Kenarları çek",
    free: false,
    tone: "blue",
  },
  {
    id: "denoise",
    name: "Gürültü azalt",
    hint: "Temiz alan",
    free: true,
    tone: "blue",
  },
  {
    id: "dehaze",
    name: "Pus gider",
    hint: "Hava açılır",
    free: true,
    tone: "blue",
  },
  {
    id: "colorize",
    name: "Renk geri",
    hint: "Soluk canlanır",
    free: true,
    tone: "orange",
  },
  {
    id: "restore",
    name: "Yüz onarımı",
    hint: "Cihazda",
    free: true,
    tone: "blue",
  },
  {
    id: "details",
    name: "Mikro netlik",
    hint: "Kumaş, saç",
    free: true,
    tone: "green",
  },
  {
    id: "clarity",
    name: "Net iz",
    hint: "Mikro kontrast",
    free: true,
    tone: "green",
  },
  {
    id: "sharpen",
    name: "Keskin iz",
    hint: "1024 px",
    free: true,
    tone: "green",
  },
  {
    id: "vintage",
    name: "Arşiv",
    hint: "Soluk kart",
    free: true,
    tone: "orange",
  },
];
export const REIRA_TOOLS: ToolDef[] = [
  {
    id: "relight",
    name: "Yeniden ışık",
    hint: "Yön seç",
    free: true,
    tone: "blue",
  },
  {
    id: "backdrop",
    name: "Stüdyo fon",
    hint: "Seçili sahne",
    free: true,
    tone: "orange",
  },
  {
    id: "bgblur",
    name: "Fon yumuşat",
    hint: "Konu önde",
    free: false,
    tone: "blue",
  },
  {
    id: "rotate",
    name: "Döndür",
    hint: "90° sağ",
    free: true,
    tone: "green",
  },
  {
    id: "flip",
    name: "Çevir",
    hint: "Yatay ayna",
    free: true,
    tone: "green",
  },
  {
    id: "frame",
    name: "Çerçeve",
    hint: "Seçili kenar",
    free: true,
    tone: "orange",
  },
  {
    id: "letterbox",
    name: "Şerit",
    hint: "Sinema kenar",
    free: true,
    tone: "orange",
  },
  {
    id: "hd",
    name: "Net kare",
    hint: "Çekim netliği",
    free: false,
    tone: "blue",
  },
  {
    id: "even",
    name: "Ten denge",
    hint: "Işık sonrası",
    free: true,
    tone: "green",
  },
];
export const EVEN_CORE_TOOLS: ToolDef[] = [
  { id: "auto", name: "Tek dokunuş", hint: "Temel", free: true, tone: "green" },
  { id: "even", name: "Ten denge", hint: "Temel", free: true, tone: "green" },
  { id: "restore", name: "Yüz onar", hint: "Temel", free: true, tone: "blue" },
  { id: "details", name: "Mikro net", hint: "Temel", free: true, tone: "green" },
  { id: "eyes", name: "Bakış", hint: "Temel", free: true, tone: "blue" },
  { id: "denoise", name: "Gürültü", hint: "Temel", free: true, tone: "blue" },
];
export const EVEN_BRUSH_TOOLS: ToolDef[] = [
  { id: "blemish", name: "Leke", hint: "Fırça", free: true, tone: "green", tap: true },
  { id: "erase", name: "Silgi", hint: "Fırça", free: true, tone: "blue", tap: true },
  { id: "dodge", name: "Aydınlat", hint: "Fırça", free: true, tone: "orange", tap: true },
  { id: "skin", name: "Cilt", hint: "Fırça", free: true, tone: "green", tap: true },
  { id: "contour", name: "Kontür", hint: "Fırça", free: true, tone: "green", tap: true },
  { id: "darkcircle", name: "Gözaltı", hint: "Fırça", free: true, tone: "blue", tap: true },
  { id: "glow", name: "Işıltı", hint: "Fırça", free: true, tone: "orange", tap: true },
  { id: "matte", name: "Mat", hint: "Fırça", free: true, tone: "green", tap: true },
  { id: "eyeshadow", name: "Far", hint: "Fırça", free: true, tone: "blue", tap: true },
  { id: "liner", name: "Liner", hint: "Fırça", free: true, tone: "blue", tap: true },
  { id: "brows", name: "Kaş", hint: "Fırça", free: true, tone: "blue", tap: true },
  { id: "lashes", name: "Kirpik", hint: "Fırça", free: true, tone: "blue", tap: true },
  { id: "plump", name: "Dolgun", hint: "Fırça", free: true, tone: "orange", tap: true },
  { id: "tan", name: "Bronz", hint: "Fırça", free: true, tone: "orange", tap: true },
  { id: "freckle", name: "Çil", hint: "Fırça", free: true, tone: "orange", tap: true },
  { id: "hair", name: "Saç", hint: "Fırça", free: true, tone: "blue", tap: true },
  { id: "shadow", name: "Gölge", hint: "Fırça", free: true, tone: "green", tap: true },
  { id: "lipstick", name: "Ruj", hint: "Fırça", free: true, tone: "orange", tap: true },
  { id: "blush", name: "Allık", hint: "Fırça", free: true, tone: "orange", tap: true },
  { id: "teeth", name: "Diş", hint: "Fırça", free: true, tone: "green", tap: true },
];
export const BRUSH_HINT: Partial<Record<ToolId, string>> = {
  blemish: "Lekenin üstüne sürün.",
  erase: "Silinecek alanı sürün.",
  dodge: "Aydınlatılacak yeri sürün.",
  skin: "Cildi fırçayla yumuşatın.",
  blush: "Yanaklara sürün.",
  lipstick: "Dudaklara sürün.",
  contour: "Hatları fırçalayın.",
  darkcircle: "Gözaltına sürün.",
  glow: "Işıltı için sürün.",
  matte: "Parlayan yere sürün.",
  eyeshadow: "Göz kapağına sürün.",
  liner: "Kirpik dibine çizin.",
  brows: "Kaşa sürün.",
  lashes: "Kirpik hattını çizin.",
  plump: "Dudaklara sürün.",
  tan: "Ten ısınsın diye sürün.",
  freckle: "Çil serpin.",
  hair: "Saça sürün.",
  shadow: "Gölge için sürün.",
  teeth: "Dişlere sürün.",
  eyes: "Gözlere sürün.",
};
export const EVEN_SIGNATURE_TOOLS: ToolDef[] = [
  { id: "glow", name: "NURA ışıltı", hint: "NURA", free: true, tone: "orange" },
  { id: "matte", name: "NURA mat", hint: "NURA", free: true, tone: "green" },
  { id: "smile", name: "CEHRA gülümse", hint: "CEHRA", free: true, tone: "green" },
  { id: "brows", name: "CEHRA kaş", hint: "CEHRA", free: true, tone: "blue" },
  { id: "teeth", name: "CEHRA diş", hint: "CEHRA", free: true, tone: "green" },
  { id: "lashes", name: "CEHRA kirpik", hint: "CEHRA", free: true, tone: "blue" },
  { id: "hd", name: "RELYN HD", hint: "RELYN", free: false, tone: "blue" },
  { id: "unblur", name: "RELYN net", hint: "RELYN", free: false, tone: "blue" },
  { id: "colorize", name: "RELYN renk", hint: "RELYN", free: true, tone: "orange" },
  { id: "relight", name: "REIRA ışık", hint: "REIRA", free: true, tone: "blue" },
  { id: "bgblur", name: "REIRA fon", hint: "REIRA", free: false, tone: "blue" },
  { id: "letterbox", name: "PACCA şerit", hint: "PACCA", free: true, tone: "orange" },
  { id: "vintage", name: "PACCA film", hint: "PACCA", free: true, tone: "orange" },
  { id: "frost", name: "PACCA kırağı", hint: "PACCA", free: true, tone: "blue" },
];
export const PACCA_TOOLS: ToolDef[] = [
  {
    id: "frame",
    name: "Çerçeve",
    hint: "Kenar",
    free: true,
    tone: "orange",
  },
  {
    id: "cutout",
    name: "Kesip al",
    hint: "PNG",
    free: true,
    tone: "green",
  },
  {
    id: "letterbox",
    name: "Şerit",
    hint: "Sinema kenar",
    free: true,
    tone: "orange",
  },
  {
    id: "sparkle",
    name: "Işıltı",
    hint: "Nokta",
    free: true,
    tone: "orange",
  },
  {
    id: "vintage",
    name: "Film",
    hint: "Arşiv look",
    free: true,
    tone: "orange",
  },
  {
    id: "frost",
    name: "Kırağı",
    hint: "Soğuk tül",
    free: true,
    tone: "blue",
  },
  {
    id: "dehaze",
    name: "Pus gider",
    hint: "Hava",
    free: true,
    tone: "blue",
  },
  {
    id: "animate",
    name: "Işık canlandır",
    hint: "Parlama",
    free: false,
    tone: "orange",
  },
];
export const ATELIERS = [
  {
    id: "even",
    name: "EVENGIRL",
    kicker: "Tümü",
    line: "Ortak efektler ve her ajanın özel yeteneği.",
    cover: "/media/prism.jpg",
    tone: "green",
    mode: "enhance",
  },
  {
    id: "nura",
    name: "NURA",
    kicker: "Güzellik",
    line: "Ten, ışık, allık — nur gibi. Cihazda.",
    cover: "/media/portrait-elif.jpg",
    tone: "orange",
    mode: "makeup",
  },
  {
    id: "cehra",
    name: "CEHRA",
    kicker: "Çehre",
    line: "Look senin. Yaş veya cinsiyet yok.",
    cover: "/media/portrait-zeynep.jpg",
    tone: "green",
    mode: "makeup",
  },
  {
    id: "relyn",
    name: "RELYN",
    kicker: "Netlik",
    line: "Bulanık kareyi onar, rengi geri çağır.",
    cover: "/media/portrait-arda.jpg",
    tone: "blue",
    mode: "enhance",
  },
  {
    id: "reira",
    name: "REIRA",
    kicker: "Yeniden çek",
    line: "Aynı yüz, yeni ışık ve sahne.",
    cover: "/media/loft.jpg",
    tone: "azure",
    mode: "takes",
  },
  {
    id: "pacca",
    name: "PACCA",
    kicker: "Klip & şablon",
    line: "Klip, reel, şerit — orijinal look.",
    cover: "/media/street-night.jpg",
    tone: "blue",
    mode: "motion",
  },
];
export const PACK_LABEL = {
  orbit: "Orbit · sosyal",
  even: "EVENGIRL",
  nura: "NURA",
  cehra: "CEHRA",
  relyn: "RELYN",
  reira: "REIRA",
  pacca: "PACCA",
};
export const PACK_ORDER: TemplatePack[] = ["orbit", "nura", "cehra", "relyn", "reira", "pacca"];
export function templatesFor(pack?: TemplatePack | "all"): Template[] {
  if (!pack || pack === "all" || pack === "even") {
    return TEMPLATES;
  }
  if (pack === "pacca")
    return TEMPLATES.filter(
      (t) => t.pack === "pacca" || t.pack === "orbit" || !t.pack,
    );
  return TEMPLATES.filter((t) => t.pack === pack);
}
export function toolsForAtelier(id: AtelierId): ToolDef[] {
  if (id === "even") {
    const seen = new Set<string>();
    const all = [
      ...EVEN_CORE_TOOLS,
      ...EVEN_SIGNATURE_TOOLS,
      ...NURA_TOOLS,
      ...CEHRA_TOOLS,
      ...RELYN_TOOLS,
      ...REIRA_TOOLS,
      ...PACCA_TOOLS,
    ];
    return all.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
  }
  if (id === "nura") return NURA_TOOLS;
  if (id === "cehra") return CEHRA_TOOLS;
  if (id === "relyn") return RELYN_TOOLS;
  if (id === "reira") return REIRA_TOOLS;
  return PACCA_TOOLS;
}
export const PRO_TOOLS = ["animate", "hd", "unblur", "bgblur", "lift", "hips", "waist", "eyesbig", "eyessmall", "almond", "eyein", "eyeout"];
export const FACE_PACK: MakeupLook[] = [
  { id: "pack-pudra", name: "Pudra", steps: ["even", "blush", "glow"], free: true, tone: "orange" },
  { id: "pack-gul", name: "Gülümse", steps: ["smile", "teeth", "blush"], free: true, tone: "orange" },
  { id: "pack-dew", name: "Dew ten", steps: ["skin", "glow", "eyes"], free: true, tone: "green" },
  { id: "pack-sinema", name: "Sinema", steps: ["contour", "relight", "vintage"], free: true, tone: "orange" },
  { id: "pack-hali", name: "Kırmızı halı", steps: ["lipstick", "lashes", "glow"], free: true, tone: "orange" },
];
export const SCENE_PACK: { id: string; name: string; image: string; free: boolean; light: "left" | "right" | "front" | "rim"; prompt: string }[] = [
  { id: "sc-cafe", name: "Kafe", image: "/media/cafe.jpg", free: true, light: "right", prompt: "sunlit Paris cafe window, warm wood, latte on table, soft bokeh" },
  { id: "sc-loft", name: "Bej stüdyo", image: "/media/loft.jpg", free: true, light: "right", prompt: "cream beige photography studio, paper backdrop, gentle key light" },
  { id: "sc-kristal", name: "Kristal cam", image: "/media/prism.jpg", free: true, light: "rim", prompt: "crystal prism light flares, rainbow glass, luxury fashion close-up" },
  { id: "sc-orman", name: "Orman", image: "/media/forest.jpg", free: false, light: "left", prompt: "misty forest path, golden leaves, cinematic natural light" },
  { id: "sc-gece", name: "Gece sokağı", image: "/media/street-night.jpg", free: false, light: "rim", prompt: "rainy night city street, neon reflections, cinematic portrait" },
  { id: "sc-altin", name: "Altın saat", image: "/media/loft.jpg", free: false, light: "right", prompt: "golden hour rooftop, warm sun on cheek, luxury editorial" },
  { id: "sc-pembe", name: "Pembe salon", image: "/media/cafe.jpg", free: false, light: "front", prompt: "blush pink salon interior, velvet chair, beauty campaign lighting" },
  { id: "sc-sinema", name: "Sinema", image: "/media/street-night.jpg", free: false, light: "left", prompt: "old cinema lobby, red velvet, marquee lights, film still" },
  { id: "sc-kuzey", name: "Kuzey camı", image: "/media/prism.jpg", free: false, light: "rim", prompt: "nordic glass cabin, snow outside, cool window light" },
  { id: "sc-bahce", name: "Bahçe", image: "/media/forest.jpg", free: false, light: "front", prompt: "flower garden at noon, roses, soft daylight, romantic portrait" },
];
export const STUDIO_EFFECTS: { id: string; name: string; hint: string; look?: string; template?: string; free: boolean; preview: string }[] = [
  { id: "fx-gul", name: "Gülüş", hint: "Diş + gülümse", look: "gulumse", free: true, preview: "/media/portrait-elif.jpg" },
  { id: "fx-dis", name: "Diş beyaz", hint: "Parlak gülüş", look: "gulumse", free: true, preview: "/media/portrait-zeynep.jpg" },
  { id: "fx-dew", name: "Dew", hint: "Islak ışıltı", look: "dew", free: true, preview: "/media/portrait-elif.jpg" },
  { id: "fx-ipek", name: "İpek ten", hint: "Pürüzsüz", look: "ipek-look", free: true, preview: "/media/portrait-zeynep.jpg" },
  { id: "fx-bakis", name: "Bakış", hint: "Kirpik + kaş", look: "bakis", free: true, preview: "/media/portrait-arda.jpg" },
  { id: "fx-dudak", name: "Gül dudak", hint: "Sır", look: "guldudak", free: true, preview: "/media/portrait-elif.jpg" },
  { id: "fx-porselen", name: "Porselen", hint: "Cam ten", template: "porselen", free: false, preview: "/media/portrait-elif.jpg" },
  { id: "fx-amber", name: "Amber", hint: "Sıcak film", template: "amber", free: true, preview: "/media/loft.jpg" },
  { id: "fx-hali", name: "Kırmızı halı", hint: "Sahne PRO", look: "sahnepro", free: false, preview: "/media/portrait-zeynep.jpg" },
  { id: "fx-sinema", name: "Sinema gecesi", hint: "Look", look: "sahne", free: true, preview: "/media/street-night.jpg" },
  { id: "fx-kuzey", name: "Kuzey camı", hint: "Soğuk", template: "kuzey", free: true, preview: "/media/portrait-arda.jpg" },
  { id: "fx-uzay", name: "Kristal uzay", hint: "Look", template: "uzay", free: true, preview: "/media/prism.jpg" },
  { id: "fx-buz", name: "Buz tül", hint: "Soğuk", template: "buz", free: true, preview: "/media/forest.jpg" },
  { id: "fx-altin", name: "Altın saat", hint: "Işık", template: "kare-altin", free: true, preview: "/media/loft.jpg" },
];
export function isDirty(a) {
  return Object.values(a).some((n) => n !== 0);
}
export function looksFor(id: AtelierId): MakeupLook[] {
  if (id === "even") {
    const seen = new Set<string>();
    return [...MAKEUP_LOOKS, ...NURA_LOOKS, ...CEHRA_LOOKS, ...FACE_PACK, ...HAIR_STYLES].filter((l) =>
      seen.has(l.id) ? false : (seen.add(l.id), true),
    );
  }
  if (id === "nura") return NURA_LOOKS;
  if (id === "cehra") return CEHRA_LOOKS;
  return [];
}

const MASTER_STAGES: AgentStage[] = [
  { hint: "RELYN · net onarım", tools: ["restore", "denoise"] },
  { hint: "NURA · ten ipek", tools: ["skin", "even", "darkcircle"] },
  { hint: "NURA · ışıltı", tools: ["glow", "blush"] },
  { hint: "CEHRA · bakış", tools: ["eyes", "teeth"] },
  { hint: "REIRA · ışık", tools: ["relight"] },
  { hint: "PACCA · mikro net", tools: ["details"] },
];

function withSignature(extra: AgentStage): AgentStage[] {
  return [...MASTER_STAGES, extra];
}

export const AGENTS: AgentDef[] = [
  {
    id: "even",
    name: "EVEN",
    kicker: "Tümü",
    line: "Bütün atölye özellikleri burada.",
    cover: "/media/prism.jpg",
    tone: "green",
    atelier: "even",
    templateId: "even",
    light: "front",
    stages: withSignature({ hint: "EVEN · kristal mühür", tools: ["auto"] }),
  },
];

export function agentById(id: AgentId) {
  return AGENTS.find((a) => a.id === id);
}

export { TEMPLATES, gradeCss } from "./templates";
