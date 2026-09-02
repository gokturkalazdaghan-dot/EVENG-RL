/**
 * Navigasyon erişilebilirlik denetimi.
 *
 * Bir ekran yazılıp hiçbir yerden çağrılmazsa, kod tabanında durur ama
 * KULLANICI ONA HİÇ ULAŞAMAZ. TypeScript bunu yakalamaz (dosya geçerli),
 * testler yakalamaz (ekran test edilebilir), CI yeşil kalır.
 *
 * Bu gerçekten olmuştu: ProfileScreen, ChatScreen, StoryViewerScreen ve
 * TemplateDetailScreen yazılmış ama hiçbir yerden açılmıyordu.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src');

/** `src` altındaki tüm .ts/.tsx dosyalarının içeriği. */
function allSources(): string {
  const chunks: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry.name)) chunks.push(readFileSync(path, 'utf8'));
    }
  };
  walk(SRC);
  return chunks.join('\n');
}

const SCREENS = readdirSync(join(SRC, 'ui', 'screens'))
  .filter((n) => n.endsWith('.tsx'))
  .map((n) => n.replace(/\.tsx$/, ''));

/**
 * Kendi kendini render eden ekranlar — bir yerden "açılmazlar", bir DURUM
 * tarafından gösterilirler. Her muafiyet gerekçe taşır.
 */
const KASITLI_MUAF = new Map([
  ['SecurityCheckScreen', 'Güvenlik kontrolü sürerken App tarafından gösterilir.'],
  ['SecurityBlockedScreen', 'Bütünlük kontrolü başarısızsa App tarafından gösterilir.'],
  ['AgeGateScreen', 'Yaş kapısı geçilmemişse App tarafından gösterilir.'],
  ['SafeModeNoticeScreen', 'Safe Mode bildirimi bir kez App tarafından gösterilir.'],
  ['OnboardingShowcaseScreen', 'İlk açılış vitrini App tarafından gösterilir.'],
  ['EthicsDisclaimerScreen', 'Etik onayı EthicsConsentHost tarafından gösterilir.'],
]);

describe('her ekrana ulaşılabilir', () => {
  it('ekran listesi boş değil — denetim kendini doğruluyor', () => {
    expect(SCREENS.length).toBeGreaterThan(10);
  });

  it.each(SCREENS)('%s bir yerden çağrılıyor', (screen) => {
    if (KASITLI_MUAF.has(screen)) return;

    const sources = allSources();
    // Kendi dosyasındaki tanım sayılmaz; başka bir dosyadan import edilmeli.
    const imported = sources.includes(`from '@/ui/screens/${screen}'`);

    expect(imported).toBe(true);
  });

  it('her muafiyet gerekçe taşır', () => {
    for (const [screen, gerekce] of KASITLI_MUAF) {
      expect(SCREENS).toContain(screen);
      expect(gerekce.length).toBeGreaterThan(30);
    }
  });
});

describe('yığın ekranlarının hepsi render ediliyor', () => {
  it('StackEntry türündeki her ekran StackHost içinde ele alınıyor', () => {
    const stack = readFileSync(join(SRC, 'navigation', 'Stack.tsx'), 'utf8');
    const host = readFileSync(join(SRC, 'navigation', 'StackHost.tsx'), 'utf8');

    const screens = [...stack.matchAll(/screen: '([a-z]+)'/g)].map((m) => m[1]);
    expect(screens.length).toBeGreaterThan(3);

    for (const screen of new Set(screens)) {
      // Ele alınmayan bir dal, o ekranın açılmaya çalışıldığında hiçbir
      // şey göstermemesi demektir.
      expect(host).toContain(`case '${screen}':`);
    }
  });
});
