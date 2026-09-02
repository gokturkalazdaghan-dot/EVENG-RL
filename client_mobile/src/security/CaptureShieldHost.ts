/**
 * CaptureShieldHost — yakalama olaylarını politikaya bağlayan katman.
 *
 * SORUMLULUK SINIRI
 *   `CaptureShield.ts` KARAR verir (saf, test edilebilir).
 *   Bu dosya kararı UYGULAR (native köprü, abonelik durumu, yönlendirme).
 *   `ScreenGuard` (native) kalkanı ÇİZER.
 *
 * NATIVE TARAFIN KENDİ BAŞINA YAPTIĞI ŞEY
 * Yakalama algılandığında native taraf kalkanı gösterip tamponları JS
 * yanıtını BEKLEMEDEN boşaltır. Köprüyü beklemek, JS thread'i meşgulken
 * (bir render sürerken) korunmak istenen karelerin geçmesi demektir.
 * Bu dosya kararı ayrıca alır ve kalkanı KALDIRMA ile paywall
 * yönlendirmesini yönetir — yani native taraf hızlı ve kaba, bu katman
 * doğru ve geri alınabilir davranır.
 */
import { NativeEventEmitter, NativeModules } from 'react-native';

import { Entitlements } from '@/billing/Entitlements';
import { createLogger } from '@/core/logging/Logger';
import { ExportGate } from '@/export/ExportGate';
import {
  decideCaptureResponse,
  shouldLiftShield,
  type CaptureContext,
  type CaptureEvent,
  type CaptureResponse,
} from '@/security/CaptureShield';

const log = createLogger('CaptureShieldHost');

interface NativeScreenGuard {
  setGateStrings(title: string, body: string, actionTitle: string | null): void;
  purgeImageBuffers(): void;
  hasProtectedBuffer(): Promise<boolean>;
  dismissGate(): void;
}

const guard = NativeModules.EvenGirlScreenGuard as NativeScreenGuard | undefined;

export interface CaptureShieldHandlers {
  /** Paywall'a yönlendirme — navigasyon bu dosyaya bağımlı olmasın diye enjekte edilir. */
  readonly openPaywall: () => void;
  /** Kullanıcıya gösterilecek bilgilendirme (i18n anahtarıyla). */
  readonly notify: (i18nKey: string) => void;
  /** Kalkan metinleri — dil senkronu tek yerde kalsın diye çağıran taraf çevirir. */
  readonly gateStrings: () => { title: string; body: string; actionTitle: string };
}

class CaptureShieldHostImpl {
  private subscriptions: { remove(): void }[] = [];
  private handlers: CaptureShieldHandlers | null = null;
  private recordingActive = false;
  private started = false;

  /** Uygulama açılışında bir kez çağrılır. */
  start(handlers: CaptureShieldHandlers): void {
    if (this.started || !guard) return;
    this.started = true;
    this.handlers = handlers;

    this.pushGateStrings();

    const emitter = new NativeEventEmitter(NativeModules.EvenGirlScreenGuard);

    this.subscriptions = [
      emitter.addListener('screenCaptureChanged', (payload: { captured: boolean }) => {
        this.recordingActive = payload?.captured === true;
        void this.handle({ kind: 'recording', active: this.recordingActive });
      }),
      emitter.addListener('screenshotTaken', () => {
        void this.handle({ kind: 'screenshot' });
      }),
      emitter.addListener('gateContinueTapped', () => {
        // Kalkan AÇIK kalır; paywall onun üstüne açılır. Kalkanı burada
        // kapatmak, paywall yüklenene kadar korumasız kareler bırakırdı.
        this.handlers?.openPaywall();
      }),
      // Android'de native tampon yoktur; boşaltma isteği JS'e gelir.
      emitter.addListener('purgeImageBuffers', () => {
        this.purgeJsImageCache();
      }),
    ];

    // Abonelik değiştiğinde kalkan DERHAL yeniden değerlendirilir.
    Entitlements.subscribe(() => this.reevaluate());
  }

  stop(): void {
    this.subscriptions.forEach((subscription) => subscription.remove());
    this.subscriptions = [];
    this.started = false;
    this.handlers = null;
  }

  /** Kalkan metinlerini native tarafa iletir (dil değişiminde de çağrılır). */
  pushGateStrings(): void {
    const strings = this.handlers?.gateStrings();
    if (!guard || !strings) return;
    guard.setGateStrings(strings.title, strings.body, strings.actionTitle);
  }

  private async context(): Promise<CaptureContext> {
    // Tampon sorgusu başarısız olursa `true` varsayılır: boşaltmayı
    // ATLAMAK, boşuna boşaltmaktan daha pahalıdır.
    const hasProtectedBuffer = await guard?.hasProtectedBuffer().catch(() => true) ?? true;

    return {
      isPro: Entitlements.isPro,
      remainingFreeExports: ExportGate.remaining,
      hasProtectedBuffer,
    };
  }

  private async handle(event: CaptureEvent): Promise<void> {
    const response = decideCaptureResponse(event, await this.context());
    this.apply(response);
  }

  private apply(response: CaptureResponse): void {
    if (response.purgeBuffers) {
      guard?.purgeImageBuffers();
      this.purgeJsImageCache();
    }

    if (!response.shield) {
      guard?.dismissGate();
    }

    if (response.noticeKey) {
      this.handlers?.notify(response.noticeKey);
    }

    if (response.routeToPaywall) {
      this.handlers?.openPaywall();
    }
  }

  /**
   * Abonelik değiştiğinde veya kayıt durduğunda kalkanı yeniden değerlendirir.
   *
   * Bu olmadan, kalkan açıkken abone olan kullanıcı uygulamayı yeniden
   * başlatana kadar siyah ekranla kalırdı.
   */
  private reevaluate(): void {
    void this.context().then((context) => {
      if (shouldLiftShield(context, this.recordingActive)) {
        guard?.dismissGate();
      }
    });
  }

  /**
   * RN görüntü önbelleğini boşaltır.
   *
   * `Image.queryCache` ile ne tutulduğunu okumak mümkün ama boşaltmak için
   * platform API'si yok; bu yüzden boşaltma, korunan görünümlerin kaynak
   * URI'sini düşürmesiyle yapılır. Burada yalnızca abonelere sinyal verilir.
   */
  private purgeJsImageCache(): void {
    this.purgeListeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        log.warn('Tampon boşaltma dinleyicisi hata verdi');
      }
    });
  }

  private readonly purgeListeners = new Set<() => void>();

  /**
   * Tam çözünürlük çıktı gösteren ekranlar buraya abone olur ve sinyal
   * geldiğinde kaynağını düşürür.
   */
  onPurge(listener: () => void): () => void {
    this.purgeListeners.add(listener);
    return () => {
      this.purgeListeners.delete(listener);
    };
  }
}

export const CaptureShieldHost = new CaptureShieldHostImpl();
