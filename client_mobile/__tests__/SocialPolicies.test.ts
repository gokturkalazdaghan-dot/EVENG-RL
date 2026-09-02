import {
  STORY_LIFETIME_MS,
  allowedAudiences,
  canPublishStory,
  canViewStory,
  isLive,
  lifetimeProgress,
  liveStories,
  remainingMs,
  type Story,
} from '@/social/StoryPolicy';
import {
  DEFAULT_DM_SETTINGS,
  allowedDmAudiences,
  canSendDm,
  type DmPermissionInput,
  type DmSettings,
} from '@/social/DmPolicy';

const NOW = Date.UTC(2026, 5, 17, 12, 0);

const story = (overrides: Partial<Story> = {}): Story => ({
  storyId: 's1',
  authorId: 'author',
  publishedAtMs: NOW - 60_000,
  rating: 'general',
  audience: 'followers',
  ...overrides,
});

describe('hikaye ömrü', () => {
  it('24 saat dolmadan canlıdır', () => {
    expect(isLive(story({ publishedAtMs: NOW - STORY_LIFETIME_MS + 1000 }), NOW)).toBe(true);
  });

  it('tam 24 saatte düşer', () => {
    expect(isLive(story({ publishedAtMs: NOW - STORY_LIFETIME_MS }), NOW)).toBe(false);
  });

  it('kalan süreyi doğru hesaplar', () => {
    const halfway = story({ publishedAtMs: NOW - STORY_LIFETIME_MS / 2 });
    expect(remainingMs(halfway, NOW)).toBe(STORY_LIFETIME_MS / 2);
    expect(lifetimeProgress(halfway, NOW)).toBeCloseTo(0.5);
  });

  it('süresi dolmuşta kalan süre negatif olmaz', () => {
    expect(remainingMs(story({ publishedAtMs: NOW - STORY_LIFETIME_MS * 3 }), NOW)).toBe(0);
  });

  it('canlı hikayeleri en yeniden eskiye sıralar', () => {
    const list = [
      story({ storyId: 'old', publishedAtMs: NOW - 10_000 }),
      story({ storyId: 'newest', publishedAtMs: NOW - 1_000 }),
      story({ storyId: 'expired', publishedAtMs: NOW - STORY_LIFETIME_MS * 2 }),
    ];
    expect(liveStories(list, NOW).map((s) => s.storyId)).toEqual(['newest', 'old']);
  });
});

describe('hikaye görünürlüğü', () => {
  const base = { viewerId: 'viewer', viewerFollowsAuthor: true, mutualFollow: true, nowMs: NOW };

  it('yazar süresi dolmuş hikayesini arşivinde görür', () => {
    // "Düşmek" silinmek değildir; Zero-Deletion gereği medya kullanıcıda kalır.
    const expired = story({ publishedAtMs: NOW - STORY_LIFETIME_MS * 2 });
    expect(canViewStory({ ...base, story: expired, viewerId: 'author' })).toEqual({
      visible: true,
    });
  });

  it('başkası süresi dolmuş hikayeyi göremez', () => {
    const expired = story({ publishedAtMs: NOW - STORY_LIFETIME_MS * 2 });
    expect(canViewStory({ ...base, story: expired })).toEqual({
      visible: false,
      reason: 'expired',
    });
  });

  it('takipçi kitlesinde takip etmeyene göstermez', () => {
    expect(
      canViewStory({ ...base, story: story({ audience: 'followers' }), viewerFollowsAuthor: false }),
    ).toEqual({ visible: false, reason: 'not-follower' });
  });

  it('karşılıklı kitlesinde tek taraflı takipçiye göstermez', () => {
    expect(
      canViewStory({ ...base, story: story({ audience: 'mutuals' }), mutualFollow: false }),
    ).toEqual({ visible: false, reason: 'not-mutual' });
  });

  it('herkese açık hikayeyi herkese gösterir', () => {
    expect(
      canViewStory({
        ...base,
        story: story({ audience: 'public' }),
        viewerFollowsAuthor: false,
        mutualFollow: false,
      }),
    ).toEqual({ visible: true });
  });
});

describe('hikaye kitlesi seçenekleri', () => {
  it('reşit olmayan herkese açık yayınlayamaz', () => {
    expect(allowedAudiences('safe')).not.toContain('public');
  });

  it('reşit olmayan takipçi ve karşılıklı seçebilir', () => {
    // Kısıtlama yaratıcılıkta değil, temas yüzeyinde.
    expect(allowedAudiences('safe')).toEqual(['followers', 'mutuals']);
  });

  it('yetişkin hepsini seçebilir', () => {
    expect(allowedAudiences('adult')).toHaveLength(3);
  });

  it('doğrulanmamış hiçbirini seçemez', () => {
    expect(allowedAudiences('unverified')).toHaveLength(0);
  });
});

// ============================== DM ==============================

const dm = (overrides: Partial<DmPermissionInput> = {}): DmPermissionInput => ({
  senderId: 'sender',
  senderIsPro: true,
  recipientTier: 'adult',
  recipientSettings: DEFAULT_DM_SETTINGS,
  recipientFollowsSender: false,
  mutualFollow: false,
  blockedEitherWay: false,
  senderIsKnownContact: false,
  ...overrides,
});

const settings = (overrides: Partial<DmSettings> = {}): DmSettings => ({
  ...DEFAULT_DM_SETTINGS,
  ...overrides,
});

describe('DM — PRO gereksinimi', () => {
  it('PRO abonesi olmayan DM gönderemez', () => {
    expect(canSendDm(dm({ senderIsPro: false, mutualFollow: true }))).toEqual({
      allowed: false,
      reason: 'pro-required',
    });
  });

  it('PRO kontrolü diğer kurallardan önce gelir', () => {
    expect(canSendDm(dm({ senderIsPro: false, blockedEitherWay: true })).allowed).toBe(false);
  });
});

describe('hikaye yayınlama PRO gerektirir', () => {
  it('PRO abonesi hikaye yayınlayabilir', () => {
    expect(canPublishStory(true)).toBe(true);
  });

  it('abone olmayan hikaye yayınlayamaz', () => {
    expect(canPublishStory(false)).toBe(false);
  });
});

describe('DM varsayılanı', () => {
  it('varsayılan karşılıklı takipleşenlerdir', () => {
    // "Herkes" değil: yeni kullanıcının ilk deneyimi istenmeyen mesaj olmamalı.
    expect(DEFAULT_DM_SETTINGS.audience).toBe('mutuals');
  });

  it('karşılıklı takipleşene doğrudan izin verir', () => {
    expect(canSendDm(dm({ mutualFollow: true }))).toEqual({ allowed: true, asRequest: false });
  });

  it('tanımadığa istek kutusu açar, gelen kutusuna koymaz', () => {
    expect(canSendDm(dm())).toEqual({ allowed: true, asRequest: true });
  });

  it('istek kutusu kapalıysa reddeder', () => {
    expect(canSendDm(dm({ recipientSettings: settings({ allowRequests: false }) }))).toEqual({
      allowed: false,
      reason: 'audience',
    });
  });
});

describe('DM — reşit olmayan koruması', () => {
  it('tanımadığı kişiden mesaj ALMAZ — istek kutusu bile açılmaz', () => {
    // İstek kutusu, tanımadık birinin metin göndermesine izin verir ve içerik
    // alıcıya görünür; reşit olmayan için yeterli koruma değil.
    expect(canSendDm(dm({ recipientTier: 'safe', senderIsKnownContact: false }))).toEqual({
      allowed: false,
      reason: 'minor-protection',
    });
  });

  it('tanıdığı kişiden mesaj alabilir', () => {
    expect(
      canSendDm(dm({ recipientTier: 'safe', senderIsKnownContact: true, mutualFollow: true })),
    ).toEqual({ allowed: true, asRequest: false });
  });

  it('"herkes" seçeneği reşit olmayana SUNULMAZ', () => {
    // Sunup sonra engellemek kafa karıştırır.
    expect(allowedDmAudiences('safe')).not.toContain('everyone');
    expect(allowedDmAudiences('safe')).toEqual(['mutuals', 'nobody']);
  });
});

describe('DM — diğer kurallar', () => {
  it('engel her şeyin önündedir', () => {
    expect(
      canSendDm(dm({ blockedEitherWay: true, recipientSettings: settings({ audience: 'everyone' }) })),
    ).toEqual({ allowed: false, reason: 'blocked' });
  });

  it('doğrulanmamış alıcıya mesaj gitmez', () => {
    expect(canSendDm(dm({ recipientTier: 'unverified' }))).toEqual({
      allowed: false,
      reason: 'not-verified',
    });
  });

  it('"kimse" ayarında istek kutusu bile açılmaz', () => {
    expect(canSendDm(dm({ recipientSettings: settings({ audience: 'nobody' }) }))).toEqual({
      allowed: false,
      reason: 'audience',
    });
  });

  it('"takip ettiklerim" ayarında takip edilene izin verir', () => {
    expect(
      canSendDm(dm({ recipientSettings: settings({ audience: 'following' }), recipientFollowsSender: true })),
    ).toEqual({ allowed: true, asRequest: false });
  });
});
