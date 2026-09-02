/**
 * ULAŞILABİLİRLİK: yazılmış her modül gerçekten ÇAĞRILIYOR mu.
 *
 * NEDEN BU TEST VAR
 * Bu depoda tam bu sınıf hatanın beş örneği bulundu: dört AI boru hattı,
 * ManualStudio, ExportFlow, CreatorSubscriptions, RewardRedemption ve
 * CloudDraftSync yazılmıştı, testleri geçiyordu, kod incelemesinde doğru
 * görünüyordu — ve HİÇBİR YERDEN çağrılmıyordu. Kullanıcı o özelliklerin
 * hiçbirine ulaşamıyordu, hiçbir hata da görünmüyordu.
 *
 * Öksüz bir modül derlenir, tip denetiminden geçer ve testi bile olabilir.
 * Onu yakalayan tek şey "kim import ediyor" sorusudur.
 *
 * İSTİSNALAR GEREKÇESİYLE yazılır: her istisna, bir sonraki okuyucunun
 * "bu neden öksüz" diye sormasına gerek bırakmamalı.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

const src = join(__dirname, '..', 'src');

/** Öksüz olması BEKLENEN dosyalar — sebebiyle birlikte. */
const EXPECTED_ORPHANS = new Map<string, string>([
  ['App.tsx', 'index.js (JS giriş noktası) tarafından import edilir; tarama yalnızca .ts/.tsx bakar'],

  // ───────────────────────────────────────────────────────────────────
  // AŞAĞIDAKİLER İSTİSNA DEĞİL, AÇIK BORÇ.
  //
  // Kapı `src/` dışındaki import'ları da sayarken bu dosyalar
  // "ulaşılabilir" görünüyordu — oysa onları import eden tek yer kendi
  // testleriydi. Yani: kod var, testi yeşil, KULLANICI ÖZELLİĞE
  // ULAŞAMIYOR. Kapıyı daralttım ve altısı birden ortaya çıktı.
  //
  // Buraya yazmamın sebebi gizlemek değil sabitlemek: "bayat değil"
  // testi, bunlardan biri bağlandığı anda KIRMIZIYA döner ve satırı
  // silmeye zorlar. Liste kısalmadan bu depo tamam sayılmaz.
  // ───────────────────────────────────────────────────────────────────
  ['EvenGenerate.ts', 'BORÇ: kendi ekranı (EvenGenerateScreen) hiç yazılmadı; EditorScreen yeteneği DEDICATED_FLOW olarak yönlendiriyor ama gidecek yer yok'],
  ['ContentClassifier.ts', 'BORÇ: yayınlama/yükleme yolundan çağrılmıyor; NSFW sınıflandırma çalışma anında hiç devreye girmiyor'],
  ['ActivityPrivacy.ts', 'BORÇ: Ghost Mode ve son görülme ayarları hiçbir ekrana bağlı değil'],
  ['DmPolicy.ts', 'BORÇ: ChatScreen izin kontrolü yapmıyor; PRO olmayan da yazma alanını görüyor'],
  ['Lut.ts', 'BORÇ: filtre yüzeyi (FilterStrip) henüz yok; renk motoru hazır, editöre bağlı değil'],
  ['TimelineEdits.ts', 'BORÇ: video zaman çizelgesi yüzeyi henüz yok; düzenleme işlemleri hazır, ekrana bağlı değil'],
]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      // Çeviri kaynakları modül değil, veri.
      if (name === 'locales') continue;
      out.push(...walk(full));
    } else if (name.endsWith('.ts') || name.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(src);

/**
 * Ulaşılabilirlik YALNIZCA `src/` içinden ölçülür.
 *
 * Bunu daraltmam gerekti: tarama önce test ağacını da sayıyordu, yani
 * kendi testinden başka hiçbir yerden çağrılmayan bir modül "ulaşılabilir"
 * görünüyordu. Oysa bu, testin var olma sebebi olan hatanın TA KENDİSİ —
 * modül derlenir, testleri yeşildir, kullanıcı özelliğe asla ulaşamaz.
 * Ölçtüm: daraltmadan önce iki yeni modül (Timeline, Lut) yalnızca kendi
 * testlerinden import edildikleri için kapıdan geçiyordu.
 */
const productionSources = files.map((file) => ({
  file,
  text: readFileSync(file, 'utf8'),
}));

function isImportedSomewhere(file: string): boolean {
  const name = basename(file).replace(/\.tsx?$/, '');
  // `@/x/Name`, `./Name`, `../y/Name` — üç biçim de aranıyor.
  const pattern = new RegExp(`from\\s+['"](?:@/[^'"]*|\\.{1,2}/[^'"]*)?${name}['"]`);
  return productionSources.some((entry) => entry.file !== file && pattern.test(entry.text));
}

describe('Her modül en az bir yerden import edilir', () => {
  const orphans = files
    .filter((file) => basename(file) !== 'index.ts')
    .filter((file) => !isImportedSomewhere(file))
    .map((file) => file.slice(src.length + 1));

  it('beklenmeyen öksüz modül yok', () => {
    const unexpected = orphans.filter((file) => !EXPECTED_ORPHANS.has(basename(file)));

    expect(unexpected).toEqual([]);
  });

  it('istisna listesi BAYAT değil', () => {
    // Artık öksüz olmayan bir dosya için istisna tutmak, bir sonraki
    // okuyucuya var olmayan bir kısıtı doğru sanmasına yol açar.
    const orphanNames = new Set(orphans.map((file) => basename(file)));
    const stale = [...EXPECTED_ORPHANS.keys()].filter((name) => !orphanNames.has(name));

    expect(stale).toEqual([]);
  });

  it('tarama gerçekten çalışıyor — dosya sayısı beklenen aralıkta', () => {
    // Yürüyüş bozulursa liste boşalır ve yukarıdaki testler SESSİZCE geçer.
    // Hiçbir şey ölçmeyen yeşil bir test, testin en tehlikeli halidir.
    expect(files.length).toBeGreaterThan(60);
  });
});

describe('Her ekran gerçekten RENDER EDİLİYOR', () => {
  // İçe aktarılmış ama JSX'te hiç kullanılmayan bir ekran, import
  // kontrolünden GEÇER: dosya "ulaşılabilir" görünür, kullanıcı onu asla
  // göremez. Bu yüzden ayrı bir kontrol gerekiyor.
  //
  // Bu depoda daha önce dört ekran tam olarak bu durumdaydı ve
  // navigasyona bağlanana kadar kimse fark etmedi.
  const screensDir = join(src, 'ui', 'screens');
  const screens = readdirSync(screensDir)
    .filter((name) => name.endsWith('.tsx'))
    .map((name) => name.replace(/\.tsx$/, ''));

  const tsxSources = walk(src)
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => ({ file, text: readFileSync(file, 'utf8') }));

  it('ekran listesi okunabildi', () => {
    expect(screens.length).toBeGreaterThan(10);
  });

  it.each(screens)('%s bir JSX ağacında kullanılıyor', (screen) => {
    // Sınır KARAKTERİ aranıyor, düz alt dize DEĞİL: `includes('<Market')`
    // ifadesi `<MarketScreenX` gibi başka bir bileşeni de eşleştirir ve
    // kontrol, ekran gerçekten render'dan çıkarıldığında bile yeşil kalır.
    // Ölçüldü: alt dize biçimi mutasyonu yakalayamadı.
    const usage = new RegExp(`<${screen}[\\s/>]`);
    const rendered = tsxSources.some(
      (entry) => !entry.file.endsWith(`screens/${screen}.tsx`) && usage.test(entry.text),
    );

    expect(rendered).toBe(true);
  });
});
