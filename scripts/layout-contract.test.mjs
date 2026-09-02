/**
 * Yerleşim sözleşmesi — CSS kaynağından doğrulanır.
 *
 * NEDEN KAYNAKTAN, TARAYICIDAN DEĞİL
 * `browser-smoke.mjs`e "görünür alanın üstüne kaçmış tıklanabilir eleman"
 * kontrolü eklendi (offscreenAbove) ve doğru çalışıyor — ama ÖLÇTÜM:
 * o betik yalnızca AÇILIŞ EKRANINI yüklüyor. Hata Efekt sekmesinde,
 * üstelik bir fotoğraf yüklendikten sonra ortaya çıkıyordu; smoke testi
 * oraya hiç gitmediği için bu örneği YAKALAYAMAZDI.
 *
 * Bu yüzden sözleşme burada, kaynak seviyesinde sabitleniyor. Tek işi:
 * kural geri alınırsa haber vermek.
 *
 * ── SABİTLENEN HATA ──────────────────────────────────────────────────
 * `.app-center { justify-content: center }` taşan çocuğu İKİ YÖNE birden
 * taşırır. Aşağı taşan kısma kaydırarak ulaşılır; YUKARI taşan kısma
 * ULAŞILAMAZ, çünkü `scrollTop` negatif olamaz.
 *
 * Ölçüldü: Efekt sekmesinde 342 kart 42 564 piksellik bir yığın oluşturuyor
 * ve kategori düğmeleri y = -20793'e düşüyordu. Görünmüyor, tıklanamıyor,
 * kaydırmayla gelmiyor. Efekt, Oluştur, Projeler ve Ayarlar sekmelerinin
 * dördü de bu kuralın altındaydı; yalnızca is-studio / is-tools / is-oracle
 * tek tek istisna eklenerek kurtarılmıştı — yani sorun o üç ekranda değil,
 * kuralın kendisindeydi ve her yeni ekranda tekrar çıkardı.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(join(ROOT, "src/styles.css"), "utf8");

/**
 * SADECE `.app-center` kuralının gövdesi (son tanım kazanır).
 *
 * Seçici TEK BAŞINA olmalı. İlk yazdığım regex torun seçicileri de
 * yakalıyordu (`.app-body.is-tools .app-center {`) ve "son blok" olarak
 * onu alıp `justify-content: stretch` görüyordu — yani test, düzeltme
 * yerindeyken bile kırmızıydı. Kendi kapımın yanlış yere bakması,
 * bakmamasından kötü: düzeltilecek bir şey yokken alarm verir.
 */
function appCenterBlocks() {
  const blocks = [];
  // Seçicinin önü satır başı, `,` veya `}` olmalı — boşluk OLMAMALI.
  const re = /(?:^|[},])\s*\.app-center\s*\{([^}]*)\}/gm;
  let m;
  while ((m = re.exec(css)) !== null) blocks.push(m[1]);
  return blocks;
}

test("styles.css okunabildi ve .app-center tanımlı", () => {
  assert.ok(css.length > 1000, "styles.css beklenenden kısa");
  assert.ok(appCenterBlocks().length > 0, ".app-center kuralı bulunamadı");
});

test(".app-center taşan içeriği ortalamaz — safe center şart", () => {
  const blocks = appCenterBlocks();
  const last = blocks[blocks.length - 1] ?? "";
  assert.match(
    last,
    /justify-content:\s*safe\s+center/,
    "`.app-center` düz `center` kullanıyor: taşan içeriğin üst kısmına " +
      "kaydırılarak ULAŞILAMAZ. `justify-content: safe center` gerekli.",
  );
});

test("safe center düz center'dan SONRA gelir (geri düşüş sırası)", () => {
  // Anlamayan tarayıcı ikinci bildirimi yok sayar; ters sırada yazılırsa
  // modern tarayıcı da düz `center`a düşer ve düzeltme etkisiz kalır.
  const last = appCenterBlocks().at(-1) ?? "";
  const plain = last.search(/justify-content:\s*center/);
  const safe = last.search(/justify-content:\s*safe\s+center/);
  assert.ok(plain >= 0, "geri düşüş için düz `center` bildirimi de olmalı");
  assert.ok(safe > plain, "`safe center`, düz `center`dan sonra gelmeli");
});

test("alt menü sabit ve en üstte (CLAUDE.md yerleşim sözleşmesi)", () => {
  const nav = /\.app-nav\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  assert.match(nav, /position:\s*fixed/, "alt menü fixed olmalı");
  assert.match(nav, /bottom:\s*0/, "alt menü bottom: 0 olmalı");
});
