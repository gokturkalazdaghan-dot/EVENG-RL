/**
 * core_gateway/ai_studio/faceScreening.js
 *
 * Yüz biyometrik ön taraması: referans fotoğraflar kısıtlı kimliklere karşı.
 *
 * NEDEN ÜRETİMDEN ÖNCE
 * Tarama üretimden SONRA yapılırsa, kısıtlı bir kimliğin fotogerçekçi sahte
 * görüntüsü bir kez üretilmiş olur — diskte, log'da, önbellekte. Silmek onu
 * üretilmemiş yapmaz. Kapı girişte durur.
 *
 * GÖMME SAKLANMAZ
 * Referans fotoğrafların yüz gömmeleri (embedding) BİYOMETRİK VERİDİR ve
 * GDPR Md.9 / BIPA kapsamındadır. Bu modül gömmeyi yalnızca istek süresince
 * bellekte tutar, hiçbir yere yazmaz ve kayıt sorgusuna gömme değil
 * yalnızca EŞLEŞME SONUCU taşınır. Uygulamanın "hiçbir kimlik bilgisi
 * toplanmaz" taahhüdü bunu gerektirir.
 *
 * TEK FOTOĞRAF YETMEZ, HEPSİ DE GEREKMEZ
 * 5 referansın TEK BİRİNDE kısıtlı kimlik bulunması üretimi durdurur.
 * "Çoğunluk kuralı" uygulamak, 4 kendi fotoğrafı + 1 ünlü fotoğrafı ile
 * kimlik harmanlamayı serbest bırakırdı — ki bu, deepfake üretmenin en
 * bilinen yoludur.
 */

'use strict';

/**
 * Kosinüs benzerliği eşikleri.
 *
 * `match` eşiği bilinçli olarak DÜŞÜK tutulmuştur. Bu kapıda yanlış
 * pozitifin bedeli bir kullanıcının fotoğrafını yeniden yüklemesidir;
 * yanlış negatifin bedeli, gerçek bir insanın hiç yapmadığı bir şeyi
 * yapıyormuş gibi görünen fotogerçekçi bir görüntüdür. Kıyaslanamaz.
 */
const THRESHOLDS = Object.freeze({
  /** Bu ve üzeri: aynı kişi kabul edilir → blok. */
  match: 0.62,
  /** Bu ve üzeri: şüpheli benzerlik → insan incelemesi. */
  review: 0.52,
});

/** Referans fotoğraf sayısı — EvenGenerate spec'i ile aynı. */
const REQUIRED_REFERENCES = 5;

const OUTCOME = Object.freeze({
  ALLOW: 'allow',
  REVIEW: 'review',
  BLOCK: 'block',
});

/**
 * Tek bir tarama sonucunu değerlendirir.
 *
 * @param {object|null} screening  Tarayıcı yanıtı; null/eksik ise fail-closed.
 */
function decideFaceScreening(screening) {
  // FAIL-CLOSED: tarayıcı çalışmadıysa üretim yapılmaz. Deepfake kapısının
  // "tarayıcı bozuk, geç" modu olamaz.
  if (!screening || screening.screenerRan !== true) {
    return {
      outcome: OUTCOME.BLOCK,
      reasons: ['screener_unavailable'],
      matches: [],
      retryable: true,
    };
  }

  const faces = Array.isArray(screening.faces) ? screening.faces : [];

  // Hiç yüz bulunamadıysa kimlik koşullama zaten anlamsızdır; bu bir
  // ihlal değil, geçersiz girdidir.
  if (faces.length === 0) {
    return {
      outcome: OUTCOME.BLOCK,
      reasons: ['no_face_detected'],
      matches: [],
      retryable: true,
    };
  }

  const matches = [];
  let highest = 0;

  for (const face of faces) {
    const similarity = normalizeSimilarity(face.similarity);
    if (similarity > highest) highest = similarity;

    if (similarity >= THRESHOLDS.review) {
      matches.push({
        referenceIndex: face.referenceIndex ?? null,
        canonical: face.canonical ?? 'unknown',
        category: face.category ?? 'public_figure',
        similarity,
      });
    }
  }

  if (highest >= THRESHOLDS.match) {
    return {
      outcome: OUTCOME.BLOCK,
      reasons: ['restricted_identity_match'],
      matches,
      retryable: false,
    };
  }
  if (highest >= THRESHOLDS.review) {
    return {
      outcome: OUTCOME.REVIEW,
      reasons: ['restricted_identity_similar'],
      matches,
      retryable: false,
    };
  }

  return { outcome: OUTCOME.ALLOW, reasons: [], matches: [], retryable: false };
}

/** Benzerlik skorunu 0..1'e sıkıştırır; anlamsız değer 1 sayılır (fail-closed). */
function normalizeSimilarity(raw) {
  if (raw === undefined || raw === null) return 0;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 1;
  return Math.min(1, Math.max(0, raw));
}

/**
 * Referans setinin bütünlüğünü doğrular.
 *
 * Eksik referansla üretim yapmak, kimlik koşullamayı zayıflatır ve
 * "az referansla daha kolay geçer" davranışını ödüllendirir.
 */
function validateReferenceSet(references) {
  if (!Array.isArray(references) || references.length !== REQUIRED_REFERENCES) {
    return { valid: false, reason: 'reference_count' };
  }
  if (references.some((ref) => typeof ref !== 'string' || ref.length === 0)) {
    return { valid: false, reason: 'invalid_reference' };
  }
  // Aynı fotoğrafı 5 kez yüklemek geçerli bir referans seti değildir.
  if (new Set(references).size !== references.length) {
    return { valid: false, reason: 'duplicate_references' };
  }
  return { valid: true, reason: null };
}

/**
 * Tarama + karar. Gömmeler HİÇBİR YERE yazılmaz.
 *
 * @param {object} deps
 *   - screenFaces(references) → { screenerRan, faces: [{referenceIndex, similarity, canonical, category}] }
 *   - recordAttempt(record)   → denetim kaydı (gömme İÇERMEZ)
 */
async function screenReferences(deps, { references, userId, nowMs }) {
  const validity = validateReferenceSet(references);
  if (!validity.valid) {
    return {
      outcome: OUTCOME.BLOCK,
      reasons: [validity.reason],
      matches: [],
      retryable: true,
    };
  }

  let screening = null;
  try {
    screening = await deps.screenFaces(references);
  } catch (err) {
    console.error('[FaceScreening] tarayıcı hatası:', err.message);
    screening = null;
  }

  const decision = decideFaceScreening(screening);

  if (decision.outcome !== OUTCOME.ALLOW) {
    // Denetim kaydı: hangi kullanıcı, hangi kategori, hangi sonuç.
    // Gömme, benzerlik vektörü veya fotoğraf referansı TAŞINMAZ.
    await deps.recordAttempt({
      userId,
      outcome: decision.outcome,
      reasons: decision.reasons,
      categories: [...new Set(decision.matches.map((m) => m.category))],
      atMs: nowMs,
    });
  }

  return decision;
}

module.exports = {
  THRESHOLDS,
  REQUIRED_REFERENCES,
  OUTCOME,
  decideFaceScreening,
  validateReferenceSet,
  screenReferences,
};
