/**
 * Yetenek sözlüğü kapsam testi.
 *
 * İstemcinin `ModelRegistry.Capability` tip birliği tek sözleşmedir.
 * Sunucunun `KNOWN_CAPABILITIES` listesi ondan geri kalırsa, o yeteneği
 * kullanan HER şablon `unknown_capability` ile reddedilir.
 *
 * Bu gerçekten olmuştu: sunucu listesi ürünün iki amiral modunu
 * (Manuel & Botox Stüdyo, Even Girl Generate) hiç tanımıyordu — sekiz
 * yetenek eksikti. Şablon pazarında bu adımları içeren hiçbir şablon
 * yayınlanamıyordu.
 *
 * TS DOSYASI OKUNUYOR, LİSTE KOPYALANMIYOR
 * Buraya elle bir liste yazmak, listenin kendisinin eskimesine açıktır.
 * `ReportSurfaces.test.ts` ile aynı yaklaşım: kaynak dosya okunur.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const { KNOWN_CAPABILITIES } = require('../social_gamification/social');

const REGISTRY = join(__dirname, '..', 'client_mobile', 'src', 'ai', 'engine', 'ModelRegistry.ts');

/**
 * İstemcinin `Capability` tip birliğini kaynak dosyadan çıkarır.
 *
 * `export type Capability =` ile ilk `;` arasındaki tüm `'değer'` alınır.
 */
function clientCapabilities() {
  const source = readFileSync(REGISTRY, 'utf8');
  const start = source.indexOf('export type Capability =');
  assert.notEqual(start, -1, 'Capability tipi bulunamadı — dosya taşınmış olabilir');

  const end = source.indexOf(';', start);
  assert.notEqual(end, -1, 'Capability tipinin sonu bulunamadı');

  const block = source.slice(start, end);
  const values = [...block.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]);

  assert.ok(values.length > 10, `yalnızca ${values.length} yetenek ayrıştırıldı — ayrıştırıcı bozuk`);
  return values;
}

/**
 * Bilerek sunucuda KABUL EDİLMEYEN yetenekler.
 *
 * Her giriş bir gerekçe taşır; gerekçesiz muafiyet, kapıyı zamanla boşaltır.
 */
const KASITLI_HARIC = new Map([
  [
    'nsfw-classify',
    'Moderasyon sınıflandırıcısı kullanıcı aracı değildir. Şablon adımı ' +
      'olarak kabul edilseydi, kullanıcı üretimi bir içerik moderasyon ' +
      'modelini keyfî girdiyle çalıştırabilirdi.',
  ],
]);

test('istemcinin her yeteneği sunucuda tanınır (kasıtlı hariç tutulanlar dışında)', () => {
  const eksik = clientCapabilities()
    .filter((cap) => !KASITLI_HARIC.has(cap))
    .filter((cap) => !KNOWN_CAPABILITIES.has(cap));

  assert.deepEqual(
    eksik,
    [],
    `sunucuda tanınmayan yetenekler — bu adımları içeren şablonlar reddedilir: ${eksik.join(', ')}`,
  );
});

test('sunucu istemcide OLMAYAN bir yetenek kabul etmez', () => {
  // Ters yön de önemli: sunucunun tanıdığı ama istemcinin üretemediği bir
  // yetenek, ya ölü koddur ya da istemci tipinden yanlışlıkla düşmüştür.
  const client = new Set(clientCapabilities());
  const fazla = [...KNOWN_CAPABILITIES].filter((cap) => !client.has(cap));

  assert.deepEqual(fazla, [], `istemcide karşılığı olmayan yetenekler: ${fazla.join(', ')}`);
});

test('nsfw-classify şablon adımı olarak KABUL EDİLMEZ', () => {
  // Muafiyetin yönü kritik: hariç tutulan yetenek gerçekten dışarıda mı.
  assert.equal(KNOWN_CAPABILITIES.has('nsfw-classify'), false);
});

test('her muafiyet bir gerekçe taşır', () => {
  for (const [cap, gerekce] of KASITLI_HARIC) {
    assert.ok(
      typeof gerekce === 'string' && gerekce.length > 40,
      `"${cap}" muafiyeti gerekçesiz — gerekçesiz muafiyet kapıyı zamanla boşaltır`,
    );
  }
});

test('amiral özellikler sunucuda tanınır', () => {
  // Bu isimler AÇIK yazılmıştır: türetilseydi, ürünün iki ana modu
  // istemci tipinden düştüğünde test sessizce boşalırdı.
  const AMIRAL = [
    // Manuel & Botox Stüdyo (ücretsiz, sınırsız)
    'manual-reshape',
    'botox-jawline',
    'skin-smooth',
    'blemish-eraser',
    // Even Girl Generate (PRO)
    'even-generate',
    'light-sync',
    'cinematic-bokeh',
    'pore-preserve',
  ];

  for (const cap of AMIRAL) {
    assert.ok(KNOWN_CAPABILITIES.has(cap), `amiral özellik "${cap}" sunucuda tanınmıyor`);
  }
});
