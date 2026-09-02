/**
 * ReportSurfaces — rapor düğmesinin ZORUNLU olduğu yüzeylerin kaydı.
 *
 * NEDEN BİR KAYIT DEFTERİ VAR
 * "Her profil, hikaye ve sohbet ekranında rapor düğmesi var" cümlesi bir
 * iddiadır. Altı ay sonra eklenen dördüncü bir UGC ekranında kimse bunu
 * hatırlamaz ve iddia sessizce yanlış olur.
 *
 * Bu dosya iddiayı ölçülebilir hâle getirir: yüzey burada listelenir,
 * `__tests__/ReportSurfaces.test.ts` her yüzeyin gerçekten
 * `ReportAffordance` render ettiğini KAYNAK KODUNDAN doğrular. Kayıt
 * defterine ekleyip düğmeyi koymayan bir ekran, testte kırmızıya döner.
 *
 * ATLATILAMAZLIK NE DEMEK
 *   1. Düğme, içeriğin kendisiyle aynı ekranda ve iki dokunuştan yakın.
 *   2. Kullanıcının kendi içeriğinde bile GİZLENMEZ — yalnızca devre dışı
 *      görünür; "rapor düğmesini görmüyorum" durumu hiç oluşmaz.
 *   3. Ağ yokken de görünür; rapor kuyruğa alınır, düğme kaybolmaz.
 *   4. PRO/ücretsiz ayrımı YOKTUR. Güvenlik aracı ödeme duvarının arkasına
 *      konmaz.
 */

/** Rapor düğmesi taşımak ZORUNDA olan yüzeyler. */
export type ReportSurface =
  /** Başka bir kullanıcının profili. */
  | 'profile'
  /** Tam ekran hikaye görüntüleyici. */
  | 'story'
  /** Birebir sohbet ekranı. */
  | 'chat'
  /** Keşfet akışındaki gönderi kartı. */
  | 'feed-post'
  /** Şablon pazarındaki kullanıcı şablonu. */
  | 'template';

export const REQUIRED_REPORT_SURFACES: readonly ReportSurface[] = [
  'profile',
  'story',
  'chat',
  'feed-post',
  'template',
];

/**
 * Yüzey → bu yüzeyi render eden dosya.
 *
 * Test bu eşlemeyi kullanarak dosyayı okur ve `ReportAffordance` kullanımını
 * arar. Dosya taşınırsa test kırılır — bu istenen davranıştır: taşıma
 * sırasında düğmenin düşmediğini birinin doğrulaması gerekir.
 */
export const REPORT_SURFACE_FILES: Readonly<Record<ReportSurface, string>> = {
  profile: 'src/ui/screens/ProfileScreen.tsx',
  story: 'src/ui/screens/StoryViewerScreen.tsx',
  chat: 'src/ui/screens/ChatScreen.tsx',
  'feed-post': 'src/ui/screens/FeedScreen.tsx',
  template: 'src/ui/screens/TemplateDetailScreen.tsx',
};

/**
 * Rapor düğmesinin gösterilip gösterilmeyeceği.
 *
 * HER ZAMAN `true` DÖNER. Fonksiyon yine de var, çünkü çağıran taraf bir
 * koşul yazmak istediğinde buraya bakar ve cevabı burada bulur: koşul yok.
 * Bunu `visible={...}` ifadeleriyle çağrı yerlerine dağıtmak, zamanla
 * birinin oraya `&& !isOwnContent` eklemesiyle biter.
 */
export function shouldShowReportAffordance(): true {
  return true;
}

/**
 * Düğmenin ETKİN olup olmadığı.
 *
 * Görünürlükten AYRI bir sorudur: kendi içeriğini raporlamak anlamsızdır ve
 * düğme devre dışı görünür — ama GÖRÜNÜR kalır (bkz. atlatılamazlık #2).
 */
export function reportAffordanceEnabled(params: {
  readonly viewerId: string;
  readonly authorId: string;
  readonly alreadyReported: boolean;
}): boolean {
  if (params.viewerId === params.authorId) return false;
  return !params.alreadyReported;
}

/** Devre dışıysa kullanıcıya gösterilecek açıklamanın i18n anahtarı. */
export function reportDisabledReasonKey(params: {
  readonly viewerId: string;
  readonly authorId: string;
  readonly alreadyReported: boolean;
}): string | null {
  if (params.viewerId === params.authorId) return 'moderation.report.ownContent';
  if (params.alreadyReported) return 'moderation.report.already';
  return null;
}
