/**
 * Yerelleştirme (i18n).
 *
 * İLKELER
 * 1. Arayüzde SABİT KODLANMIŞ metin yoktur; tek istisna güvenlik kilidi
 *    ekranıdır (çeviri yüklemesi başarısız olsa bile görünmelidir).
 * 2. FİYATLAR ÇEVRİLMEZ. Para birimi ve tutar mağazadan yerelleştirilmiş
 *    dize olarak gelir; i18n yalnızca çevresindeki metni sağlar. Kendi
 *    kur dönüşümümüzü yapmak hem yanlış hem de Guideline 3.1.2 ihlalidir.
 * 3. Cihaz dili okunur ama TELEMETRİYE GÖNDERİLMEZ — dil + saat dilimi
 *    birleşimi parmak izi oluşturur. Tek istisna AI ajan çağrılarıdır:
 *    ajanın kullanıcının kendi dilinde yanıt üretmesi için hedef dil
 *    istekle birlikte gider (bkz. agentLanguageTag).
 * 4. Eksik çeviri anahtarı için İngilizce'ye düşülür; anahtar adı asla
 *    kullanıcıya gösterilmez.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { NativeModules, Platform } from 'react-native';

import { createLogger } from '@/core/logging/Logger';

import ar from '@/i18n/locales/ar.json';
import de from '@/i18n/locales/de.json';
import en from '@/i18n/locales/en.json';
import es from '@/i18n/locales/es.json';
import fr from '@/i18n/locales/fr.json';
import ja from '@/i18n/locales/ja.json';
import pt from '@/i18n/locales/pt.json';
import tr from '@/i18n/locales/tr.json';

const log = createLogger('i18n');

export const FALLBACK_LANGUAGE = 'en';

/** Sağdan sola yazılan diller — yerleşim aynalanır. */
export const RTL_LANGUAGES: readonly string[] = ['ar', 'he', 'fa', 'ur'];

export const RESOURCES = {
  ar: { translation: ar },
  de: { translation: de },
  en: { translation: en },
  es: { translation: es },
  fr: { translation: fr },
  ja: { translation: ja },
  pt: { translation: pt },
  tr: { translation: tr },
} as const;

export type SupportedLanguage = keyof typeof RESOURCES;

/**
 * Cihaz dilini okur (ağ isteği yok, kimlik üretmez).
 *
 * "pt-BR" gibi bölgesel etiketler taban dile indirgenir: bölgeye özel
 * çeviri dosyası tutmadığımız sürece "pt-BR" desteklenmiyor sayılıp
 * İngilizce'ye düşülürdü.
 */
export function detectDeviceLanguage(): string {
  const raw =
    Platform.OS === 'ios'
      ? (NativeModules.SettingsManager?.settings?.AppleLocale as string | undefined) ??
        (NativeModules.SettingsManager?.settings?.AppleLanguages?.[0] as string | undefined)
      : (NativeModules.I18nManager?.localeIdentifier as string | undefined);

  if (!raw) return FALLBACK_LANGUAGE;
  return raw.replace('_', '-').split('-')[0]?.toLowerCase() ?? FALLBACK_LANGUAGE;
}

export function resolveLanguage(candidate: string): SupportedLanguage {
  return candidate in RESOURCES ? (candidate as SupportedLanguage) : FALLBACK_LANGUAGE;
}

export function isRtl(language: string): boolean {
  return RTL_LANGUAGES.includes(language);
}

/**
 * Sistem dili değişimini izler.
 *
 * iOS ve Android'de kullanıcı dili değiştirdiğinde uygulama genellikle
 * yeniden başlatılır — ama her zaman değil (Android 13+ uygulama başına dil
 * seçimi). Ön plana dönüşte dili yeniden çözmek, arayüzün eski dilde takılı
 * kalmasını önler.
 */
export async function resyncDeviceLanguage(): Promise<SupportedLanguage> {
  const detected = resolveLanguage(detectDeviceLanguage());
  if (detected !== i18n.language) {
    log.info(`Sistem dili değişti -> ${detected}`);
    await i18n.changeLanguage(detected);
  }
  return detected;
}

/**
 * AI ajanına gönderilecek dil etiketi.
 *
 * Ajan promptu ve çıktısı (altyazı metni, şablon adı, konsept çözümlemesi)
 * kullanıcının kendi dilinde olmalıdır. Arayüz diliyle aynı etiketi
 * kullanıyoruz: kullanıcı arayüzü Türkçe'yken altyazının İngilizce gelmesi
 * tutarsızlıktır.
 *
 * BÖLGE GÖNDERİLMEZ: "tr" gider, "tr-TR" değil. Bölge kodu, dil + saat
 * dilimi birleşiminde ek bir ayırt edici bittir ve ajanın çıktısını
 * değiştirmez.
 */
export function agentLanguageTag(): string {
  return resolveLanguage(i18n.language || detectDeviceLanguage());
}

/** Bildirim metinleri için aktif dil. */
export function currentLanguage(): SupportedLanguage {
  return resolveLanguage(i18n.language || FALLBACK_LANGUAGE);
}

let initialized = false;

export async function initI18n(preferred?: string): Promise<SupportedLanguage> {
  const language = resolveLanguage(preferred ?? detectDeviceLanguage());

  if (initialized) {
    await i18n.changeLanguage(language);
    return language;
  }

  await i18n.use(initReactI18next).init({
    resources: RESOURCES,
    lng: language,
    fallbackLng: FALLBACK_LANGUAGE,
    // React zaten XSS'e karşı kaçış yapar; i18next'in ikinci kez kaçış
    // yapması Türkçe/Fransızca tırnak ve kesme işaretlerini bozar.
    interpolation: { escapeValue: false },
    returnNull: false,
    // Eksik anahtarı kullanıcıya göstermek yerine logla ve fallback'e düş.
    parseMissingKeyHandler: (key) => {
      log.warn(`Eksik çeviri anahtarı: ${key}`);
      return '';
    },
  });

  initialized = true;
  return language;
}

export { i18n };
