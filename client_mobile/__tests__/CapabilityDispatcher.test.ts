/**
 * CapabilityDispatcher testleri.
 *
 * NEDEN
 * EditorScreen her araç için `AiEngine.run(capability, { sourceUri,
 * maxEdgePx: 2048 })` çağırıyordu; boru hatlarının yetenek başına
 * ayarladığı kenar tavanları ve parametreler HİÇ UYGULANMIYORDU.
 * Boru hatları depoda duruyor, kod incelemesinde doğru görünüyor, çalışma
 * anında devre dışıydı.
 *
 * Buradaki testler `AiEngine.run`'ı taklit edip HANGİ ARGÜMANLARLA
 * çağrıldığını ölçüyor: "çağrıldı mı" değil, "doğru tavanla mı çağrıldı".
 */

// `mock` önekli değişkenler jest.mock fabrikasından erişilebilir; öneksiz
// olanlar "out-of-scope variable" hatası verir (fabrika hoisted edilir).
const mockRun = jest.fn(async () => ({ ok: true as const, value: { executedOn: 'local' } }));

jest.mock('@/ai/engine/AiEngine', () => ({
  AiEngine: { run: (...args: unknown[]) => mockRun(...(args as [])) },
}));

jest.mock('@/connectivity/NetworkMonitor', () => ({
  NetworkMonitor: { isOnline: true, isMetered: false },
}));

jest.mock('@/performance/ThermalGovernor', () => ({
  ThermalGovernor: { budget: { maxOutputEdgePx: 1920 } },
}));

import {
  dispatchCapability,
  DEDICATED_FLOW_CAPABILITIES,
  NON_TOOL_CAPABILITIES,
  SOURCELESS_CAPABILITIES,
} from '@/ai/CapabilityDispatcher';
import type { Capability } from '@/ai/engine/ModelRegistry';

const SRC = 'file:///tmp/a.jpg';

beforeEach(() => mockRun.mockClear());

/** Son `AiEngine.run` çağrısının seçenekleri. */
function lastOptions(): Record<string, unknown> {
  const call = mockRun.mock.calls.at(-1) as unknown as [string, Record<string, unknown>];
  return call[1];
}
function lastCapability(): string {
  const call = mockRun.mock.calls.at(-1) as unknown as [string, unknown];
  return call[0];
}

describe('Yetenek başına kenar tavanı UYGULANIR', () => {
  it('ai-avatar 1024 kenarla çalışır — 2048 değil', async () => {
    // Boru hattının koyduğu tavan: "bellek tepe noktası cihazı öldürmesin".
    await dispatchCapability('ai-avatar', SRC);
    expect(lastCapability()).toBe('ai-avatar');
    expect(lastOptions().maxEdgePx).toBe(1024);
    expect(lastOptions().preferRemote).toBe(true);
  });

  it('hd-upscale 4x seçilince 4096 kenar alır', async () => {
    await dispatchCapability('hd-upscale', SRC, { scale: 4 });
    expect(lastOptions().maxEdgePx).toBe(4096);

    await dispatchCapability('hd-upscale', SRC, { scale: 2 });
    expect(lastOptions().maxEdgePx).toBe(2560);
  });

  it('auto-captions bir VİDEO işlemidir — kenar tavanı 0', async () => {
    await dispatchCapability('auto-captions', SRC);
    expect(lastOptions().maxEdgePx).toBe(0);
  });

  it('object-tracking düşük çözünürlükte çalışır — ısınmayı artırmaz', async () => {
    await dispatchCapability('object-tracking', SRC);
    expect(lastOptions().maxEdgePx).toBe(1280);
  });

  it('manuel stüdyo araçları tam 4096 kenarda çalışır', async () => {
    for (const capability of [
      'manual-reshape',
      'botox-jawline',
      'skin-smooth',
      'blemish-eraser',
    ] as const) {
      await dispatchCapability(capability, SRC);
      expect(lastOptions().maxEdgePx).toBe(4096);
    }
  });

  it('smart-template küçük önizleme gönderir — bant genişliği tasarrufu', async () => {
    await dispatchCapability('smart-template', SRC);
    expect(lastOptions().maxEdgePx).toBe(768);
  });
});

describe('Parametreler sıkıştırılır', () => {
  it('face-restore gücü 0..1 aralığına kırpılır', async () => {
    await dispatchCapability('face-restore', SRC, { strength: 5 });
    expect((lastOptions().params as { strength: number }).strength).toBe(1);

    await dispatchCapability('face-restore', SRC, { strength: -3 });
    expect((lastOptions().params as { strength: number }).strength).toBe(0);
  });

  it('NaN güç varsayılana düşer — modele NaN gitmez', async () => {
    // NaN native tarafa gittiğinde çıktı sessizce bozulur ya da çökme olur.
    await dispatchCapability('face-restore', SRC, { strength: Number.NaN });
    expect((lastOptions().params as { strength: number }).strength).toBe(0.6);
  });

  it('geçersiz scale 2x sayılır', async () => {
    await dispatchCapability('hd-upscale', SRC, { scale: 3 as unknown as 2 });
    expect(lastOptions().maxEdgePx).toBe(2560);
  });
});

describe('Kaynak medya kontrolü', () => {
  it('kaynak yoksa çağrı YAPILMAZ ve açık hata döner', async () => {
    const result = await dispatchCapability('face-restore', undefined);

    expect(result.ok).toBe(false);
    // "hiçbir şey olmadı" yerine sebebi söylenen bir hata.
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('text-to-video kaynaksız da çalışır', async () => {
    const result = await dispatchCapability('text-to-video', undefined, { prompt: 'gün batımı' });
    expect(result.ok).toBe(true);
    expect(mockRun).toHaveBeenCalled();
  });
});

describe('Araç olmayan yetenekler', () => {
  it('nsfw-classify araç olarak çalıştırılamaz', async () => {
    // Moderasyon sınıflandırıcısı bir kullanıcı aracı değildir; sunucu
    // tarafında da aynı sebeple KNOWN_CAPABILITIES dışında.
    const result = await dispatchCapability('nsfw-classify', SRC);
    expect(result.ok).toBe(false);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('even-generate kendi akışına yönlendirir, boş istekle çalıştırmaz', async () => {
    // Kavram + 5 referans + arka plan ister; araç çubuğundan boş
    // parametreyle çağırmak "empty-concept" hatası üretirdi.
    const result = await dispatchCapability('even-generate', SRC);
    expect(result.ok).toBe(false);
    expect(mockRun).not.toHaveBeenCalled();
    expect(DEDICATED_FLOW_CAPABILITIES.has('even-generate')).toBe(true);
  });
});

describe('Kapsam: HİÇBİR yetenek eşlemenin dışında kalmaz', () => {
  // Kaynaktan okunuyor, kopyalanmıyor: elle yazılmış bir liste yeni
  // yetenek eklendiğinde güncellenmeyi unutur ve yeni araç ayarsız
  // (2048 kenar, parametresiz) çalışır — tam da bu testin engellediği şey.
  const source = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'src/ai/engine/ModelRegistry.ts'),
    'utf8',
  ) as string;

  const union = source.slice(
    source.indexOf('export type Capability'),
    source.indexOf(';', source.indexOf('export type Capability')),
  );
  const capabilities = [...union.matchAll(/\|\s*'([a-z0-9-]+)'/g)].map((m) => m[1] as Capability);

  it('yetenek birliği okunabildi', () => {
    expect(capabilities.length).toBeGreaterThanOrEqual(20);
  });

  it.each(capabilities)('%s eşlenmiş', async (capability) => {
    mockRun.mockClear();
    const source_ = SOURCELESS_CAPABILITIES.has(capability) ? undefined : SRC;
    const result = await dispatchCapability(capability, source_, { maskUri: 'file://m.png' });

    if (NON_TOOL_CAPABILITIES.has(capability) || DEDICATED_FLOW_CAPABILITIES.has(capability)) {
      expect(result.ok).toBe(false);
      return;
    }

    // Eşlenmemiş bir yetenek `switch` içinde hiçbir dala düşmez ve
    // TypeScript'in tükenmişlik denetimi derlemede yakalar; bu test
    // çalışma anında da doğruluyor.
    expect(mockRun).toHaveBeenCalledTimes(1);
    expect(lastCapability()).toBe(capability);
  });
});
