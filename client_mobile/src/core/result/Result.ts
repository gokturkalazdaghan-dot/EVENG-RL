/**
 * Result<T, E> — istisna fırlatmak yerine hata durumunu tip sisteminde taşıyan
 * dönüş tipi. AI/ödeme/güvenlik gibi "beklenen başarısızlığı olan" katmanlarda
 * try/catch yerine bunu kullanıyoruz; böylece çağıran taraf hatayı ele almayı
 * unutamıyor (derleyici zorluyor).
 */
export type Result<T, E = AppError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });

/** Uygulama genelindeki hata sınıfları — analitikte tip olarak gruplanır. */
export type AppErrorCode =
  | 'SECURITY_INTEGRITY_FAILED'
  | 'NETWORK_UNAVAILABLE'
  | 'PINNING_FAILED'
  | 'MODEL_UNAVAILABLE'
  | 'MODEL_TOO_HEAVY_FOR_DEVICE'
  | 'THERMAL_THROTTLED'
  | 'CACHE_WRITE_FAILED'
  | 'BILLING_UNAVAILABLE'
  | 'BILLING_CANCELLED'
  | 'ENTITLEMENT_REQUIRED'
  | 'DISCLAIMER_NOT_ACCEPTED'
  | 'UNKNOWN';

export interface AppError {
  readonly code: AppErrorCode;
  /** Geliştirici mesajı — ASLA kullanıcıya gösterilmez, PII içerebilecek
   *  hiçbir alan buraya yazılmaz (bkz. telemetry/Scrubber.ts). */
  readonly debugMessage: string;
  /** Kullanıcıya gösterilecek metnin i18n anahtarı. */
  readonly i18nKey: string;
  readonly retryable: boolean;
}

export function appError(
  code: AppErrorCode,
  debugMessage: string,
  opts: { i18nKey?: string; retryable?: boolean } = {},
): AppError {
  return {
    code,
    debugMessage,
    i18nKey: opts.i18nKey ?? `errors.${code}`,
    retryable: opts.retryable ?? false,
  };
}

export function unwrapOr<T>(result: Result<T, unknown>, fallback: T): T {
  return result.ok ? result.value : fallback;
}
