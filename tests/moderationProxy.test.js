/**
 * Moderasyon kapısı testleri.
 *
 * Bu dosyanın işi üç değişmezi KANITLAMAKTIR (bkz. moderationProxy.js):
 *   A. fail-closed, B. CSAM istisnasız, C. tarama render'dan önce.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { decideIngest, scanAndGate, OUTCOME, PRIORITY } = require('../social_gamification/moderationProxy');

const clean = {
  scannerRan: true,
  knownCsamHashMatch: false,
  signals: { sexualAct: 0.02, apparentMinor: 0.05, graphicViolence: 0.01 },
};

// ------------------------------------------------- Değişmez A: fail-closed ----

test('tarayıcı yanıt vermezse içerik temiz sayılmaz', () => {
  for (const bad of [null, undefined, {}, { scannerRan: false }, { signals: {} }]) {
    const decision = decideIngest(bad, { kind: 'story' });
    assert.equal(decision.outcome, OUTCOME.QUARANTINE, `girdi: ${JSON.stringify(bad)}`);
    assert.notEqual(decision.rating, 'general');
  }
});

test('sayı olmayan skor 1 sayılır (fail-closed), 0 değil', () => {
  const decision = decideIngest(
    { scannerRan: true, signals: { sexualAct: 'çok', apparentMinor: null } },
    { kind: 'story' },
  );
  // Bozuk skorlar 1'e yuvarlandığı için reşit olmayan + cinsel birleşimi oluşur.
  assert.equal(decision.outcome, OUTCOME.BLOCK);
  assert.equal(decision.priority, PRIORITY.CRITICAL);
});

// ------------------------------------------------ Değişmez B: CSAM istisnasız ----

test('bilinen karma eşleşmesi diğer tüm sinyallerden bağımsız bloke eder', () => {
  const decision = decideIngest(
    {
      scannerRan: true,
      knownCsamHashMatch: true,
      // Sınıflandırıcı "tamamen temiz" dese bile karma eşleşmesi kazanır.
      signals: { sexualAct: 0, apparentMinor: 0, swimwear: 1, athleticwear: 1 },
    },
    { kind: 'story' },
  );

  assert.equal(decision.outcome, OUTCOME.BLOCK);
  assert.equal(decision.rating, 'blocked');
  assert.equal(decision.priority, PRIORITY.CRITICAL);
  assert.equal(decision.escalate, true);
  assert.equal(decision.suspendAuthor, true);
  assert.deepEqual(decision.reasons, ['csam_hash_match']);
});

test('reşit olmayan + cinsel sinyal, kıyafet bağlamıyla BASTIRILAMAZ', () => {
  // Mayo bağlamı yetişkin içeriği bastırır (yanlış pozitif koruması) ama
  // reşit olmayan birleşimini ASLA bastırmaz. Bu kapı gevşetilemez.
  const decision = decideIngest(
    {
      scannerRan: true,
      signals: { apparentMinor: 0.4, sexualAct: 0.35, swimwear: 0.95, athleticwear: 0.9 },
    },
    { kind: 'story' },
  );

  assert.equal(decision.outcome, OUTCOME.BLOCK);
  assert.deepEqual(decision.reasons, ['apparent_minor_sexual_content']);
  assert.equal(decision.escalate, true);
});

test('CSAM eşiği yetişkin eşiğinden BELİRGİN ŞEKİLDE düşüktür', () => {
  // Yetişkin sayılmayacak kadar düşük bir cinsel sinyal (0.35 < 0.85),
  // reşit olmayan görünümle birleştiğinde yine de bloke edilir.
  const adultAlone = decideIngest(
    { scannerRan: true, signals: { sexualAct: 0.35, apparentMinor: 0 } },
    { kind: 'story' },
  );
  assert.notEqual(adultAlone.outcome, OUTCOME.BLOCK);

  const withMinor = decideIngest(
    { scannerRan: true, signals: { sexualAct: 0.35, apparentMinor: 0.4 } },
    { kind: 'story' },
  );
  assert.equal(withMinor.outcome, OUTCOME.BLOCK);
});

test('tehlike altındaki reşit olmayan bloke edilir ama yazar otomatik askıya ALINMAZ', () => {
  // İstismar bildiren bir içerik, mağduru cezalandırmamalı.
  const decision = decideIngest(
    { scannerRan: true, signals: { apparentMinor: 0.6, minorInDistress: 0.7 } },
    { kind: 'story' },
  );
  assert.equal(decision.outcome, OUTCOME.BLOCK);
  assert.deepEqual(decision.reasons, ['minor_in_distress']);
  assert.equal(decision.escalate, true);
  assert.equal(decision.suspendAuthor, false);
});

// ---------------------------------------------- yanlış pozitif koruması ----

test('mayo ve spor taytı NSFW DEĞİLDİR', () => {
  const decision = decideIngest(
    { scannerRan: true, signals: { swimwear: 0.9, sexualAct: 0.55, apparentMinor: 0.05 } },
    { kind: 'story' },
  );
  assert.equal(decision.outcome, OUTCOME.APPROVE);
  assert.equal(decision.rating, 'general');
});

test('kıyafet bağlamı 0.85 üstü cinsel sinyali bastırmaz', () => {
  const decision = decideIngest(
    { scannerRan: true, signals: { swimwear: 0.95, sexualAct: 0.9, apparentMinor: 0.05 } },
    { kind: 'story' },
  );
  assert.equal(decision.rating, 'adult');
});

test('temiz içerik onaylanır', () => {
  const decision = decideIngest(clean, { kind: 'dm-attachment' });
  assert.equal(decision.outcome, OUTCOME.APPROVE);
  assert.equal(decision.rating, 'general');
  assert.equal(decision.priority, null);
  assert.deepEqual(decision.reasons, []);
});

test('grafik şiddet bloke, orta düzey şiddet karantina', () => {
  const heavy = decideIngest({ scannerRan: true, signals: { graphicViolence: 0.8 } }, { kind: 'story' });
  assert.equal(heavy.outcome, OUTCOME.BLOCK);
  assert.equal(heavy.priority, PRIORITY.HIGH);
  assert.equal(heavy.escalate, false);

  const mild = decideIngest({ scannerRan: true, signals: { graphicViolence: 0.6 } }, { kind: 'story' });
  assert.equal(mild.outcome, OUTCOME.QUARANTINE);
});

test('rızasız mahrem görüntü bloke edilir ve yazar askıya alınır', () => {
  const decision = decideIngest(
    { scannerRan: true, signals: { nonConsensualIntimate: 0.6 } },
    { kind: 'story' },
  );
  assert.equal(decision.outcome, OUTCOME.BLOCK);
  assert.equal(decision.suspendAuthor, true);
  assert.equal(decision.escalate, true);
});

// ----------------------------------- Değişmez C: tarama render'dan önce ----

function recordingDeps(scanResult, { throwOnScan = false } = {}) {
  const calls = { states: [], queue: [], escalations: [], suspensions: [] };
  return {
    calls,
    deps: {
      scanMedia: async () => {
        if (throwOnScan) throw new Error('provider_down');
        return scanResult;
      },
      setModerationState: async (u) => calls.states.push(u),
      enqueueReview: async (i) => calls.queue.push(i),
      escalate: async (e) => calls.escalations.push(e),
      suspendAccount: async (s) => calls.suspensions.push(s),
    },
  };
}

test('onaylanan içerik approved durumuyla yazılır', async () => {
  const { deps, calls } = recordingDeps(clean);
  const result = await scanAndGate(deps, {
    contentId: 'c1', authorId: 'a1', mediaRef: 'ref', kind: 'story', nowMs: 1000,
  });

  assert.equal(result.state, 'approved');
  assert.equal(calls.states.length, 1);
  assert.equal(calls.states[0].state, 'approved');
  assert.equal(calls.queue.length, 0);
  assert.equal(calls.escalations.length, 0);
});

test('sağlayıcı çökerse istek 500 ile ölmez, içerik karantinaya alınır', async () => {
  const { deps, calls } = recordingDeps(null, { throwOnScan: true });
  const result = await scanAndGate(deps, {
    contentId: 'c2', authorId: 'a2', mediaRef: 'ref', kind: 'story', nowMs: 1000,
  });

  assert.equal(result.state, 'pending');
  assert.equal(calls.states[0].state, 'pending');
  // Karantina insan incelemesi gerektirir; sessizce beklemede kalmaz.
  assert.equal(calls.queue.length, 1);
});

test('CSAM yolunda askıya alma, kuyruk ve eskalasyon birlikte tetiklenir', async () => {
  const { deps, calls } = recordingDeps({
    scannerRan: true, knownCsamHashMatch: true, signals: {},
  });

  const result = await scanAndGate(deps, {
    contentId: 'c3', authorId: 'a3', mediaRef: 'storage://bucket/obj', kind: 'story', nowMs: 5000,
  });

  assert.equal(result.state, 'blocked');
  assert.equal(calls.suspensions.length, 1);
  assert.equal(calls.suspensions[0].automatic, true);
  assert.equal(calls.queue.length, 1);
  assert.equal(calls.queue[0].priority, PRIORITY.CRITICAL);
  assert.equal(calls.escalations.length, 1);
});

test('eskalasyon medyanın kendisini TAŞIMAZ, yalnızca parmak izi', async () => {
  const { deps, calls } = recordingDeps({
    scannerRan: true, knownCsamHashMatch: true, signals: {},
  });
  await scanAndGate(deps, {
    contentId: 'c4', authorId: 'a4', mediaRef: 'storage://bucket/secret-object', kind: 'story', nowMs: 1,
  });

  const event = calls.escalations[0];
  const serialized = JSON.stringify(event);
  assert.equal(serialized.includes('secret-object'), false);
  assert.match(event.mediaFingerprint, /^[0-9a-f]{12}$/);
});

// ------------------------------------------------- sözlük anlaşması ----

test('sunucu YALNIZCA istemcinin tanıdığı dereceleri üretir', () => {
  // İstemcinin `ContentRating` tip birliği tek sözleşmedir. Sunucunun
  // oraya olmayan bir değer yazması (eskiden 'safe' yazıyordu) iki hata
  // üretir: istemcide exhaustive switch varsayılan dala düşer ve
  // fail-open/fail-closed davranışı kazara belirlenir; ayrıca 'safe' bu
  // kod tabanında zaten YAŞ KADEMESİ anlamına gelir.
  const IZINLI = new Set(['general', 'sensitive', 'adult', 'review', 'blocked']);

  const girdiler = [
    null,
    { scannerRan: false },
    { scannerRan: true, knownCsamHashMatch: true, signals: {} },
    { scannerRan: true, signals: {} },
    { scannerRan: true, signals: { apparentMinor: 0.5, sexualAct: 0.5 } },
    { scannerRan: true, signals: { apparentMinor: 0.6, minorInDistress: 0.8 } },
    { scannerRan: true, signals: { nonConsensualIntimate: 0.9 } },
    { scannerRan: true, signals: { graphicViolence: 0.9 } },
    { scannerRan: true, signals: { graphicViolence: 0.6 } },
    { scannerRan: true, signals: { sexualAct: 0.9 } },
    { scannerRan: true, signals: { sexualAct: 0.6 } },
    { scannerRan: true, signals: { swimwear: 0.9, sexualAct: 0.6 } },
  ];

  for (const girdi of girdiler) {
    for (const kind of ['story', 'dm-attachment', 'post', 'template']) {
      const karar = decideIngest(girdi, { kind });
      assert.ok(
        IZINLI.has(karar.rating),
        `bilinmeyen derece "${karar.rating}" — girdi: ${JSON.stringify(girdi)}`,
      );
    }
  }
});
