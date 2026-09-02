/**
 * Uygulama giriş noktası.
 *
 * SIRA KRİTİK:
 *   1. gesture-handler  — kaydırmalı navigasyonun native tarafını kurar,
 *      her şeyden önce import edilmeli.
 *   2. Çökme raporlayıcı — React ağacı monte edilmeden ÖNCE kurulur ki
 *      modül yükleme ve native köprü kurulumu sırasındaki erken hatalar da
 *      yakalanabilsin. Sonraya bırakılırsa açılışta çöken bir sürüm hakkında
 *      hiçbir veri alınamaz — yani en kritik hata sınıfı görünmez kalır.
 *   3. Uygulama kaydı.
 */
import 'react-native-gesture-handler';
import { AppRegistry } from 'react-native';

import App from './src/App';
import { installCrashReporter } from './src/telemetry/AnonymousCrashReporter';
import { name as appName, version as appVersion } from './app.json';

installCrashReporter({ appVersion });

AppRegistry.registerComponent(appName, () => App);
