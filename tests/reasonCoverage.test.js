/**
 * Gerekçe → SLA önceliği KAPSAM testi.
 *
 * NEDEN VAR
 * `queue.priorityFor` bilinmeyen bir gerekçeyi sessizce `normal` sayar —
 * yani 24 saat. Bu, bilinmeyen gerekçeler için makul bir varsayılan; ama
 * BİRİ YENİ BİR GEREKÇE EKLEYİP öncelik haritasına yazmayı unutursa,
 * CSAM sınıfı bir olay da 24 saat bekler. Hiçbir test bunu yakalamıyordu.
 *
 * Bu dosya kapsamı zorunlu kılar: kuyruğa düşebilen her gerekçenin AÇIK bir
 * önceliği olmalı ve güvenlik gerekçeleri asla `normal` olmamalı.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { decideIngest } = require('../social_gamification/moderationProxy');
const { REPORT_REASONS } = require('../social_gamification/social');
const queue = require('../core_gateway/moderation/queue');

/**
 * Proxy'nin üretebildiği gerekçeleri DAVRANIŞTAN türetir.
 *
 * Sabit bir liste yazmak, listenin kendisinin eskimesine açıktır: biri yeni
 * bir dal ekler, listeyi güncellemez ve test yine yeşil kalır. Kararı
 * gerçekten çalıştırmak bu tuzağı kapatır.
 */
function proxyEnqueueableReasons() {
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
    { scannerRan: true, signals: { apparentMinor: 0.36, sexualAct: 0.31 } },
    { scannerRan: true, signals: { sexualAct: 'bozuk' } },
  ];

  const reasons = new Set();
  for (const girdi of girdiler) {
    for (const kind of ['story', 'dm-attachment', 'post', 'template']) {
      const karar = decideIngest(girdi, { kind });
      // Yalnızca KUYRUĞA DÜŞEN kararlar önemli; onaylananın önceliği yok.
      if (karar.priority !== null) {
        karar.reasons.forEach((r) => reasons.add(r));
      }
    }
  }
  return [...reasons];
}

test('proxy kuyruğa düşürdüğü her gerekçe için AÇIK önceliğe sahiptir', () => {
  const reasons = proxyEnqueueableReasons();
  assert.ok(reasons.length > 0, 'hiç gerekçe türetilemedi — test kendini doğrulamıyor');

  for (const reason of reasons) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(queue.REASON_PRIORITY, reason),
      `"${reason}" öncelik haritasında YOK — sessizce 24 saate düşer`,
    );
  }
});

test('her rapor gerekçesi için AÇIK öncelik tanımlıdır', () => {
  for (const reason of REPORT_REASONS) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(queue.REASON_PRIORITY, reason),
      `rapor gerekçesi "${reason}" öncelik haritasında YOK`,
    );
  }
});

/**
 * Güvenlik gerekçeleri — bunların SLA'sı asla 24 saat olamaz.
 *
 * Liste bilerek AÇIK yazılmıştır: türetilseydi, gerekçe yeniden
 * adlandırıldığında test sessizce boşalır ve hiçbir şeyi korumaz.
 */
const GUVENLIK_GEREKCELERI = [
  'csam_hash_match',
  'apparent_minor_sexual_content',
  'minor_in_distress',
  'nonconsensual_intimate',
  'minor-safety',
  'nonconsensual-intimate',
];

test('güvenlik gerekçeleri KRİTİK önceliktedir (1 saat)', () => {
  for (const reason of GUVENLIK_GEREKCELERI) {
    assert.equal(
      queue.priorityFor(reason),
      'critical',
      `"${reason}" kritik değil — 1 saatlik SLA'yı kaybediyor`,
    );
  }
});

test('güvenlik gerekçeleri hâlâ TANIMLI (yeniden adlandırma sessiz kalmasın)', () => {
  // Bir gerekçe yeniden adlandırılırsa üstteki test yine geçerdi — çünkü
  // bilinmeyen gerekçe 'normal' döner ve assert 'critical' beklediği için
  // düşer. Ama haritadan tamamen silinirse de aynı şey olur; bu test
  // hangi durumun geçerli olduğunu ayırır.
  for (const reason of GUVENLIK_GEREKCELERI) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(queue.REASON_PRIORITY, reason),
      `"${reason}" haritadan silinmiş`,
    );
  }
});

test('kritik gerekçelerin SLA süresi gerçekten 1 saattir', () => {
  // Öncelik adı doğru olsa bile süre yanlış olabilir; ikisi ayrı şeydir.
  assert.equal(queue.SLA_MS.critical, 60 * 60 * 1000);
  assert.ok(queue.SLA_MS.critical < queue.SLA_MS.high);
  assert.ok(queue.SLA_MS.high < queue.SLA_MS.normal);
  assert.equal(queue.SLA_MS.normal, 24 * 60 * 60 * 1000);
});

test('güvenlik gerekçeleri yaptırım haritasında da en az askı üretir', () => {
  const ban = require('../core_gateway/moderation/banHammer');
  for (const reason of GUVENLIK_GEREKCELERI) {
    const sanction = ban.suggestedSanction(reason);
    assert.ok(
      ban.SEVERITY[sanction] >= ban.SEVERITY[ban.SANCTION.SUSPEND],
      `"${reason}" için önerilen yaptırım çok hafif: ${sanction}`,
    );
  }
});
