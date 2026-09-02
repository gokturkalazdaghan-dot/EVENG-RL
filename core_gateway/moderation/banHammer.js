/**
 * core_gateway/moderation/banHammer.js
 *
 * ANINDA HESAP YAPTIRIMI.
 *
 * "Askıya aldık" demek yetmez — hesabın hangi yeteneklerinin ne zaman
 * kapandığı tek bir yerde tanımlı olmalı. Yaptırım mantığı uçlara dağılırsa,
 * altı ay sonra biri "banlanmış kullanıcı hikaye atamaz ama DM atabilir"
 * gibi bir boşluk bırakır.
 *
 * DÖRT KADEME
 *   shadow    — içerik yalnızca yazarına görünür (spam botları için;
 *               ban'ı fark etmeyen bot yeni hesap açmaz)
 *   suspend   — süreli; içerik gizlenir, yazma kapanır, okuma açık kalır
 *   ban       — süresiz; tüm sosyal yetenekler kapanır
 *   terminate — geri dönüşsüz; içerik kaldırılır, cihaz parmak izi
 *               engellenir, yasal eskalasyon yapılır (CSAM)
 *
 * ABONELİĞE DOKUNULMAZ
 * Yaptırım, kullanıcının ÖDEDİĞİ aboneliği iptal ETMEZ ve para iadesi
 * yapmaz — ikisi de mağazanın yetkisindedir. Uygulama yalnızca kendi
 * yeteneklerini kapatır. Buradan `pro_expiry_date` yazmak, ödül motorunda
 * kaldırılan aynı hatanın yaptırım tarafından tekrarı olurdu.
 *
 * GERİ ALINABİLİRLİK
 * `terminate` dışındaki her yaptırım geri alınabilir ve her yaptırım
 * denetim kaydı üretir: kim, ne zaman, hangi gerekçe, hangi kanıt.
 * Gerekçesiz yaptırım bu API'den GEÇMEZ.
 */

'use strict';

const crypto = require('crypto');

/** Kademeler — ağırdan hafife sıralı değil, açıkça numaralandırılmış. */
const SANCTION = Object.freeze({
  SHADOW: 'shadow',
  SUSPEND: 'suspend',
  BAN: 'ban',
  TERMINATE: 'terminate',
});

const SEVERITY = Object.freeze({ shadow: 0, suspend: 1, ban: 2, terminate: 3 });

/** Kademe → kapanan yetenekler. Tek gerçek kaynak. */
const CAPABILITY_MATRIX = Object.freeze({
  shadow: Object.freeze({
    canPublishStory: true, // yayınlar ama yalnızca kendisi görür
    canSendDm: true,
    canComment: true,
    canBeDiscovered: false,
    canEnterLeaderboard: false,
    contentVisibleToOthers: false,
    canReadFeed: true,
  }),
  suspend: Object.freeze({
    canPublishStory: false,
    canSendDm: false,
    canComment: false,
    canBeDiscovered: false,
    canEnterLeaderboard: false,
    contentVisibleToOthers: false,
    canReadFeed: true, // okuma açık: itiraz edebilmesi için uygulamaya girebilmeli
  }),
  ban: Object.freeze({
    canPublishStory: false,
    canSendDm: false,
    canComment: false,
    canBeDiscovered: false,
    canEnterLeaderboard: false,
    contentVisibleToOthers: false,
    canReadFeed: false,
  }),
  terminate: Object.freeze({
    canPublishStory: false,
    canSendDm: false,
    canComment: false,
    canBeDiscovered: false,
    canEnterLeaderboard: false,
    contentVisibleToOthers: false,
    canReadFeed: false,
  }),
});

/** Otomatik yaptırımın (insan onayı olmadan) çıkabileceği en ağır kademe. */
const AUTOMATIC_CEILING = SANCTION.SUSPEND;

/**
 * Gerekçe → önerilen kademe.
 *
 * `csam_hash_match` doğrudan `terminate` önerir; doğrulanmış karma listesi
 * eşleşmesi için "önce uyar" diye bir kademe yoktur.
 */
const REASON_SANCTION = Object.freeze({
  csam_hash_match: SANCTION.TERMINATE,
  apparent_minor_sexual_content: SANCTION.BAN,
  'minor-safety': SANCTION.BAN,
  nonconsensual_intimate: SANCTION.BAN,
  'nonconsensual-intimate': SANCTION.BAN,
  minor_in_distress: SANCTION.SUSPEND,
  graphic_violence: SANCTION.SUSPEND,
  harassment: SANCTION.SUSPEND,
  'hate-speech': SANCTION.SUSPEND,
  impersonation: SANCTION.SUSPEND,
  spam: SANCTION.SHADOW,
});

function suggestedSanction(reason) {
  return REASON_SANCTION[reason] ?? SANCTION.SUSPEND;
}

/**
 * Yaptırım kaydı üretir — SAF fonksiyon, yan etkisi yok.
 *
 * @throws gerekçe boşsa, kademe geçersizse veya otomatik yaptırım tavanı
 *         aşılıyorsa. Sessizce düzeltmek yerine reddetmek kasıtlı: tavanı
 *         aşan bir otomatik çağrı, çağıran taraftaki bir hatadır.
 */
function makeSanction({ userId, sanction, reason, evidenceIds, moderatorId, automatic, durationMs, nowMs }) {
  if (!userId) throw new Error('user_required');
  if (!Object.values(SANCTION).includes(sanction)) throw new Error('invalid_sanction');
  if (typeof reason !== 'string' || reason.trim().length === 0) throw new Error('reason_required');

  const isAutomatic = automatic === true;

  if (isAutomatic && SEVERITY[sanction] > SEVERITY[AUTOMATIC_CEILING]) {
    // Otomatik sistem kalıcı ban veremez. Bir sınıflandırıcının yanlış
    // pozitifi, insan onayı olmadan bir hesabı kalıcı olarak silemez.
    throw new Error('automatic_sanction_exceeds_ceiling');
  }
  if (!isAutomatic && !moderatorId) {
    // Manuel yaptırım daima kime ait olduğu bilinerek kaydedilir.
    throw new Error('moderator_required');
  }

  const expiresAtMs = resolveExpiry(sanction, durationMs, nowMs);

  return Object.freeze({
    id: crypto.randomUUID(),
    userId,
    sanction,
    reason,
    // Kanıt kimlikleri String() ile ZORLANMAZ: `String({})` "[object Object]"
    // üretir ve denetim kaydına anlamsız bir kanıt referansı yazardı.
    evidenceIds: Object.freeze(
      (Array.isArray(evidenceIds) ? evidenceIds : []).filter(
        (id) => typeof id === 'string' && id.length > 0 && id.length <= 128,
      ),
    ),
    moderatorId: isAutomatic ? null : moderatorId,
    automatic: isAutomatic,
    appliedAtMs: nowMs,
    expiresAtMs,
    liftedAtMs: null,
    capabilities: CAPABILITY_MATRIX[sanction],
    /** `terminate` geri alınamaz; diğerleri itiraz edilebilir. */
    appealable: sanction !== SANCTION.TERMINATE,
  });
}

/** Süreli askının üst sınırı. Bunun ötesi süreli değil, süresizdir. */
const MAX_SUSPENSION_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Süreli askının bitiş anını hesaplar.
 *
 * BOZUK SÜRE SESSİZCE SÜRESİZE DÖNMEZ — bu bir hataydı:
 *
 *   durationMs = Infinity  → expiresAtMs = Infinity → `nowMs >= Infinity`
 *                            hiçbir zaman doğru olmaz → askı HİÇ BİTMEZ
 *   durationMs = 1e30      → aynı sonuç, pratikte kalıcı
 *   durationMs = NaN / -5  → koşul düşer, expiresAtMs = null → SÜRESİZ
 *
 * Üçünde de moderatör "7 günlük askı" verdiğini sanırken kalıcı bir askı
 * uygulanmış oluyordu. Süre VERİLMİŞSE geçerli olmak zorundadır; verilmemiş
 * olması (undefined) süresiz askının meşru yoludur.
 */
function resolveExpiry(sanction, durationMs, nowMs) {
  if (sanction !== SANCTION.SUSPEND) return null;
  // Süre verilmemişse süresiz askı — kasıtlı ve geçerli.
  if (durationMs === undefined || durationMs === null) return null;

  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error('invalid_duration');
  }
  if (durationMs > MAX_SUSPENSION_MS) {
    // Bir yazım hatasının yüzyıllık "geçici" askı üretmesini engeller.
    throw new Error('duration_too_long');
  }
  return nowMs + durationMs;
}

/** Yaptırım şu anda etkin mi (süreli askı dolmuş olabilir). */
function isActive(record, nowMs) {
  if (!record) return false;
  if (record.liftedAtMs !== null) return false;
  if (record.expiresAtMs !== null && nowMs >= record.expiresAtMs) return false;
  return true;
}

/**
 * Bir kullanıcının etkin yetenekleri.
 *
 * FAIL-CLOSED DEĞİL, FAIL-OPEN: yaptırım kaydı yoksa kullanıcı serbesttir.
 * Burada fail-closed olmak, veritabanı hatasında tüm kullanıcıları banlamak
 * demektir. Kayıt okunamıyorsa çağıran taraf hatayı görür ve isteği
 * reddeder — sessizce "yaptırım yok" varsaymaz.
 */
function effectiveCapabilities(records, nowMs) {
  const active = (records ?? []).filter((record) => isActive(record, nowMs));
  if (active.length === 0) {
    return {
      sanction: null,
      canPublishStory: true,
      canSendDm: true,
      canComment: true,
      canBeDiscovered: true,
      canEnterLeaderboard: true,
      contentVisibleToOthers: true,
      canReadFeed: true,
    };
  }

  // Birden fazla etkin yaptırım varsa EN AĞIRI geçerlidir.
  const strongest = active.reduce((acc, record) =>
    SEVERITY[record.sanction] > SEVERITY[acc.sanction] ? record : acc,
  );
  return { sanction: strongest.sanction, ...CAPABILITY_MATRIX[strongest.sanction] };
}

/**
 * Yaptırımı uygular ve yan etkileri tetikler.
 *
 * SIRA ÖNEMLİ: önce yetenekler kapatılır, sonra içerik kaldırılır. Ters sıra,
 * içerik kaldırılırken kullanıcının yenisini yüklemesine izin veren bir
 * pencere açar.
 */
async function applySanction(deps, input) {
  const record = makeSanction(input);

  await deps.persistSanction(record);
  await deps.revokeSessions(record.userId);

  if (!record.capabilities.contentVisibleToOthers) {
    await deps.hideUserContent(record.userId);
  }
  if (record.sanction === SANCTION.TERMINATE) {
    await deps.purgeUserContent(record.userId);
    await deps.blockDeviceFingerprints(record.userId);
    await deps.escalateToLegal({
      userId: record.userId,
      reason: record.reason,
      evidenceIds: record.evidenceIds,
      atMs: record.appliedAtMs,
    });
  }

  await deps.writeAudit({
    action: 'sanction',
    sanctionId: record.id,
    userId: record.userId,
    sanction: record.sanction,
    reason: record.reason,
    moderatorId: record.moderatorId,
    automatic: record.automatic,
    atMs: record.appliedAtMs,
  });

  return record;
}

/** Yaptırımı kaldırır (itiraz kabul veya yanlış pozitif). */
async function liftSanction(deps, { sanctionId, record, moderatorId, note, nowMs }) {
  if (!moderatorId) throw new Error('moderator_required');
  if (record && record.sanction === SANCTION.TERMINATE) {
    throw new Error('terminate_not_reversible');
  }

  await deps.persistLift({ sanctionId, liftedAtMs: nowMs, moderatorId });
  await deps.restoreUserContent(record?.userId ?? null);
  await deps.writeAudit({
    action: 'lift',
    sanctionId,
    userId: record?.userId ?? null,
    moderatorId,
    note: typeof note === 'string' ? note.slice(0, 1000) : '',
    atMs: nowMs,
  });
  return { lifted: true };
}

module.exports = {
  SANCTION,
  MAX_SUSPENSION_MS,
  SEVERITY,
  CAPABILITY_MATRIX,
  AUTOMATIC_CEILING,
  REASON_SANCTION,
  suggestedSanction,
  makeSanction,
  isActive,
  effectiveCapabilities,
  applySanction,
  liftSanction,
};
