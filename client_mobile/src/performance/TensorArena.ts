/**
 * TensorArena — AI tensor'larının ömrünü AÇIKÇA yöneten havuz.
 *
 * SORUN: TFLite/CoreML tensor'ları JS heap'inde değil native heap'te durur.
 * JS tarafındaki referans düşse bile GC'nin ne zaman çalışacağı belirsizdir ve
 * JS GC'si native belleği zaten SAYMAZ — 4K bir kare için ayrılan 100+ MB,
 * JS tarafı "boş" görünürken dakikalarca tutulabilir. Sonuç: iOS'ta jetsam,
 * Android'de LMK tarafından öldürülme; kullanıcı için "uygulama kapandı".
 *
 * ÇÖZÜM: Tensor'lar bir arena içinde alınır; `withArena` scope'undan çıkıldığı
 * anda — hata fırlasa, iş iptal edilse bile — native buffer'lar DERHAL
 * serbest bırakılır. GC'ye güvenilmez.
 */
import { NativeModules } from 'react-native';

import { createLogger } from '@/core/logging/Logger';

const log = createLogger('TensorArena');

interface NativeTensorBridge {
  allocate(arenaId: string, bytes: number, label: string): Promise<number>;
  release(handle: number): Promise<void>;
  releaseAll(arenaId: string): Promise<void>;
  nativeHeapUsedBytes(): Promise<number>;
}

const bridge = NativeModules.EvenGirlTensor as NativeTensorBridge | undefined;

export interface TensorHandle {
  readonly id: number;
  readonly bytes: number;
  readonly label: string;
}

/** Açık arena'lar — bellek baskısında dışarıdan kapatılabilmeleri için. */
const openArenas = new Set<Arena>();

export class Arena {
  private readonly handles: TensorHandle[] = [];
  private closed = false;

  constructor(
    readonly id: string,
    /** Kullanıcının aktif olarak beklediği iş mi? Bellek baskısında en son feda edilir. */
    readonly interactive: boolean = true,
  ) {}

  async allocate(bytes: number, label: string): Promise<TensorHandle> {
    if (this.closed) throw new Error(`Kapalı arena'ya tahsis: ${this.id}`);

    const nativeId = (await bridge?.allocate(this.id, bytes, label)) ?? -1;
    const handle: TensorHandle = { id: nativeId, bytes, label };
    this.handles.push(handle);
    return handle;
  }

  /**
   * Ara tensor'u scope bitmeden bırakır. Uzun işlem hatlarında (ör. 12 adımlı
   * difüzyon) her adımın çıktısını tutmak tepe belleği katlar; adım biter
   * bitmez bırakmak tavanı tek adımın maliyetine indirir.
   */
  async releaseEarly(handle: TensorHandle): Promise<void> {
    const index = this.handles.indexOf(handle);
    if (index === -1) return;
    this.handles.splice(index, 1);
    await bridge?.release(handle.id).catch(() => undefined);
  }

  get allocatedBytes(): number {
    return this.handles.reduce((sum, h) => sum + h.bytes, 0);
  }

  get isClosed(): boolean {
    return this.closed;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    openArenas.delete(this);

    const freed = this.allocatedBytes;
    this.handles.length = 0;
    await bridge?.releaseAll(this.id).catch((e) => log.error('releaseAll başarısız', e));
    log.debug(`Arena kapandı ${this.id} — ${freed} bayt`);
  }
}

let arenaCounter = 0;

/**
 * Tensor kullanan HER işlem bu scope içinde çalışmalıdır.
 * `finally`, işlem hata verse veya iptal edilse de belleğin bırakılmasını
 * garanti eder — bu garanti olmadan tek bir hata yolu sızıntı üretir.
 */
export async function withArena<T>(
  label: string,
  fn: (arena: Arena) => Promise<T>,
  options: { interactive?: boolean } = {},
): Promise<T> {
  const arena = new Arena(`${label}#${++arenaCounter}`, options.interactive ?? true);
  openArenas.add(arena);
  try {
    return await fn(arena);
  } finally {
    await arena.close();
  }
}

/**
 * Bellek baskısında (iOS didReceiveMemoryWarning / Android onTrimMemory)
 * çağrılır. Önce etkileşimsiz (arka plan ön-render) arena'lar kapatılır;
 * kullanıcının beklediği iş en son feda edilir.
 *
 * Dönen değer: serbest bırakılan tahmini bayt.
 */
export async function releaseUnderMemoryPressure(
  options: { includeInteractive?: boolean } = {},
): Promise<number> {
  const victims = [...openArenas].filter(
    (arena) => options.includeInteractive === true || !arena.interactive,
  );
  const freed = victims.reduce((sum, arena) => sum + arena.allocatedBytes, 0);

  await Promise.all(victims.map((arena) => arena.close()));

  if (victims.length > 0) {
    log.warn(`Bellek baskısı: ${victims.length} arena kapatıldı (~${freed} bayt)`);
  }
  return freed;
}

export async function nativeHeapUsedBytes(): Promise<number> {
  return (await bridge?.nativeHeapUsedBytes()) ?? 0;
}

/** Testler için — tekil kayıt defterini temizler. */
export function resetArenaRegistryForTests(): void {
  openArenas.clear();
}
