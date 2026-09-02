/**
 * Araç çubuğu kapsamı: her yetenek kullanıcıya ULAŞIYOR mu.
 *
 * NEDEN
 * EditorScreen araçları `APPLIES_TO[capability] !== undefined` ile süzüyor.
 * Bir yetenek bu tabloya eklenmezse araç çubuğunda HİÇ GÖRÜNMEZ — yetenek
 * tanımlı, boru hattı yazılmış, sunucu kabul ediyor, kullanıcı ulaşamıyor.
 *
 * Ölçüldü: ürünün amiral gemisi olan sekiz yetenek (Manuel & Botox stüdyo
 * ve Even Girl Generate adımları) tam olarak bu durumdaydı. Hiçbir test
 * göremiyordu çünkü eksik satır, yanlış satır gibi görünmüyor.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { NON_TOOL_CAPABILITIES } from '@/ai/CapabilityDispatcher';
import type { Capability } from '@/ai/engine/ModelRegistry';

const src = join(__dirname, '..', 'src');

/** Yetenek birliği KAYNAKTAN okunuyor — kopyalanmış liste bayatlar. */
function capabilities(): Capability[] {
  const text = readFileSync(join(src, 'ai/engine/ModelRegistry.ts'), 'utf8');
  const start = text.indexOf('export type Capability');
  const block = text.slice(start, text.indexOf(';', start));
  return [...block.matchAll(/\|\s*'([a-z0-9-]+)'/g)].map((m) => m[1] as Capability);
}

/** EditorScreen'in APPLIES_TO tablosundaki anahtarlar. */
function toolbarKeys(): Set<string> {
  const text = readFileSync(join(src, 'ui/screens/EditorScreen.tsx'), 'utf8');
  const start = text.indexOf('const APPLIES_TO');
  const block = text.slice(start, text.indexOf('\n};', start));
  // `noUncheckedIndexedAccess` açık: yakalama grubu `string | undefined`.
  // Süzmek, tip iddiasıyla susturmaktan doğru — boş bir yakalama gerçekten
  // olabilir ve sessizce `undefined` anahtar eklerdi.
  return new Set(
    [...block.matchAll(/^\s*'?([a-z0-9-]+)'?:\s*\[/gm)]
      .map((m) => m[1])
      .filter((key): key is string => key !== undefined),
  );
}

describe('Her araç yeteneği araç çubuğunda görünür', () => {
  const all = capabilities();
  const inToolbar = toolbarKeys();

  it('yetenek birliği ve tablo okunabildi', () => {
    // Tarama bozulursa listeler boşalır ve aşağıdaki test SESSİZCE geçer.
    expect(all.length).toBeGreaterThanOrEqual(20);
    expect(inToolbar.size).toBeGreaterThanOrEqual(20);
  });

  const userTools = capabilities().filter((c) => !NON_TOOL_CAPABILITIES.has(c));

  it.each(userTools)('%s araç çubuğunda tanımlı', (capability) => {
    expect(inToolbar.has(capability)).toBe(true);
  });

  it('araç OLMAYAN yetenekler tabloya EKLENMEMİŞ', () => {
    // `nsfw-classify` bir moderasyon sınıflandırıcısıdır; araç çubuğunda
    // görünmesi, kullanıcının moderasyon modelini keyfî girdiyle
    // çalıştırabilmesi demektir.
    for (const capability of NON_TOOL_CAPABILITIES) {
      expect(inToolbar.has(capability)).toBe(false);
    }
  });

  it('tabloda yetenek birliğinde OLMAYAN anahtar yok', () => {
    // Yazım hatası olan bir anahtar sessizce hiçbir şey yapmaz.
    const unknown = [...inToolbar].filter((key) => !all.includes(key as Capability));
    expect(unknown).toEqual([]);
  });
});
