import {
  DEFAULT_ACTIVITY_SETTINGS,
  canSeeReadReceipts,
  canSeeTypingIndicator,
  isSharingActivity,
  normalizeAfterSubscriptionLapse,
  resolveActivityView,
  type ActivitySettings,
  type ActivityViewInput,
} from '@/social/ActivityPrivacy';

const settings = (overrides: Partial<ActivitySettings> = {}): ActivitySettings => ({
  ...DEFAULT_ACTIVITY_SETTINGS,
  ...overrides,
});

const view = (overrides: Partial<ActivityViewInput> = {}): ActivityViewInput => ({
  viewer: settings(),
  target: settings(),
  mutualFollow: true,
  blockedEitherWay: false,
  ...overrides,
});

describe('isSharingActivity', () => {
  it('varsayılan olarak paylaşır', () => {
    expect(isSharingActivity(settings())).toBe(true);
  });

  it('her ikisi de kapalıysa paylaşmaz', () => {
    expect(
      isSharingActivity(settings({ lastSeenVisibility: 'nobody', onlineBadgeVisible: false })),
    ).toBe(false);
  });

  it('yalnızca son görülme gizliyse hâlâ paylaşır (çevrimiçi rozeti açık)', () => {
    expect(isSharingActivity(settings({ lastSeenVisibility: 'nobody' }))).toBe(true);
  });

  it('Ghost Mode her şeyi kapatır', () => {
    expect(isSharingActivity(settings({ ghostMode: true, isPro: true }))).toBe(false);
  });

  it('PRO olmayanda Ghost Mode etkisizdir', () => {
    // Ayar açık kalmış olabilir ama abonelik yoksa uygulanmaz.
    expect(isSharingActivity(settings({ ghostMode: true, isPro: false }))).toBe(true);
  });
});

describe('KARŞILIKLILIK KURALI', () => {
  it('kendini gizleyen, başkasınınkini de göremez', () => {
    const hider = settings({ lastSeenVisibility: 'nobody', onlineBadgeVisible: false });
    expect(resolveActivityView(view({ viewer: hider }))).toEqual({
      kind: 'hidden',
      reason: 'reciprocity',
    });
  });

  it('PRO abonesi karşılıklılıktan MUAF DEĞİLDİR', () => {
    // "Para verirsen tek taraflı gözetleyebilirsin" satmıyoruz.
    const ghostPro = settings({ ghostMode: true, isPro: true });
    expect(resolveActivityView(view({ viewer: ghostPro }))).toEqual({
      kind: 'hidden',
      reason: 'reciprocity',
    });
  });

  it('paylaşan kullanıcı, paylaşanın durumunu görür', () => {
    expect(resolveActivityView(view())).toEqual({ kind: 'last-seen', showTimestamp: true });
  });
});

describe('hedefin tercihi', () => {
  it('Ghost Mode\'daki hedefi kimse göremez', () => {
    const ghost = settings({ ghostMode: true, isPro: true });
    expect(resolveActivityView(view({ target: ghost }))).toEqual({
      kind: 'hidden',
      reason: 'target-ghost',
    });
  });

  it('her şeyi kapatan hedefi göremez', () => {
    const hidden = settings({ lastSeenVisibility: 'nobody', onlineBadgeVisible: false });
    expect(resolveActivityView(view({ target: hidden }))).toEqual({
      kind: 'hidden',
      reason: 'target-hidden',
    });
  });

  it('son görülmeyi gizleyip çevrimiçi rozetini açık bırakan hedefte rozeti gösterir', () => {
    // Kullanıcı iki ayarı ayrı ayrı kontrol edebilmeli.
    const partial = settings({ lastSeenVisibility: 'nobody', onlineBadgeVisible: true });
    expect(resolveActivityView(view({ target: partial }))).toEqual({ kind: 'online' });
  });

  it('"yalnızca karşılıklı" ayarında takipleşmeyene son görülmeyi vermez', () => {
    const mutualsOnly = settings({ lastSeenVisibility: 'mutuals', onlineBadgeVisible: false });
    expect(
      resolveActivityView(view({ target: mutualsOnly, mutualFollow: false })),
    ).toEqual({ kind: 'hidden', reason: 'not-mutual' });
  });

  it('"yalnızca karşılıklı" ayarında takipleşene son görülmeyi verir', () => {
    const mutualsOnly = settings({ lastSeenVisibility: 'mutuals' });
    expect(resolveActivityView(view({ target: mutualsOnly, mutualFollow: true }))).toEqual({
      kind: 'last-seen',
      showTimestamp: true,
    });
  });
});

describe('engelleme her şeyin önünde', () => {
  it('engel varsa hiçbir şey göstermez', () => {
    expect(resolveActivityView(view({ blockedEitherWay: true }))).toEqual({
      kind: 'hidden',
      reason: 'blocked',
    });
  });

  it('engel Ghost Mode kontrolünden bile önce gelir', () => {
    const ghost = settings({ ghostMode: true, isPro: true });
    expect(
      resolveActivityView(view({ target: ghost, blockedEitherWay: true })).kind,
    ).toBe('hidden');
    expect(
      (resolveActivityView(view({ target: ghost, blockedEitherWay: true })) as { reason: string })
        .reason,
    ).toBe('blocked');
  });
});

describe('yazıyor göstergesi ve okundu bilgisi', () => {
  it('aktifliğini gizleyen, yazıyor göstergesini de göremez', () => {
    // Son görülmeyi gizleyip "yazıyor"u izlemek, gizlemenin amacını boşa çıkarır.
    const hider = settings({ lastSeenVisibility: 'nobody', onlineBadgeVisible: false });
    expect(canSeeTypingIndicator(view({ viewer: hider }))).toBe(false);
  });

  it('Ghost Mode\'daki kullanıcı yazıyor göstergesini göremez', () => {
    const ghostPro = settings({ ghostMode: true, isPro: true });
    expect(canSeeTypingIndicator(view({ viewer: ghostPro }))).toBe(false);
  });

  it('paylaşan kullanıcı görebilir', () => {
    expect(canSeeTypingIndicator(view())).toBe(true);
    expect(canSeeReadReceipts(view())).toBe(true);
  });
});

describe('abonelik bitişi', () => {
  it('Ghost Mode\'u kapatır', () => {
    const lapsed = normalizeAfterSubscriptionLapse(settings({ ghostMode: true, isPro: true }));
    expect(lapsed.ghostMode).toBe(false);
    expect(lapsed.isPro).toBe(false);
  });

  it('kullanıcının DİĞER gizlilik tercihlerini korur', () => {
    // Abonelik bitti diye son görülmeyi herkese açmak, kullanıcının açık
    // iradesini görmezden gelmek olur.
    const lapsed = normalizeAfterSubscriptionLapse(
      settings({ ghostMode: true, isPro: true, lastSeenVisibility: 'mutuals' }),
    );
    expect(lapsed.lastSeenVisibility).toBe('mutuals');
  });
});
