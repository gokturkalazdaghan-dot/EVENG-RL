#!/usr/bin/env node
import { mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { chromium } from "playwright";
import { checkedOutputPath, checkedUrl } from "./browser-guard.mjs";
import { projectRoot } from "./with-app-env.mjs";
import { computeBrandWarnings } from "./brand-check.mjs";
import {
  authInvariantWarnings,
  buildAuthEnabled,
  compareAuthInvariant,
  probeDevAuthEnabled,
} from "./check-auth-invariant.mjs";
import {
  baselineComparison,
  bodyTextPrefix,
  derivedPaths,
  exitCodeFor,
  normalizeBodyText,
  normalizedBodyTextHash,
  parseSmokeArgs,
} from "./browser-smoke-verdict.mjs";

const args = parseSmokeArgs(process.argv.slice(2), process.env);
if (args.error) {
  console.error(JSON.stringify({ ok: false, error: args.error }, null, 2));
  process.exit(1);
}

const url = checkedUrl(args.url);

/**
 * Ekran görüntülerinin yazılabileceği dizinler.
 *
 * Eskiden yalnızca `/workspace` sabitiydi — o dizin sadece app-builder
 * kum havuzunda var. Başka her yerde (bu depo bir geliştirici makinesine ya
 * da CI'a klonlandığında) betik, koşmadan önce "path must be under
 * /workspace" diye ölüyordu. Yani ürünün kendi tarayıcı testi, ürünün
 * yaşadığı yerlerin çoğunda hiç çalışmıyordu.
 *
 * Depo kökü de kabul ediliyor. Yol kontrolünün asıl işi (`..` ile dizin
 * dışına yazmayı engellemek) aynen duruyor.
 */
const WRITABLE_ROOTS = [projectRoot(), "/workspace"];
const outPng = checkedOutputPath(args.outPng, WRITABLE_ROOTS);
const derived = derivedPaths(outPng);
const mobilePng = checkedOutputPath(derived.mobilePng, WRITABLE_ROOTS);
const outJson = checkedOutputPath(derived.verdictJson, WRITABLE_ROOTS, "verdict JSON");

const MAX_BASELINE_BYTES = 1024 * 1024;
const baselineRequested = Boolean(args.baseline);
let baselinePath = null;
let baselineResolveError = null;
if (baselineRequested) {
  try {
    baselinePath = checkedOutputPath(realpathSync(args.baseline), WRITABLE_ROOTS, "baseline");
  } catch (err) {
    baselineResolveError = err?.code ?? "unresolvable path";
  }
  if (baselinePath === outJson) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error:
            `--baseline ${args.baseline} is this run's own verdict output; ` +
            "pass a distinct output PNG (e.g. app-builder-built.png) so the baseline is not overwritten",
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }
}

const timeoutMs = Number(process.env.BROWSER_SMOKE_TIMEOUT_MS || 45000);

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800, screenshot: outPng },
  { name: "mobile", width: 390, height: 844, screenshot: mobilePng },
];

mkdirSync(dirname(outPng), { recursive: true });

function compareAgainstBaseline(verdict) {
  if (!baselinePath) {
    return {
      divergesFromBaseline: true,
      reasons: [`baseline unreadable: ${baselineResolveError ?? "unresolvable path"}`],
    };
  }
  try {
    if (statSync(baselinePath).size > MAX_BASELINE_BYTES) {
      return { divergesFromBaseline: true, reasons: ["baseline unreadable: too large"] };
    }
    return baselineComparison(verdict, readFileSync(baselinePath, "utf8"));
  } catch (err) {
    return {
      divergesFromBaseline: true,
      reasons: [`baseline unreadable: ${err?.code ?? "read error"}`],
    };
  }
}

let browser = null;
try {
  browser = await chromium.launch({
    // Ortamda ÖNCEDEN KURULU bir Chromium varsa onu kullan.
    //
    // Playwright, paketle birlikte gelen sürüme özel bir tarayıcı derlemesi
    // arar (ör. chromium-1234). CI ve konteyner imajlarında tarayıcı çoğu
    // zaman zaten kurulu ama BAŞKA bir derleme numarasıyla; o zaman bu betik
    // "Executable doesn't exist" ile ölüyor ve indirmeye izin olmayan
    // ortamlarda hiç koşamıyor. Değişken yoksa davranış aynı kalıyor.
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {}),
  });

  const viewports = {};
  for (const vp of VIEWPORTS) {
    const errors = { consoleErrors: [], pageErrors: [] };
    const page = await browser.newPage({
      viewport: { width: vp.width, height: vp.height },
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.pageErrors.push(String(err?.message || err)));
    // `domcontentloaded`, not `networkidle`: Vite keeps an HMR websocket open, so
    // networkidle never settles and would burn the whole timeout.
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    const status = resp?.status() ?? 0;
    await page.waitForTimeout(1000);

    const title = await page.title();
    const hasCanvas = (await page.locator("canvas").count()) > 0;
    const bodyText = await page
      .locator("body")
      .innerText()
      .catch(() => "");
    const horizontalOverflow = await page.evaluate(() => {
      const el = document.documentElement;
      return el.scrollWidth > el.clientWidth + 1;
    });

    /**
     * GÖRÜNÜR ALANIN ÜSTÜNE KAÇMIŞ İÇERİK.
     *
     * `justify-content: center`, çocuğu kapsayıcıdan uzunsa onu İKİ YÖNE
     * birden taşırır. Aşağı taşan kısma kaydırarak ulaşılır; YUKARI taşan
     * kısma ULAŞILAMAZ, çünkü `scrollTop` negatif olamaz.
     *
     * Bu depoda tam olarak bu oldu: Efekt sekmesindeki 342 kart 42 564
     * piksellik bir yığın oluşturuyor ve kategori düğmeleri y = -20793'e
     * düşüyordu. Ekranda yok, tıklanamıyor, kaydırmayla da gelmiyor.
     * `horizontalOverflow` bunu görmüyordu — yatay değil DİKEY ve
     * negatif yöndeydi.
     *
     * Eşik -4px: kenar yumuşatma ve dönüşümler için küçük negatifler
     * normaldir; ekran yüksekliği kadar yukarıda duran bir düğme değildir.
     */
    const offscreenAbove = await page.evaluate(() => {
      const worst = { top: 0, selector: "" };
      for (const el of document.querySelectorAll("button, a, input, [role='button']")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.top < worst.top) {
          worst.top = Math.round(r.top);
          worst.selector = `${el.tagName.toLowerCase()}.${String(el.className || "").split(" ")[0]}`;
        }
      }
      return worst.top < -4 ? worst : null;
    });
    await page.screenshot({ path: vp.screenshot, fullPage: false });
    await page.close();

    viewports[vp.name] = {
      width: vp.width,
      height: vp.height,
      status,
      title,
      hasCanvas,
      bodyTextLen: normalizeBodyText(bodyText).length,
      bodyTextHash: normalizedBodyTextHash(bodyText),
      bodyTextPrefix: bodyTextPrefix(bodyText),
      horizontalOverflow,
      offscreenAbove,
      consoleErrors: errors.consoleErrors,
      pageErrors: errors.pageErrors,
      screenshot: vp.screenshot,
    };
  }

  // Kök AÇIKÇA veriliyor: `computeBrandWarnings` varsayılanı `/workspace`
  // ve o dizin yalnızca app-builder kum havuzunda var. Varsayılana bırakınca
  // marka kontrolü, kartlar depoda DURURKEN "kart yok" diyordu — ölçüldü.
  // Yanlış yere bakan bir kapı, hiç bakmayan bir kapıdan daha kötüdür:
  // düzeltilecek bir şey yokken uyarı üretir ve zamanla susturulur.
  const brandWarnings = computeBrandWarnings({
    hasCanvas: viewports.desktop.hasCanvas,
    workspaceRoot: projectRoot(),
  });
  // Only a dev server answers /__app-env, so smoking the built output reads as
  // indeterminate — report a divergence, never the absence of an observation.
  const authWarnings = authInvariantWarnings(
    compareAuthInvariant({
      devAuthEnabled: await probeDevAuthEnabled(url),
      buildAuthEnabled: buildAuthEnabled(),
    }),
  );
  const verdict = { url, viewports, brandWarnings, authWarnings, verdictFile: outJson };
  if (baselineRequested) {
    const { divergesFromBaseline, reasons } = compareAgainstBaseline(verdict);
    verdict.divergesFromBaseline = divergesFromBaseline;
    verdict.baselineReasons = reasons;
  }

  writeFileSync(outJson, JSON.stringify(verdict, null, 2));
  console.log(JSON.stringify(verdict, null, 2));
  for (const w of [...brandWarnings, ...authWarnings]) console.error(w);
  // Set the code rather than aborting the process so the `finally` browser
  // teardown always runs (agents typically smoke twice per turn; leaking
  // Chromium accumulates across retries).
  process.exitCode = exitCodeFor(viewports);
} catch (err) {
  const failure = { ok: false, url, error: String(err?.message || err) };
  try {
    writeFileSync(outJson, JSON.stringify(failure, null, 2));
  } catch (writeErr) {
    failure.verdictWriteError = String(writeErr?.message || writeErr);
  }
  console.error(JSON.stringify(failure, null, 2));
  process.exitCode = 1;
} finally {
  await browser?.close();
}
