/**
 * FeedbackComposer — geri bildirim e-postasının SAF oluşturucusu.
 *
 * NEDEN E-POSTA, NEDEN SUNUCU DEĞİL
 * Uygulama içi bir form, mesajı bizim sunucumuza gönderirdi: bu, hesap
 * olmayan bir uygulamada bile bir gönderim kaydı, bir zaman damgası ve
 * (kaçınılmaz olarak) bir IP kaydı yaratır. `mailto:` ile kullanıcının kendi
 * posta uygulaması devreye girer — biz hiçbir şey toplamayız, kullanıcı
 * gönderdiğinin tam metnini görür ve gönderip göndermemeye kendi karar verir.
 * "Sıfır veri toplama" ilkesiyle tutarlı olan tek çözüm budur.
 *
 * TEŞHİS BİLGİSİ
 * Destek isteğine sürüm/platform eklemek gerçekten işe yarar ("hangi sürümde
 * oldu?" sorusunu ortadan kaldırır). Ancak eklenen her alan bir tanımlayıcı
 * olabilir; bu yüzden çökme raporundakiyle AYNI disiplin uygulanır: tam cihaz
 * modeli değil sınıfı, tam OS sürümü değil ana sürümü, kimlik yok.
 *
 * Kullanıcı metni GÖRÜR ve silebilir — gizli hiçbir şey eklenmez.
 */
import type { DeviceClass } from '@/telemetry/AnonymousCrashReporter';

/** Kullanıcının seçtiği bildirim türü. */
export type FeedbackCategory = 'feedback' | 'request' | 'complaint';

export const FEEDBACK_CATEGORIES: readonly FeedbackCategory[] = [
  'feedback',
  'request',
  'complaint',
];

/** Destek adresi. Uygulama içinde başka hiçbir yere e-posta gönderilmez. */
export const SUPPORT_EMAIL = 'gokturkalazdaghan@gmail.com';

/** Konu satırındaki etiket — gelen kutusunda filtrelemeyi mümkün kılar. */
const CATEGORY_TAG: Readonly<Record<FeedbackCategory, string>> = {
  feedback: 'Geri Bildirim',
  request: 'Istek',
  complaint: 'Sikayet',
};

export interface Diagnostics {
  readonly appVersion: string;
  readonly platform: 'ios' | 'android';
  /** Yalnızca ana sürüm — yama sürümü tekilleştirici olabilir. */
  readonly osMajor: string;
  readonly deviceClass: DeviceClass;
  /** Arayüz dili — hangi çeviride sorun olduğunu anlamak için. */
  readonly language: string;
  /** Abonelik durumu; kimlik değil, yalnızca "pro" veya "free". */
  readonly plan: 'pro' | 'free';
}

export interface ComposeInput {
  readonly category: FeedbackCategory;
  readonly diagnostics: Diagnostics;
  /** Kullanıcının yazacağı yere konan yer tutucu satır (i18n'den gelir). */
  readonly bodyPlaceholder: string;
  readonly diagnosticsHeading: string;
}

/**
 * Teşhis bloğu. Kullanıcı bunu görür ve isterse siler.
 *
 * BURAYA EKLENMEYENLER — ve neden:
 *   - Cihaz/kurulum kimliği : kimlik oluşturur
 *   - Tam cihaz modeli      : dil ve saatle birleşince tekilleştirici olur
 *   - Zaman damgası         : e-postanın kendi başlığında zaten var
 *   - Proje/dosya adları    : kullanıcı içeriğidir
 */
export function buildDiagnosticsBlock(
  diagnostics: Diagnostics,
  heading: string,
): string {
  return [
    heading,
    `- App: EVEN GIRL ${diagnostics.appVersion}`,
    `- Platform: ${diagnostics.platform} ${diagnostics.osMajor}`,
    `- Device class: ${diagnostics.deviceClass}`,
    `- Language: ${diagnostics.language}`,
    `- Plan: ${diagnostics.plan}`,
  ].join('\n');
}

export function buildSubject(category: FeedbackCategory, appVersion: string): string {
  return `EVEN GIRL ${appVersion} - ${CATEGORY_TAG[category]}`;
}

export function buildBody(input: ComposeInput): string {
  // Kullanıcının yazacağı alan EN ÜSTTE: posta uygulaması açıldığında imleç
  // orada olur ve kullanıcı teşhis bloğunu kaydırıp geçmek zorunda kalmaz.
  return [
    input.bodyPlaceholder,
    '',
    '',
    '---',
    buildDiagnosticsBlock(input.diagnostics, input.diagnosticsHeading),
  ].join('\n');
}

/**
 * `mailto:` bağlantısını üretir.
 *
 * KAÇIŞ (escaping) KRİTİK: Konu ve gövde sorgu parametresi olarak taşınır.
 * `encodeURIComponent` kullanılmazsa Türkçe karakterler, satır sonları ve
 * `&` işareti bağlantıyı bozar — posta uygulaması ya açılmaz ya da gövdenin
 * yarısını yutar. `encodeURI` YETMEZ: `&` ve `#` karakterlerini kaçırmaz.
 */
export function buildMailtoUrl(input: ComposeInput): string {
  const subject = encodeURIComponent(buildSubject(input.category, input.diagnostics.appVersion));
  const body = encodeURIComponent(buildBody(input));
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}
