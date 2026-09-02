/**
 * Moderasyon kuyruğu ve 24 saatlik SLA testleri.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const queue = require('../core_gateway/moderation/queue');

const T0 = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;

function item(overrides = {}) {
  return queue.makeItem({
    contentId: 'c1',
    authorId: 'a1',
    kind: 'story',
    reasons: ['spam'],
    source: 'report',
    createdAtMs: T0,
    ...overrides,
  });
}

test('normal öncelikli kayıt 24 saatlik vade alır', () => {
  const record = item();
  assert.equal(record.priority, 'normal');
  assert.equal(record.dueAtMs - record.createdAtMs, 24 * HOUR);
});

test('kritik gerekçe 1 saatlik vade alır', () => {
  const record = item({ reasons: ['csam_hash_match'] });
  assert.equal(record.priority, 'critical');
  assert.equal(record.dueAtMs - record.createdAtMs, HOUR);
});

test('birden fazla gerekçede EN AĞIR olan belirler', () => {
  // Ortalama almak, kritik bir gerekçeyi normale sulandırırdı.
  const record = item({ reasons: ['spam', 'minor-safety', 'copyright'] });
  assert.equal(record.priority, 'critical');
});

test('bilinmeyen gerekçe normal önceliğe düşer, hata vermez', () => {
  const record = item({ reasons: ['bilinmeyen_yeni_gerekce'] });
  assert.equal(record.priority, 'normal');
  assert.equal(record.dueAtMs - record.createdAtMs, 24 * HOUR);
});

test('vade sabittir, sonradan uzatılamaz', () => {
  const record = item();
  assert.throws(() => {
    record.dueAtMs = T0 + 999 * HOUR;
  }, TypeError);
});

test('kuyruk FIFO DEĞİLDİR: kritik olay eski spam raporunun önüne geçer', () => {
  const oldSpam = item({ contentId: 'eski', reasons: ['spam'], createdAtMs: T0 - 3 * HOUR });
  const newCsam = item({ contentId: 'yeni', reasons: ['csam_hash_match'], createdAtMs: T0 });

  const batch = queue.nextBatch([oldSpam, newCsam], T0);
  assert.equal(batch[0].contentId, 'yeni');
  assert.equal(batch[1].contentId, 'eski');
});

test('aynı öncelikte vadesi yakın olan öne geçer', () => {
  const later = item({ contentId: 'sonra', createdAtMs: T0 + HOUR });
  const sooner = item({ contentId: 'once', createdAtMs: T0 });

  const batch = queue.nextBatch([later, sooner], T0);
  assert.equal(batch[0].contentId, 'once');
});

test('sahiplenilmiş kayıt çalışma listesinde görünmez', () => {
  const claimed = { ...item(), claimedBy: 'mod-1' };
  assert.equal(queue.nextBatch([claimed], T0).length, 0);
});

test('vadesi geçen kayıt işaretlenir', () => {
  const record = item({ reasons: ['csam_hash_match'] });
  assert.equal(queue.overdue(record, T0 + 30 * 60 * 1000), false);
  assert.equal(queue.overdue(record, T0 + 2 * HOUR), true);
  assert.equal(queue.remainingMs(record, T0 + 2 * HOUR) < 0, true);
});

test('SLA raporu ihlali sayar ve sağlıksız olduğunu söyler', () => {
  const items = [
    item({ contentId: 'a', reasons: ['csam_hash_match'] }),
    item({ contentId: 'b', reasons: ['spam'] }),
  ];

  const healthy = queue.slaReport(items, T0 + 30 * 60 * 1000);
  assert.equal(healthy.healthy, true);
  assert.equal(healthy.breached, 0);
  assert.equal(healthy.byPriority.critical, 1);

  const breached = queue.slaReport(items, T0 + 2 * HOUR);
  assert.equal(breached.healthy, false);
  assert.equal(breached.breached, 1);
  assert.equal(breached.breachedCritical, 1);
});

test('kapanmış kayıt SLA raporunu kirletmez', () => {
  const closed = { ...item({ reasons: ['csam_hash_match'] }), state: 'closed' };
  const report = queue.slaReport([closed], T0 + 100 * HOUR);
  assert.equal(report.open, 0);
  assert.equal(report.healthy, true);
});

test('karar SLA içinde mi verildiği denetim için kaydedilir', () => {
  const record = item({ reasons: ['harassment'] }); // high → 6 saat

  const onTime = queue.applyDecision(record, {
    decision: 'uphold', moderatorId: 'mod-1', nowMs: T0 + 2 * HOUR,
  });
  assert.equal(onTime.withinSla, true);
  assert.equal(onTime.state, 'closed');

  const late = queue.applyDecision(record, {
    decision: 'uphold', moderatorId: 'mod-1', nowMs: T0 + 10 * HOUR,
  });
  assert.equal(late.withinSla, false);
});

test('escalate kararı kaydı KAPATMAZ ve vadeyi kritiğe çeker', () => {
  const record = item({ reasons: ['spam'] });
  const escalated = queue.applyDecision(record, {
    decision: 'escalate', moderatorId: 'mod-1', nowMs: T0 + HOUR,
  });

  assert.equal(escalated.state, 'open');
  assert.equal(escalated.priority, 'critical');
  assert.equal(escalated.dueAtMs, T0 + HOUR + HOUR);
});

test('doğrulanmış karma eşleşmesi tek moderatörle geri ALINAMAZ', () => {
  const record = item({ reasons: ['csam_hash_match'] });
  assert.throws(
    () => queue.applyDecision(record, { decision: 'reverse', moderatorId: 'mod-1', nowMs: T0 }),
    /reversal_requires_escalation/,
  );
  // Ama eskalasyon her zaman mümkündür — çıkmaz sokak yok.
  assert.doesNotThrow(() =>
    queue.applyDecision(record, { decision: 'escalate', moderatorId: 'mod-1', nowMs: T0 }),
  );
});

test('diğer kritik gerekçelerde yanlış pozitif geri alınabilir', () => {
  // Otomatik blokajın yanlış pozitif üretebileceğini kabul etmeyen bir sistem,
  // moderatörleri karar almaktan caydırır.
  const record = item({ reasons: ['apparent_minor_sexual_content'] });
  const reversed = queue.applyDecision(record, {
    decision: 'reverse', moderatorId: 'mod-1', nowMs: T0,
  });
  assert.equal(reversed.decision, 'reverse');
  assert.equal(reversed.state, 'closed');
});

test('geçersiz karar reddedilir', () => {
  assert.throws(
    () => queue.applyDecision(item(), { decision: 'sil-gitsin', moderatorId: 'm', nowMs: T0 }),
    /invalid_decision/,
  );
});

test('süre dolduğunda içerik kendiliğinden yayına DÖNMEZ', () => {
  // Vadesi geçmiş kayıt hâlâ açık ve hâlâ karantinadadır; yalnızca uyarı üretir.
  const record = item({ reasons: ['scanner_unavailable'] });
  const afterSla = T0 + 48 * HOUR;
  assert.equal(record.state, 'open');
  assert.equal(queue.overdue(record, afterSla), true);
  assert.equal(queue.nextBatch([record], afterSla)[0].overdue, true);
});
