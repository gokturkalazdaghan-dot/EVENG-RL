#!/usr/bin/env node
/**
 * WCAG 2.2 AA denetimi — canlı uygulamanın SEKİZ EKRANINDA.
 *
 * NEDEN SEKİZ EKRAN
 * Deponun mevcut tarayıcı testi (browser-smoke.mjs) yalnızca açılış
 * ekranını yüklüyor. Ölçüldü: kritik bulguların hepsi diğer sekmelerdeydi
 * ve smoke testi hiçbirini göremezdi.
 *
 * İLK KOŞUDA BULUNANLAR (plugin87/ux-ui-agent-skills kiti · axe-core)
 *   label (kritik) ×7 ekran  — fotoğraf yükleme girdilerinin ve
 *     kaydırıcıların erişilebilir adı yoktu. Ekran okuyucu kullanan biri
 *     uygulamanın EN TEMEL kontrolünü tanıyamıyordu.
 *   color-contrast (ciddi)  — herkesin gördüğü İLK düğme (18+ kapısı)
 *     3.04:1 veriyordu; gereken 4.5:1.
 *
 * Düzeltildikten sonra sekiz ekranda da sıfır ihlal.
 *
 * KULLANIM
 *   node scripts/a11y-audit.mjs            # dev sunucu 8080'de açıkken
 *   PLAYWRIGHT_CHROMIUM_EXECUTABLE=... node scripts/a11y-audit.mjs
 *
 * Çıkış kodu: ihlal varsa 1.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const axeSrc = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
let total = 0;

const b = await chromium.launch({
  // Ortamda önceden kurulu tarayıcı varsa onu kullan (CI imajları).
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {}),
});
const page = await b.newPage({ viewport: { width: 390, height: 844 } });
await page.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2000);

async function audit(label) {
  await page.addScriptTag({ content: axeSrc });
  const r = await page.evaluate(async () =>
    await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"] } }));
  const rows = r.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length,
    help: v.help, sample: (v.nodes[0]?.html || "").replace(/\s+/g," ").slice(0, 90) }));
  console.log(`\n═══ ${label} ═══  ihlal: ${rows.length}`);
  for (const v of rows.sort((a,c)=>c.n-a.n))
    console.log(`  [${String(v.impact).padEnd(8)}] ${v.id.padEnd(28)} ×${String(v.n).padStart(3)}  ${v.help}\n      ${v.sample}`);
  total += rows.length;
  return rows;
}

await audit("18+ KAPISI");
await page.locator("button", { hasText: /18\+/i }).first().click();
await page.waitForTimeout(1500);
await page.evaluate(() => { for (const k of Object.keys(localStorage)) { try { const v=JSON.parse(localStorage.getItem(k)); if (v&&"proUntil" in v){v.proUntil=Date.now()+864e5;localStorage.setItem(k,JSON.stringify(v));} } catch{} } });
await page.reload({ waitUntil: "domcontentloaded" }); await page.waitForTimeout(2000);
await audit("PROJELER");
for (const tab of ["Edit","Looks","Create","Seer","Tools","Settings"]) {
  await page.locator("button", { hasText: new RegExp(`^${tab}$`) }).last().click();
  await page.waitForTimeout(1400);
  await audit(tab.toUpperCase());
}
await b.close();

if (total > 0) {
  console.error(`\nWCAG 2.2 AA: ${total} ihlal. Ayrıntılar yukarıda.`);
  process.exitCode = 1;
} else {
  console.log("\nWCAG 2.2 AA: sekiz ekranda da ihlal yok.");
}
