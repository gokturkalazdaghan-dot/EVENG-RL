/**
 * 3B LUT renk motoru.
 *
 * Renk hataları SESSİZDİR: kod çöker değil, fotoğraf yanlış çıkar.
 * Kullanıcı bunu filtreye değil kendi fotoğrafına yorar ve uygulamayı
 * "renkleri bozuyor" diye bırakır. Bu yüzden burada ayrıştırıcının
 * REDDETME yolları, interpolasyonun ARA değerleri ve kafesin EKSEN
 * SIRASI ayrı ayrı ölçülüyor.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  applyLut,
  blend,
  identityLut,
  parseCube,
  type CubeLut,
  type Rgb,
} from '@/editor/color/Lut';

/** Testte okunabilir olsun diye: 2³ kafesin sekiz satırı. */
function cubeText(entries: readonly string[], header = 'LUT_3D_SIZE 2'): string {
  return [header, ...entries].join('\n');
}

const IDENTITY_2: readonly string[] = [
  '0 0 0',
  '1 0 0',
  '0 1 0',
  '1 1 0',
  '0 0 1',
  '1 0 1',
  '0 1 1',
  '1 1 1',
];

function parsed(text: string): CubeLut {
  const result = parseCube(text);
  if (!result.ok) throw new Error(`ayrıştırma beklenmedik şekilde başarısız: ${result.reason}`);
  return result.lut;
}

function expectClose(actual: Rgb, expected: Rgb, precision = 5): void {
  expect(actual.r).toBeCloseTo(expected.r, precision);
  expect(actual.g).toBeCloseTo(expected.g, precision);
  expect(actual.b).toBeCloseTo(expected.b, precision);
}

describe('parseCube — reddetme yolları', () => {
  it('boş metni reddeder', () => {
    expect(parseCube('')).toEqual({ ok: false, reason: 'empty' });
    expect(parseCube('   \n\n  ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('yalnızca yorumdan oluşan dosyayı boş sayar', () => {
    expect(parseCube('# sadece yorum\n# ikinci satır')).toEqual({
      ok: false,
      reason: 'missing-size',
    });
  });

  it('LUT_1D_SIZE dosyasını 3B sanmak yerine açıkça reddeder', () => {
    const result = parseCube('LUT_1D_SIZE 2\n0 0 0\n1 1 1');
    expect(result).toEqual({ ok: false, reason: 'invalid-size', line: 1 });
  });

  it('boyut satırı yoksa reddeder', () => {
    expect(parseCube(IDENTITY_2.join('\n'))).toEqual({ ok: false, reason: 'missing-size' });
  });

  it('kabul edilemez boyutları reddeder', () => {
    // 1 = tek nokta, interpolasyon imkânsız.
    expect(parseCube(cubeText(['0 0 0'], 'LUT_3D_SIZE 1'))).toMatchObject({
      ok: false,
      reason: 'invalid-size',
    });
    // Kesirli boyut, kafes indeksleme matematiğini bozar.
    expect(parseCube(cubeText(IDENTITY_2, 'LUT_3D_SIZE 2.5'))).toMatchObject({
      ok: false,
      reason: 'invalid-size',
    });
    // 257³ ≈ 17 milyon nokta — bellek patlaması.
    expect(parseCube(cubeText(IDENTITY_2, 'LUT_3D_SIZE 257'))).toMatchObject({
      ok: false,
      reason: 'invalid-size',
    });
    // Sayı olmayan boyut: NaN "eksik" değil GEÇERSİZ sayılır — boyut satırı
    // dosyada VAR, okunamıyor. Ayrım hata mesajının doğruluğu için önemli.
    expect(parseCube(cubeText(IDENTITY_2, 'LUT_3D_SIZE abc'))).toMatchObject({
      ok: false,
      reason: 'invalid-size',
    });
  });

  it('eksik satırlı dosyayı kalan veriyle uygulamaz', () => {
    const truncated = IDENTITY_2.slice(0, 7);
    expect(parseCube(cubeText(truncated))).toEqual({
      ok: false,
      reason: 'entry-count-mismatch',
    });
  });

  it('fazladan satırlı dosyayı da reddeder', () => {
    expect(parseCube(cubeText([...IDENTITY_2, '0.5 0.5 0.5']))).toEqual({
      ok: false,
      reason: 'entry-count-mismatch',
    });
  });

  it('sayı olmayan veri satırını satır numarasıyla bildirir', () => {
    const broken = [...IDENTITY_2];
    broken[2] = '0 sarı 0';
    const result = parseCube(cubeText(broken));
    // 1. satır başlık, veri 2'den başlar → bozuk satır 4.
    expect(result).toEqual({ ok: false, reason: 'bad-entry', line: 4 });
  });

  it('eksik bileşenli veri satırını reddeder', () => {
    const broken = [...IDENTITY_2];
    broken[0] = '0 0';
    expect(parseCube(cubeText(broken))).toMatchObject({ ok: false, reason: 'bad-entry' });
  });

  it('ters ya da sıfır genişlikte alanı reddeder (sıfıra bölme)', () => {
    const inverted = ['DOMAIN_MIN 1 1 1', 'DOMAIN_MAX 0 0 0', ...IDENTITY_2];
    expect(parseCube(cubeText(inverted))).toEqual({ ok: false, reason: 'invalid-domain' });

    const zeroWidth = ['DOMAIN_MIN 0 0 0', 'DOMAIN_MAX 0 1 1', ...IDENTITY_2];
    expect(parseCube(cubeText(zeroWidth))).toEqual({ ok: false, reason: 'invalid-domain' });
  });

  it('bozuk DOMAIN satırını satır numarasıyla reddeder', () => {
    const result = parseCube(cubeText(['DOMAIN_MAX 1 1', ...IDENTITY_2]));
    expect(result).toEqual({ ok: false, reason: 'invalid-domain', line: 2 });
  });
});

describe('parseCube — kabul edilen dosyalar', () => {
  it('başlığı tırnaklardan arındırır', () => {
    expect(parsed(cubeText(['TITLE "Kodak Portra"', ...IDENTITY_2])).title).toBe('Kodak Portra');
  });

  it('başlık yoksa varsayılan ad kullanır', () => {
    expect(parsed(cubeText(IDENTITY_2)).title).toBe('Untitled');
  });

  it('anahtar sözcükleri büyük/küçük harften bağımsız okur', () => {
    const lut = parsed(cubeText(['title "kucuk"', ...IDENTITY_2], 'lut_3d_size 2'));
    expect(lut.size).toBe(2);
    expect(lut.title).toBe('kucuk');
  });

  it('satır ortasındaki yorumu ve CRLF satır sonlarını atlar', () => {
    const text = ['LUT_3D_SIZE 2 # boyut', ...IDENTITY_2].join('\r\n') + '\r\n# son\r\n';
    const lut = parsed(text);
    expect(lut.size).toBe(2);
    expect(lut.table).toHaveLength(24);
  });

  it('varsayılan alanı 0..1 kabul eder', () => {
    const lut = parsed(cubeText(IDENTITY_2));
    expect(lut.domainMin).toEqual({ r: 0, g: 0, b: 0 });
    expect(lut.domainMax).toEqual({ r: 1, g: 1, b: 1 });
  });
});

describe('applyLut — kafes düzeni', () => {
  it('R en hızlı değişen eksendir (.cube standardı)', () => {
    // Yalnızca (r=1, g=0, b=0) noktası işaretli. Eksen sırası ters olsaydı
    // bu işaret mavi ucunda görünürdü.
    const marked = ['0 0 0', '1 0 0', '0 0 0', '0 0 0', '0 0 0', '0 0 0', '0 0 0', '0 0 0'];
    const lut = parsed(cubeText(marked));

    expectClose(applyLut(lut, { r: 1, g: 0, b: 0 }), { r: 1, g: 0, b: 0 });
    expectClose(applyLut(lut, { r: 0, g: 0, b: 1 }), { r: 0, g: 0, b: 0 });
    expectClose(applyLut(lut, { r: 0, g: 1, b: 0 }), { r: 0, g: 0, b: 0 });
  });

  it('kimlik kafesi rengi değiştirmez — köşeler', () => {
    const lut = parsed(cubeText(IDENTITY_2));
    for (const color of [
      { r: 0, g: 0, b: 0 },
      { r: 1, g: 1, b: 1 },
      { r: 1, g: 0, b: 0 },
      { r: 0, g: 1, b: 1 },
    ]) {
      expectClose(applyLut(lut, color), color);
    }
  });

  it('kimlik kafesi ara değerleri de korur — 17³ ve 33³', () => {
    for (const size of [17, 33]) {
      const lut = identityLut(size);
      for (const v of [0.05, 0.2, 0.333, 0.5, 0.618, 0.9, 0.99]) {
        expectClose(applyLut(lut, { r: v, g: v, b: v }), { r: v, g: v, b: v }, 4);
      }
    }
  });
});

describe('applyLut — trilineer interpolasyon', () => {
  it('ara değerleri gerçekten karıştırır (nearest bant üretirdi)', () => {
    const lut = parsed(cubeText(IDENTITY_2));
    // En yakın noktaya yuvarlansaydı sonuç 0 ya da 1 olurdu.
    expectClose(applyLut(lut, { r: 0.25, g: 0.25, b: 0.25 }), { r: 0.25, g: 0.25, b: 0.25 });
    expectClose(applyLut(lut, { r: 0.75, g: 0.1, b: 0.4 }), { r: 0.75, g: 0.1, b: 0.4 });
  });

  it('sekiz komşunun tamamını ağırlıklandırır', () => {
    // Yalnızca (1,1,1) köşesi 1; merkezdeki renk 8 komşunun ortalaması → 1/8.
    const cornerOnly = ['0 0 0', '0 0 0', '0 0 0', '0 0 0', '0 0 0', '0 0 0', '0 0 0', '1 1 1'];
    const lut = parsed(cubeText(cornerOnly));
    expectClose(applyLut(lut, { r: 0.5, g: 0.5, b: 0.5 }), { r: 0.125, g: 0.125, b: 0.125 });
  });

  it('tek eksende hareket yalnızca o eksenin ağırlığını değiştirir', () => {
    const cornerOnly = ['0 0 0', '0 0 0', '0 0 0', '0 0 0', '0 0 0', '0 0 0', '0 0 0', '1 1 1'];
    const lut = parsed(cubeText(cornerOnly));
    // g=b=1 sabit, r kayıyor → sonuç doğrudan r ile orantılı olmalı.
    expectClose(applyLut(lut, { r: 0.25, g: 1, b: 1 }), { r: 0.25, g: 0.25, b: 0.25 });
    expectClose(applyLut(lut, { r: 1, g: 0.25, b: 1 }), { r: 0.25, g: 0.25, b: 0.25 });
    expectClose(applyLut(lut, { r: 1, g: 1, b: 0.25 }), { r: 0.25, g: 0.25, b: 0.25 });
  });

  it('ters kafes rengi doğru çevirir', () => {
    const inverted = ['1 1 1', '0 1 1', '1 0 1', '0 0 1', '1 1 0', '0 1 0', '1 0 0', '0 0 0'];
    const lut = parsed(cubeText(inverted));
    expectClose(applyLut(lut, { r: 0.2, g: 0.6, b: 0.9 }), { r: 0.8, g: 0.4, b: 0.1 });
  });
});

describe('applyLut — sınır davranışı', () => {
  it('alan dışı değerleri kırpar, sarmalamaz', () => {
    const lut = identityLut(17);
    // Aşırı pozlanmış piksel (>1) beyaz kalmalı; sarmalasaydı koyulaşırdı.
    expectClose(applyLut(lut, { r: 4, g: 2, b: 1.5 }), { r: 1, g: 1, b: 1 });
    // Negatif değer siyaha kırpılır.
    expectClose(applyLut(lut, { r: -3, g: -0.1, b: 0 }), { r: 0, g: 0, b: 0 });
  });

  it('tam beyaz kafesin son noktasında siyaha düşmez', () => {
    for (const size of [2, 17, 33]) {
      expectClose(applyLut(identityLut(size), { r: 1, g: 1, b: 1 }), { r: 1, g: 1, b: 1 });
    }
  });

  it('NaN girdi NaN renk üretmez', () => {
    const lut = identityLut(17);
    const out = applyLut(lut, { r: Number.NaN, g: 0.5, b: Number.NaN });
    expect(Number.isFinite(out.r)).toBe(true);
    expect(Number.isFinite(out.g)).toBe(true);
    expect(Number.isFinite(out.b)).toBe(true);
    expect(out.r).toBe(0);
  });

  it('özel alan (domain) girdiyi doğru ölçekler', () => {
    // 0..255 alanında tanımlı kimlik kafesi.
    const scaled = ['DOMAIN_MIN 0 0 0', 'DOMAIN_MAX 255 255 255', ...IDENTITY_2];
    const lut = parsed(cubeText(scaled));
    expectClose(applyLut(lut, { r: 255, g: 0, b: 128 }), { r: 1, g: 0, b: 128 / 255 });
    // 0..1 sanılsaydı 255 ile 128 aynı (kırpılmış) sonucu verirdi.
    expect(applyLut(lut, { r: 128, g: 0, b: 0 }).r).toBeLessThan(1);
  });
});

describe('blend — filtre şiddeti', () => {
  const original: Rgb = { r: 0, g: 0, b: 0 };
  const graded: Rgb = { r: 1, g: 0.5, b: 0.25 };

  it('0 özgün rengi, 1 işlenmiş rengi verir', () => {
    expectClose(blend(original, graded, 0), original);
    expectClose(blend(original, graded, 1), graded);
  });

  it('aradaki değerlerde doğrusal karışır', () => {
    expectClose(blend(original, graded, 0.5), { r: 0.5, g: 0.25, b: 0.125 });
  });

  it('1 üstünü kırpar — extrapolasyon doygunluğu patlatırdı', () => {
    expectClose(blend(original, graded, 3), graded);
  });

  it('negatif şiddeti kırpar', () => {
    expectClose(blend(original, graded, -2), original);
  });

  it('sayı olmayan şiddette tam filtreye düşer', () => {
    expectClose(blend(original, graded, Number.NaN), graded);
    expectClose(blend(original, graded, Number.POSITIVE_INFINITY), graded);
  });
});

describe('identityLut', () => {
  it('doğru uzunlukta kafes üretir', () => {
    expect(identityLut(2).table).toHaveLength(2 * 2 * 2 * 3);
    expect(identityLut(33).table).toHaveLength(33 * 33 * 33 * 3);
  });

  it('ürettiği kafes ayrıştırıcının kabul ettiği kafesle aynıdır', () => {
    const fromText = parsed(cubeText(IDENTITY_2));
    const built = identityLut(2);
    expect(Array.from(built.table)).toEqual(Array.from(fromText.table));
  });
});

/**
 * ÜST KOMŞU KIRPMASI — bu davranışı mutasyon testi YAKALAYAMIYOR, sebebi:
 *
 * `applyLut` içinde `x1 = x0 < last ? x0 + 1 : last` satırını kaldırıp
 * `x1 = x0 + 1` yaptığımda YUKARIDAKİ 34 TESTİN HİÇBİRİ KIRMIZIYA DÖNMEDİ.
 * Ölçtüm, tahmin etmedim.
 *
 * Sebep matematiksel: `x` en fazla `last` olabildiği için `x0 === last`
 * olduğu tek durumda `fx = x - x0` tam olarak 0'dır. Kırpma olmadan
 * okunan yanlış hücre sonuca 0 ağırlıkla girer — çıktı aynı kalır.
 *
 * Yani kırpma bir DAVRANIŞ koruması değil, BELLEK koruması: kafesin
 * dışını ya da bir sonraki satırını hiç okumamayı garanti ediyor. Doğru
 * sonucun "sıfırla çarpılan çöp veriye" dayanmasını istemiyorum; ileride
 * biri interpolasyon ağırlıklarını değiştirdiğinde o çöp görünür hale
 * gelirdi.
 *
 * Test edilemeyen bir şeyi test ediyormuş gibi yapmak yerine kaynaktan
 * doğruluyorum. Bu testin tek işi: kırpma satırı silinirse haber vermek.
 */
describe('applyLut — kaynak seviyesinde değişmez', () => {
  it('üst komşu son noktaya kırpılıyor', () => {
    const source = readFileSync(
      resolve(__dirname, '../src/editor/color/Lut.ts'),
      'utf8',
    );
    for (const axis of ['x', 'y', 'z']) {
      expect(source).toContain(`const ${axis}1 = ${axis}0 < last ? ${axis}0 + 1 : last;`);
    }
  });
});
