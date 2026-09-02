# EVENGIRL Android (Play)

- applicationId: `com.evenaistudio.app`
- versionName: `1.1.0` / versionCode `3`
- minSdk 26, target/compile 34
- WebView: `android/app/src/main/assets/www/index.html`
- Signing: `android/app/even-release.jks` alias `even` (passwords in `android/app/build.gradle`)

## Build

1. `npm install && npm run build`
2. Copy the production web bundle into `android/app/src/main/assets/www/`
3. Open `android/` in Android Studio or:

```bash
cd android
./gradlew assembleRelease bundleRelease
```

Outputs: `app/build/outputs/apk/release/app-release.apk` and `.../bundle/release/app-release.aab`

This zip also contains `dist/EVENGIRL.apk` and `dist/EVENGIRL.aab` from the last signed build.

Play SKUs: `even_pro_weekly` $3.99 · `even_pro_monthly` $9.99 · `even_pro_yearly` $49.99  
Play Billing UI is in `src/lib/play-store.ts` — wire BillingClient before store submit.

## Banuba token

Token **yalnız native** `BuildConfig.BANUBA_TOKEN`. JS bundle’a (`VITE_*`) koyma — WebView’den çıkarılır.

| Yer | |
|---|---|
| Lokal | `android/banuba.properties` (gitignore). Örnek: `android/banuba.properties.example` |
| CI / Play build | env `BANUBA_TOKEN` |
| Çalışma | `EvenApp` → `BanubaSdkManager.initialize(app, token)` |
| Boş token | `hasBanuba()==false`, klinik MediaPipe |

Trial ve production **ayrı token**. MAU kotası aşıldıysa Banuba yeni token keser; APK’yı yeniden imzala.

AAR: `android/app/libs/*.aar` gitignore. Beauty: `assets/effects/Beauty`.


