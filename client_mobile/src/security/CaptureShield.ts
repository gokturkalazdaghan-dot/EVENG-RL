/**
 * CaptureShield — ekran yakalama olaylarına verilecek yanıtın SAF politikası.
 *
 * NEDEN AYRI BİR POLİTİKA DOSYASI
 * Yakalama yanıtı native köprüye gömüldüğünde iki platformda iki farklı
 * davranış oluşur ve hiçbiri test edilemez. Karar burada verilir, native
 * taraf yalnızca uygular.
 *
 * İKİ FARKLI OLAY, İKİ FARKLI DOĞA
 *
 *   `recording` (UIScreen.isCaptured / yansıtma): SÜREKLİdir ve
 *   ÖNLENEBİLİR. Kayıt sürerken ekranda ne varsa videoya girer; kalkanı
 *   kayıt başlar başlamaz göstermek, kaydın geri kalanını değersiz kılar.
 *
 *   `screenshot` (userDidTakeScreenshotNotification): ANLIKtır ve
 *   ÖNLENEMEZ. Bildirim, görüntü ALINDIKTAN sonra gelir. Kalkanı göstermek
 *   o kareyi geri getirmez — ama bir sonraki kareyi korur ve kullanıcıya
 *   sınırın var olduğunu bildirir.
 *
 * DÜRÜSTLÜK KURALI: Ekran görüntüsünü "engelledik" demiyoruz. iOS'ta
 * engellenemez. Yaptığımız şey, hakkı tükenmiş kullanıcının filigransız
 * çıktıyı ekran görüntüsüyle elde etmesini ZORLAŞTIRMAK ve bunu ona açıkça
 * söylemektir.
 */

/** Native köprüden gelen olay türleri. */
export type CaptureEvent =
  /** Ekran kaydı veya yansıtma durumu değişti. */
  | { readonly kind: 'recording'; readonly active: boolean }
  /** Kullanıcı ekran görüntüsü aldı (olay ALINDIKTAN sonra gelir). */
  | { readonly kind: 'screenshot' };

/** Kalkanın uygulanacağı bağlam. */
export interface CaptureContext {
  /** Kullanıcının aktif PRO aboneliği var mı. */
  readonly isPro: boolean;
  /** Kalan ücretsiz indirme hakkı. */
  readonly remainingFreeExports: number;
  /** Ekranda şu anda korunan bir çıktı var mı (tam çözünürlük render). */
  readonly hasProtectedBuffer: boolean;
}

/** Politika kararı — native ve JS tarafı bunu uygular. */
export interface CaptureResponse {
  /** Opak gizlilik kalkanı gösterilsin mi. */
  readonly shield: boolean;
  /** Bellekteki çözülmüş görüntü tamponu boşaltılsın mı. */
  readonly purgeBuffers: boolean;
  /** Kullanıcı paywall'a yönlendirilsin mi. */
  readonly routeToPaywall: boolean;
  /** Kullanıcıya gösterilecek açıklamanın i18n anahtarı (yoksa null). */
  readonly noticeKey: string | null;
}

const ALLOW: CaptureResponse = {
  shield: false,
  purgeBuffers: false,
  routeToPaywall: false,
  noticeKey: null,
};

/**
 * PRO abone yakalama kısıtı GÖRMEZ.
 *
 * Ödeme yapmış kullanıcının kendi çıktısının ekran görüntüsünü alması
 * meşrudur; kalkan onun için yalnızca bir arıza olur. Kalkanın amacı
 * hakkı tükenmiş kullanıcının ödeme duvarını atlatmasını zorlaştırmaktır,
 * herkesi ekran görüntüsünden alıkoymak değil.
 */
function unrestricted(context: CaptureContext): boolean {
  return context.isPro || context.remainingFreeExports > 0;
}

export function decideCaptureResponse(
  event: CaptureEvent,
  context: CaptureContext,
): CaptureResponse {
  if (unrestricted(context)) return ALLOW;

  if (event.kind === 'recording') {
    // Kayıt DURDUĞUNDA kalkan kalkar. Kalıcı kalkan, kaydı bir kez açıp
    // kapatan kullanıcının uygulamayı yeniden başlatana kadar hiçbir şey
    // görememesi demektir — bu bir hata gibi görünür, koruma gibi değil.
    if (!event.active) return ALLOW;

    return {
      shield: true,
      // Kayıt sürerken tampon bellekte kalırsa, kalkan gösterilmeden önceki
      // son kare veya bir bellek dökümü hâlâ tam çözünürlük taşır.
      purgeBuffers: context.hasProtectedBuffer,
      // Kayıt sırasında paywall AÇILMAZ: kayıt kullanıcının kendi ekranını
      // kaydetmesi olabilir (destek videosu, hata bildirimi). Kalkan yeter.
      routeToPaywall: false,
      noticeKey: 'export.capture.recordingBlocked',
    };
  }

  // Ekran görüntüsü: kare zaten alındı. Yapılacak tek anlamlı şey, bir
  // sonraki kareyi korumak ve kullanıcıya neden bu sınırın var olduğunu
  // söylemektir.
  return {
    shield: true,
    purgeBuffers: context.hasProtectedBuffer,
    routeToPaywall: true,
    noticeKey: 'export.capture.screenshotNotice',
  };
}

/**
 * Kalkanın kalkıp kalkmayacağı.
 *
 * Kullanıcı abone olduğunda veya kayıt durduğunda kalkan DERHAL kalkmalıdır.
 * "Bir sonraki açılışta düzelir" davranışı, ödeme yapmış kullanıcının bozuk
 * bir uygulamayla baş başa kalması demektir.
 */
export function shouldLiftShield(
  context: CaptureContext,
  recordingActive: boolean,
): boolean {
  if (unrestricted(context)) return true;
  return !recordingActive;
}
