/**
 * Rapor düğmesi kayıt defteri denetimi.
 *
 * Bu test bir birim testi değil, bir DENETİMDİR: "her profil, hikaye ve
 * sohbet ekranında rapor düğmesi var" iddiasını kaynak kodundan doğrular.
 * Bir ekran düğmeyi düşürürse veya menü içine gömerse burada kırılır.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  REPORT_SURFACE_FILES,
  REQUIRED_REPORT_SURFACES,
  reportAffordanceEnabled,
  reportDisabledReasonKey,
  shouldShowReportAffordance,
} from '@/moderation/ReportSurfaces';

const ROOT = join(__dirname, '..');

function sourceOf(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

describe('rapor yüzeyi kayıt defteri', () => {
  it('her zorunlu yüzeyin bir dosya eşlemesi vardır', () => {
    for (const surface of REQUIRED_REPORT_SURFACES) {
      expect(REPORT_SURFACE_FILES[surface]).toBeTruthy();
    }
  });

  it.each(REQUIRED_REPORT_SURFACES)('%s ekranı ReportAffordance render eder', (surface) => {
    const source = sourceOf(REPORT_SURFACE_FILES[surface]);

    expect(source).toContain("from '@/ui/components/ReportAffordance'");
    expect(source).toContain('<ReportAffordance');
    // Yüzey kimliği doğru geçilmiş olmalı; yanlış yüzey adı, denetimin
    // yanlış dosyayı doğrulaması demektir.
    expect(source).toContain(`surface="${surface}"`);
  });

  it.each(REQUIRED_REPORT_SURFACES)('%s ekranı düğmeyi koşula bağlamaz', (surface) => {
    const source = sourceOf(REPORT_SURFACE_FILES[surface]);

    // ReportAffordance çağrısının hemen öncesinde koşullu render kalıbı
    // (`&&` veya `? :`) aranmaz — bunun yerine bileşene `visible` benzeri
    // bir prop geçirilmediği doğrulanır. Görünürlük koşulsuzdur.
    const call = source.slice(source.indexOf('<ReportAffordance'));
    const closing = call.indexOf('/>');
    const props = call.slice(0, closing);

    expect(props).not.toContain('visible');
    expect(props).not.toContain('isPro');
    expect(props).not.toContain('hidden');
  });

  it('ReportAffordance bileşeni visible prop KABUL ETMEZ', () => {
    // Prop kabul edilir hâle gelirse, çağrı yerlerinde koşul yazılabilir
    // olur ve yukarıdaki denetim anlamını yitirir.
    const source = sourceOf('src/ui/components/ReportAffordance.tsx');
    const propsBlock = source.slice(
      source.indexOf('export interface ReportAffordanceProps'),
      source.indexOf('export function ReportAffordance'),
    );
    expect(propsBlock).not.toContain('visible');
  });
});

describe('shouldShowReportAffordance', () => {
  it('koşulsuz true döner', () => {
    expect(shouldShowReportAffordance()).toBe(true);
  });
});

describe('reportAffordanceEnabled', () => {
  const base = { viewerId: 'viewer-1', authorId: 'author-1', alreadyReported: false };

  it('başkasının içeriği için etkindir', () => {
    expect(reportAffordanceEnabled(base)).toBe(true);
  });

  it('kendi içeriğinde devre dışıdır ama GİZLENMEZ', () => {
    const own = { ...base, authorId: 'viewer-1' };
    expect(reportAffordanceEnabled(own)).toBe(false);
    // Görünürlük ayrı bir sorudur ve cevabı her zaman evettir.
    expect(shouldShowReportAffordance()).toBe(true);
    expect(reportDisabledReasonKey(own)).toBe('moderation.report.ownContent');
  });

  it('zaten raporlanmış içerikte devre dışıdır', () => {
    const reported = { ...base, alreadyReported: true };
    expect(reportAffordanceEnabled(reported)).toBe(false);
    expect(reportDisabledReasonKey(reported)).toBe('moderation.report.already');
  });

  it('bilinmeyen kimlik (boş dize) düğmeyi devre dışı BIRAKMAZ', () => {
    // Viewer kimliği çözülemediğinde `''` gelir. Bunu yazarla eşleştirip
    // düğmeyi kapatmak, mağaza yanıt vermediğinde raporlamayı sessizce
    // öldürmek olurdu.
    expect(reportAffordanceEnabled({ ...base, viewerId: '' })).toBe(true);
  });

  it('etkin düğme için gerekçe anahtarı yoktur', () => {
    expect(reportDisabledReasonKey(base)).toBeNull();
  });
});
