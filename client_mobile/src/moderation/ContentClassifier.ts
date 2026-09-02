/**
 * ContentClassifier — NSFW sınıflandırıcısının çalıştırılması.
 *
 * CİHAZ ÜSTÜ ÇALIŞIR — bu bir gizlilik kararıdır
 * Sınıflandırma için medyayı sunucuya göndermek, kullanıcının HER
 * fotoğrafının sunucumuzdan geçmesi demektir; yayınlamadığı taslakların bile.
 * Model cihazda çalıştığında medya cihazdan hiç çıkmaz ve sınıflandırma
 * uçak modunda da yapılır.
 *
 * SUNUCU YİNE DE SINIFLANDIRIR — ve o karar bağlayıcıdır
 * İstemci sınıflandırması, kullanıcıya ANINDA geri bildirim vermek içindir
 * ("bu gönderi +18 olarak etiketlenecek"). Yayınlanan içeriğin nihai
 * derecesini sunucu belirler: istemci modeli yamalanabilir, atlatılabilir
 * veya eski sürümde kalmış olabilir. İki katman farklı işler yapar.
 *
 * FAIL-CLOSED
 * Sınıflandırıcı çalışmazsa içerik "temiz" sayılMAZ: `review` derecesi
 * verilir. Reşit olmayanlara gösterilmez, yetişkin akışına da düşmez.
 */
import { createLogger } from '@/core/logging/Logger';
import { LocalInferenceRuntime } from '@/ai/engine/LocalInferenceRuntime';
import { rateContent, type ClassifierSignals, type RatingDecision } from '@/moderation/ContentRating';

const log = createLogger('ContentClassifier');

/** Sınıflandırıcı çalışmadığında kullanılan güvenli varsayılan. */
const UNKNOWN_SIGNALS: ClassifierSignals = {
  exposedFemaleNipple: 0,
  exposedFemaleGenitalia: 0,
  exposedMaleGenitalia: 0,
  exposedAnus: 0,
  sexualAct: 0,
  swimwear: 0,
  athleticwear: 0,
  underwear: 0,
  apparentMinor: 0,
};

export interface ClassificationResult extends RatingDecision {
  /** Sınıflandırıcı gerçekten çalıştı mı; false ise karar fail-closed'dır. */
  readonly classifierRan: boolean;
  readonly signals: ClassifierSignals;
}

/**
 * Native çıkarımın döndürdüğü ham skorları politika sinyallerine çevirir.
 *
 * İKİ FARKLI "YOK" AYRIMI — sunucudaki `moderationProxy.score` ile AYNI kural:
 *
 *   YOK (undefined): model bu etiketi hiç döndürmedi → 0.
 *     Bilmediği bir kavramı 0.5 saymak politikayı sessizce kaydırır.
 *
 *   BOZUK (sayı değil, NaN, Infinity, null): etiket GELDİ ama anlamsız → 1.
 *     Bunu 0 saymak fail-OPEN'dır: bozuk yanıt üreten bir native katman,
 *     kullanıcıya "bu güvenli olarak paylaşılacak" der, sunucu sonra
 *     'adult' derecelendirir. Dosyanın kaçınmak istediği sürpriz tam
 *     olarak budur.
 *
 * İki katmanın aynı soruyu farklı yanıtlaması, hangisinin doğru olduğunu
 * belirsiz bırakıyordu.
 */
export function toSignals(raw: Record<string, unknown>): ClassifierSignals {
  const read = (key: string): number => {
    if (!(key in raw) || raw[key] === undefined) return 0;
    const value = raw[key];
    return typeof value === 'number' && Number.isFinite(value)
      ? Math.min(1, Math.max(0, value))
      : 1;
  };

  return {
    exposedFemaleNipple: read('exposed_female_nipple'),
    exposedFemaleGenitalia: read('exposed_female_genitalia'),
    exposedMaleGenitalia: read('exposed_male_genitalia'),
    exposedAnus: read('exposed_anus'),
    sexualAct: read('sexual_act'),
    swimwear: read('swimwear'),
    athleticwear: read('athleticwear'),
    underwear: read('underwear'),
    apparentMinor: read('apparent_minor'),
  };
}

export const ContentClassifier = {
  /**
   * Paylaşım öncesi sınıflandırma.
   *
   * Kullanıcı gönderiyi yayınlamadan ÖNCE çağrılır ki sonucu görüp
   * vazgeçebilsin. Yayınladıktan sonra "aslında bu +18'miş" demek, hem
   * kullanıcı için sürpriz hem de kalkan için geç kalmış bir karardır.
   */
  async classify(mediaUri: string): Promise<ClassificationResult> {
    try {
      const result = await LocalInferenceRuntime.run('nsfw-classify', {
        sourceUri: mediaUri,
        // Sınıflandırma için küçük girdi yeterli ve çok daha hızlıdır;
        // anatomik tespit 512 px'te güvenilir çalışır.
        maxEdgePx: 512,
      });

      if (!result.ok) {
        log.warn('Sınıflandırıcı çalıştırılamadı — fail-closed');
        return {
          ...rateContent(UNKNOWN_SIGNALS),
          rating: 'review',
          reason: 'classifier-unavailable',
          classifierRan: false,
          signals: UNKNOWN_SIGNALS,
        };
      }

      // Native taraf skorları çıktı meta verisi olarak döndürür.
      const raw = (result.value as unknown as { scores?: Record<string, unknown> }).scores ?? {};
      const signals = toSignals(raw);

      return { ...rateContent(signals), classifierRan: true, signals };
    } catch (e) {
      log.error('Sınıflandırma hatası — fail-closed', e);
      return {
        ...rateContent(UNKNOWN_SIGNALS),
        rating: 'review',
        reason: 'classifier-error',
        classifierRan: false,
        signals: UNKNOWN_SIGNALS,
      };
    }
  },

  /** Sınıflandırıcı modeli bu cihazda kurulu ve çalışabilir mi. */
  async isReady(): Promise<boolean> {
    return LocalInferenceRuntime.isSupported('nsfw-classify');
  },
};
