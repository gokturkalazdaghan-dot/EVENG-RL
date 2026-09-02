# EVENGIRL

On-device beauty studio + Kahin (coffee / palm / dream).  
Package `com.evenaistudio.app`. 18+ checkbox (no age spinner). No account.  
Photos stay on device unless the user hits **Create** (optional xAI / HeyGen / Flux).

Read **`CLAUDE.md`** before changing product behavior. Android notes: **`ANDROID.md`**.

Host: [armanalabs.com](https://armanalabs.com)  
GitHub: [gokturkalazdaghan-dot/EVENG-RL](https://github.com/gokturkalazdaghan-dot/EVENG-RL)

---

## What it does

| Tab | Role |
|---|---|
| Projeler | New photo or blank canvas |
| Düzenle | Studio canvas, undo / redo / save |
| Efekt | Looks and filters (draft until Kaydet) |
| Oluştur | 10 scenes from 1–5 photos + video (15 / 30 / 60s) |
| Fal | Kahin: 3 cup angles, palm, dream. PRO. Delayed reveal |
| Araçlar | Clinic: skin, lips, hair, face, body. Magic brush |
| Ayarlar | Legal PDFs, feedback mail, POWERED BY ARMANALABS |

- Draft overlay until **Kaydet**. Geri / İleri sit on the photo, not baked into downloads.
- PRO: weekly **$3.99** · monthly **$9.99** · yearly **$49.99**. Download gated until PRO.
- Theme: cream + candy-pink. Device language, English fallback.
- Bottom nav glued to the phone; content sits between notch and nav (`100svh` + safe-area).
- Keyboard open: nav hides, dream composer lifts.

---

## Run

```bash
cp .env.example .env   # fill XAI_API_KEY / HEYGEN_API_KEY
npm install
npm run dev            # 0.0.0.0:8080
npm run typecheck
npm run test
npm run build
```

Android WebView shell: `android/`. Rebuild `app/src/main/assets/www` after web changes. Banuba token only in `android/banuba.properties` (never `VITE_*`).

---

## Layout

```
src/                 React (TanStack Start)
  components/        screens + Kahin + clinic
  lib/               store, oracle, imagine, clinic-vision, shield
public/
  media/seer/        kahin stills
  legal/             KVKK PDFs
  mediapipe/         Face Landmarker (clinic, lazy)
android/             Play Store WebView + Banuba hook
scripts/             preview / env / legal PDFs
CLAUDE.md            product rules
ANDROID.md           Play / Gradle
.env.example         key names only
vercel.json          deploy
```

---

## Keys (server only)

| Env | Used for |
|---|---|
| `XAI_API_KEY` | Grok fal + image fallback |
| `HEYGEN_API_KEY` | Talking / video |
| `BANUBA_TOKEN` | Native clinic (android/banuba.properties) |
| Optional | BFL / Gemini / Fal / OpenAI stills (see `src/lib/imagine-api.ts`) |

Never commit `.env` or `banuba.properties`.

---

## Fal (Kahin)

1. Three cup angles (üst / kulp / karşı) or one palm photo, or a dream note.
2. PRO. Wait: dream 1 min · coffee / palm 3 min. Notification when ready.
3. Interpretation: Grok JSON, sources only at the bottom. Not medical / legal / fate.
4. Cup photos live in RAM (`fal-hold`), not `sessionStorage` (iPhone crash).

---

## Security

- `src/lib/shield.server.ts` — IP rate limit + bot UA gate
- `src/lib/timed.ts` — fetch abort 45–60s (no infinite skeleton)
- `src/lib/guard.ts` — MIME / size ingest
- Legal PDFs: `public/legal/`
- Feedback: `gokturkalazdaghan@gmail.com`

---

POWERED BY ARMANALABS
