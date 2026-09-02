import {
  ADULT_AGE,
  calculateAge,
  capabilitiesFor,
  decideAccess,
  isValidCalendarDate,
  type BirthDate,
} from '@/age/AgePolicy';

/** 15 Haziran 2026, 12:00 UTC — tüm testlerin referans "bugün"ü. */
const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);
const date = (year: number, month: number, day: number): BirthDate => ({ year, month, day });

describe('calculateAge — doğum günü sınırı', () => {
  it('doğum günü geçmişse tam yaşı verir', () => {
    expect(calculateAge(date(2000, 1, 1), NOW)).toBe(26);
  });

  it('doğum günü bu yıl HENÜZ GELMEDİYSE bir yaş geri alır', () => {
    // Yıl farkını yaş sanmak en klasik hatadır: 2026-2000 = 26 ama
    // 15 Aralık henüz gelmedi, kişi hâlâ 25.
    expect(calculateAge(date(2000, 12, 15), NOW)).toBe(25);
  });

  it('doğum gününün TAM günü yaşı artırır', () => {
    expect(calculateAge(date(2008, 6, 15), NOW)).toBe(18);
  });

  it('doğum gününden bir gün önce henüz artırmaz', () => {
    expect(calculateAge(date(2008, 6, 16), NOW)).toBe(17);
  });

  it('aynı ay, önceki gün doğumluyu yaşlı sayar', () => {
    expect(calculateAge(date(2008, 6, 14), NOW)).toBe(18);
  });
});

describe('calculateAge — takvim tuzakları', () => {
  it('29 Şubat doğumluyu artık olmayan yılda doğru hesaplar', () => {
    // 2008-02-29 doğumlu, 2026-06-15'te 18 olmalı (Şubat geçti).
    expect(calculateAge(date(2008, 2, 29), NOW)).toBe(18);
  });

  it('yıl başında bir önceki yılın Aralık doğumlusunu şişirmez', () => {
    const newYear = Date.UTC(2026, 0, 1, 0, 0, 0);
    expect(calculateAge(date(2008, 12, 31), newYear)).toBe(17);
  });

  it('saat diliminden bağımsız aynı sonucu verir', () => {
    // Aynı takvim günü, günün başı ve sonu: yaş değişmemeli.
    const dayStart = Date.UTC(2026, 5, 15, 0, 0, 0);
    const dayEnd = Date.UTC(2026, 5, 15, 23, 59, 59);
    expect(calculateAge(date(2008, 6, 15), dayStart)).toBe(
      calculateAge(date(2008, 6, 15), dayEnd),
    );
  });
});

describe('isValidCalendarDate', () => {
  it('imkânsız tarihi reddeder', () => {
    // JS'te new Date(2026, 1, 31) sessizce 3 Mart'a taşar; kontrol edilmezse
    // kullanıcı imkânsız tarih girip yaşını kaydırabilir.
    expect(isValidCalendarDate(date(2026, 2, 31))).toBe(false);
    expect(isValidCalendarDate(date(2026, 4, 31))).toBe(false);
  });

  it('artık olmayan yılda 29 Şubat reddedilir', () => {
    expect(isValidCalendarDate(date(2025, 2, 29))).toBe(false);
  });

  it('artık yılda 29 Şubat kabul edilir', () => {
    expect(isValidCalendarDate(date(2024, 2, 29))).toBe(true);
  });

  it('ay ve gün aralığı dışını reddeder', () => {
    expect(isValidCalendarDate(date(2000, 13, 1))).toBe(false);
    expect(isValidCalendarDate(date(2000, 0, 1))).toBe(false);
    expect(isValidCalendarDate(date(2000, 1, 32))).toBe(false);
  });
});

describe('decideAccess', () => {
  it('tam 18. doğum gününde yetişkin sayar', () => {
    // `>` yerine `>=`: aksi halde kullanıcı doğum gününde bir yıl daha kilitli
    // kalır.
    const decision = decideAccess(date(2008, 6, 15), NOW);
    expect(decision).toEqual({ ok: true, age: ADULT_AGE, tier: 'adult' });
  });

  it('18. doğum gününe bir gün kala Safe Mode uygular', () => {
    const decision = decideAccess(date(2008, 6, 16), NOW);
    expect(decision.ok && decision.tier).toBe('safe');
  });

  it('gelecek tarihi reddeder', () => {
    expect(decideAccess(date(2030, 1, 1), NOW)).toEqual({ ok: false, reason: 'future-date' });
  });

  it('imkânsız tarihi reddeder', () => {
    expect(decideAccess(date(2000, 2, 30), NOW)).toEqual({ ok: false, reason: 'invalid-date' });
  });

  it('gerçekçi olmayan yaşı reddeder', () => {
    expect(decideAccess(date(1800, 1, 1), NOW)).toEqual({ ok: false, reason: 'invalid-date' });
    expect(decideAccess(date(1901, 1, 1), NOW)).toEqual({ ok: false, reason: 'implausible-age' });
  });
});

describe('capabilitiesFor — fail-closed', () => {
  it('doğrulanmamış kullanıcıya HİÇBİR şey açmaz', () => {
    // Yaş kapısı atlatılmaya çalışıldığında uygulama boş ve güvenli davranır.
    const caps = capabilitiesFor('unverified');
    expect(Object.values(caps).every((value) => value === false)).toBe(true);
  });

  it('Safe Mode yetişkin içeriği hem göstermez hem yayınlatmaz', () => {
    const caps = capabilitiesFor('safe');
    expect(caps.canSeeAdultContent).toBe(false);
    expect(caps.canPublishAdultContent).toBe(false);
  });

  it('Safe Mode yabancılardan DM almayı kapatır', () => {
    expect(capabilitiesFor('safe').canReceiveDmFromStrangers).toBe(false);
  });

  it('Safe Mode kullanıcısı Even arenasında yarışır', () => {
    expect(capabilitiesFor('safe').appearsInPublicLeaderboard).toBe(true);
  });

  it('Safe Mode abonelik satın almayı ENGELLEMEZ', () => {
    // Ebeveyn onayını mağaza yürütür (Ask to Buy / Aile Kütüphanesi).
    // Uygulamanın ikinci kez ve daha kötü engellemesi anlamsızdır.
    expect(capabilitiesFor('safe').canPurchaseSubscription).toBe(true);
  });

  it('Safe Mode düzenleme araçlarını KISITLAMAZ', () => {
    // Kısıtlama yaratıcılıkta değil, temas yüzeyindedir.
    expect(capabilitiesFor('safe').canUseAllEditingTools).toBe(true);
  });

  it('yetişkine tüm yetenekleri açar', () => {
    const caps = capabilitiesFor('adult');
    expect(Object.values(caps).every((value) => value === true)).toBe(true);
  });
});

// --- Tekerlek seçenekleri ---
import { clampDay, dayOptions, daysInMonth, defaultBirthDate, yearOptions } from '@/age/dateOptions';

describe('dateOptions — gün listesi aya göre daralır', () => {
  it('Şubat 2024 (artık yıl) 29 gün verir', () => {
    expect(daysInMonth(2, 2024)).toBe(29);
    expect(dayOptions(2, 2024)).toHaveLength(29);
  });

  it('Şubat 2025 (artık olmayan) 28 gün verir', () => {
    expect(daysInMonth(2, 2025)).toBe(28);
  });

  it('Nisan 30, Ocak 31 gün verir', () => {
    expect(daysInMonth(4, 2025)).toBe(30);
    expect(daysInMonth(1, 2025)).toBe(31);
  });
});

describe('clampDay', () => {
  it('31 Ocak seçiliyken Subat ayina gecince gunu daraltir', () => {
    // Aksi halde kullanıcı 31 Şubat seçip hata alır; geçersiz seçeneği hiç
    // sunmamak, hata göstermekten iyidir.
    expect(clampDay({ day: 31, month: 2, year: 2025 })).toEqual({ day: 28, month: 2, year: 2025 });
  });

  it('geçerli günü değiştirmez', () => {
    expect(clampDay({ day: 15, month: 6, year: 2000 })).toEqual({ day: 15, month: 6, year: 2000 });
  });
});

describe('yearOptions ve varsayılan', () => {
  it('yıl listesi kronolojik ve makul aralıkta', () => {
    const years = yearOptions(NOW);
    expect(years[0]!.value).toBeLessThan(years[years.length - 1]!.value);
    expect(years[years.length - 1]!.value).toBe(2026);
  });

  it('varsayılan tarih ne bugün ne de 18 eşiğidir', () => {
    // Bugün = "0 yaşında"; eşik = kullanıcıyı kaydırmadan onaylamaya iter.
    const fallback = defaultBirthDate(NOW);
    const age = 2026 - fallback.year;
    expect(age).toBeGreaterThan(18);
  });
});
