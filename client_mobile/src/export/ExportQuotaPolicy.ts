/**
 * ExportQuotaPolicy — ücretsiz indirme hakkının SAF karar mantığı.
 *
 * KURAL
 *   - Üretim ve düzenleme SINIRSIZ.
 *   - Yerel galeriye kayıt hakkı: ücretsiz kullanıcıya TOPLAM 1 adet.
 *   - Bu tek hak filigransızdır.
 *   - Hak tükendiğinde kayıt/ekran görüntüsü denemesi paywall'a yönlenir.
 *   - Abonelik aktifse sınırsız ve filigransız.
 */

export const FREE_EXPORT_ALLOWANCE = 1;

export interface ExportQuotaState {
  /** Şimdiye kadar kullanılan ücretsiz indirme sayısı. */
  readonly usedFreeExports: number;
  readonly isPro: boolean;
}

export const INITIAL_QUOTA: ExportQuotaState = {
  usedFreeExports: 0,
  isPro: false,
};

export type ExportDecision =
  | { readonly allowed: true; readonly watermarked: false; readonly remainingFree: number }
  | { readonly allowed: false; readonly reason: 'quota-exhausted' };

/** Dışa aktarım (galeriye kayıt) izni. */
export function canExport(state: ExportQuotaState): ExportDecision {
  if (state.isPro) {
    return { allowed: true, watermarked: false, remainingFree: Number.POSITIVE_INFINITY };
  }

  const remaining = FREE_EXPORT_ALLOWANCE - state.usedFreeExports;
  if (remaining <= 0) return { allowed: false, reason: 'quota-exhausted' };

  return { allowed: true, watermarked: false, remainingFree: remaining };
}

/** Başarılı bir dışa aktarımdan SONRA sayacı ilerletir. */
export function consumeExport(state: ExportQuotaState): ExportQuotaState {
  if (state.isPro) return state;
  return { ...state, usedFreeExports: state.usedFreeExports + 1 };
}

export function remainingFreeExports(state: ExportQuotaState): number {
  if (state.isPro) return Number.POSITIVE_INFINITY;
  return Math.max(0, FREE_EXPORT_ALLOWANCE - state.usedFreeExports);
}

/**
 * Ekran yakalama koruması ne zaman aktif olmalı.
 *
 * Ücretsiz hak tükendiğinde koruma devreye girer; PRO abonesinde kapalıdır.
 */
export function shouldProtectScreen(state: ExportQuotaState): boolean {
  if (state.isPro) return false;
  return remainingFreeExports(state) <= 0;
}

/** Abonelik durumu değiştiğinde kotayı günceller. */
export function applySubscription(state: ExportQuotaState, isPro: boolean): ExportQuotaState {
  return { ...state, isPro };
}
