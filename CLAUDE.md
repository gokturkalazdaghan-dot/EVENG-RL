# EVENGIRL — Claude Code brief

Continue this product. Do not rename it EVEN AI / EVEN BOY. Product name is **EVENGIRL**.

Feminine beauty photo studio + AI generate. Android-first (Play Store), React 19 SPA wrapped in a WebView APK.

Owner intent: store-ready, balanced iPhone-like 9:16 frame, candy-pink neon, Bubu/Dudu mascots. Not cyberpunk, not dark space, not EV/car app.

## Run

```bash
npm install
npm run dev          # Vite, 0.0.0.0:8080
npm run typecheck
npm run test
npm run build
```

Android: `android/` Gradle project, package `com.evenaistudio.app`, WebView loads `android/app/src/main/assets/www/index.html`. Rebuild the WebView bundle after web changes, then assemble release APK.

## Stack

- React 19 + TanStack Router/Start + Zustand (`src/lib/store.ts`)
- Canvas FX in `src/lib/fx.ts` (on-device, identity-preserving)
- Catalog in `src/lib/catalog.ts`
- Optional AI: xAI Imagine (`src/lib/imagine-api.ts`) + HeyGen talking video
- Persistence: localStorage via `store.persist` — no user accounts
- Auth scaffold exists under `src/lib/auth/` but product auth is OFF
- i18n: phone language, English fallback (`src/lib/i18n.ts`)

## Screens (bottom nav)

| Tab | File | User job |
|-----|------|----------|
| Projeler | `projects-screen.tsx` | New project, open, copy, delete |
| Düzenle | `studio-screen.tsx` | Empty canvas + Görsel ekle, filters, brushes, undo/save/redo |
| Efekt | `effects-screen.tsx` | Looks/templates; preview then jump to studio |
| Oluştur | `generate-screen.tsx` | 1–5 selfies → 10 scenes, collage, text-to-image, HeyGen/xAI video 15/30/60s |
| Araçlar | `tools-screen.tsx` | Aesthetic clinic (5 doctor agents) |
| Ayarlar | `settings-screen.tsx` | PRO, feedback, storage, agents, locale |

Removed on purpose (do not restore unless asked): Story, weekly rank/league, Feed tab, age year-picker.

## Hard product rules (do not break)

1. **Preview ≠ save.** Filter/tool/clinic tap writes `draftImage` only. Switching tools replaces the draft. `commitDraft` / Kaydet bakes a version. Undo restores previous version or clears draft.
2. **Chrome is overlay, never baked.** Pink Geri (top-left of PHOTO), Kaydet (top-center), İleri (top-right). `bakeCurrent` / `gatedDownload` use image pixels + design overlays only — never screenshot the DOM.
3. **Identity.** Clinic/studio must edit the user's photo (`data:` URL). Never replace the face with a generated stranger. `runClinic` = local `processChain` on latest user image. Do not re-enable AI img2img for morphs (it swapped identity).
4. **Need a real photo.** Seed portraits are demos. `userProject` / empty canvas: user must add their photo. Seed images must not be treated as the user's face.
5. **Bottom nav is `position: fixed; bottom: 0;`** with `padding-bottom: env(safe-area-inset-bottom)`. Content uses padding-bottom so it is not hidden. Do not put the nav in flex flow. Header uses `padding-top: env(safe-area-inset-top)`.
6. **18+ checkbox only** (`legal-gate.tsx`). No year spinner.
7. **Download is PRO-gated** (`src/lib/download.ts`). Screen capture is blocked (`capture-guard.tsx`) silently — do not tell the user recording is off.
8. **Paywall** first launch if not PRO (`paywall-sheet.tsx`). SKUs: weekly $3.99, monthly $9.99, yearly $49.99. Crystals visual only — no “pink/blue” captions. Purchases go through `src/lib/billing.ts` only; never write `proUntil` directly, and never grant PRO when the Play bridge is absent. `redeemPro` is a **dev-only** unlock behind `import.meta.env.DEV` — it is stripped from production builds (verified against the bundle).
9. **Theme:** dim beige/white background, candy pink buttons, neon glow only on press/active. Not dark, not navy space. App language follows device; UI copy English-simple with TR catalog names OK.
   **Pink is split into two roles** (measured with axe-core): `--pink` `#ff4fa3` is decoration only (glow, borders, icons, marks) and never carries text; `--pink-ink` `#d6156e` is the fill under white text, at 5.01:1 against white. Plain `#ff4fa3` under white text gives 3.04:1 and fails WCAG AA — the 18+ gate button, the first thing every user sees, was failing. Neutrals (`--ink`, `--paper`, `--line`) carry the weight; pink is reserved for the primary action and the active state.
   Run `npm run a11y` (eight screens, axe-core, WCAG 2.2 AA) before shipping UI changes. `browser-smoke.mjs` only loads the landing screen, so it cannot see most of them.
10. **Horizontal rails** for filters/templates (swipe left/right) so the photo stays on screen. Labels + color ribbons under thumbs must stay visible.
11. **Agent dock** (right edge) opens a chooser under the app — does not auto-apply/save. Auto-hides to an edge chevron after ~20s idle.
12. **Warps stay subtle.** `hipsWarp` / `waistWarp` build a `BandWarp` and go through `bandSourceX` in `src/lib/warp.ts`; `sampleWarp` resamples with clamped Catmull-Rom (`sampleBicubic`). Keep k ≈ 0.05–0.16.
    *Correction to the old rule:* the tearing this rule blamed on large k was **not** caused by k. The band had a hard lateral cutoff (`if (|dx| > w*half*1.35) return [x, y]`), so displacement dropped from 43 px to 0 between two neighbouring pixels. Measured, then fixed with a smoothstep window that reaches exactly zero at the edge: worst neighbour-to-neighbour jump went 25.92 px → 0.74 px at identical k. Do not reintroduce a hard cutoff; widen `edge` instead. Covered by `src/lib/warp.test.ts` (22 tests, 12/12 mutations caught).

## Clinic (Araçlar) — treat as aesthetic desk

Doctors in `CLINIC_AGENTS`:

- Dr. NURA Cilt — AI/manual spot brush (`clinicSpot`), blemish, smooth, under-eye, glow
- Dr. CEHRA Dudak — `LIP_FILLERS` shape + amount slider → plump
- Dr. EVEN Saç — `HAIR_STYLES`, `HAIR_CUTS`, `HAIR_COLORS`
- Dr. REIRA Yüz — smile, teeth, lift, eyes big/small/almond/spacing
- Dr. RELYN Beden — hips, waist, hourglass, jaw + amount slider

Tap photo when brush armed. Tools tab body is scrollable (`.app-body.is-tools`).

## Studio chrome / empty canvas

Empty atelier: blank beige canvas, centered neon-white **Görsel ekle** (black text). No stock model on the canvas.

Live photo shows overlay buttons on the image itself (`.studio-chrome` inside `.studio-photo`).

## Generate

- Upload 1–5 faces → `bakeScenes` 10 landscape cards (`SCENE_PACK`) via Imagine, fallback `processSource(..., "backdrop")`
- Locked scenes → paywall
- Pick 2–4 → collage
- Prompt → still (`generateStill`) or video (`startTalking` HeyGen, fallback `generateClip`)
- Durations: 15 / 30 / 60 (HeyGen); xAI clip 10 or 15

Env keys (not in git): `XAI_API_KEY` (Imagine), `HEYGEN_API_KEY`, `BFL_API_KEY` (Flux 2 Pro), `GEMINI_API_KEY` (Nano Banana), `FAL_KEY` (Nano Banana/Flux/Seedream/Kling), `OPENAI_API_KEY` (GPT Image). Image chain: Flux → Nano Banana → fal → GPT Image → Imagine. Video chain: HeyGen → Kling → Imagine Video.

## Key files

```
src/components/app-shell.tsx     shell, splash, nav, sheets
src/components/studio-screen.tsx edit canvas
src/components/tools-screen.tsx  clinic
src/components/generate-screen.tsx
src/components/effects-screen.tsx
src/lib/store.ts                 zustand: draft, clinic, generate, persist
src/lib/fx.ts                    canvas pipeline
src/lib/catalog.ts               looks, clinic, scenes, prices in copy
src/lib/download.ts              PRO gate
src/lib/guard.ts                 MIME/size/sanitize
src/styles.css                   theme, nav, neon, clinic, chrome
android/                         WebView APK
```

## Layout CSS contracts

- `.app-center` uses `justify-content: safe center`, **never plain `center`**. Plain `center` overflows a too-tall child in *both* directions and the top part becomes unreachable — `scrollTop` cannot go negative. Measured: the Looks tab's 342 cards form a 42,564px stack and the category buttons sat at y = -20793, invisible and unclickable. Four tabs were under that rule; only studio/tools/oracle had been rescued with one-off exception classes. Pinned by `scripts/layout-contract.test.mjs`.
- `#app` / `.phone` 9:16, fills the device, not floating in a tablet bezel
- `.nav` `position: fixed; left:0; right:0; bottom:0; z-index: 9999;`
- `.app-body` `padding-bottom` ≥ nav height; `.app-body.is-tools { justify-content: flex-start; overflow-y: auto; }`
- `.studio-chrome` absolute on the photo: space-between, Geri | Kaydet | İleri

## What is still weak (fix these next, in order)

1. ~~Clinic morphs sampling~~ — **done**: bilinear → clamped Catmull-Rom everywhere (`sampleWarp`), and the lateral hard cutoff that was tearing hips/waist is gone (see rule 12).
   `eyeScaleWarp` / `almondWarp` were **measured, not assumed**: their radial `(1 - r²)²` falloff already reaches zero at the ellipse edge, so they never tore — worst neighbour jump 0.38 px at max strength. They keep their inline path on purpose; there is nothing to fix there.
2. Hair style/cut is glaze/color, not a real restyle.
3. Generate/video depends on API keys; always keep on-device fallback. **Fal now has one too** — `readOracle` returned a single line ("Reading is closed right now.") without `XAI_API_KEY`, so coffee, palm and dream were all three dead. `src/lib/oracle-local.ts` reads the actual photo (grounds coverage, largest blob position/shape, open gap; per-band line density and continuity on a palm) and picks the matching clause from `oracle-canon.ts`. It does **not** invent text: an unrecognised dream returns `null` and the screen asks for more detail. `oracle-device.ts` does the canvas→pixels step; server first, device on failure.
4. ~~Play Billing is UI-only~~ — **web side done**, native side pending. It was worse than "UI-only": `purchasePlaySku` wrote `proUntil` straight to localStorage and told the user "Google Play üzerinden açıldı". No token, no BillingClient — nobody could pay and everybody got PRO free. Now routed through `src/lib/billing.ts`: entitlement is derived from real purchase records, PENDING never grants, unacknowledged purchases get acknowledged (Play refunds after 3 days otherwise), and `restorePro()` runs on every launch. Verified end to end: no bridge → no PRO; bridge present → PRO from the purchase record. **Remaining: `EvenBillingBridge.kt` in `android/` — see `docs/BILLING.md`.**
5. WebView `www/index.html` can lag the Vite app — refresh it on each Android build.
6. Some makeup brushes still feel faint; prefer visible-but-natural over no-op.

## Do not

- Do not add Story, Feed, weekly ranking unless the owner asks.
- Do not bake UI chrome into exports.
- Do not auto-commit drafts.
- Do not use seed portraits as the working face.
- Do not introduce purple/cyberpunk/dark-space themes.
- Do not put “telifsiz”, “powered by” on the studio canvas (credit lives only in Settings footer: armanalabs TR).

## Zip / handoff

Unzip → folder `EVENGIRL`. No `node_modules` (run `npm install`).

```bash
cp .env.example .env   # paste XAI_API_KEY and HEYGEN_API_KEY
npm install
```

Also in the zip: `ANDROID.md`, `dist/EVENGIRL.apk`, `dist/EVENGIRL.aab`, `android/app/even-release.jks`.
