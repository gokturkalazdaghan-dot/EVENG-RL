/**
 * Klinik warp çekirdeği.
 *
 * Buradaki hatalar SESSİZDİR: uygulama çökmez, fotoğraf bozulur ve
 * kullanıcı bunu kendi fotoğrafına yorar. Testlerin çoğu bu yüzden
 * SÜREKLİLİK ölçüyor — yer değiştirme alanında bir sıçrama, ekranda
 * dümdüz bir yırtık demek.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bandDisplacement,
  bandFalloff,
  bandSourceX,
  lateralFalloff,
  sampleBicubic,
  sampleBilinear,
  smoothstep,
  type BandWarp,
} from "./warp.ts";

const W = 1000;
const H = 1400;

/** Eski `hipsWarp` ile aynı geometri — karşılaştırma anlamlı olsun diye. */
const HIPS: BandWarp = {
  center: 0.76,
  halfHeight: 0.08,
  axis: 0.5,
  core: 0.2,
  edge: 0.27, // 0.2 * 1.35 — eski sert kesmenin durduğu yer
  amount: 0.16,
  guardTop: 0.4,
};

test("smoothstep uçlarda tam 0 ve tam 1", () => {
  assert.equal(smoothstep(0), 0);
  assert.equal(smoothstep(1), 1);
  assert.equal(smoothstep(-5), 0);
  assert.equal(smoothstep(9), 1);
  assert.equal(smoothstep(0.5), 0.5);
  assert.equal(smoothstep(Number.NaN), 0);
});

test("smoothstep tek yönlü artar", () => {
  let prev = -1;
  for (let u = 0; u <= 1.0001; u += 0.02) {
    const v = smoothstep(u);
    assert.ok(v >= prev, `u=${u} geriye gitti`);
    prev = v;
  }
});

/**
 * ARTMASI YETMEZ — TÜREVİ DE UÇLARDA SIFIRA İNMELİ.
 *
 * Mutasyonla ölçüldü: `smoothstep`i düz doğrusal rampaya (`return u`)
 * çevirdiğimde yukarıdaki tekdüzelik testi ve süreklilik testlerinin
 * TAMAMI yeşil kaldı. Yani o testler smoothstep'in var olma sebebini hiç
 * ölçmüyordu.
 *
 * Fark şurada: doğrusal rampanın eğimi çekirdek sınırında 0'dan bir anda
 * tam değerine sıçrar. Yer değiştirme sürekli olsa bile TÜREVİ süreklisiz
 * olur — fotoğrafta yırtık değil ama KIRIŞIK bırakır; gerilen bölgenin
 * kenarında keskin bir dirsek görünür. smoothstep iki uçta da eğimi
 * sıfırlar.
 */
test("smoothstep uçlarda DÜZLEŞİR — doğrusal rampa değil", () => {
  const slope = (u: number) => (smoothstep(u + 0.005) - smoothstep(u - 0.005)) / 0.01;
  const mid = slope(0.5);
  // Doğrusalda eğim her yerde aynıdır (oran 1.0). smoothstep'te uçlarda
  // ortanın çok altında olmalı.
  assert.ok(slope(0.02) / mid < 0.25, `başlangıç eğimi çok dik: ${slope(0.02) / mid}`);
  assert.ok(slope(0.98) / mid < 0.25, `bitiş eğimi çok dik: ${slope(0.98) / mid}`);
  assert.ok(mid > 1, "orta eğim beklenenden düşük");
});

test("yanal pencerenin TÜREVİ çekirdek sınırında sıçramaz", () => {
  const core = 200;
  const edge = 270;
  const slope = (a: number) => lateralFalloff(a + 0.5, core, edge) - lateralFalloff(a - 0.5, core, edge);
  const steepest = Math.abs(slope((core + edge) / 2));
  // Sınırın hemen dışındaki eğim, en dik noktanın çok altında olmalı.
  // Doğrusal pencerede bu oran 1.0 olur ve test kırılır.
  assert.ok(
    Math.abs(slope(core + 3)) / steepest < 0.4,
    `çekirdek sınırında eğim sıçraması: ${Math.abs(slope(core + 3)) / steepest}`,
  );
  assert.ok(
    Math.abs(slope(edge - 3)) / steepest < 0.4,
    `dış kenarda eğim sıçraması: ${Math.abs(slope(edge - 3)) / steepest}`,
  );
});

test("yanal pencere çekirdekte tam güç, kenarda TAM SIFIR", () => {
  assert.equal(lateralFalloff(0, 200, 270), 1);
  assert.equal(lateralFalloff(200, 200, 270), 1);
  assert.equal(lateralFalloff(270, 200, 270), 0);
  assert.equal(lateralFalloff(400, 200, 270), 0);
  // Simetrik: sol ve sağ aynı
  assert.equal(lateralFalloff(-235, 200, 270), lateralFalloff(235, 200, 270));
});

test("yanal pencere bozuk aralıkta güvenli", () => {
  assert.equal(lateralFalloff(10, 200, 200), 0); // edge <= core
  assert.equal(lateralFalloff(Number.NaN, 200, 270), 0);
});

test("dikey pencere merkezde 1, kesme noktasında TAM SIFIR", () => {
  assert.equal(bandFalloff(0.76, 0.76, 0.08), 1);
  // Eski kod burada 0.077'de kesiyordu — artık tam sıfır.
  assert.equal(bandFalloff(0.76 + 0.08 * 1.6, 0.76, 0.08), 0);
  assert.equal(bandFalloff(0.76 - 0.08 * 1.6, 0.76, 0.08), 0);
  assert.equal(bandFalloff(0.2, 0.76, 0.08), 0);
  assert.equal(bandFalloff(0.5, 0.5, 0), 0); // sıfır yükseklik
});

/**
 * ASIL TEST — YIRTIK.
 *
 * Eski kodda yer değiştirme, bandın yatay sınırında bir anda sıfıra
 * düşüyordu. Ölçüm: 1000px genişlik, half=0.2, k=0.16, bant merkezinde
 * sınırda 43 PİKSELLİK sıçrama. Bu test o sıçramayı yasaklıyor.
 */
test("yatay sınırda yer değiştirme SIÇRAMAZ", () => {
  const y = H * HIPS.center; // bandın tam merkezi — en güçlü yer
  let worst = 0;
  let worstAt = 0;
  for (let x = 1; x < W; x++) {
    const jump = Math.abs(
      bandDisplacement(x, y, W, H, HIPS) - bandDisplacement(x - 1, y, W, H, HIPS),
    );
    if (jump > worst) {
      worst = jump;
      worstAt = x;
    }
  }
  // Komşu iki piksel arasında 1 pikselden fazla fark, görünür bir kırıktır.
  assert.ok(
    worst < 1,
    `x=${worstAt} civarında ${worst.toFixed(2)}px sıçrama — yırtık geri geldi`,
  );
});

test("dikey sınırda yer değiştirme SIÇRAMAZ", () => {
  const x = W * HIPS.axis + W * HIPS.core * 0.5; // etkinin güçlü olduğu sütun
  let worst = 0;
  for (let y = 1; y < H; y++) {
    const jump = Math.abs(
      bandDisplacement(x, y, W, H, HIPS) - bandDisplacement(x, y - 1, W, H, HIPS),
    );
    if (jump > worst) worst = jump;
  }
  assert.ok(worst < 1, `${worst.toFixed(2)}px dikey sıçrama`);
});

test("etki gerçekten uygulanıyor — sıfır değil", () => {
  // Süreklilik testleri, alan HER YERDE sıfır olsaydı da geçerdi.
  // Bu test o kaçışı kapatıyor.
  const y = H * HIPS.center;
  const x = W * HIPS.axis + W * HIPS.core * 0.9;
  const d = Math.abs(bandDisplacement(x, y, W, H, HIPS));
  assert.ok(d > 10, `merkezde yer değiştirme yalnızca ${d.toFixed(1)}px — etki yok`);
});

/**
 * ETKİ SINIRLI OLMALI — SÜREKLİ OLMASI YETMEZ.
 *
 * Mutasyonla ölçüldü: yanal pencereyi tamamen kaldırıp `lateral = 1`
 * yaptığımda süreklilik testleri YEŞİL kaldı. Mantıklı: kesme yoksa
 * sıçrama da olmaz. Ama o halde warp GÖRÜNTÜNÜN TÜM GENİŞLİĞİNE yayılır —
 * kalça bandı arka planı, kolları, çerçevenin kenarını da gerer.
 * Kullanıcı bunu "kalçamı düzelttim" diye yapar, arka plandaki kapı
 * çerçevesi eğrilir.
 *
 * Bu test etkiye bir SINIR koyuyor: dış kenarın ötesinde tam sıfır.
 */
test("etki gövde bandının DIŞINA taşmaz", () => {
  const y = H * HIPS.center; // en güçlü satır
  const cx = W * HIPS.axis;
  const outer = W * HIPS.edge;

  // Dış kenarda ve ötesinde hiç kayma yok.
  for (const dx of [outer, outer + 1, outer + 50, cx - 1]) {
    assert.equal(
      bandSourceX(cx + dx, y, W, H, HIPS),
      cx + dx,
      `dx=${dx} bant dışında kaydı`,
    );
    assert.equal(bandSourceX(cx - dx, y, W, H, HIPS), cx - dx);
  }
  // Görüntü kenarları hiç oynamamalı.
  assert.equal(bandSourceX(0, y, W, H, HIPS), 0);
  assert.equal(bandSourceX(W - 1, y, W, H, HIPS), W - 1);
});

test("miktar sıfırsa hiçbir piksel oynamaz", () => {
  const spec = { ...HIPS, amount: 0 };
  for (const y of [0, H * 0.5, H * 0.76, H - 1]) {
    for (const x of [0, W * 0.3, W * 0.5, W - 1]) {
      assert.equal(bandSourceX(x, y, W, H, spec), x);
    }
  }
});

test("yüz bölgesine (guardTop üstü) dokunulmaz", () => {
  // GUARD, BANDIN İÇİNDEN geçmeli — yoksa test hiçbir şey ölçmez.
  //
  // Mutasyonla ölçüldü: guardTop kontrolünü tamamen kaldırdığımda bu test
  // guardTop=0.5 ile YEŞİL kalıyordu. Sebebi basit: bant zaten t<0.63'te
  // sıfır, yani guard'ın koruduğu bölgede korunacak bir şey yoktu.
  // guardTop, bant merkezinin (0.76) ÜSTÜNE alınıyor ki guard olmadan
  // kesinlikle kayacak pikselleri kapsasın.
  const spec = { ...HIPS, guardTop: 0.8 };
  const x = W * spec.axis + W * spec.core * 0.9;

  // Guard olmadan bu satır kesinlikle kayardı — önce onu kanıtla.
  const unguarded = bandDisplacement(x, H * HIPS.center, W, H, { ...spec, guardTop: 0 });
  assert.ok(Math.abs(unguarded) > 10, "test kurgusu bozuk: guard'sız da kaymıyor");

  // Guard varken kaymamalı.
  for (let y = 0; y < H * 0.8; y += 13) {
    assert.equal(bandSourceX(x, y, W, H, spec), x, `y=${y} guard'ı aştı`);
  }
});

test("işaret yön değiştirir, büyüklük simetrik", () => {
  const y = H * HIPS.center;
  const x = W * 0.5 + 100;
  const grow = bandDisplacement(x, y, W, H, { ...HIPS, amount: 0.16 });
  const shrink = bandDisplacement(x, y, W, H, { ...HIPS, amount: -0.16 });
  assert.ok(grow * shrink < 0, "iki yön aynı işarette");
  assert.ok(Math.abs(Math.abs(grow) - Math.abs(shrink)) < 1e-9);
});

test("bozuk boyutlarda kimlik döner", () => {
  assert.equal(bandSourceX(5, 5, 0, H, HIPS), 5);
  assert.equal(bandSourceX(5, 5, W, 0, HIPS), 5);
});

// ─── ÖRNEKLEME ────────────────────────────────────────────────────────

/** w×h RGBA; `f(x,y)` her kanala aynı değeri verir. */
function grid(w: number, h: number, f: (x: number, y: number) => number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = f(x, y);
      const i = (y * w + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
  return d;
}

test("iki örnekleyici de kafes noktalarında kaynağı aynen verir", () => {
  const d = grid(8, 8, (x, y) => (x * 31 + y * 17) % 256);
  for (const y of [0, 3, 7]) {
    for (const x of [0, 5, 7]) {
      const expected = (x * 31 + y * 17) % 256;
      assert.equal(sampleBilinear(d, 8, 8, x, y, 0), expected);
      assert.ok(Math.abs(sampleBicubic(d, 8, 8, x, y, 0) - expected) < 1e-6);
    }
  }
});

test("düz doğrusal rampada bikübik doğrusalı korur", () => {
  // f(x) = 10x doğrusal; her iki örnekleyici de tam değeri vermeli.
  const d = grid(10, 4, (x) => 10 * x);
  for (const sx of [1.5, 2.25, 6.75]) {
    assert.ok(Math.abs(sampleBilinear(d, 10, 4, sx, 1, 0) - 10 * sx) < 1e-6);
    assert.ok(Math.abs(sampleBicubic(d, 10, 4, sx, 1, 0) - 10 * sx) < 1e-6);
  }
});

test("bikübik keskin kenarı bilineerden DAHA KESKİN geçirir — YATAY", () => {
  // Sol yarı 0, sağ yarı 255 — kirpik/saç kenarının modeli.
  const d = grid(10, 8, (x) => (x < 5 ? 0 : 255));
  const bl = sampleBilinear(d, 10, 8, 4.75, 1, 0);
  const bc = sampleBicubic(d, 10, 8, 4.75, 1, 0);
  assert.ok(bc > bl, `bikübik ${bc.toFixed(1)} bilineer ${bl.toFixed(1)}`);
});

/**
 * DİKEY EKSEN AYRI ÖLÇÜLÜYOR.
 *
 * Mutasyonla ölçüldü: bikübiğin yalnızca DİKEY geçişini bilineere
 * çevirdiğimde yukarıdaki yatay test YEŞİL kaldı — çünkü tam sayı bir y
 * satırında (sy=1) dikey interpolasyon hiç devreye girmiyor. Tek eksende
 * ölçmek, diğer ekseni gözden kaçırıyordu.
 */
test("bikübik keskin kenarı bilineerden DAHA KESKİN geçirir — DİKEY", () => {
  // Üst yarı 0, alt yarı 255 — yatay bir kenar.
  const d = grid(8, 10, (_x: number, y: number) => (y < 5 ? 0 : 255));
  const bl = sampleBilinear(d, 8, 10, 3, 4.75, 0);
  const bc = sampleBicubic(d, 8, 10, 3, 4.75, 0);
  assert.ok(bc > bl, `bikübik ${bc.toFixed(1)} bilineer ${bl.toFixed(1)}`);
});


test("bikübik HALE YAPMAZ — komşuluğa kırpılı", () => {
  // Kırpma olmasa Catmull-Rom bu kenarda 0'ın altına / 255'in üstüne taşar
  // ve koyu kirpiğin yanında açık bir hale bırakırdı.
  const d = grid(12, 4, (x) => (x < 6 ? 20 : 240));
  for (let sx = 0; sx <= 11; sx += 0.05) {
    const v = sampleBicubic(d, 12, 4, sx, 1, 0);
    assert.ok(v >= 20 - 1e-9 && v <= 240 + 1e-9, `sx=${sx} → ${v} (aralık dışı)`);
  }
});

test("örnekleme kenar dışında kırpar, tabloyu taşmaz", () => {
  const d = grid(6, 6, () => 128);
  for (const [sx, sy] of [[-5, -5], [10, 10], [0, 5.99], [5.99, 0]] as const) {
    assert.equal(sampleBilinear(d, 6, 6, sx, sy, 0), 128);
    assert.equal(sampleBicubic(d, 6, 6, sx, sy, 0), 128);
  }
});

test("düz alanda iki örnekleyici de düz kalır", () => {
  const d = grid(8, 8, () => 77);
  for (const sx of [0.5, 3.3, 6.9]) {
    assert.equal(sampleBilinear(d, 8, 8, sx, 4.2, 0), 77);
    assert.equal(sampleBicubic(d, 8, 8, sx, 4.2, 0), 77);
  }
});
