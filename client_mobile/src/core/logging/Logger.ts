/**
 * Logger — release build'de tamamen susturulan, debug build'de konsola yazan
 * ince katman.
 *
 * ÖNEMLİ: Bu logger hiçbir zaman uzak sunucuya veri göndermez. Uzağa giden tek
 * şey telemetry/AnonymousCrashReporter üzerinden geçen, PII'den arındırılmış
 * yığın izidir.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

// __DEV__ React Native tarafından global olarak tanımlanır.
declare const __DEV__: boolean;

const MIN_LEVEL: Level = __DEV__ ? 'debug' : 'error';

function emit(level: Level, scope: string, message: string, meta?: unknown): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;
  const line = `[${scope}] ${message}`;
  if (level === 'error') console.error(line, meta ?? '');
  else if (level === 'warn') console.warn(line, meta ?? '');
  else console.log(line, meta ?? '');
}

export function createLogger(scope: string) {
  return {
    debug: (m: string, meta?: unknown) => emit('debug', scope, m, meta),
    info: (m: string, meta?: unknown) => emit('info', scope, m, meta),
    warn: (m: string, meta?: unknown) => emit('warn', scope, m, meta),
    error: (m: string, meta?: unknown) => emit('error', scope, m, meta),
  };
}

export type Logger = ReturnType<typeof createLogger>;
