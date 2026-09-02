/**
 * core_gateway/moderation/routes.js
 *
 * Moderasyon nöbetçisi uçları.
 *
 * BU UÇLAR UYGULAMA İSTEMCİSİNE AÇIK DEĞİLDİR. Mobil uygulamanın anonim
 * `x-app-user-id` başlığı burada hiçbir yetki taşımaz — nöbetçi kimliği
 * ayrı bir paylaşılan sırla imzalanır ve rol taşır.
 *
 * NEDEN AYRI KİMLİK: son kullanıcı kimliği (anonim, cihazda üretilen)
 * ile personel kimliği aynı doğrulama hattından geçerse, istemci tarafında
 * bulunan tek bir kusur ban-hammer'ı herkese açar.
 */

'use strict';

const express = require('express');
const crypto = require('crypto');

const queue = require('./queue');
const { isValidId } = require('../../social_gamification/social');
const { getRepositories } = require('../../persistence/registry');
const banHammer = require('./banHammer');

const router = express.Router();

// ------------------------------------------------------------ personel auth ----

const ROLES = Object.freeze({
  /** Kuyruğu okur, karar verir; ban veremez. */
  REVIEWER: 'reviewer',
  /** Karar verir ve `ban` kademesine kadar yaptırım uygular. */
  MODERATOR: 'moderator',
  /** `terminate` ve yaptırım kaldırma yetkisi. */
  LEAD: 'lead',
});

const ROLE_RANK = Object.freeze({ reviewer: 0, moderator: 1, lead: 2 });

/**
 * Personel jetonu doğrulama.
 *
 * HMAC imzalı, kısa ömürlü. JWT kütüphanesi yok — `billing_infrastructure`
 * ile aynı gerekçe: ihtiyaç duyulan tek şey HMAC'tir ve `alg: none` sınıfı
 * tuzakları taşımaya gerek yok.
 *
 * Jeton biçimi: base64url(payload) + '.' + base64url(hmac)
 */
function verifyStaffToken(token, secret, nowMs) {
  if (typeof token !== 'string' || !token.includes('.')) return null;

  const [payloadPart, signaturePart] = token.split('.', 2);
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payloadPart)
    .digest('base64url');

  const a = Buffer.from(signaturePart);
  const b = Buffer.from(expected);
  // Sabit süreli karşılaştırma: uzunluk farkı da sızıntıdır, önce eşitlenir.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (typeof payload.exp !== 'number' || nowMs >= payload.exp) return null;
  if (!Object.values(ROLES).includes(payload.role)) return null;
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null;

  return { moderatorId: payload.sub, role: payload.role };
}

function requireRole(minimum) {
  return function guard(req, res, next) {
    const secret = process.env.MODERATION_STAFF_SECRET;
    if (!secret) {
      // Sır yapılandırılmamışsa uç ÇALIŞMAZ. Varsayılan bir sırla açık
      // bırakmak, ban-hammer'ı herkese vermektir.
      console.error('[Moderation] MODERATION_STAFF_SECRET tanımsız — uç kapalı');
      return res.status(503).json({ error: 'moderation_unavailable' });
    }

    const header = req.headers['authorization'];
    const token = typeof header === 'string' ? header.replace(/^Bearer\s+/i, '') : '';
    const staff = verifyStaffToken(token, secret, Date.now());

    if (!staff) return res.status(401).json({ error: 'invalid_staff_token' });
    if (ROLE_RANK[staff.role] < ROLE_RANK[minimum]) {
      return res.status(403).json({ error: 'insufficient_role' });
    }

    req.staff = staff;
    return next();
  };
}

// ----------------------------------------------------------------- kuyruk ----

router.get('/moderation/queue', requireRole(ROLES.REVIEWER), async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const items = await loadOpenItems();
    return res.status(200).json({ items: queue.nextBatch(items, Date.now(), limit) });
  } catch (err) {
    console.error('[Moderation] kuyruk hatası:', err.message);
    return res.status(500).json({ error: 'queue_failed' });
  }
});

/**
 * SLA durumu.
 *
 * İzleme sistemi bunu dakikada bir çeker; `healthy: false` sayfa çağırır.
 * 24 saatlik taahhüdü ölçen tek yer burasıdır.
 */
router.get('/moderation/sla', requireRole(ROLES.REVIEWER), async (req, res) => {
  const items = await loadOpenItems();
  const report = queue.slaReport(items, Date.now());
  // Vadesi geçmiş kritik olay varsa HTTP durumu da bunu yansıtır; izleme
  // aracının gövdeyi ayrıştırmasına gerek kalmaz.
  return res.status(report.breachedCritical > 0 ? 503 : 200).json(report);
});

router.post('/moderation/queue/claim', requireRole(ROLES.REVIEWER), express.json(), async (req, res) => {
  const { itemId } = req.body ?? {};
  if (!isValidId(itemId)) return res.status(400).json({ error: 'invalid_item' });

  // İKİ NÖBETÇİ AYNI OLAYA BAKMAZ: atomik sahiplenme, aynı kaydın iki kez
  // karara bağlanmasını (ve ikinci kararın birinciyi ezmesini) önler.
  const claimed = await claimItem(itemId, req.staff.moderatorId);
  if (!claimed) return res.status(409).json({ error: 'already_claimed' });

  return res.status(200).json({ item: claimed });
});

router.post('/moderation/queue/decide', requireRole(ROLES.REVIEWER), express.json(), async (req, res) => {
  const { itemId, decision, note } = req.body ?? {};

  // Karar ucunda kimlik hiç doğrulanmıyordu; doğrudan `loadItem`'a gidiyordu.
  if (!isValidId(itemId)) return res.status(400).json({ error: 'invalid_item' });

  try {
    const item = await loadItem(itemId);
    if (!item) return res.status(404).json({ error: 'item_not_found' });
    if (item.claimedBy !== req.staff.moderatorId) {
      return res.status(409).json({ error: 'not_claimed_by_you' });
    }

    const nowMs = Date.now();
    const resolved = queue.applyDecision(item, {
      decision,
      moderatorId: req.staff.moderatorId,
      nowMs,
      note,
    });

    await persistItem(resolved);

    // `reverse` = yanlış pozitif: içerik geri yayına alınır. Bu adımı atlamak,
    // "yanlış pozitifi kabul ettik ama içerik yine de gizli" durumu üretir.
    if (decision === 'reverse') await restoreContent(item.contentId);
    if (decision === 'uphold') await removeContent(item.contentId);

    await writeAudit({
      action: 'queue_decision',
      itemId,
      decision,
      moderatorId: req.staff.moderatorId,
      withinSla: resolved.withinSla,
      atMs: nowMs,
    });

    return res.status(200).json({
      state: resolved.state,
      decision,
      withinSla: resolved.withinSla,
    });
  } catch (err) {
    if (err.message === 'invalid_decision') {
      return res.status(400).json({ error: 'invalid_decision' });
    }
    if (err.message === 'reversal_requires_escalation') {
      return res.status(403).json({ error: 'reversal_requires_escalation' });
    }
    console.error('[Moderation] karar hatası:', err.message);
    return res.status(500).json({ error: 'decide_failed' });
  }
});

// ------------------------------------------------------------ ban-hammer ----

/**
 * Anında yaptırım.
 *
 * `terminate` yalnızca `lead` rolüyle verilebilir — geri dönüşü olmayan bir
 * işlemi tek bir nöbetçinin tek tıkla yapabilmesi, kötüye kullanımın ve
 * kazanın en kısa yoludur.
 */
router.post('/moderation/sanction', requireRole(ROLES.MODERATOR), express.json(), async (req, res) => {
  const { userId, sanction, reason, evidenceIds, durationMs } = req.body ?? {};

  // `makeSanction` yalnızca doğruluk sınıyor: `{ $ne: null }` truthy olduğu
  // için geçip `persistSanction`'a anahtar olarak girerdi.
  if (!isValidId(userId)) return res.status(400).json({ error: 'user_required' });

  if (sanction === banHammer.SANCTION.TERMINATE && req.staff.role !== ROLES.LEAD) {
    return res.status(403).json({ error: 'terminate_requires_lead' });
  }

  try {
    const record = await banHammer.applySanction(sanctionDeps, {
      userId,
      sanction,
      reason,
      // String() zorlaması yok: makeSanction dize olmayanları eler.
      evidenceIds: Array.isArray(evidenceIds) ? evidenceIds.slice(0, 50) : [],
      moderatorId: req.staff.moderatorId,
      automatic: false,
      durationMs: typeof durationMs === 'number' ? durationMs : undefined,
      nowMs: Date.now(),
    });

    return res.status(200).json({
      sanctionId: record.id,
      sanction: record.sanction,
      expiresAtMs: record.expiresAtMs,
      appealable: record.appealable,
    });
  } catch (err) {
    const clientErrors = new Set([
      'user_required',
      'invalid_sanction',
      'reason_required',
      'moderator_required',
      'automatic_sanction_exceeds_ceiling',
      // Bozuk süre sessizce süresiz askıya dönmez; moderatör hatayı görür.
      'invalid_duration',
      'duration_too_long',
    ]);
    if (clientErrors.has(err.message)) {
      return res.status(400).json({ error: err.message });
    }
    console.error('[Moderation] yaptırım hatası:', err.message);
    return res.status(500).json({ error: 'sanction_failed' });
  }
});

router.post('/moderation/sanction/lift', requireRole(ROLES.LEAD), express.json(), async (req, res) => {
  const { sanctionId, note } = req.body ?? {};
  if (!isValidId(sanctionId)) return res.status(400).json({ error: 'invalid_sanction_id' });

  try {
    const record = await loadSanction(sanctionId);
    if (!record) return res.status(404).json({ error: 'sanction_not_found' });

    await banHammer.liftSanction(sanctionDeps, {
      sanctionId,
      record,
      moderatorId: req.staff.moderatorId,
      note,
      nowMs: Date.now(),
    });
    return res.status(200).json({ lifted: true });
  } catch (err) {
    if (err.message === 'terminate_not_reversible') {
      return res.status(403).json({ error: 'terminate_not_reversible' });
    }
    console.error('[Moderation] kaldırma hatası:', err.message);
    return res.status(500).json({ error: 'lift_failed' });
  }
});

// ---- Depo delegasyonu -------------------------------------------------

const repo = () => getRepositories();

async function loadOpenItems() {
  return repo().loadOpenItems();
}
async function loadItem(itemId) {
  return repo().loadItem(itemId);
}
/**
 * ATOMİK sahiplenme — koşul UPDATE'in içindedir.
 *
 * Önce okuyup sonra yazmak, iki nöbetçinin aynı olayı sahiplenmesine ve
 * ikinci kararın birinciyi ezmesine izin verirdi.
 */
async function claimItem(itemId, moderatorId) {
  return repo().claimItem(itemId, moderatorId);
}
async function persistItem(item) {
  return repo().persistItem(item);
}
async function restoreContent(contentId) {
  return repo().restoreContent(contentId);
}
async function removeContent(contentId) {
  return repo().removeContent(contentId);
}
async function loadSanction(sanctionId) {
  return repo().loadSanction(sanctionId);
}
async function writeAudit(entry) {
  return repo().writeAudit(entry);
}

const sanctionDeps = {
  persistSanction: (record) => repo().persistSanction(record),
  revokeSessions: (userId) => repo().revokeSessions(userId),
  hideUserContent: (userId) => repo().hideUserContent(userId),
  purgeUserContent: (userId) => repo().purgeUserContent(userId),
  blockDeviceFingerprints: (userId) => repo().blockDeviceFingerprints(userId, []),
  escalateToLegal: async (event) => {
    // Yasal bildirim hattı dışarıdadır; denetim kaydı içeride tutulur.
    console.error(`[Moderation] LEGAL_ESCALATION -> user=${event.userId} reason=${event.reason}`);
    return repo().writeAudit({ action: 'legal_escalation', subjectId: event.userId, atMs: event.atMs });
  },
  restoreUserContent: (userId) => repo().restoreUserContent(userId),
  persistLift: (lift) => repo().persistLift(lift),
  writeAudit: (entry) => repo().writeAudit(entry),
};

module.exports = router;
module.exports.ROLES = ROLES;
module.exports.verifyStaffToken = verifyStaffToken;
module.exports.sanctionDeps = sanctionDeps;
