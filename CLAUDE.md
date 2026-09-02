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
8. **Paywall** first launch if not PRO (`paywall-sheet.tsx`). SKUs: weekly $3.99, monthly $9.99, yearly $49.99. Crystals visual only — no “pink/blue” captions.
9. **Theme:** dim beige/white background, candy pink buttons, neon glow only on press/active. Not dark, not navy space. App language follows device; UI copy English-simple with TR catalog names OK.
10. **Horizontal rails** for filters/templates (swipe left/right) so the photo stays on screen. Labels + color ribbons under thumbs must stay visible.
11. **Agent dock** (right edge) opens a chooser under the app — does not auto-apply/save. Auto-hides to an edge chevron after ~20s idle.
12. **Warps stay subtle.** `hipsWarp` / `waistWarp` in `fx.ts` use bilinear `sampleWarp` with small k (≈0.05–0.16). Large displacement tears holes — never raise k blindly.

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

- `#app` / `.phone` 9:16, fills the device, not floating in a tablet bezel
- `.nav` `position: fixed; left:0; right:0; bottom:0; z-index: 9999;`
- `.app-body` `padding-bottom` ≥ nav height; `.app-body.is-tools { justify-content: flex-start; overflow-y: auto; }`
- `.studio-chrome` absolute on the photo: space-between, Geri | Kaydet | İleri

## What is still weak (fix these next, in order)

1. Clinic morphs (hips/waist/eyes) are local warps — quality is not Remini/Facetune. Improve sampling, never identity-swap via AI.
2. Hair style/cut is glaze/color, not a real restyle.
3. Generate/video depends on API keys; always keep on-device fallback.
4. Play Billing is UI-only (`play-store.ts`) — wire real Play Billing before store submit.
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
