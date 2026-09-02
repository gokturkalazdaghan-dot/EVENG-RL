/**
 * Tasarım token'ları — minimalist arayüzün tek renk/tipografi/hareket kaynağı.
 *
 * Bileşenler ham renk kodu (#RRGGBB) veya ham sayı KULLANMAZ; her değer
 * buradan gelir. Bunun pratik faydası: dark/light geçişi ve "batarya koruma
 * modunda animasyonları kıs" gibi global kararlar tek yerden uygulanır.
 */
export const palette = {
  /**
   * AÇIK TEMA VARSAYILANDIR.
   *
   * Önceki palet neredeyse saf siyah (#0B0B0F) bir zemin üzerine moru
   * koyuyordu. Bunun iki sorunu vardı: fotoğraf düzenleyicide koyu zemin
   * kullanıcının rengini yanlış okumasına yol açıyor (aynı kare koyu
   * arayüzde daha parlak görünür), ve mor-üzerine-siyah bugün jenerik bir
   * arayüz dili.
   *
   * Yeni zemin SOĞUK AÇIK GRİ: nötr değil, imza rengine doğru hafifçe
   * eğilmiş. Fotoğrafın kendisi sayfadaki en doygun şey olur — profesyonel
   * düzenleme araçlarının arayüzü bu yüzden geri çekilir.
   */
  light: {
    background: '#EDEFF1',
    surface: '#FFFFFF',
    surfaceElevated: '#FFFFFF',
    surfaceSunken: '#E3E7EA',
    textPrimary: '#0F171A',
    textSecondary: '#55666C',
    textDisabled: '#95A4A9',
    danger: '#B3372C',
    success: '#1B7A4F',
    /** İmza rengi: petrol mavisi. Optik alet diline yakın, sıcak değil. */
    accent: '#0E5F73',
    /** Basılı/gölge tonu — 3B buton tabanı bundan gelir. */
    accentDeep: '#0A4655',
    /** Seçili durumların zeminine yayılan çok açık ton. */
    accentSoft: '#DCE9ED',
    /** Ödül, PRO ve rozet: pirinç. Aksanla çakışmaz, ondan sıcaktır. */
    highlight: '#A8791F',
    highlightSoft: '#F3E9D4',
    border: '#D6DCDF',
    /** Yükseltilmiş yüzeylerin üst kenarındaki ışık. */
    edgeLight: 'rgba(255,255,255,0.9)',
    scrim: 'rgba(9,20,24,0.32)',
  },

  /**
   * Koyu tema MUTLAK SİYAH DEĞİL.
   *
   * #0B0B0F gibi bir zemin OLED'de "delik" gibi görünür ve üzerindeki
   * gölgeler kaybolur — 3B butonlar orada düz görünürdü. Zemin petrol
   * siyahına kaydırıldı; yüzeyler arasında gerçek bir aydınlık farkı var,
   * böylece derinlik iki temada da okunuyor.
   */
  dark: {
    background: '#0F1619',
    surface: '#182126',
    surfaceElevated: '#212C32',
    surfaceSunken: '#0A1013',
    textPrimary: '#ECF2F3',
    textSecondary: '#8FA2A8',
    textDisabled: '#5B6C72',
    danger: '#E8695C',
    success: '#3FBF80',
    accent: '#3EA3BE',
    accentDeep: '#256F84',
    accentSoft: '#16323B',
    highlight: '#D6A94A',
    highlightSoft: '#2A2416',
    border: '#2A373D',
    edgeLight: 'rgba(255,255,255,0.10)',
    scrim: 'rgba(0,0,0,0.58)',
  },
} as const;

export type ColorScheme = keyof typeof palette;
export type Colors = (typeof palette)[ColorScheme];

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

export const radius = { sm: 8, md: 12, lg: 18, xl: 26, pill: 999 } as const;

/**
 * DERİNLİK.
 *
 * React Native'de gradyan yok (ek bağımlılık ister). Hacim bunun yerine üç
 * gerçek katmandan geliyor:
 *
 *   1. `shadow*` / `elevation` — yüzeyin zeminden ayrılması,
 *   2. `borderBottomWidth` + koyu ton — tuş kapağı tabanı,
 *   3. üst kenardaki ince ışık çizgisi (`edgeLight`).
 *
 * Basılınca taban küçülür ve yüzey aşağı iner: parmak altında gerçekten
 * çöken bir tuş hissi. Bu üçü olmadan "3B" görünüm yalnızca bir gölge
 * taklidi olur ve dokununca ölü kalır.
 */
export const elevation = {
  /** Kartlar: zeminden hafifçe ayrık. */
  raised: {
    shadowColor: '#0A1013',
    shadowOpacity: 0.10,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  /** Birincil eylemler: net bir tuş. */
  key: {
    shadowColor: '#0A1013',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  /** Basılı hâl: gölge neredeyse kaybolur. */
  pressed: {
    shadowColor: '#0A1013',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  /** Üste açılan sayfalar. */
  sheet: {
    shadowColor: '#0A1013',
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
  },
} as const;

/** Tuş tabanının kalınlığı (px). Basılınca `pressedDepth`'e iner. */
export const depth = { rest: 3, pressed: 1, travel: 2 } as const;

/**
 * Tipografi: tek bir ölçek, net hiyerarşi. Ekranda aynı anda ikiden fazla
 * ağırlık kullanılmaz — "göz yormayan arayüz" bunun sonucudur.
 */
export const typography = {
  display: { fontSize: 32, fontWeight: '700' as const, letterSpacing: -0.8 },
  title: { fontSize: 24, fontWeight: '600' as const, letterSpacing: -0.4 },
  heading: { fontSize: 17, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  caption: { fontSize: 13, fontWeight: '400' as const },
  label: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.4 },
} as const;

/**
 * Hareket token'ları.
 *
 * `spring` doğal his verir ama sönümlenene kadar birkaç yüz ms boyunca her
 * karede hesaplanır. Batarya koruma modunda `reduced` profiline geçilir:
 * kısa, deterministik timing — cihaz daha az kare üretir.
 */
export const motion = {
  standard: {
    spring: { damping: 22, stiffness: 220, mass: 0.9 },
    timing: { duration: 260 },
  },
  reduced: {
    spring: { damping: 30, stiffness: 320, mass: 0.7 },
    timing: { duration: 140 },
  },
} as const;

export type MotionProfile = keyof typeof motion;

/** Kaydırma jestinin geçişi tamamlaması için gereken eşikler. */
export const gesture = {
  /** Ekran genişliğinin bu oranı aşılırsa geçiş tamamlanır. */
  distanceRatio: 0.28,
  /** Mesafe yetmese bile bu hızın üstünde "fırlatma" (fling) sayılır (px/sn). */
  velocity: 550,
  /** Yatay/dikey jest ayrımı için minimum aktivasyon mesafesi (px). */
  activationDistance: 12,
} as const;
