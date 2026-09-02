/**
 * core_gateway/ai_studio/restrictedRegistry.js
 *
 * Kısıtlı kimlikler kaydı: kamuya mal olmuş kişiler, siyasi kimlikler ve
 * ticari markalı karakterler.
 *
 * NE İÇİN VAR
 * "Even Girl Generate" 5 referans fotoğraftan kimlik koşullu üretim yapar.
 * Referans olarak bir ünlünün fotoğrafı verilirse çıktı, o kişinin hiç
 * yapmadığı bir şeyi yapıyormuş gibi görünen fotogerçekçi bir görüntüdür —
 * yani deepfake. Aynı şey ticari markalı bir karakter için telif ihlalidir.
 *
 * İKİ AYRI HAT, İKİ AYRI SORU
 *   Bu dosya METİN sorusunu yanıtlar: konsept metninde kısıtlı bir isim
 *   geçiyor mu.
 *   `faceScreening.js` GÖRÜNTÜ sorusunu yanıtlar: referans fotoğraftaki yüz
 *   kısıtlı bir kimliğe mi ait.
 *
 * İki hat da gereklidir. Yalnızca metni denetlemek, ismi yazmadan ünlü
 * fotoğrafı yüklemeyi serbest bırakır; yalnızca yüzü denetlemek,
 * "<ünlü ismi> tarzında" yazıp kendi fotoğrafını yüklemeyi serbest bırakır.
 *
 * KAYIT BURADA DEĞİL
 * Gerçek kayıt binlerce girdilik bir veritabanıdır ve düzenli güncellenir.
 * Bu dosya SORGU MANTIĞINI ve normalleştirmeyi taşır; `lookup` bağımlılığı
 * dışarıdan verilir. Listeyi koda gömmek, güncellemeyi sürüm çıkmaya
 * bağlardı.
 */

'use strict';

/** Kısıtlama kategorileri — her biri farklı bir hukuki gerekçe taşır. */
const CATEGORY = Object.freeze({
  /** Tanınmış kişi: kişilik hakkı / benzerlik hakkı (right of publicity). */
  PUBLIC_FIGURE: 'public_figure',
  /** Siyasetçi, devlet kurumu, aday: seçim manipülasyonu riski. */
  POLITICAL: 'political',
  /** Ticari markalı karakter, logo, maskot: telif ve marka hakkı. */
  TRADEMARK: 'trademark',
  /** Kullanıcı bildirimiyle eklenen özel kişi (kendi benzerliğini korur). */
  PRIVATE_OPT_OUT: 'private_opt_out',
});

/**
 * Kategori → yaptırım.
 *
 * `block` üretimi tamamen durdurur; `require_disclosure` üretime izin verir
 * ama çıktıya kaynak bildirimi (provenance) işler.
 *
 * SİYASİ İÇERİK İSTİSNASIZ BLOKE. Bir seçim döneminde bir siyasetçinin
 * fotogerçekçi sahte görüntüsü, en yüksek zarar potansiyeli olan çıktıdır ve
 * "parodi" ayrımını otomatik yapmanın güvenilir bir yolu yoktur.
 */
const ENFORCEMENT = Object.freeze({
  public_figure: 'block',
  political: 'block',
  trademark: 'block',
  private_opt_out: 'block',
});

/**
 * Eşleştirme için isim normalleştirme.
 *
 * KRİTİK AYRIM — noktalama SİLİNİR, boşluğa ÇEVRİLMEZ.
 * "E.l.o.n M-u-s-k" içindeki noktalar boşluğa çevrilseydi sonuç
 * "e l o n m u s k" olurdu ve kayıttaki "elon musk" ile eşleşmezdi. Yani
 * ayırıcıyı boşluğa çevirmek, tam olarak yakalamaya çalıştığımız yazım
 * oyununu ÇALIŞIR hâle getirirdi. Bu hata bir testle bulundu.
 *
 * Kelimeleri yalnızca GERÇEK boşluk ayırır.
 */
function normalizeName(value) {
  return String(value ?? '')
    // Unicode uyumluluk normalizasyonu: tam genişlikli karakterler ve
    // yazı tipi varyantları ASCII karşılıklarına iner.
    .normalize('NFKD')
    // Birleşen aksan işaretleri (é → e).
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // Görünmez karakterler: sıfır genişlikli boşluk/birleştirici, bidi
    // kontrolleri ve izolatları. Bunlar da SİLİNİR — boşluğa çevrilseydi
    // aynı bölme hatası doğardı.
    .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    // Harf/rakam ve boşluk DIŞINDAKİ her şey SİLİNİR (nokta, tire, alt
    // çizgi, kesme işareti).
    .replace(/[^\p{L}\p{N}\s]+/gu, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Eşleştirme anahtarı: boşluklar dahil TÜM ayırıcılar kaldırılmış hâl.
 *
 * NEDEN AYRI BİR ANAHTAR
 * "Elon-Musk" normalleştirmeden sonra tek kelimedir ("elonmusk"), "Elon
 * Musk" ise iki. İkisi de aynı kişidir ve aynı sorguya inmelidir. Boşluğu
 * da kaldıran bir anahtar bunu çözer.
 *
 * KAYIT BU ANAHTARLA İNDEKSLENMELİDİR — `lookup` bu biçimde ifadeler alır.
 */
function matchKey(value) {
  return normalizeName(value).replace(/\s+/g, '');
}

/**
 * Konsept metninden aday eşleştirme anahtarlarını çıkarır.
 *
 * Konsept 3-5 kelimedir; bu yüzden tüm 1-4 kelimelik pencereler denenir.
 * "kelime sayısı az" diye tek kelimeye bakmak, iki kelimelik isimleri
 * kaçırırdı — bunun bir testi var.
 *
 * Her pencere `matchKey` biçiminde döner (boşluksuz), böylece "elon musk"
 * ve "elonmusk" aynı anahtara iner.
 */
function candidatePhrases(text, maxWords = 4) {
  const words = normalizeName(text).split(' ').filter(Boolean);
  const phrases = new Set();

  for (let size = 1; size <= maxWords; size += 1) {
    for (let start = 0; start + size <= words.length; start += 1) {
      phrases.add(words.slice(start, start + size).join(''));
    }
  }
  return [...phrases];
}

/**
 * Konsept metnini kısıtlı kayda karşı tarar.
 *
 * @param {string} concept  Kullanıcının 3-5 kelimelik konsepti.
 * @param {(phrases: string[]) => Promise<Array<{name,category,canonical}>>} lookup
 *        Toplu sorgu — tek tek sorgulamak, 3-5 kelime için 10+ gidiş-dönüş
 *        demektir ve üretim gecikmesini görünür şekilde artırır.
 */
async function screenConcept(concept, lookup) {
  const phrases = candidatePhrases(concept);
  if (phrases.length === 0) {
    return { blocked: false, matches: [] };
  }

  const matches = await lookup(phrases);
  const normalized = (matches ?? []).map((match) => ({
    canonical: match.canonical ?? match.name,
    category: match.category,
    enforcement: ENFORCEMENT[match.category] ?? 'block',
  }));

  return {
    blocked: normalized.some((match) => match.enforcement === 'block'),
    matches: normalized,
  };
}

module.exports = {
  CATEGORY,
  ENFORCEMENT,
  normalizeName,
  matchKey,
  candidatePhrases,
  screenConcept,
};
