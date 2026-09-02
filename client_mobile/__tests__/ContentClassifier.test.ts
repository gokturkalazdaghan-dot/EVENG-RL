/**
 * Sınıflandırıcı sinyal ayrıştırma testleri.
 *
 * `toSignals`, native katmanın döndürdüğü ham skorlarla politika arasındaki
 * TEK geçittir. Buradaki bir hata, NSFW politikasının tamamını sessizce
 * kaydırır — eşikler doğru olsa bile.
 */
import { toSignals } from '@/moderation/ContentClassifier';
import { rateContent } from '@/moderation/ContentRating';

describe('toSignals — iki farklı "yok" ayrımı', () => {
  it('etiket hiç gelmediyse 0 sayılır', () => {
    // Modelin bilmediği bir kavramı 0.5 saymak politikayı kaydırırdı;
    // 1 saymak ise HER içeriği bloke ederdi.
    const signals = toSignals({});
    expect(signals.sexualAct).toBe(0);
    expect(signals.apparentMinor).toBe(0);
    expect(signals.swimwear).toBe(0);
  });

  it('etiket geldi ama anlamsızsa 1 sayılır (fail-closed)', () => {
    // Bozuk yanıt üreten bir native katman, 0 sayılsaydı kullanıcıya
    // "bu güvenli olarak paylaşılacak" derdi; sunucu sonra 'adult'
    // derecelendirirdi. Sürpriz tam olarak budur.
    for (const bozuk of ['çok', NaN, Infinity, -Infinity, null, {}, [], true]) {
      const signals = toSignals({ sexual_act: bozuk });
      expect(signals.sexualAct).toBe(1);
    }
  });

  it('geçerli skorlar 0..1 aralığına sıkıştırılır', () => {
    const signals = toSignals({ sexual_act: 0.42, apparent_minor: 2, swimwear: -3 });
    expect(signals.sexualAct).toBeCloseTo(0.42);
    expect(signals.apparentMinor).toBe(1);
    expect(signals.swimwear).toBe(0);
  });

  it('açıkça undefined verilen etiket de 0 sayılır', () => {
    expect(toSignals({ sexual_act: undefined }).sexualAct).toBe(0);
  });

  it('bilinmeyen ek etiketler sessizce yok sayılır', () => {
    // Model yeni bir etiket eklerse politika kırılmamalı; o etiket
    // politikaya girene kadar dikkate alınmaz.
    const signals = toSignals({ yepyeni_etiket: 0.9, sexual_act: 0.1 });
    expect(signals.sexualAct).toBeCloseTo(0.1);
    expect(Object.values(signals).every((v) => typeof v === 'number')).toBe(true);
  });

  it('tüm politika sinyalleri her zaman tanımlıdır', () => {
    // Eksik alan, `rateContent` içinde undefined karşılaştırmasına yol açar
    // ve karşılaştırma sessizce false döner — yani sinyal yok sayılır.
    const signals = toSignals({});

    // `keyof` kullanılıyor: alan adı değişirse test DERLENMEZ. Dize listesi
    // olsaydı, yeniden adlandırılmış bir alanı sessizce kaçırırdı.
    const beklenen: (keyof typeof signals)[] = [
      'exposedFemaleNipple',
      'exposedFemaleGenitalia',
      'exposedMaleGenitalia',
      'exposedAnus',
      'sexualAct',
      'swimwear',
      'athleticwear',
      'underwear',
      'apparentMinor',
    ];
    for (const anahtar of beklenen) {
      expect(typeof signals[anahtar]).toBe('number');
    }
  });
});

describe('bozuk yanıt politikaya nasıl yansıyor', () => {
  it('tamamen bozuk yanıt temiz derece ÜRETMEZ', () => {
    // Uçtan uca kanıt: ayrıştırma fail-closed olduğu için derecelendirme de
    // güvenli tarafa düşer.
    const kararTemiz = rateContent(toSignals({}));
    expect(kararTemiz.rating).toBe('general');

    const kararBozuk = rateContent(
      toSignals({ sexual_act: 'bilinmiyor', apparent_minor: 'bilinmiyor' }),
    );
    expect(kararBozuk.rating).not.toBe('general');
  });

  it('bozuk reşit olmayan + cinsel sinyal birleşimi bloke edilir', () => {
    const karar = rateContent(
      toSignals({ apparent_minor: NaN, sexual_act: NaN }),
    );
    expect(karar.rating).toBe('blocked');
  });
});
