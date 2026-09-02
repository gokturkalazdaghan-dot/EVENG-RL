import {
  THRESHOLDS,
  isAdultOnly,
  isClothingContext,
  isPublishable,
  rateContent,
  type ClassifierSignals,
} from '@/moderation/ContentRating';

/** Tüm sinyaller sıfır — testler yalnızca ilgilendiği alanı yükseltir. */
const signals = (overrides: Partial<ClassifierSignals> = {}): ClassifierSignals => ({
  exposedFemaleNipple: 0,
  exposedFemaleGenitalia: 0,
  exposedMaleGenitalia: 0,
  exposedAnus: 0,
  sexualAct: 0,
  swimwear: 0,
  athleticwear: 0,
  underwear: 0,
  apparentMinor: 0,
  ...overrides,
});

describe('rateContent — kesin +18 kriterleri', () => {
  it('örtüsüz kadın meme ucunu +18 sayar', () => {
    expect(rateContent(signals({ exposedFemaleNipple: 0.95 })).rating).toBe('adult');
  });

  it('örtüsüz kadın genital bölgesini +18 sayar', () => {
    expect(rateContent(signals({ exposedFemaleGenitalia: 0.92 })).rating).toBe('adult');
  });

  it('örtüsüz erkek genital bölgesini +18 sayar', () => {
    expect(rateContent(signals({ exposedMaleGenitalia: 0.9 })).rating).toBe('adult');
  });

  it('rektal bölgeyi +18 sayar', () => {
    expect(rateContent(signals({ exposedAnus: 0.88 })).rating).toBe('adult');
  });

  it('cinsel eylemi +18 sayar', () => {
    expect(rateContent(signals({ sexualAct: 0.91 })).rating).toBe('adult');
  });

  it('kararı sürükleyen sinyali raporlar', () => {
    // Moderasyon arayüzünde "neden" gösterilebilmeli.
    expect(rateContent(signals({ exposedAnus: 0.9 })).reason).toBe('exposed-anus');
  });
});

describe('rateContent — YANLIŞ POZİTİF koruması', () => {
  it('mayolu plaj fotoğrafını +18 SAYMAZ', () => {
    // Sınıflandırıcılar mayoyu düzenli olarak çıplaklıkla karıştırır; plaj
    // fotoğrafı bu kategorideki en yaygın içeriklerden biridir.
    const beach = signals({ swimwear: 0.9, exposedFemaleNipple: 0.55 });
    expect(rateContent(beach).rating).toBe('general');
    expect(rateContent(beach).reason).toBe('swimwear-context');
  });

  it('bikinili fotoğrafı hassas bile saymaz', () => {
    expect(rateContent(signals({ swimwear: 0.95, exposedFemaleGenitalia: 0.4 })).rating).toBe(
      'general',
    );
  });

  it('spor taytı ve atleti +18 SAYMAZ', () => {
    const gym = signals({ athleticwear: 0.85, exposedFemaleGenitalia: 0.5 });
    expect(rateContent(gym).rating).toBe('general');
    expect(rateContent(gym).reason).toBe('athleticwear-context');
  });

  it('giyim bağlamı KESİN tespiti bastırmaz', () => {
    // Mayo giyen biri de teşhir yapabilir; giyim bağlamı 0.85 üstü net
    // tespiti geçersiz kılmamalı.
    expect(
      rateContent(signals({ swimwear: 0.9, exposedFemaleGenitalia: 0.95 })).rating,
    ).toBe('adult');
  });

  it('giyim bağlamı eşiğin altındaysa devreye girmez', () => {
    expect(isClothingContext(signals({ swimwear: 0.5 }))).toBe(false);
  });
});

describe('rateContent — belirsizlik insan incelemesine gider', () => {
  it('orta güvenli sinyali otomatik +18 damgalamaz', () => {
    // Yanlış pozitif de gerçek bir zarardır: masum kullanıcı akışını kaybeder.
    const decision = rateContent(signals({ exposedFemaleNipple: 0.6 }));
    expect(decision.rating).toBe('review');
  });

  it('inceleme bekleyen içerik yine de reşit olmayanlara kapalıdır', () => {
    expect(isAdultOnly('review')).toBe(true);
  });

  it('eşiğin tam altı incelemeye, tam üstü +18 olur', () => {
    expect(rateContent(signals({ sexualAct: THRESHOLDS.adult - 0.01 })).rating).toBe('review');
    expect(rateContent(signals({ sexualAct: THRESHOLDS.adult })).rating).toBe('adult');
  });
});

describe('rateContent — iç çamaşırı', () => {
  it('iç çamaşırını +18 değil hassas sayar', () => {
    expect(rateContent(signals({ underwear: 0.8 })).rating).toBe('sensitive');
  });

  it('hassas içerik reşit olmayanlara kapalıdır', () => {
    expect(isAdultOnly('sensitive')).toBe(true);
  });
});

describe('rateContent — reşit olmayan koruması', () => {
  it('reşit olmayan + cinsel sinyal kombinasyonunu ENGELLER', () => {
    const decision = rateContent(signals({ apparentMinor: 0.6, exposedFemaleNipple: 0.7 }));
    expect(decision.rating).toBe('blocked');
    expect(isPublishable(decision.rating)).toBe(false);
  });

  it('giyim bağlamı bu kuralı BASTIRAMAZ', () => {
    // Mayo bağlamı diğer tüm yanlış pozitifleri bastırır ama bunu bastırmaz.
    expect(
      rateContent(signals({ apparentMinor: 0.5, swimwear: 0.95, underwear: 0.6 })).rating,
    ).toBe('blocked');
  });

  it('düşük eşikle çalışır — burada temkinli olmanın maliyeti düşüktür', () => {
    expect(THRESHOLDS.apparentMinor).toBeLessThan(0.5);
    expect(
      rateContent(signals({ apparentMinor: THRESHOLDS.apparentMinor, sexualAct: 0.5 })).rating,
    ).toBe('blocked');
  });

  it('cinsel sinyal yoksa yaş sinyali tek başına engellemez', () => {
    // Çocukların normal fotoğrafları engellenmemeli.
    expect(rateContent(signals({ apparentMinor: 0.95 })).rating).toBe('general');
  });
});

describe('rateContent — temiz içerik', () => {
  it('sinyalsiz içeriği genel sayar', () => {
    const decision = rateContent(signals());
    expect(decision.rating).toBe('general');
    expect(decision.reason).toBe('clean');
  });

  it('genel içerik reşit olmayanlara açıktır', () => {
    expect(isAdultOnly('general')).toBe(false);
  });
});
