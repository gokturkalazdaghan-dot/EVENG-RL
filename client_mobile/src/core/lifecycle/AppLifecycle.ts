/**
 * AppLifecycle — arka plan/ön plan geçişlerinde yapılan bakım işleri.
 *
 * NEDEN TEK YERDE: Bu işlerin her biri ayrı bileşene dağıtılsaydı (her ekran
 * kendi AppState dinleyicisini kurar), aynı iş birden çok kez tetiklenir ve
 * arka plana geçerken 3-4 paralel dosya sistemi taraması başlardı. Tek bir
 * koordinatör, sıralamayı da garanti eder.
 *
 * SIRALAMA ÖNEMLİ (arka plana geçerken):
 *   1. Model/tensor belleğini bırak  — OS'un uygulamayı öldürme olasılığını
 *      düşüren en etkili adım budur ve hemen yapılmalıdır.
 *   2. Önbellek bakımı çalıştır      — dosya sistemi taraması, kullanıcı
 *      ön plandayken ASLA yapılmaz (kare bütçesini bozar).
 *   3. Termal izlemeyi durdur        — arka planda sinyal dinlemek pilden yer.
 */
import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';

import { AgeGate } from '@/age/AgeGate';
import { LocalInferenceRuntime } from '@/ai/engine/LocalInferenceRuntime';
import { BillingService } from '@/billing/BillingService';
import { ExportGate } from '@/export/ExportGate';
import { StoreManagement } from '@/billing/StoreManagement';
import { NetworkMonitor } from '@/connectivity/NetworkMonitor';
import { createLogger } from '@/core/logging/Logger';
import { initI18n, resyncDeviceLanguage } from '@/i18n';
import { releaseUnderMemoryPressure } from '@/performance/TensorArena';
import { ThermalGovernor } from '@/performance/ThermalGovernor';
import { CacheManager } from '@/storage/CacheManager';
import { ensureDirectories } from '@/storage/paths';

const log = createLogger('AppLifecycle');

type Task = () => void | Promise<void>;

class AppLifecycleImpl {
  private subscription: NativeEventSubscription | null = null;
  private previousState: AppStateStatus = 'active';
  private readonly onBackgroundTasks = new Set<Task>();
  private maintenanceRunning = false;

  /** Güvenlik kontrolü GEÇTİKTEN sonra çağrılır (bkz. App.tsx). */
  async start(): Promise<void> {
    if (this.subscription) return;

    await ensureDirectories();
    await initI18n();
    // Yaş kaydı, kabuk monte edilmeden önce hazır olmalı: kademe bilinmeden
    // akış filtreleri kurulamaz.
    await AgeGate.load();
    NetworkMonitor.start();
    await ThermalGovernor.start();

    // Ödeme katmanı: yapılandır, mevcut yetkiyi tazele, iOS'ta uygulama
    // kapalıyken onaylanan işlemleri dinlemeye başla.
    await BillingService.configure();
    StoreManagement.startListening();
    void BillingService.refresh();

    // Dışa aktarım kotası: sayaç okunur ve hak tükendiyse ekran koruması
    // (FLAG_SECURE / UIScreen.isCaptured) derhal devreye girer.
    await ExportGate.load();

    this.subscription = AppState.addEventListener('change', (next) => {
      const wasActive = this.previousState === 'active';
      const isActive = next === 'active';
      this.previousState = next;

      if (wasActive && !isActive) void this.onEnterBackground();
      else if (!wasActive && isActive) void this.onEnterForeground();
    });

    log.info('Yaşam döngüsü başlatıldı');
  }

  stop(): void {
    this.subscription?.remove();
    this.subscription = null;
    ThermalGovernor.stop();
    NetworkMonitor.stop();
  }

  /** Ek bakım işleri kaydı (ör. Modül 4'te model interpreter'larını boşaltma). */
  registerBackgroundTask(task: Task): () => void {
    this.onBackgroundTasks.add(task);
    return () => {
      this.onBackgroundTasks.delete(task);
    };
  }

  private async onEnterBackground(): Promise<void> {
    // 1) Bellek — en acil adım. Önce arena'lar, sonra model interpreter'ları:
    //    yüklü bir TFLite/CoreML oturumu tek başına yüzlerce MB tutar ve
    //    arka planda hiçbir işe yaramaz. Bunları bırakmak, OS'un uygulamayı
    //    öldürme olasılığını en çok düşüren adımdır.
    await releaseUnderMemoryPressure({ includeInteractive: true });
    await LocalInferenceRuntime.releaseAll();

    for (const task of this.onBackgroundTasks) {
      await Promise.resolve(task()).catch((e) => log.warn('Arka plan görevi hata verdi', e));
    }

    // 2) Önbellek bakımı.
    await this.runMaintenanceOnce();

    // 3) Termal izleme.
    ThermalGovernor.stop();
    StoreManagement.stopListening();
  }

  private async onEnterForeground(): Promise<void> {
    // Sistem dili arka plandayken değişmiş olabilir (Android 13+ uygulama
    // başına dil seçimi uygulamayı yeniden başlatmaz).
    await resyncDeviceLanguage();
    await ThermalGovernor.start();
    StoreManagement.startListening();

    // Abonelik uygulama dışında da değişmiş olabilir (yenileme, iptal, iade).
    void BillingService.refresh();

    // Play içi ödeme kurtarma mesajı: kullanıcı kartını güncellediyse
    // yetkiyi DERHAL tazele, aksi halde ödeme yapmış kullanıcı kilitli kalır.
    const recovered = await StoreManagement.showPaymentRecoveryMessages();
    if (recovered) void BillingService.refresh();
  }

  /**
   * Dışa aktarım sonrası da çağrılır. Yeniden giriş koruması var: iki
   * kaynaktan aynı anda tetiklenirse ikinci çağrı beklemeden döner —
   * paralel iki tarama, silinmekte olan dosyaları iki kez planlar.
   */
  async runMaintenanceOnce(): Promise<void> {
    if (this.maintenanceRunning) return;
    this.maintenanceRunning = true;
    try {
      const result = await CacheManager.runMaintenance();
      if (!result.ok) log.warn('Önbellek bakımı başarısız', result.error.code);
    } finally {
      this.maintenanceRunning = false;
    }
  }

  /**
   * Bellek uyarısı (iOS didReceiveMemoryWarning / Android onTrimMemory).
   * Kullanıcı ön plandayken çağrılabilir; bu yüzden yalnızca ETKİLEŞİMSİZ
   * arena'lar kapatılır — aktif işi öldürmek, çökmekten daha iyi değildir.
   */
  async onMemoryWarning(): Promise<void> {
    const freed = await releaseUnderMemoryPressure({ includeInteractive: false });
    log.warn(`Bellek uyarısı — ${Math.round(freed / 1024 / 1024)} MB bırakıldı`);
  }
}

export const AppLifecycle = new AppLifecycleImpl();
