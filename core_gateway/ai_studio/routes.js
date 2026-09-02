/**
 * core_gateway/ai_studio/routes.js
 *
 * Even Girl Generate üretim kapısı.
 *
 * KAPI SIRASI — her adım bir öncekini varsayar:
 *
 *   1. Yetki        → PRO değilse hiç başlamaz
 *   2. Konsept      → enjeksiyon taraması + sadeleştirme
 *   3. İsim taraması→ konseptte kısıtlı kimlik var mı (METİN hattı)
 *   4. Yüz taraması → referanslarda kısıtlı kimlik var mı (GÖRÜNTÜ hattı)
 *   5. Negatif      → taban liste eksiksiz mi (üretimden hemen önce)
 *   6. Üretim
 *
 * SIRA NEDEN BU
 * Yüz taraması en pahalı adımdır (5 gömme + kayıt sorgusu). Ucuz metin
 * kapıları önce çalışır. Ama negatif liste doğrulaması EN SONA konur:
 * amacı, kendisinden önceki hiçbir adımın listeyi düşürmediğini üretim
 * çağrısına bitişik olarak kanıtlamaktır.
 */

'use strict';

const express = require('express');
const crypto = require('crypto');

const { requireProEntitlement } = require('../../billing_infrastructure/entitlements');
const registry = require('./restrictedRegistry');
const faceScreening = require('./faceScreening');
const negativePrompts = require('./negativePrompts');
const providers = require('./providers');

const router = express.Router();

function shortId(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 8);
}

/** Konsept kelime sınırları — istemcideki EvenGenerate.ts ile aynı. */
const MIN_CONCEPT_WORDS = 3;
const MAX_CONCEPT_WORDS = 5;

router.post(
  '/ai/even-generate',
  express.json({ limit: '64kb' }),
  requireProEntitlement,
  async (req, res) => {
    const { concept, references, extraNegative } = req.body ?? {};
    const userId = req.headers['x-app-user-id'];

    if (typeof concept !== 'string') {
      return res.status(400).json({ error: 'invalid_concept' });
    }

    try {
      // --- 2. Konsept: enjeksiyon + sadeleştirme -----------------------
      const prompt = negativePrompts.buildPrompt(
        concept,
        Array.isArray(extraNegative) ? extraNegative.slice(0, 10).map(String) : [],
      );

      if (!prompt.ok) {
        // Hangi kalıbın eşleştiği kullanıcıya SÖYLENMEZ: bu bilgi, kapıyı
        // deneme-yanılmayla kalibre etmenin tarifidir.
        console.warn(
          `[AiStudio] prompt reddi user=${shortId(userId)} reason=${prompt.reason}` +
            ` pattern=${prompt.pattern ?? '-'}`,
        );
        return res.status(422).json({ error: 'concept_rejected', reason: prompt.reason });
      }

      const wordCount = prompt.positive.split(' ').filter(Boolean).length;
      if (wordCount < MIN_CONCEPT_WORDS || wordCount > MAX_CONCEPT_WORDS) {
        return res.status(400).json({
          error: 'concept_length',
          min: MIN_CONCEPT_WORDS,
          max: MAX_CONCEPT_WORDS,
        });
      }

      // --- 3. METİN hattı: konseptte kısıtlı isim ----------------------
      const nameScreen = await registry.screenConcept(prompt.positive, lookupRestrictedNames);
      if (nameScreen.blocked) {
        await recordGuardEvent({
          userId,
          stage: 'concept_name',
          categories: nameScreen.matches.map((m) => m.category),
          atMs: Date.now(),
        });
        return res.status(422).json({
          error: 'restricted_identity',
          stage: 'concept',
          categories: [...new Set(nameScreen.matches.map((m) => m.category))],
        });
      }

      // --- 4. GÖRÜNTÜ hattı: referanslarda kısıtlı yüz -----------------
      const faceDecision = await faceScreening.screenReferences(faceDeps, {
        references,
        userId,
        nowMs: Date.now(),
      });

      if (faceDecision.outcome !== faceScreening.OUTCOME.ALLOW) {
        const status = faceDecision.retryable ? 400 : 422;
        return res.status(status).json({
          error: 'reference_rejected',
          stage: 'reference',
          reasons: faceDecision.reasons,
          // `review` sonucu kullanıcıya "reddedildi" olarak döner: "inceleme
          // sonrası üretilebilir" demek, üretimi kuyruğa almak demektir ve
          // deepfake kapısında bekleyen bir kuyruk tutmuyoruz.
          retryable: faceDecision.retryable,
        });
      }

      // --- 5. Negatif liste bütünlüğü (üretime BİTİŞİK) ----------------
      const intact = negativePrompts.assertBaseNegativeIntact(prompt.negative);
      if (!intact.intact) {
        // Buraya düşmek bir KOD hatasıdır, kullanıcı hatası değil. Sessizce
        // üretmek, güvenlik listesi olmadan üretmek demektir.
        console.error(`[AiStudio] taban negatif liste eksik: ${intact.missing.join(', ')}`);
        return res.status(500).json({ error: 'guard_integrity_failed' });
      }

      // --- 6. Üretim ---------------------------------------------------
      const result = await generate({
        positive: prompt.positive,
        negative: prompt.negative,
        references,
        userId,
      });

      return res.status(200).json(result);
    } catch (err) {
      console.error(`[AiStudio] üretim hatası user=${shortId(userId)}:`, err.message);
      return res.status(500).json({ error: 'generation_failed' });
    }
  },
);

// ---- Örnek bağımlılıklar (kendi katmanınızla değiştirin) ----

/**
 * Kısıtlı isim toplu sorgusu.
 *
 * FAIL-CLOSED: veritabanı hatası FIRLATILIR, boş dizi döndürülmez.
 * "Eşleşme yok" demek, veritabanı hatasında deepfake kapısını sessizce
 * açmaktır — çağıran taraf 500 döndürür ve üretim hiç başlamaz.
 */
async function lookupRestrictedNames(phrases) {
  const { getRepositories } = require('../../persistence/registry');
  return getRepositories().lookupRestrictedNames(phrases);
}

const faceDeps = {
  /**
   * Yüz gömme + kayıt eşleştirme.
   *
   * Gömme HİÇBİR YERE YAZILMAZ; yalnızca eşleşme sonucu döner.
   * Yapılandırılmamışsa fırlatır — sessizce `undefined` dönen bir tarayıcı
   * `decideFaceScreening`'i fail-closed yoluna sokar ama sebebi görünmez
   * olurdu.
   */
  // ORTAMDAN kurulur (`configureProviders`). Yapılandırılmamışsa fırlatan
  // yer tutucu kalır ve fail-closed korunur.
  screenFaces: providers.unconfigured('face_screener', 'FACE_SCREENER_URL'),
  recordAttempt: async (record) => {
    const { getRepositories } = require('../../persistence/registry');
    console.warn(
      `[AiStudio] GUARD -> user=${shortId(record.userId)} outcome=${record.outcome} ` +
        `reasons=${record.reasons.join(',')}`,
    );
    // Gömme, benzerlik vektörü veya fotoğraf referansı TAŞINMAZ.
    return getRepositories().writeAudit({
      action: 'face_screening_blocked',
      subjectId: record.userId,
      detail: { outcome: record.outcome, reasons: record.reasons, categories: record.categories },
      atMs: record.atMs,
    });
  },
};

async function recordGuardEvent(event) {
  const { getRepositories } = require('../../persistence/registry');
  console.warn(
    `[AiStudio] GUARD -> user=${shortId(event.userId)} stage=${event.stage} ` +
      `categories=${event.categories.join(',')}`,
  );
  return getRepositories().writeAudit({
    action: 'generation_blocked',
    subjectId: event.userId,
    detail: { stage: event.stage, categories: event.categories },
    atMs: event.atMs,
  });
}

let generate = providers.unconfigured('generator', 'IMAGE_GENERATOR_URL');

/**
 * Dış sağlayıcıları ortamdan kurar. `server.js` açılışta çağırır.
 *
 * İkisi de kalıcı olarak fırlatan yer tutucuydu: fail-closed doğruydu ama
 * Even Girl Generate HİÇ ÇALIŞMIYORDU. Doğru davranış ile çalışan ürün aynı
 * şey değildir; bu yüzden eksik yapılandırma artık açılışta söyleniyor.
 *
 * Testler bu fonksiyonu ÇAĞIRMAZ ve kendi bağımlılıklarını enjekte eder.
 */
function configureProviders(env = process.env) {
  const configured = providers.createProvidersFromEnv(env);
  faceDeps.screenFaces = configured.screenFaces;
  generate = configured.generate;

  if (!configured.faceScreenerConfigured) {
    console.warn(
      '[AiStudio] FACE_SCREENER_URL TANIMLI DEĞİL — yüz taraması yok.\n' +
        '  Fail-closed korunuyor: referans içeren HİÇBİR üretim tamamlanmayacak.',
    );
  }
  if (!configured.generatorConfigured) {
    console.warn(
      '[AiStudio] IMAGE_GENERATOR_URL TANIMLI DEĞİL — üreteç yok.\n' +
        '  Even Girl Generate isteklerinin tamamı 500 dönecek.',
    );
  }

  return {
    faceScreener: configured.faceScreenerConfigured,
    generator: configured.generatorConfigured,
  };
}

module.exports = router;
module.exports.faceDeps = faceDeps;
module.exports.MIN_CONCEPT_WORDS = MIN_CONCEPT_WORDS;
module.exports.MAX_CONCEPT_WORDS = MAX_CONCEPT_WORDS;
module.exports.configureProviders = configureProviders;
