/**
 * LeaderboardPolicy — haftalık liderlik tablosu ve çelenk rozetlerinin
 * SAF karar mantığı.
 *
 * ÇELENK TASARIMI — bir tasarım kararının gerekçesi
 *
 * Rozetin görseli spec'te tarif edildiği gibidir: parlak lila
 * (`Neon Lilac Garland`) ve loş uzay mavisi (`Space Blue Garland`) animasyonlu
 * çelenkler, zirvedeki için altın taç.
 *
 * DEĞİŞEN İKİ ŞEY ve nedenleri:
 *
 * 1. Çelenk rengi kullanıcının CİNSİYET ALANINDAN türetilmez, kullanıcının
 *    SEÇTİĞİ kozmetik stildir. Profilde otomatik cinsiyet etiketi üretmek,
 *    kullanıcıyı beyan etmediği bir bilgiyi yayınlamaya zorlar ve trans /
 *    non-binary kullanıcılar için yanlış sonuç verir. Seçim olarak sunmak
 *    aynı görseli verir, kimseyi etiketlemez.
 *
 * 2. Rozet, PRO ABONELİĞİNE bağlıdır — yaşa değil. Profilde herkese açık
 *    "bu kullanıcı reşit değil" sinyali üretmek, yetişkin içerik ve DM
 *    barındıran bir uygulamada doğrudan bir hedefleme vektörüdür; ayrıca
 *    Apple 1.3 / Play Families açısından ret riski ve GDPR-K açısından
 *    (çocuğun verisinin herkese açık işlenmesi) sorunludur.
 *
 * 18 yaş altı kullanıcılar herkese açık sıralamada zaten görünmez
 * (bkz. AgePolicy.capabilitiesFor — `appearsInPublicLeaderboard: false`);
 * kendi çelenklerini görürler ve yaş grubuna özel sıralamada yarışırlar.
 */
import type { AccessTier } from '@/age/AgePolicy';

/** Profil cinsiyeti — çelenk stilini belirler. */
export type ProfileGender = 'female' | 'male' | 'unspecified';

/**
 * Çelenk stili.
 *   neon-lilac  : parlak lila  (dişi profiller)
 *   space-blue  : loş uzay mavisi (erkek profiller)
 */
export type GarlandStyle = 'neon-lilac' | 'space-blue' | 'none';

/** Profil cinsiyetinden çelenk stilini türetir. */
export function garlandStyleFor(gender: ProfileGender): GarlandStyle {
  switch (gender) {
    case 'female':
      return 'neon-lilac';
    case 'male':
      return 'space-blue';
    default:
      return 'none';
  }
}

export const GARLAND_STYLES: readonly Exclude<GarlandStyle, 'none'>[] = [
  'neon-lilac',
  'space-blue',
];

/** Rozet kademesi — sıralamadaki yere göre. */
export type BadgeTier = 'crown' | 'garland' | 'none';

export interface LeaderboardEntry {
  readonly userId: string;
  /** Haftalık puan — paylaşım, beğeni, şablon kullanımı vb.'den toplanır. */
  readonly weeklyScore: number;
  readonly isPro: boolean;
  readonly tier: AccessTier;
  readonly gender: ProfileGender;
  readonly garlandStyle: GarlandStyle;
  /** Eşitlik bozucu: aynı puanda önce ulaşan üstte olur. */
  readonly scoreReachedAtMs: number;
}

export interface RankedEntry extends LeaderboardEntry {
  readonly rank: number;
  readonly badge: BadgeTier;
}

/** Sıralamanın kaç kişiyi gösterdiği. */
export const LEADERBOARD_SIZE = 100;

/**
 * Otomatik ödül kademeleri — her Pazartesi 00:00 UTC'de dağıtılır.
 *   1-10  : 7 gün ücretsiz PRO
 *   11-20 : 3 gün ücretsiz PRO
 */
export const REWARD_TIERS: readonly {
  readonly minRank: number;
  readonly maxRank: number;
  readonly freeProDays: number;
}[] = [
  { minRank: 1, maxRank: 10, freeProDays: 7 },
  { minRank: 11, maxRank: 20, freeProDays: 3 },
];

/** Bu sıradaki kullanıcıya kaç gün ücretsiz PRO verilir. */
export function rewardDaysFor(rank: number): number {
  const tier = REWARD_TIERS.find((candidate) => rank >= candidate.minRank && rank <= candidate.maxRank);
  return tier?.freeProDays ?? 0;
}

/**
 * Haftanın başlangıcı (Pazartesi 00:00 UTC).
 *
 * UTC kullanılır: yerel saatle hesaplamak, kullanıcının saat dilimine göre
 * haftanın farklı anlarda dönmesine ve sıralamanın tutarsız görünmesine
 * yol açar.
 */
export function weekStartMs(nowMs: number): number {
  const date = new Date(nowMs);
  const day = date.getUTCDay(); // 0 = Pazar
  const daysSinceMonday = (day + 6) % 7;

  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() - daysSinceMonday,
  );
}

export function weekEndMs(nowMs: number): number {
  return weekStartMs(nowMs) + 7 * 24 * 60 * 60 * 1000;
}

/**
 * Herkese açık sıralamaya kimlerin gireceği.
 *
 * Reşit olmayan hesaplar HARİÇTİR — kişisel bir başarı sıralamasında bir
 * kullanıcının reşit olmadığını herkese duyurmak istemiyoruz. Bu, Modül 5'te
 * `capabilitiesFor('safe').appearsInPublicLeaderboard = false` ile
 * kilitlenmiştir; burada aynı kural uygulanır.
 */
export function eligibleForPublicLeaderboard(entry: LeaderboardEntry): boolean {
  return entry.tier !== 'unverified';
}

/**
 * Rozet kademesi.
 *
 * - 1. sıra: altın taç
 * - PRO abonesi: çelenk (seçtiği stille)
 * - Diğerleri: rozet yok
 *
 * Sıralamada olmak çelenk vermez; çelenk aboneliğin görsel karşılığıdır.
 * Taç ise puana bağlıdır ve abonelik gerektirmez — aksi halde "birinciliği
 * satın alınabilir" izlenimi doğar.
 */
export function badgeFor(entry: LeaderboardEntry, rank: number): BadgeTier {
  if (rank === 1) return 'crown';
  // Çelenk: ücretli EVEN PRO abonesi olan 18 yaş altı kullanıcılar.
  if (entry.isPro && entry.tier === 'safe' && garlandStyleFor(entry.gender) !== 'none') {
    return 'garland';
  }
  return 'none';
}

/**
 * Sıralamayı hesaplar.
 *
 * Eşit puanda önce ulaşan üstte olur: rastgele veya kimliğe göre sıralamak,
 * aynı puandaki kullanıcılar için sıralamanın her yenilemede değişmesine
 * yol açar.
 */
export function rank(
  entries: readonly LeaderboardEntry[],
  options: { publicOnly?: boolean; size?: number } = {},
): readonly RankedEntry[] {
  const pool = options.publicOnly === false
    ? [...entries]
    : entries.filter(eligibleForPublicLeaderboard);

  const sorted = pool.sort((a, b) => {
    if (b.weeklyScore !== a.weeklyScore) return b.weeklyScore - a.weeklyScore;
    if (a.scoreReachedAtMs !== b.scoreReachedAtMs) return a.scoreReachedAtMs - b.scoreReachedAtMs;
    // Tam eşitlikte deterministik olsun diye kimliğe göre.
    return a.userId.localeCompare(b.userId);
  });

  return sorted.slice(0, options.size ?? LEADERBOARD_SIZE).map((entry, index) => ({
    ...entry,
    rank: index + 1,
    badge: badgeFor(entry, index + 1),
  }));
}

/**
 * Kullanıcının kendi profilinde göreceği rozet.
 *
 * Herkese açık sıralamada görünmeyen (reşit olmayan) kullanıcı da kendi
 * çelengini GÖRÜR: rozet aboneliğin karşılığıdır ve ödediği şeyi görmemesi
 * için bir sebep yoktur. Görünmeyen tek şey, adının herkese açık listede
 * yer almasıdır.
 */
export function selfBadge(entry: LeaderboardEntry, publicRank: number | null): BadgeTier {
  if (publicRank === 1) return 'crown';
  if (entry.isPro && entry.tier === 'safe' && garlandStyleFor(entry.gender) !== 'none') {
    return 'garland';
  }
  return 'none';
}
