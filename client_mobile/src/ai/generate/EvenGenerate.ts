/**
 * EvenGenerate — "Even Girl Generate" modu.
 *
 * AKIŞ
 *   1. Kullanıcı 5 referans fotoğraf yükler.
 *   2. Konsepti 3-5 kelimeyle özetler ("cyberpunk sokaklar, neon ışıklar").
 *   3. AI ajanı niyeti çözümler, fantezi arka planını seçer.
 *   4. Light Sync: arka planın ışık açısı ve renk paleti yüze füzyonlanır.
 *   5. Cinematic Bokeh: derinlik haritasından sinematik alan derinliği.
 *   6. Pore Preserve: yüksek frekans detayı (gözenek, ince tüy) orijinal
 *      karodan geri taşınır — "uncanny valley" etkisi burada ortadan kalkar.
 *   7. Çıktı FİLİGRANSIZ.
 *
 * Fırça, maske veya manuel düzenleme adımı YOKTUR.
 */
import { createLogger } from '@/core/logging/Logger';
import { appError, Err, Ok, type Result } from '@/core/result/Result';
import { AiEngine, type RunResult } from '@/ai/engine/AiEngine';

const log = createLogger('EvenGenerate');

/** Referans fotoğraf sayısı — spec gereği tam 5. */
export const REQUIRED_REFERENCE_PHOTOS = 5;

/** Konsept kelime sınırları — spec gereği 3-5 kelime. */
export const MIN_CONCEPT_WORDS = 3;
export const MAX_CONCEPT_WORDS = 5;

export type ConceptRejection =
  | 'too-few-references'
  | 'too-many-references'
  | 'too-few-words'
  | 'too-many-words'
  | 'empty-concept';

/** Konsept metnini kelimelere ayırır (noktalama ve fazla boşluk temizlenir). */
export function conceptWords(concept: string): readonly string[] {
  return concept
    .replace(/[.,;:!?]/g, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0);
}

export type ConceptValidation =
  | { readonly ok: true; readonly words: readonly string[] }
  | { readonly ok: false; readonly reason: ConceptRejection };

export function validateRequest(input: {
  referenceUris: readonly string[];
  concept: string;
}): ConceptValidation {
  if (input.referenceUris.length < REQUIRED_REFERENCE_PHOTOS) {
    return { ok: false, reason: 'too-few-references' };
  }
  if (input.referenceUris.length > REQUIRED_REFERENCE_PHOTOS) {
    return { ok: false, reason: 'too-many-references' };
  }

  const words = conceptWords(input.concept);
  if (words.length === 0) return { ok: false, reason: 'empty-concept' };
  if (words.length < MIN_CONCEPT_WORDS) return { ok: false, reason: 'too-few-words' };
  if (words.length > MAX_CONCEPT_WORDS) return { ok: false, reason: 'too-many-words' };

  return { ok: true, words };
}

export interface GenerateRequest {
  readonly referenceUris: readonly string[];
  readonly concept: string;
  /** Kullanıcının seçtiği fantezi arka plan kimliği. */
  readonly backdropId: string;
  readonly maxEdgePx?: number;
}

export interface GenerateResult extends RunResult {
  /** Even Girl Generate çıktıları HER ZAMAN filigransızdır. */
  readonly watermarked: false;
  readonly conceptWords: readonly string[];
}

export const EvenGenerate = {
  async run(request: GenerateRequest): Promise<Result<GenerateResult>> {
    const validation = validateRequest(request);
    if (!validation.ok) {
      return Err(
        appError('UNKNOWN', `geçersiz istek: ${validation.reason}`, {
          i18nKey: `generate.error.${validation.reason}`,
        }),
      );
    }

    log.debug(`Even Generate — ${validation.words.length} kelime, ${request.referenceUris.length} referans`);

    // Tek çağrı: sunucudaki ajan zinciri light-sync + bokeh + pore-preserve
    // adımlarını kendi içinde sıralar. İstemcinin adımları tek tek çağırması,
    // her adımda medyayı yeniden yüklemek demektir.
    const result = await AiEngine.run('even-generate', {
      sourceUri: request.referenceUris[0]!,
      maxEdgePx: request.maxEdgePx ?? 2048,
      params: {
        references: request.referenceUris.join(','),
        concept: validation.words.join(' '),
        backdropId: request.backdropId,
        lightSync: true,
        cinematicBokeh: true,
        porePreserve: true,
      },
      preferRemote: true,
    });

    if (!result.ok) return result;

    return Ok({
      ...result.value,
      watermarked: false,
      conceptWords: validation.words,
    });
  },
};
