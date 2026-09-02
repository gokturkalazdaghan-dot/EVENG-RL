/**
 * Açılış sırası sözleşmesi — KAYNAK ÜZERİNDEN.
 *
 * NEDEN KAYNAK OKUNUYOR
 * Bu testler `node` ortamında çalışıyor ve React ağacı monte etmiyor. Ama
 * açılış sırasındaki hatalar tam da monte edilmeden önceki pencerede olur:
 * i18n hazır değilken çeviri istemek, güvenlik kapısı geçmeden ağır iş
 * başlatmak. Kaynağı okumak, bu pencereyi bileşen testi olmadan
 * denetlemenin dürüst yoludur; kopyalanmış bir liste yerine dosyanın
 * kendisi ölçülüyor.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = join(__dirname, '..', 'src');
const read = (relative: string): string => readFileSync(join(src, relative), 'utf8');

describe('Güvenlik kapısı ekranları çevirisiz olmalı', () => {
  // i18n/index.ts ilke 1: tek istisna güvenlik kilidi ekranıdır — çeviri
  // yüklemesi başarısız olsa bile görünmelidir.
  const screens = ['ui/screens/SecurityCheckScreen.tsx', 'ui/screens/SecurityBlockedScreen.tsx'];

  it.each(screens)('%s useTranslation kullanmaz', (screen) => {
    const source = read(screen);
    expect(source).not.toContain('useTranslation');
    expect(source).not.toContain("from 'react-i18next'");
  });
});

describe('App i18n hazır olmadan çeviri gösteren ağacı monte etmez', () => {
  const app = read('App.tsx');

  it('i18next initialized olayını dinler', () => {
    // Ayrı bir bayrak tutup senkron tutmayı unutmak yerine i18next'in kendi
    // olayı dinleniyor.
    expect(app).toContain("i18n.on('initialized'");
    expect(app).toContain("i18n.off('initialized'");
  });

  it('hazır değilken erken döner', () => {
    expect(app).toContain('if (!i18nReady) return');
  });

  it('erken dönüş, kapı kontrolünden SONRA gelir', () => {
    // Sıra ters olsaydı, kilitli bir cihazda çeviri beklenirdi ve güvenlik
    // kilidi ekranı hiç görünmezdi.
    const blocked = app.indexOf("gate.status === 'blocked'");
    const ready = app.indexOf('if (!i18nReady) return');
    expect(blocked).toBeGreaterThan(-1);
    expect(ready).toBeGreaterThan(blocked);
  });

  it('dinleyici temizlenir — bileşen sökülünce sızıntı olmaz', () => {
    const listener = app.slice(app.indexOf("i18n.on('initialized'"));
    expect(listener.slice(0, 400)).toContain("i18n.off('initialized'");
  });
});

describe('Ağır işler güvenlik kapısı geçmeden başlamaz', () => {
  const app = read('App.tsx');

  // `void ...` öneki ile aranıyor: dosyanın başındaki açıklama yorumu da
  // `AppLifecycle.start()` dizgesini içeriyor ve ilk eşleşme oraya
  // düşüyordu. Yorumun üzerine ateşleyen bir kontrol, zamanla görmezden
  // gelinen bir kontroldür.
  it.each(['void AppLifecycle.start()', 'CaptureShieldHost.start('])(
    '%s çağrısı kapı kontrolünün ardında',
    (call) => {
      const index = app.indexOf(call);
      expect(index).toBeGreaterThan(-1);

      // Çağrıdan önceki 300 karakterde kapı koşulu olmalı: kilitli bir
      // uygulamada dosya sistemi taraması ve termal izleme çalıştırmak,
      // hem gereksiz hem de bütünlük kontrolünün amacına aykırıdır.
      const before = app.slice(Math.max(0, index - 300), index);
      expect(before).toContain("gate.status !== 'passed'");
    },
  );
});

describe('Giriş noktası sırası', () => {
  const index = readFileSync(join(__dirname, '..', 'index.js'), 'utf8');

  it('gesture-handler her şeyden ÖNCE import edilir', () => {
    const gesture = index.indexOf("import 'react-native-gesture-handler'");
    const other = index.indexOf("import { AppRegistry }");
    expect(gesture).toBeGreaterThan(-1);
    expect(gesture).toBeLessThan(other);
  });

  it('çökme raporlayıcı kayıttan ÖNCE kurulur', () => {
    // Sonraya bırakılırsa açılışta çöken bir sürüm hakkında hiçbir veri
    // alınamaz — yani en kritik hata sınıfı görünmez kalır.
    const installed = index.indexOf('installCrashReporter(');
    const registered = index.indexOf('AppRegistry.registerComponent');
    expect(installed).toBeGreaterThan(-1);
    expect(installed).toBeLessThan(registered);
  });

  it('kayıt adı app.json ile aynı kaynaktan gelir', () => {
    // Sabit kodlanmış bir ad, app.json değiştiğinde uygulamanın BOŞ
    // açılmasına yol açar ve hiçbir hata mesajı çıkmaz.
    expect(index).toContain("name as appName");
    expect(index).toContain('AppRegistry.registerComponent(appName');
  });
});
