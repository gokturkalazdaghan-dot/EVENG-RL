/**
 * Ban-hammer testleri.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const ban = require('../core_gateway/moderation/banHammer');
const { verifyStaffToken, ROLES } = require('../core_gateway/moderation/routes');
const crypto = require('node:crypto');

const T0 = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

test('otomatik sistem kalıcı ban VEREMEZ', () => {
  // Bir sınıflandırıcının yanlış pozitifi, insan onayı olmadan bir hesabı
  // kalıcı olarak silemez.
  for (const sanction of [ban.SANCTION.BAN, ban.SANCTION.TERMINATE]) {
    assert.throws(
      () => ban.makeSanction({
        userId: 'u1', sanction, reason: 'csam_hash_match', automatic: true, nowMs: T0,
      }),
      /automatic_sanction_exceeds_ceiling/,
    );
  }
});

test('otomatik askı tavanın altında kalır ve moderatörsüz kaydedilir', () => {
  const record = ban.makeSanction({
    userId: 'u1', sanction: ban.SANCTION.SUSPEND, reason: 'nonconsensual_intimate',
    automatic: true, nowMs: T0,
  });
  assert.equal(record.moderatorId, null);
  assert.equal(record.automatic, true);
});

test('manuel yaptırım moderatör kimliği olmadan kaydedilmez', () => {
  assert.throws(
    () => ban.makeSanction({
      userId: 'u1', sanction: ban.SANCTION.BAN, reason: 'harassment', automatic: false, nowMs: T0,
    }),
    /moderator_required/,
  );
});

test('gerekçesiz yaptırım bu API\'den geçmez', () => {
  for (const reason of [undefined, '', '   ', null]) {
    assert.throws(
      () => ban.makeSanction({
        userId: 'u1', sanction: ban.SANCTION.SUSPEND, reason,
        moderatorId: 'm1', automatic: false, nowMs: T0,
      }),
      /reason_required/,
    );
  }
});

test('askıda okuma açık kalır — kullanıcı itiraz edebilmeli', () => {
  const caps = ban.CAPABILITY_MATRIX[ban.SANCTION.SUSPEND];
  assert.equal(caps.canReadFeed, true);
  assert.equal(caps.canSendDm, false);
  assert.equal(caps.canPublishStory, false);
});

test('shadow ban içeriği yalnızca yazarına gösterir', () => {
  const caps = ban.CAPABILITY_MATRIX[ban.SANCTION.SHADOW];
  assert.equal(caps.canPublishStory, true);
  assert.equal(caps.contentVisibleToOthers, false);
  assert.equal(caps.canBeDiscovered, false);
});

test('hiçbir kademede sıralamaya girilemez', () => {
  for (const sanction of Object.values(ban.SANCTION)) {
    assert.equal(ban.CAPABILITY_MATRIX[sanction].canEnterLeaderboard, false);
  }
});

test('yaptırımı olmayan kullanıcı serbesttir (fail-open)', () => {
  // Burada fail-closed olmak, veritabanı hatasında herkesi banlamak demektir.
  const caps = ban.effectiveCapabilities([], T0);
  assert.equal(caps.sanction, null);
  assert.equal(caps.canPublishStory, true);
  assert.equal(caps.canReadFeed, true);
});

test('birden fazla etkin yaptırımda EN AĞIRI geçerlidir', () => {
  const shadow = ban.makeSanction({
    userId: 'u1', sanction: ban.SANCTION.SHADOW, reason: 'spam',
    moderatorId: 'm1', automatic: false, nowMs: T0,
  });
  const banned = ban.makeSanction({
    userId: 'u1', sanction: ban.SANCTION.BAN, reason: 'harassment',
    moderatorId: 'm1', automatic: false, nowMs: T0,
  });

  const caps = ban.effectiveCapabilities([shadow, banned], T0);
  assert.equal(caps.sanction, ban.SANCTION.BAN);
  assert.equal(caps.canReadFeed, false);
});

test('süreli askı dolduğunda kendiliğinden kalkar', () => {
  const record = ban.makeSanction({
    userId: 'u1', sanction: ban.SANCTION.SUSPEND, reason: 'harassment',
    moderatorId: 'm1', automatic: false, durationMs: 7 * DAY, nowMs: T0,
  });

  assert.equal(ban.isActive(record, T0 + DAY), true);
  assert.equal(ban.isActive(record, T0 + 8 * DAY), false);
  assert.equal(ban.effectiveCapabilities([record], T0 + 8 * DAY).sanction, null);
});

test('süresiz ban kendiliğinden kalkmaz', () => {
  const record = ban.makeSanction({
    userId: 'u1', sanction: ban.SANCTION.BAN, reason: 'minor-safety',
    moderatorId: 'm1', automatic: false, nowMs: T0,
  });
  assert.equal(record.expiresAtMs, null);
  assert.equal(ban.isActive(record, T0 + 3650 * DAY), true);
});

test('terminate itiraz edilemez, diğerleri edilebilir', () => {
  const terminate = ban.makeSanction({
    userId: 'u1', sanction: ban.SANCTION.TERMINATE, reason: 'csam_hash_match',
    moderatorId: 'lead-1', automatic: false, nowMs: T0,
  });
  assert.equal(terminate.appealable, false);

  const suspend = ban.makeSanction({
    userId: 'u1', sanction: ban.SANCTION.SUSPEND, reason: 'spam',
    moderatorId: 'm1', automatic: false, nowMs: T0,
  });
  assert.equal(suspend.appealable, true);
});

test('gerekçe → önerilen kademe eşlemesi CSAM için terminate verir', () => {
  assert.equal(ban.suggestedSanction('csam_hash_match'), ban.SANCTION.TERMINATE);
  assert.equal(ban.suggestedSanction('spam'), ban.SANCTION.SHADOW);
  // Bilinmeyen gerekçe en hafife DEĞİL, askıya düşer.
  assert.equal(ban.suggestedSanction('yeni_gerekce'), ban.SANCTION.SUSPEND);
});

// ------------------------------------------------------------- yan etkiler ----

function recordingDeps() {
  const calls = [];
  const record = (name) => async (arg) => calls.push({ name, arg });
  return {
    calls,
    deps: {
      persistSanction: record('persistSanction'),
      revokeSessions: record('revokeSessions'),
      hideUserContent: record('hideUserContent'),
      purgeUserContent: record('purgeUserContent'),
      blockDeviceFingerprints: record('blockDeviceFingerprints'),
      escalateToLegal: record('escalateToLegal'),
      restoreUserContent: record('restoreUserContent'),
      persistLift: record('persistLift'),
      writeAudit: record('writeAudit'),
    },
  };
}

test('yetenekler İÇERİKTEN ÖNCE kapatılır', async () => {
  // Ters sıra, içerik kaldırılırken kullanıcının yenisini yüklemesine izin
  // veren bir pencere açar.
  const { deps, calls } = recordingDeps();
  await ban.applySanction(deps, {
    userId: 'u1', sanction: ban.SANCTION.BAN, reason: 'harassment',
    moderatorId: 'm1', automatic: false, nowMs: T0,
  });

  const names = calls.map((c) => c.name);
  assert.ok(names.indexOf('revokeSessions') < names.indexOf('hideUserContent'));
});

test('terminate içerik siler, cihaz engeller ve yasal hattı tetikler', async () => {
  const { deps, calls } = recordingDeps();
  await ban.applySanction(deps, {
    userId: 'u1', sanction: ban.SANCTION.TERMINATE, reason: 'csam_hash_match',
    evidenceIds: ['c1', 'c2'], moderatorId: 'lead-1', automatic: false, nowMs: T0,
  });

  const names = calls.map((c) => c.name);
  assert.ok(names.includes('purgeUserContent'));
  assert.ok(names.includes('blockDeviceFingerprints'));
  assert.ok(names.includes('escalateToLegal'));
});

test('shadow ban içeriği gizlemez (yazarına görünür kalır)', async () => {
  const { deps, calls } = recordingDeps();
  await ban.applySanction(deps, {
    userId: 'u1', sanction: ban.SANCTION.SHADOW, reason: 'spam',
    moderatorId: 'm1', automatic: false, nowMs: T0,
  });
  // contentVisibleToOthers false olduğu için hideUserContent ÇAĞRILIR.
  assert.ok(calls.some((c) => c.name === 'hideUserContent'));
});

test('her yaptırım denetim kaydı üretir', async () => {
  const { deps, calls } = recordingDeps();
  await ban.applySanction(deps, {
    userId: 'u1', sanction: ban.SANCTION.SUSPEND, reason: 'harassment',
    moderatorId: 'm1', automatic: false, nowMs: T0,
  });

  const audit = calls.find((c) => c.name === 'writeAudit');
  assert.equal(audit.arg.action, 'sanction');
  assert.equal(audit.arg.moderatorId, 'm1');
  assert.equal(audit.arg.reason, 'harassment');
});

test('terminate geri alınamaz', async () => {
  const { deps } = recordingDeps();
  const record = ban.makeSanction({
    userId: 'u1', sanction: ban.SANCTION.TERMINATE, reason: 'csam_hash_match',
    moderatorId: 'lead-1', automatic: false, nowMs: T0,
  });

  await assert.rejects(
    ban.liftSanction(deps, { sanctionId: record.id, record, moderatorId: 'lead-1', nowMs: T0 }),
    /terminate_not_reversible/,
  );
});

test('yaptırım kaldırma moderatörsüz yapılamaz', async () => {
  const { deps } = recordingDeps();
  await assert.rejects(
    ban.liftSanction(deps, { sanctionId: 's1', record: null, moderatorId: null, nowMs: T0 }),
    /moderator_required/,
  );
});

test('abonelik yaptırımdan ETKİLENMEZ', () => {
  // Yetenek matrisinde abonelikle ilgili hiçbir alan yoktur; buradan
  // pro_expiry_date yazmak, ödül motorunda kaldırılan hatanın tekrarı olurdu.
  for (const caps of Object.values(ban.CAPABILITY_MATRIX)) {
    const keys = Object.keys(caps).join(' ').toLowerCase();
    assert.equal(keys.includes('pro'), false);
    assert.equal(keys.includes('subscription'), false);
    assert.equal(keys.includes('entitlement'), false);
  }
});

// ------------------------------------------------------------ personel auth ----

function staffToken(payload, secret) {
  const part = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(part).digest('base64url');
  return `${part}.${sig}`;
}

test('geçerli personel jetonu rol ve kimlik döndürür', () => {
  const token = staffToken({ sub: 'mod-1', role: ROLES.MODERATOR, exp: T0 + 60_000 }, 's3cret');
  assert.deepEqual(verifyStaffToken(token, 's3cret', T0), {
    moderatorId: 'mod-1',
    role: ROLES.MODERATOR,
  });
});

test('imzası bozulmuş jeton reddedilir', () => {
  const token = staffToken({ sub: 'mod-1', role: ROLES.LEAD, exp: T0 + 60_000 }, 's3cret');
  const [part] = token.split('.');
  const forged = `${part}.${crypto.createHmac('sha256', 'yanlis').update(part).digest('base64url')}`;
  assert.equal(verifyStaffToken(forged, 's3cret', T0), null);
});

test('rol yükseltme imzayı bozar', () => {
  // Payload'ı `lead` yapıp aynı imzayı kullanmak işe yaramaz.
  const original = staffToken({ sub: 'mod-1', role: ROLES.REVIEWER, exp: T0 + 60_000 }, 's3cret');
  const [, sig] = original.split('.');
  const tampered = Buffer.from(
    JSON.stringify({ sub: 'mod-1', role: ROLES.LEAD, exp: T0 + 60_000 }),
  ).toString('base64url');
  assert.equal(verifyStaffToken(`${tampered}.${sig}`, 's3cret', T0), null);
});

test('süresi dolmuş jeton reddedilir', () => {
  const token = staffToken({ sub: 'mod-1', role: ROLES.LEAD, exp: T0 - 1 }, 's3cret');
  assert.equal(verifyStaffToken(token, 's3cret', T0), null);
});

test('bilinmeyen rol reddedilir', () => {
  const token = staffToken({ sub: 'mod-1', role: 'superadmin', exp: T0 + 60_000 }, 's3cret');
  assert.equal(verifyStaffToken(token, 's3cret', T0), null);
});

test('biçimsiz jeton çökmez, null döner', () => {
  for (const bad of ['', 'abc', null, undefined, 42, 'a.b.c', '.']) {
    assert.equal(verifyStaffToken(bad, 's3cret', T0), null);
  }
});

// ------------------------------------------------------- süreli askı ----

test('bozuk süre SESSİZCE süresiz askıya dönmez', () => {
  // Bu bir hataydı: Infinity → expiresAtMs = Infinity → `nowMs >= Infinity`
  // hiçbir zaman doğru olmaz → "7 günlük askı" HİÇ BİTMEZ. NaN ve negatif
  // ise koşulu düşürüp expiresAtMs = null yapıyordu — yine süresiz.
  // Üçünde de moderatör süreli askı verdiğini sanıyordu.
  for (const bozuk of [Infinity, -Infinity, NaN, -5, 0, '7 gün', {}, [], true]) {
    assert.throws(
      () => ban.makeSanction({
        userId: 'u1', sanction: ban.SANCTION.SUSPEND, reason: 'harassment',
        moderatorId: 'm1', automatic: false, durationMs: bozuk, nowMs: T0,
      }),
      /invalid_duration/,
      `bozuk süre geçti: ${String(bozuk)}`,
    );
  }
});

test('aşırı uzun süre reddedilir', () => {
  // Bir yazım hatasının yüzyıllık "geçici" askı üretmesini engeller.
  assert.throws(
    () => ban.makeSanction({
      userId: 'u1', sanction: ban.SANCTION.SUSPEND, reason: 'harassment',
      moderatorId: 'm1', automatic: false, durationMs: 400 * DAY, nowMs: T0,
    }),
    /duration_too_long/,
  );
  assert.equal(ban.MAX_SUSPENSION_MS, 365 * DAY);
});

test('süre VERİLMEMESİ süresiz askının meşru yoludur', () => {
  // Bozuk süreyi reddederken kasıtlı süresiz askıyı da kırmamak gerekir.
  for (const yok of [undefined, null]) {
    const record = ban.makeSanction({
      userId: 'u1', sanction: ban.SANCTION.SUSPEND, reason: 'harassment',
      moderatorId: 'm1', automatic: false, durationMs: yok, nowMs: T0,
    });
    assert.equal(record.expiresAtMs, null);
    assert.equal(ban.isActive(record, T0 + 1000 * DAY), true);
  }
});

test('geçerli süre gerçekten sona erer', () => {
  const record = ban.makeSanction({
    userId: 'u1', sanction: ban.SANCTION.SUSPEND, reason: 'harassment',
    moderatorId: 'm1', automatic: false, durationMs: 7 * DAY, nowMs: T0,
  });
  assert.equal(record.expiresAtMs, T0 + 7 * DAY);
  assert.equal(ban.isActive(record, T0 + 6 * DAY), true);
  assert.equal(ban.isActive(record, T0 + 8 * DAY), false);
});

test('kanıt kimlikleri String() ile ZORLANMAZ', () => {
  // `String({})` "[object Object]" üretir ve denetim kaydına anlamsız bir
  // kanıt referansı yazardı.
  const record = ban.makeSanction({
    userId: 'u1', sanction: ban.SANCTION.BAN, reason: 'harassment',
    evidenceIds: ['gecerli-1', {}, [], 42, null, '', 'gecerli-2', 'x'.repeat(129)],
    moderatorId: 'm1', automatic: false, nowMs: T0,
  });
  assert.deepEqual([...record.evidenceIds], ['gecerli-1', 'gecerli-2']);
});
