import {
  LEADERBOARD_SIZE,
  REWARD_TIERS,
  badgeFor,
  eligibleForPublicLeaderboard,
  garlandStyleFor,
  rank,
  rewardDaysFor,
  selfBadge,
  weekEndMs,
  weekStartMs,
  type LeaderboardEntry,
} from '@/social/LeaderboardPolicy';

const entry = (overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry => ({
  userId: 'u1',
  weeklyScore: 100,
  isPro: true,
  tier: 'adult',
  gender: 'female',
  garlandStyle: 'neon-lilac',
  scoreReachedAtMs: 1_000,
  ...overrides,
});

describe('haftalık pencere', () => {
  it('haftayı Pazartesi 00:00 UTC\'de başlatır', () => {
    // 2026-06-17 Çarşamba -> hafta başı 2026-06-15 Pazartesi
    const wednesday = Date.UTC(2026, 5, 17, 15, 30);
    expect(weekStartMs(wednesday)).toBe(Date.UTC(2026, 5, 15));
  });

  it('Pazar gününü bir önceki haftaya sayar', () => {
    // Pazar, ISO haftasının SON günüdür; getUTCDay 0 döndürdüğü için bu
    // hesabın en kolay yanlış yapıldığı yerdir.
    const sunday = Date.UTC(2026, 5, 21, 23, 0);
    expect(weekStartMs(sunday)).toBe(Date.UTC(2026, 5, 15));
  });

  it('Pazartesi gününün kendisi hafta başıdır', () => {
    const monday = Date.UTC(2026, 5, 15, 0, 1);
    expect(weekStartMs(monday)).toBe(Date.UTC(2026, 5, 15));
  });

  it('hafta sonu tam 7 gün sonradır', () => {
    const now = Date.UTC(2026, 5, 17);
    expect(weekEndMs(now) - weekStartMs(now)).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('saat diliminden bağımsız aynı haftayı verir', () => {
    const early = Date.UTC(2026, 5, 17, 0, 0);
    const late = Date.UTC(2026, 5, 17, 23, 59);
    expect(weekStartMs(early)).toBe(weekStartMs(late));
  });
});

describe('sıralama uygunluğu', () => {
  it('doğrulanmış hesapları sıralamaya koyar', () => {
    expect(eligibleForPublicLeaderboard(entry({ tier: 'safe' }))).toBe(true);
    expect(eligibleForPublicLeaderboard(entry({ tier: 'adult' }))).toBe(true);
  });

  it('doğrulanmamış hesapları koymaz', () => {
    expect(eligibleForPublicLeaderboard(entry({ tier: 'unverified' }))).toBe(false);
  });

  it('doğrulanmamış hesapları listeden filtreler', () => {
    const ranked = rank([
      entry({ userId: 'verified', weeklyScore: 50, tier: 'adult' }),
      entry({ userId: 'unverified', weeklyScore: 999, tier: 'unverified' }),
    ]);
    expect(ranked.map((r) => r.userId)).toEqual(['verified']);
  });
});

describe('çelenk stili — profil cinsiyetinden türetilir', () => {
  it('dişi profil parlak lila çelenk alır', () => {
    expect(garlandStyleFor('female')).toBe('neon-lilac');
  });

  it('erkek profil loş uzay mavisi çelenk alır', () => {
    expect(garlandStyleFor('male')).toBe('space-blue');
  });

  it('belirtilmemiş profil çelenk almaz', () => {
    expect(garlandStyleFor('unspecified')).toBe('none');
  });
});

describe('otomatik ödül kademeleri', () => {
  it('1-10 arası 7 gün ücretsiz PRO alır', () => {
    expect(rewardDaysFor(1)).toBe(7);
    expect(rewardDaysFor(10)).toBe(7);
  });

  it('11-20 arası 3 gün ücretsiz PRO alır', () => {
    expect(rewardDaysFor(11)).toBe(3);
    expect(rewardDaysFor(20)).toBe(3);
  });

  it('21 ve sonrası ödül almaz', () => {
    expect(rewardDaysFor(21)).toBe(0);
    expect(rewardDaysFor(100)).toBe(0);
  });

  it('kademeler çakışmaz', () => {
    expect(REWARD_TIERS).toHaveLength(2);
    expect(REWARD_TIERS[0]!.maxRank).toBeLessThan(REWARD_TIERS[1]!.minRank);
  });
});

describe('rozet kademesi', () => {
  it('birinciye altın taç verir', () => {
    expect(badgeFor(entry(), 1)).toBe('crown');
  });

  it('taç abonelik GEREKTİRMEZ', () => {
    // Aksi halde "birincilik satın alınabilir" izlenimi doğar.
    expect(badgeFor(entry({ isPro: false, garlandStyle: 'none' }), 1)).toBe('crown');
  });

  it('18 yaş altı PRO abonesine çelenk verir', () => {
    expect(badgeFor(entry({ isPro: true, tier: 'safe', gender: 'female' }), 42)).toBe('garland');
    expect(badgeFor(entry({ isPro: true, tier: 'safe', gender: 'male' }), 42)).toBe('garland');
  });

  it('abone olmayana çelenk vermez', () => {
    expect(badgeFor(entry({ isPro: false, tier: 'safe' }), 5)).toBe('none');
  });

  it('cinsiyeti belirtilmemiş profile çelenk vermez', () => {
    expect(badgeFor(entry({ isPro: true, tier: 'safe', gender: 'unspecified' }), 3)).toBe('none');
  });
});

describe('sıralama düzeni', () => {
  it('puana göre azalan sıralar', () => {
    const ranked = rank([
      entry({ userId: 'low', weeklyScore: 10 }),
      entry({ userId: 'high', weeklyScore: 90 }),
      entry({ userId: 'mid', weeklyScore: 50 }),
    ]);
    expect(ranked.map((r) => r.userId)).toEqual(['high', 'mid', 'low']);
  });

  it('eşit puanda önce ulaşanı üste koyar', () => {
    const ranked = rank([
      entry({ userId: 'later', weeklyScore: 50, scoreReachedAtMs: 9_000 }),
      entry({ userId: 'earlier', weeklyScore: 50, scoreReachedAtMs: 1_000 }),
    ]);
    expect(ranked[0]?.userId).toBe('earlier');
  });

  it('aynı girdi için deterministik sonuç verir', () => {
    const entries = [
      entry({ userId: 'b', weeklyScore: 50, scoreReachedAtMs: 1_000 }),
      entry({ userId: 'a', weeklyScore: 50, scoreReachedAtMs: 1_000 }),
      entry({ userId: 'c', weeklyScore: 50, scoreReachedAtMs: 1_000 }),
    ];
    const first = rank([...entries]).map((r) => r.userId);
    const second = rank([...entries].reverse()).map((r) => r.userId);
    expect(first).toEqual(second);
  });

  it('liste boyutunu sınırlar', () => {
    const many = Array.from({ length: 250 }, (_, i) =>
      entry({ userId: `u${i}`, weeklyScore: 250 - i }),
    );
    expect(rank(many)).toHaveLength(LEADERBOARD_SIZE);
  });

  it('yalnızca birinci taç alır', () => {
    const ranked = rank([
      entry({ userId: 'a', weeklyScore: 90 }),
      entry({ userId: 'b', weeklyScore: 80 }),
    ]);
    expect(ranked.filter((r) => r.badge === 'crown')).toHaveLength(1);
  });
});

describe('kendi profilindeki rozet', () => {
  it('18 yaş altı PRO abonesi kendi çelengini görür', () => {
    const minorPro = entry({ tier: 'safe', isPro: true, gender: 'female' });
    expect(selfBadge(minorPro, null)).toBe('garland');
  });

  it('birinciyse taç gösterir', () => {
    expect(selfBadge(entry(), 1)).toBe('crown');
  });

  it('abone değilse rozet göstermez', () => {
    expect(selfBadge(entry({ isPro: false, tier: 'safe' }), 20)).toBe('none');
  });
});
