/**
 * core_gateway/moderation/queue.js
 *
 * Moderasyon kuyruğu ve 24 SAATLİK SLA.
 *
 * APPLE GUIDELINE 1.2 "zamanında yanıt" ister ama süre vermez. Bu uygulamanın
 * taahhüdü: HER rapor en geç 24 saat içinde bir insan kararı alır. Kritik
 * öncelikli olaylar (CSAM, reşit olmayan güvenliği) 1 saat içinde.
 *
 * SLA BİR YORUM DEĞİL, ÖLÇÜLEN BİR DEĞERDİR
 * `dueAtMs` kayıt anında hesaplanır ve kaydın parçasıdır. "24 saat içinde
 * bakarız" cümlesi denetlenemez; `overdue(item, now)` denetlenebilir. Vadesi
 * geçen kuyruk `slaReport` ile görünür olur ve nöbetçi uyarısı üretir.
 *
 * ÖNCELİK, GELİŞ SIRASINI EZER
 * Kuyruk FIFO DEĞİLDİR. Kritik bir CSAM olayı, üç saat önce gelen bir spam
 * raporunun arkasında bekleyemez. Sıralama: öncelik → vade → geliş.
 *
 * OTOMATİK KARAR YOK
 * Bu kuyruk insan kararı içindir. `scanAndGate` zaten otomatik bloke etmiş
 * olabilir; kuyruk o kararın DOĞRULANDIĞI veya GERİ ALINDIĞI yerdir.
 * Süre dolduğunda içerik kendiliğinden yayına dönMEZ — vadesi geçmiş kayıt
 * karantinada kalır ve uyarı üretir.
 */

'use strict';

const crypto = require('crypto');

/** Öncelik → SLA süresi (ms). */
const SLA_MS = Object.freeze({
  /** CSAM, reşit olmayan güvenliği, rızasız mahrem görüntü. */
  critical: 60 * 60 * 1000, // 1 saat
  /** Grafik şiddet, taciz, kimlik taklidi. */
  high: 6 * 60 * 60 * 1000, // 6 saat
  /** Diğer her şey — taahhüt edilen üst sınır. */
  normal: 24 * 60 * 60 * 1000, // 24 saat
});

const PRIORITY_RANK = Object.freeze({ critical: 0, high: 1, normal: 2 });

/** Rapor gerekçesinin öncelik eşlemesi. Bilinmeyen gerekçe `normal`. */
const REASON_PRIORITY = Object.freeze({
  'csam_hash_match': 'critical',
  'apparent_minor_sexual_content': 'critical',
  'minor_in_distress': 'critical',
  'nonconsensual_intimate': 'critical',
  'minor-safety': 'critical',
  'nonconsensual-intimate': 'critical',
  'graphic_violence': 'high',
  'violence': 'high',
  'harassment': 'high',
  'hate-speech': 'high',
  'impersonation': 'high',
  'sexual-content-unlabeled': 'normal',
  'sexual_content_review': 'normal',
  'violence_review': 'normal',
  'scanner_unavailable': 'normal',
  'copyright': 'normal',
  'spam': 'normal',
  'other': 'normal',
});

function priorityFor(reason) {
  return REASON_PRIORITY[reason] ?? 'normal';
}

/**
 * Bir olay için en yüksek önceliği seçer.
 *
 * En yüksek = en kısa SLA. Birden fazla gerekçe varsa en ağırı belirler;
 * ortalama almak, kritik bir gerekçeyi normale sulandırırdı.
 */
function highestPriority(reasons) {
  let best = 'normal';
  for (const reason of reasons ?? []) {
    const p = priorityFor(reason);
    if (PRIORITY_RANK[p] < PRIORITY_RANK[best]) best = p;
  }
  return best;
}

/**
 * Kuyruk kaydı oluşturur.
 *
 * @returns kayıt — `dueAtMs` burada sabitlenir ve sonradan uzatılamaz.
 */
function makeItem({ contentId, authorId, kind, reasons, source, reporterId, createdAtMs, priority }) {
  const effective = priority ?? highestPriority(reasons);
  return Object.freeze({
    id: crypto.randomUUID(),
    contentId,
    authorId,
    kind: kind ?? 'post',
    reasons: Object.freeze([...(reasons ?? [])]),
    /** 'proxy' (otomatik tarama) veya 'report' (kullanıcı bildirimi). */
    source: source ?? 'report',
    reporterId: reporterId ?? null,
    priority: effective,
    createdAtMs,
    dueAtMs: createdAtMs + SLA_MS[effective],
    state: 'open',
    claimedBy: null,
  });
}

function overdue(item, nowMs) {
  return item.state === 'open' && nowMs > item.dueAtMs;
}

/** Kalan süre; negatif değer gecikmeyi gösterir. */
function remainingMs(item, nowMs) {
  return item.dueAtMs - nowMs;
}

/**
 * Sıralama: öncelik → vade → geliş.
 *
 * Aynı öncelikte vadesi yakın olan öne geçer; eşitlikte geliş sırası korunur
 * (kararlı sıralama için son anahtar `createdAtMs`).
 */
function compareItems(a, b) {
  const rank = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (rank !== 0) return rank;
  if (a.dueAtMs !== b.dueAtMs) return a.dueAtMs - b.dueAtMs;
  return a.createdAtMs - b.createdAtMs;
}

/** Nöbetçiye verilecek çalışma listesi. */
function nextBatch(items, nowMs, limit = 20) {
  return items
    .filter((item) => item.state === 'open' && item.claimedBy === null)
    .sort(compareItems)
    .slice(0, Math.max(0, limit))
    .map((item) => ({ ...item, overdue: overdue(item, nowMs) }));
}

/**
 * SLA durum raporu.
 *
 * `breached > 0` üretimde sayfa çağırır (page). Sessiz bir gecikme, olmayan
 * bir moderasyondur.
 */
function slaReport(items, nowMs) {
  const open = items.filter((item) => item.state === 'open');
  const breached = open.filter((item) => overdue(item, nowMs));
  const byPriority = { critical: 0, high: 0, normal: 0 };
  for (const item of open) byPriority[item.priority] += 1;

  const oldest = open.reduce(
    (acc, item) => (acc === null || item.createdAtMs < acc.createdAtMs ? item : acc),
    null,
  );

  return {
    open: open.length,
    breached: breached.length,
    breachedCritical: breached.filter((item) => item.priority === 'critical').length,
    byPriority,
    oldestAgeMs: oldest ? nowMs - oldest.createdAtMs : 0,
    healthy: breached.length === 0,
  };
}

/** Geçerli insan kararları. */
const DECISIONS = Object.freeze(['uphold', 'reverse', 'escalate']);

/**
 * İnsan kararını uygular.
 *
 * `uphold`  → içerik kaldırılmış kalır (veya kaldırılır)
 * `reverse` → yanlış pozitif; içerik geri yayına alınır
 * `escalate`→ üst kademeye / yasal hatta taşınır, kuyrukta AÇIK KALIR
 *
 * `reverse` KRİTİK ÖNCELİKTE DE MÜMKÜNDÜR — otomatik blokajın yanlış pozitif
 * üretebileceğini kabul etmeyen bir sistem, zamanla insanları karar almaktan
 * caydırır. Ancak `csam_hash_match` gerekçesi tek istisnadır: doğrulanmış
 * karma listesi eşleşmesi tek moderatör kararıyla geri alınamaz.
 */
function applyDecision(item, { decision, moderatorId, nowMs, note }) {
  if (!DECISIONS.includes(decision)) {
    throw new Error('invalid_decision');
  }
  if (decision === 'reverse' && item.reasons.includes('csam_hash_match')) {
    throw new Error('reversal_requires_escalation');
  }

  return Object.freeze({
    ...item,
    state: decision === 'escalate' ? 'open' : 'closed',
    priority: decision === 'escalate' ? 'critical' : item.priority,
    dueAtMs: decision === 'escalate' ? nowMs + SLA_MS.critical : item.dueAtMs,
    decision,
    decidedBy: moderatorId,
    decidedAtMs: nowMs,
    note: typeof note === 'string' ? note.slice(0, 1000) : '',
    /** Denetim: SLA içinde mi karar verildi. */
    withinSla: nowMs <= item.dueAtMs,
  });
}

module.exports = {
  SLA_MS,
  REASON_PRIORITY,
  DECISIONS,
  priorityFor,
  highestPriority,
  makeItem,
  overdue,
  remainingMs,
  compareItems,
  nextBatch,
  slaReport,
  applyDecision,
};
