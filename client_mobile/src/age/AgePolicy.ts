/**
 * AgePolicy — yaş hesabı ve erişim kademesinin SAF mantığı.
 *
 * NEDEN AYRI DOSYA VE NEDEN EN SIKI TEST EDİLENLERDEN BİRİ
 * Buradaki bir hatanın iki yönü de ağırdır:
 *   - Yaşı OLDUĞUNDAN BÜYÜK hesaplamak, bir çocuğu yetişkin içeriğe açar.
 *   - Yaşı OLDUĞUNDAN KÜÇÜK hesaplamak, yetişkin kullanıcıyı kilitler.
 * İkisi de sessizdir: log'da görünmez, yalnızca sahada fark edilir.
 *
 * Klasik hatalar (hepsi test edilir):
 *   - Yıl farkını yaş sanmak (doğum günü henüz gelmediyse 1 fazla çıkar)
 *   - 29 Şubat doğumluları artık olmayan yılda yanlış hesaplamak
 *   - Saat dilimi kayması yüzünden doğum gününde bir gün erken/geç açmak
 */

/** Erişim kademesi. Uygulamanın her yerinde bu tip taşınır. */
export type AccessTier =
  /** Doğrulama yapılmamış — hiçbir içerik gösterilmez. */
  | 'unverified'
  /** 18 yaş altı: kısıtlı deneyim (Safe Mode). */
  | 'safe'
  /** 18 yaş ve üzeri: tam deneyim. */
  | 'adult';

export const ADULT_AGE = 18;

/** Uygulamanın kabul ettiği en yaşlı kullanıcı — veri girişi doğrulaması için. */
export const MAX_PLAUSIBLE_AGE = 120;

export interface BirthDate {
  /** 1-12 (takvim ayı, JS'in 0 tabanlı ayı DEĞİL). */
  readonly month: number;
  readonly day: number;
  readonly year: number;
}

/**
 * Doğum tarihinden tam yaşı hesaplar.
 *
 * SAAT DİLİMİ: Karşılaştırma UTC'de yapılır ve her iki taraf da gün
 * hassasiyetine indirgenir. Yerel saat kullanmak, kullanıcının saat dilimine
 * göre doğum gününde bir gün erken veya geç yetişkin sayılmasına yol açar.
 */
export function calculateAge(birth: BirthDate, nowMs: number): number {
  const today = new Date(nowMs);
  const currentYear = today.getUTCFullYear();
  const currentMonth = today.getUTCMonth() + 1;
  const currentDay = today.getUTCDate();

  let age = currentYear - birth.year;

  // Doğum günü bu yıl HENÜZ GELMEDİYSE bir yaş geri al. Bu kontrol olmadan
  // 31 Aralık doğumlu biri 1 Ocak'ta bir yaş büyük görünür.
  if (currentMonth < birth.month || (currentMonth === birth.month && currentDay < birth.day)) {
    age -= 1;
  }
  return age;
}

/**
 * Girilen tarihin geçerli bir takvim tarihi olup olmadığı.
 *
 * 31 Şubat gibi imkânsız tarihler JS'te sessizce bir sonraki aya taşar
 * (`new Date(2024, 1, 31)` → 2 Mart). Taşma kontrolü yapılmazsa kullanıcı
 * imkânsız bir tarih girip yaşını kaydırabilir.
 */
export function isValidCalendarDate(birth: BirthDate): boolean {
  if (birth.month < 1 || birth.month > 12) return false;
  if (birth.day < 1 || birth.day > 31) return false;
  if (birth.year < 1900) return false;

  const probe = new Date(Date.UTC(birth.year, birth.month - 1, birth.day));
  return (
    probe.getUTCFullYear() === birth.year &&
    probe.getUTCMonth() === birth.month - 1 &&
    probe.getUTCDate() === birth.day
  );
}

export type AgeRejection = 'invalid-date' | 'future-date' | 'implausible-age';

export type AgeDecision =
  | { readonly ok: true; readonly age: number; readonly tier: Exclude<AccessTier, 'unverified'> }
  | { readonly ok: false; readonly reason: AgeRejection };

/**
 * Doğum tarihinden erişim kademesini belirler.
 *
 * TAM 18. DOĞUM GÜNÜ yetişkin sayılır (`age >= 18`). Hukuken de teknik olarak
 * da doğru olan budur; `>` kullanmak kullanıcıyı doğum gününde bir yıl daha
 * kilitler.
 */
export function decideAccess(birth: BirthDate, nowMs: number): AgeDecision {
  if (!isValidCalendarDate(birth)) {
    return { ok: false, reason: 'invalid-date' };
  }

  const age = calculateAge(birth, nowMs);

  if (age < 0) return { ok: false, reason: 'future-date' };
  if (age > MAX_PLAUSIBLE_AGE) return { ok: false, reason: 'implausible-age' };

  return { ok: true, age, tier: age >= ADULT_AGE ? 'adult' : 'safe' };
}

/**
 * Safe Mode kısıtlamaları.
 *
 * Tek bir "isMinor" boolean'ı yerine açık bir yetenek listesi tutuyoruz:
 * yeni bir özellik eklendiğinde geliştirici bu listeye bakmak ZORUNDA kalır,
 * yoksa varsayılan olarak kapalı gelir (bkz. `capabilitiesFor`).
 */
export interface AccessCapabilities {
  /** +18 içeriği görüntüleyebilir mi (akış, arama, profil). */
  readonly canSeeAdultContent: boolean;
  /** Kendi içeriğini +18 olarak işaretleyip yayınlayabilir mi. */
  readonly canPublishAdultContent: boolean;
  /** Tanımadığı kişilerden DM alabilir mi. */
  readonly canReceiveDmFromStrangers: boolean;
  /** Herkese açık liderlik tablosunda görünür mü. */
  readonly appearsInPublicLeaderboard: boolean;
  /** Abonelik satın alabilir mi. */
  readonly canPurchaseSubscription: boolean;
  /** Düzenleme araçlarının tamamına erişebilir mi. */
  readonly canUseAllEditingTools: boolean;
}

/**
 * VARSAYILAN: her şey KAPALI. `unverified` durumunda hiçbir şey açılmaz —
 * yaş kapısı atlatılmaya çalışıldığında uygulama boş ve güvenli davranır.
 */
const NOTHING: AccessCapabilities = {
  canSeeAdultContent: false,
  canPublishAdultContent: false,
  canReceiveDmFromStrangers: false,
  appearsInPublicLeaderboard: false,
  canPurchaseSubscription: false,
  canUseAllEditingTools: false,
};

export function capabilitiesFor(tier: AccessTier): AccessCapabilities {
  switch (tier) {
    case 'adult':
      return {
        canSeeAdultContent: true,
        canPublishAdultContent: true,
        canReceiveDmFromStrangers: true,
        appearsInPublicLeaderboard: true,
        canPurchaseSubscription: true,
        canUseAllEditingTools: true,
      };

    case 'safe':
      // Safe Mode: düzenleme araçlarının TAMAMI açık — kısıtlama yaratıcılıkta
      // değil, yetişkin içerik ve tanımadık kişilerle temas yüzeyindedir.
      //
      //
      // `canPurchaseSubscription: true` — ebeveyn onayını UYGULAMA DEĞİL
      // MAĞAZA yürütür. Apple'da Ask to Buy / Aile Paylaşımı, Play'de Aile
      // Kütüphanesi, reşit olmayan hesabın satın almasını zaten veliye
      // onaylatır. Uygulamanın kendi başına engellemesi, mağazanın
      // hâlihazırda doğru yaptığı bir işi ikinci kez ve daha kötü yapmak olur;
      // ayrıca reşit olmayan PRO abonelerini imkânsız kılardı.
      return {
        ...NOTHING,
        canUseAllEditingTools: true,
        canPurchaseSubscription: true,
        // Even Girl / Even Boy arenası tüm doğrulanmış kullanıcılara açıktır.
        appearsInPublicLeaderboard: true,
      };

    case 'unverified':
      return NOTHING;
  }
}
