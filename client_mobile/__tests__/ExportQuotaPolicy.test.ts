import {
  FREE_EXPORT_ALLOWANCE,
  INITIAL_QUOTA,
  applySubscription,
  canExport,
  consumeExport,
  remainingFreeExports,
  shouldProtectScreen,
  type ExportQuotaState,
} from '@/export/ExportQuotaPolicy';

const state = (overrides: Partial<ExportQuotaState> = {}): ExportQuotaState => ({
  ...INITIAL_QUOTA,
  ...overrides,
});

describe('ücretsiz indirme hakkı', () => {
  it('tam 1 adettir', () => {
    expect(FREE_EXPORT_ALLOWANCE).toBe(1);
  });

  it('ilk indirmeye izin verir ve filigransızdır', () => {
    const decision = canExport(state());
    expect(decision).toEqual({ allowed: true, watermarked: false, remainingFree: 1 });
  });

  it('hak kullanıldıktan sonra reddeder', () => {
    const used = consumeExport(state());
    expect(canExport(used)).toEqual({ allowed: false, reason: 'quota-exhausted' });
  });

  it('kalan hakkı doğru sayar', () => {
    expect(remainingFreeExports(state())).toBe(1);
    expect(remainingFreeExports(consumeExport(state()))).toBe(0);
  });

  it('hak tükendikten sonra sayaç artmaya devam etmez sorun çıkarmaz', () => {
    let current = state();
    for (let i = 0; i < 5; i++) current = consumeExport(current);
    expect(remainingFreeExports(current)).toBe(0);
  });
});

describe('PRO abonesi', () => {
  it('sınırsız ve filigransız dışa aktarır', () => {
    const pro = state({ isPro: true, usedFreeExports: 99 });
    const decision = canExport(pro);
    expect(decision.allowed).toBe(true);
    expect(decision.allowed && decision.watermarked).toBe(false);
  });

  it('sayacı tüketmez', () => {
    const pro = state({ isPro: true });
    expect(consumeExport(pro).usedFreeExports).toBe(0);
  });

  it('abonelik aktifleşince kota anında açılır', () => {
    const exhausted = consumeExport(state());
    expect(canExport(exhausted).allowed).toBe(false);

    const upgraded = applySubscription(exhausted, true);
    expect(canExport(upgraded).allowed).toBe(true);
  });

  it('abonelik bitince kota geri kapanır', () => {
    const lapsed = applySubscription(state({ isPro: true, usedFreeExports: 1 }), false);
    expect(canExport(lapsed).allowed).toBe(false);
  });
});

describe('ekran yakalama koruması', () => {
  it('hak dururken kapalıdır', () => {
    expect(shouldProtectScreen(state())).toBe(false);
  });

  it('hak tükendiğinde açılır', () => {
    expect(shouldProtectScreen(consumeExport(state()))).toBe(true);
  });

  it('PRO abonesinde kapalıdır', () => {
    const pro = state({ isPro: true, usedFreeExports: 5 });
    expect(shouldProtectScreen(pro)).toBe(false);
  });
});
