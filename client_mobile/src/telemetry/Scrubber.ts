/**
 * Scrubber — çökme raporundan kişisel veriyi ayıklayan SAF temizleyici.
 *
 * NEDEN BU DOSYA VAR
 * "Sıfır kişisel veri" ilkesi ile "çökme nedenini görebilmek" ihtiyacı
 * çelişir gibi görünür. Çelişmez: yığın izinin TEŞHİS DEĞERİ, dosya adları
 * ve satır numaralarındadır — kullanıcının kim olduğunda değil.
 *
 * Ancak yığın izleri, farkında olmadan kişisel veri taşır:
 *   - Dosya yolları kullanıcı adını içerir (/Users/gokturk/..., /data/user/0/...)
 *   - Hata mesajları URL, e-posta, token veya dosya adı gömülü taşır
 *   - Fotoğraf yolları "IMG_20240612_Antalya.jpg" gibi bilgi sızdırır
 *
 * Bu dosya girdiyi metin olarak alır, metin döndürür; hiçbir platform API'si
 * import etmez. Buradaki bir hata SESSİZ bir gizlilik ihlalidir — bu yüzden
 * en yoğun test edilen mantıktır.
 *
 * KURAL: Şüpheli olan atılır. Bir jetonun teşhis değeri var mı emin
 * değilsek, çıkarıyoruz. Eksik bilgiyle hata ayıklamak, kullanıcı verisi
 * sızdırmaktan iyidir.
 */

/** Yerine geçen işaretler — hangi tür verinin çıkarıldığını belli eder. */
export const REDACTED = {
  path: '<path>',
  email: '<email>',
  url: '<url>',
  ip: '<ip>',
  token: '<token>',
  number: '<n>',
  uuid: '<uuid>',
  file: '<file>',
} as const;

/**
 * Sıra ÖNEMLİ: daha spesifik kalıplar önce uygulanır. E-posta kalıbı
 * URL'den sonra çalışırsa, URL içindeki e-posta zaten silinmiş olur.
 */
const PATTERNS: readonly { pattern: RegExp; replacement: string }[] = [
  // E-posta — en yüksek hassasiyet, ilk sırada.
  { pattern: /[\w.+-]+@[\w-]+\.[\w.-]+/g, replacement: REDACTED.email },

  // URL (sorgu dizesi token taşıyabilir).
  { pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s'"<>)\]]+/gi, replacement: REDACTED.url },

  // IPv4 ve IPv6.
  { pattern: /\b\d{1,3}(?:\.\d{1,3}){3}\b/g, replacement: REDACTED.ip },
  { pattern: /\b(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{1,4}\b/gi, replacement: REDACTED.ip },

  // UUID (cihaz/oturum kimliği olabilir).
  {
    pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    replacement: REDACTED.uuid,
  },

  // JWT ve uzun base64/hex jetonlar.
  { pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, replacement: REDACTED.token },
  { pattern: /\b[A-Za-z0-9_-]{40,}\b/g, replacement: REDACTED.token },

  // iOS kullanıcı dizini: /Users/<isim>/ veya /var/mobile/Containers/...
  { pattern: /\/Users\/[^/\s]+/g, replacement: `${REDACTED.path}` },
  { pattern: /\/var\/mobile\/[^\s'"<>)\]]*/g, replacement: REDACTED.path },
  { pattern: /\/private\/var\/[^\s'"<>)\]]*/g, replacement: REDACTED.path },

  // Android uygulama veri dizini: /data/user/0/<paket>/... ve /storage/emulated/0/...
  { pattern: /\/data\/(?:user|data)\/[^\s'"<>)\]]*/g, replacement: REDACTED.path },
  { pattern: /\/storage\/emulated\/[^\s'"<>)\]]*/g, replacement: REDACTED.path },
  { pattern: /content:\/\/[^\s'"<>)\]]*/g, replacement: REDACTED.url },
];

/** Medya dosyası adları konum/tarih sızdırır: IMG_20240612_Antalya.jpg */
const MEDIA_FILE_PATTERN =
  /\b[\w.-]+\.(?:jpe?g|png|heic|heif|mp4|mov|m4v|gif|webp|dng|raw|aac|wav)\b/gi;

/**
 * Yığın izindeki bir kare için: uygulamamıza ait olmayan dosya yolları
 * (node_modules, sistem çerçeveleri) korunur; teşhis için gereklidir ve
 * kişisel veri içermez.
 */
export function scrubText(input: string): string {
  if (!input) return '';

  let output = input;
  for (const { pattern, replacement } of PATTERNS) {
    output = output.replace(pattern, replacement);
  }
  output = output.replace(MEDIA_FILE_PATTERN, REDACTED.file);

  // Uzun sayı dizileri (telefon, kart, zaman damgası, koordinat) — satır
  // numaralarını korumak için 7+ haneliler hedeflenir.
  output = output.replace(/\b\d{7,}\b/g, REDACTED.number);

  return output;
}

/**
 * Hata mesajını temizler ve KISALTIR.
 *
 * Mesajlar sıklıkla serileştirilmiş nesne taşır ("Request failed: {...500
 * karakter...}"); ilk satır ve ilk 200 karakter teşhis için yeterlidir,
 * fazlası sızıntı yüzeyidir.
 */
export function scrubMessage(message: string): string {
  const firstLine = String(message).split('\n')[0] ?? '';
  return scrubText(firstLine).slice(0, 200);
}

export interface ScrubbedFrame {
  readonly fn: string;
  readonly file: string;
  readonly line: number | null;
}

/**
 * Tek bir yığın satırını ayrıştırır ve temizler.
 *
 * Hermes ve JSC farklı biçimler üretir; ikisi de desteklenir:
 *   "at fnName (address at /path/file.js:12:34)"
 *   "fnName@/path/file.js:12:34"
 */
export function scrubFrame(rawLine: string): ScrubbedFrame | null {
  const line = rawLine.trim();
  if (!line) return null;

  // "at fn (file:line:col)" veya "fn@file:line:col"
  const parenthesized = /^at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)$/.exec(line);
  const atSign = /^(.+?)@(.+?):(\d+):(\d+)$/.exec(line);
  const bare = /^at\s+(.+?):(\d+):(\d+)$/.exec(line);

  if (parenthesized) {
    return {
      fn: scrubText(parenthesized[1]!),
      file: fileNameOf(parenthesized[2]!),
      line: Number(parenthesized[3]),
    };
  }
  if (atSign) {
    return { fn: scrubText(atSign[1]!), file: fileNameOf(atSign[2]!), line: Number(atSign[3]) };
  }
  if (bare) {
    return { fn: '<anonymous>', file: fileNameOf(bare[1]!), line: Number(bare[2]) };
  }

  // Tanınmayan biçim: satırı olduğu gibi göndermek yerine temizleyip
  // fonksiyon adı olarak koyuyoruz.
  return { fn: scrubText(line).slice(0, 120), file: '<unknown>', line: null };
}

/**
 * Dosya yolundan yalnızca DOSYA ADINI alır.
 *
 * Tam yol kullanıcı adı içerir (/Users/gokturk/..., /data/user/0/...).
 * Teşhis için gereken tek şey dosya adıdır; dizin yapısı değil.
 */
function fileNameOf(path: string): string {
  // SIRA ÖNEMLİ: önce dosya adını ayır, SONRA temizle.
  //
  // Tersini yapmak (önce temizle) Android yollarında dosya adını da yok eder:
  // "/data/user/0/com.evengirl.app/AiEngine.ts" kalıbı tüm yolu tüketir ve geriye
  // yalnızca "<path>" kalır — rapor teşhis değerini tamamen kaybeder.
  // Kullanıcı adı zaten DİZİN kısmındadır; dosya adını almak onu düşürür.
  const segments = path.split(/[/\\]/);
  const lastSegment = segments[segments.length - 1] ?? path;

  // Sorgu dizesi ve parça (fragment) atılır. Bir bundle URL'inin dosya adı
  // "bundle.js?token=abc123" biçiminde gelir; sorgu dizesindeki jeton, uzun
  // jeton kalıbına takılmayacak kadar kısa olabilir ve rapora sızar.
  const name = lastSegment.split(/[?#]/)[0] ?? lastSegment;
  const cleaned = scrubText(name);
  return cleaned.length > 80 ? `${cleaned.slice(0, 80)}…` : cleaned;
}

export function scrubStack(stack: string, maxFrames = 30): ScrubbedFrame[] {
  return stack
    .split('\n')
    .slice(0, maxFrames + 1)
    .map(scrubFrame)
    .filter((frame): frame is ScrubbedFrame => frame !== null)
    .slice(0, maxFrames);
}

/**
 * Raporun içinde kişisel veri kalıp kalmadığını denetler.
 *
 * Son savunma hattı: yeni bir kalıp gözden kaçtıysa rapor GÖNDERİLMEZ.
 * Sessizce sızdırmaktansa çökme verisini kaybetmeyi tercih ediyoruz.
 */
export function containsLikelyPii(serialized: string): boolean {
  const detectors: readonly RegExp[] = [
    /[\w.+-]+@[\w-]+\.[\w.-]+/,           // e-posta
    /\b\d{1,3}(?:\.\d{1,3}){3}\b/,        // IPv4
    /\/Users\//,                           // macOS/iOS kullanıcı dizini
    /\/data\/(?:user|data)\//,             // Android veri dizini
    /\/storage\/emulated\//,
    /\b[A-Za-z0-9_-]{40,}\b/,              // uzun jeton
    /[a-z][a-z0-9+.-]*:\/\//i,             // ham URL
  ];
  return detectors.some((detector) => detector.test(serialized));
}
