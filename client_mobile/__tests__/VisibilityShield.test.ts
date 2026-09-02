import {
  canView,
  filterVisible,
  isSearchAllowed,
  type ContentItem,
  type Viewer,
} from '@/moderation/VisibilityShield';
import type { ContentRating } from '@/moderation/ContentRating';

const viewer = (overrides: Partial<Viewer> = {}): Viewer => ({
  tier: 'adult',
  adultContentOptIn: true,
  revealSensitiveByDefault: false,
  ...overrides,
});

const item = (rating: ContentRating, overrides: Partial<ContentItem> = {}): ContentItem => ({
  rating,
  authorId: 'author-1',
  ...overrides,
});

const NO_BLOCKS: ReadonlySet<string> = new Set();

const see = (v: Viewer, i: ContentItem, blocked: ReadonlySet<string> = NO_BLOCKS) =>
  canView({ viewer: v, item: i, blockedAuthorIds: blocked });

describe('18 yaş altı görünürlük kalkanı', () => {
  const minor = viewer({ tier: 'safe', adultContentOptIn: true });

  it('+18 içeriği reşit olmayana ASLA göstermez', () => {
    // adultContentOptIn true olsa bile: reşit olmayanın "açtım" demesi
    // kalkanı devre dışı bırakamaz.
    expect(see(minor, item('adult'))).toEqual({ visible: false, reason: 'age-restricted' });
  });

  it('hassas içeriği de reşit olmayana göstermez', () => {
    expect(see(minor, item('sensitive'))).toEqual({ visible: false, reason: 'age-restricted' });
  });

  it('BELİRSİZ (inceleme) içeriği de göstermez', () => {
    // Kalkanı sınıflandırıcının en zayıf anına bağlamak olurdu.
    expect(see(minor, item('review'))).toEqual({ visible: false, reason: 'age-restricted' });
  });

  it('genel içeriği normal gösterir', () => {
    expect(see(minor, item('general'))).toEqual({ visible: true, blurred: false });
  });
});

describe('fail-closed davranışı', () => {
  it('doğrulanmamış kullanıcıya genel içeriği bile göstermez', () => {
    const unverified = viewer({ tier: 'unverified' });
    expect(see(unverified, item('general'))).toEqual({ visible: false, reason: 'not-verified' });
  });

  it('politika ihlali içeriği yetişkine de göstermez', () => {
    expect(see(viewer(), item('blocked'))).toEqual({ visible: false, reason: 'policy-blocked' });
  });

  it('raporlanmış içeriği inceleme bitene kadar yetişkine de göstermez', () => {
    expect(see(viewer(), item('general', { reportedPendingReview: true }))).toEqual({
      visible: false,
      reason: 'under-review',
    });
  });
});

describe('yetişkin kullanıcının kendi tercihi', () => {
  it('yetişkin olmak +18 içerik görmek İSTEMEK değildir', () => {
    // Varsayılan kapalı; kullanıcı açıkça açar.
    const optedOut = viewer({ adultContentOptIn: false });
    expect(see(optedOut, item('adult'))).toEqual({ visible: false, reason: 'opt-in-required' });
  });

  it('açan yetişkine gösterir', () => {
    expect(see(viewer(), item('adult'))).toEqual({ visible: true, blurred: false });
  });

  it('hassas içeriği varsayılan olarak bulanık gösterir', () => {
    expect(see(viewer(), item('sensitive'))).toEqual({ visible: true, blurred: true });
  });

  it('kullanıcı isterse hassas içeriği net gösterir', () => {
    const reveal = viewer({ revealSensitiveByDefault: true });
    expect(see(reveal, item('sensitive'))).toEqual({ visible: true, blurred: false });
  });
});

describe('engelleme', () => {
  it('engellenen kullanıcının içeriğini gizler', () => {
    const blocked = new Set(['author-1']);
    expect(see(viewer(), item('general'), blocked)).toEqual({
      visible: false,
      reason: 'blocked-author',
    });
  });

  it('engelleme derecelendirmeden ÖNCE gelir', () => {
    // Engelleyen kişi, engellediğinin masum içeriğini de görmek istemez.
    const blocked = new Set(['author-1']);
    expect(see(viewer(), item('general'), blocked).visible).toBe(false);
  });
});

describe('filterVisible — liste filtresi', () => {
  it('gizlenen öğeyi listeden TAMAMEN çıkarır', () => {
    // Yer tutucu bırakmak, reşit olmayana orada bir şey olduğunu söyler.
    const minor = viewer({ tier: 'safe' });
    const feed = [item('general'), item('adult'), item('sensitive'), item('general')];

    const visible = filterVisible(feed, minor, NO_BLOCKS);

    expect(visible).toHaveLength(2);
    expect(visible.every((entry) => entry.item.rating === 'general')).toBe(true);
  });

  it('yetişkine bulanıklık bilgisini taşır', () => {
    const visible = filterVisible([item('sensitive')], viewer(), NO_BLOCKS);
    expect(visible[0]?.blurred).toBe(true);
  });

  it('boş listeyi güvenle işler', () => {
    expect(filterVisible([], viewer(), NO_BLOCKS)).toHaveLength(0);
  });
});

describe('arama kalkanı', () => {
  it('reşit olmayanın yetişkin terim aramasını engeller', () => {
    // Sonuç boş dönse bile sorgu öneri sistemlerini besler.
    expect(isSearchAllowed(viewer({ tier: 'safe' }), true)).toBe(false);
  });

  it('reşit olmayanın normal aramasına izin verir', () => {
    expect(isSearchAllowed(viewer({ tier: 'safe' }), false)).toBe(true);
  });

  it('doğrulanmamış kullanıcının hiçbir aramasına izin vermez', () => {
    expect(isSearchAllowed(viewer({ tier: 'unverified' }), false)).toBe(false);
  });

  it('tercihini kapatmış yetişkinin yetişkin aramasını engeller', () => {
    expect(isSearchAllowed(viewer({ adultContentOptIn: false }), true)).toBe(false);
  });

  it('açan yetişkine izin verir', () => {
    expect(isSearchAllowed(viewer(), true)).toBe(true);
  });
});
