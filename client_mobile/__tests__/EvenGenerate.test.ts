import {
  MAX_CONCEPT_WORDS,
  MIN_CONCEPT_WORDS,
  REQUIRED_REFERENCE_PHOTOS,
  conceptWords,
  validateRequest,
} from '@/ai/generate/EvenGenerate';

const refs = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => `file:///ref${i}.jpg`);

describe('konsept kelime ayrıştırma', () => {
  it('fazla boşlukları yok sayar', () => {
    expect(conceptWords('  cyberpunk   sokaklar  neon ')).toEqual([
      'cyberpunk',
      'sokaklar',
      'neon',
    ]);
  });

  it('noktalamayı ayırıcı sayar', () => {
    expect(conceptWords('cyberpunk sokaklar, neon ışıklar')).toHaveLength(4);
  });

  it('boş metinde boş dizi verir', () => {
    expect(conceptWords('   ')).toHaveLength(0);
  });
});

describe('referans fotoğraf sayısı', () => {
  it('tam 5 olmalıdır', () => {
    expect(REQUIRED_REFERENCE_PHOTOS).toBe(5);
  });

  it('5 referansı kabul eder', () => {
    expect(validateRequest({ referenceUris: refs(5), concept: 'cyberpunk sokaklar neon' }).ok).toBe(
      true,
    );
  });

  it('4 referansı reddeder', () => {
    expect(validateRequest({ referenceUris: refs(4), concept: 'a b c' })).toEqual({
      ok: false,
      reason: 'too-few-references',
    });
  });

  it('6 referansı reddeder', () => {
    expect(validateRequest({ referenceUris: refs(6), concept: 'a b c' })).toEqual({
      ok: false,
      reason: 'too-many-references',
    });
  });
});

describe('konsept kelime sayısı', () => {
  it('3-5 kelime aralığındadır', () => {
    expect(MIN_CONCEPT_WORDS).toBe(3);
    expect(MAX_CONCEPT_WORDS).toBe(5);
  });

  it('3 kelimeyi kabul eder', () => {
    expect(validateRequest({ referenceUris: refs(5), concept: 'cyberpunk sokaklar neon' }).ok).toBe(
      true,
    );
  });

  it('5 kelimeyi kabul eder', () => {
    const result = validateRequest({
      referenceUris: refs(5),
      concept: 'cyberpunk sokaklar neon ışıklar yağmur',
    });
    expect(result.ok).toBe(true);
  });

  it('2 kelimeyi reddeder', () => {
    expect(validateRequest({ referenceUris: refs(5), concept: 'cyberpunk neon' })).toEqual({
      ok: false,
      reason: 'too-few-words',
    });
  });

  it('6 kelimeyi reddeder', () => {
    expect(
      validateRequest({ referenceUris: refs(5), concept: 'bir iki üç dört beş altı' }),
    ).toEqual({ ok: false, reason: 'too-many-words' });
  });

  it('boş konsepti reddeder', () => {
    expect(validateRequest({ referenceUris: refs(5), concept: '   ' })).toEqual({
      ok: false,
      reason: 'empty-concept',
    });
  });
});

describe('referans kontrolü konsept kontrolünden önce gelir', () => {
  it('her ikisi de hatalıysa referans hatasını bildirir', () => {
    expect(validateRequest({ referenceUris: refs(2), concept: 'tek' })).toEqual({
      ok: false,
      reason: 'too-few-references',
    });
  });
});
