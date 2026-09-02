/**
 * Buton sistemi: tek bileşen, tutarlı hedef, çalışan işleyici.
 *
 * NEDEN KAYNAK OKUNUYOR
 * Bu testler `node` ortamında çalışıyor ve React ağacı monte etmiyor. Ama
 * denetlenen şeyler tam olarak monte etmeden görülebilecek şeyler: her
 * butonun bir işleyicisi var mı, birincil eylemler ortak bileşeni mi
 * kullanıyor, dokunma hedefi 44pt'nin altına düşüyor mu.
 *
 * Butonlar her ekranda ayrı ayrı `Pressable` + satır içi stille yazılınca
 * aynı işlev ekranlar arasında farklı yükseklikte ve farklı basılı
 * davranışında görünüyordu — arayüzün "elden çıkmış" hissi buradan gelir.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const src = join(__dirname, '..', 'src');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const files = walk(src).map((file) => ({ file, text: readFileSync(file, 'utf8') }));

describe('Her dokunulabilir öğenin işleyicisi var', () => {
  it('onPress olmayan Pressable YOK', () => {
    // İşleyicisiz bir Pressable dokununca hiçbir şey yapmaz ve bunu
    // hiçbir hata bildirmez — kullanıcı uygulamanın donduğunu sanır.
    const dead: string[] = [];

    for (const { file, text } of files) {
      for (const match of text.matchAll(/<Pressable\b([\s\S]{0,500}?)>/g)) {
        // `noUncheckedIndexedAccess` açık: yakalama grubu ve index
        // `undefined` olabilir. Tip iddiasıyla susturmak yerine kontrol
        // ediliyor — eşleşmeyen bir grup gerçekten olabilir.
        const body = match[1] ?? '';
        if (!body.includes('onPress')) {
          const line = text.slice(0, match.index ?? 0).split('\n').length;
          dead.push(`${file.slice(src.length + 1)}:${line}`);
        }
      }
    }

    expect(dead).toEqual([]);
  });

  it('tarama gerçekten çalışıyor', () => {
    // Regex bozulursa liste boşalır ve yukarıdaki test SESSİZCE geçer.
    const pressables = files.reduce(
      (n, { text }) => n + [...text.matchAll(/<Pressable\b/g)].length,
      0,
    );
    expect(pressables).toBeGreaterThan(10);
    expect(files.length).toBeGreaterThan(20);
  });
});

describe('Birincil eylemler ortak bileşeni kullanıyor', () => {
  const button = readFileSync(join(src, 'ui/components/Button.tsx'), 'utf8');

  it('Button bileşeni var ve beş varyant sunuyor', () => {
    for (const variant of ['primary', 'secondary', 'quiet', 'danger', 'reward']) {
      expect(button).toContain(`'${variant}'`);
    }
  });

  it('dokunma hedefi 44pt altına DÜŞMEZ', () => {
    // Küçük boyutlu tuşun yüksekliği 36pt; aradaki fark hitSlop ile
    // kapatılmalı. Apple ve Google'ın ikisi de 44pt/48dp istiyor ve bu
    // erişilebilirlik incelemesinde bakılan ilk şeylerden.
    expect(button).toMatch(/44 - HEIGHTS\[size\]/);
    // Fonksiyonun VAR OLMASI yetmez, KULLANILMASI gerekir. İlk hâli
    // yalnızca tanımı arıyordu ve `hitSlop={0}` mutasyonunu kaçırdı —
    // ölçüldü. Hiçbir şey ölçmeyen yeşil bir kontrol, olmayandan kötüdür.
    expect(button).toMatch(/hitSlop=\{slopFor\(size\)\}/);
  });

  it('devre dışı buton ekran okuyucuya BİLDİRİLİYOR', () => {
    // Yalnızca soluklaştırmak, ekran okuyucu kullanan birine hiçbir şey
    // söylemez: buton hâlâ "etkin" duyurulur ve dokunulur.
    expect(button).toContain('accessibilityState');
    expect(button).toMatch(/disabled:\s*locked/);
  });

  it('kilitliyken eylem TEKRARLANMIYOR', () => {
    expect(button).toMatch(/if \(locked\) return;/);
  });

  it('basılı hâl gerçek bir derinlik değişimi', () => {
    // Yalnızca opaklık değiştirmek "3B" hissi vermez; taban incelir ve
    // yüzey aşağı iner.
    expect(button).toContain('borderBottomWidth');
    expect(button).toContain('translateY');
    expect(button).toContain('depth.travel');
  });

  it('toplam yükseklik basılınca DEĞİŞMİYOR', () => {
    // Yükseklik değişseydi basılan tuş çevresindeki her şeyi oynatır ve
    // arayüz zıplardı.
    expect(button).toMatch(/marginBottom: depth\.rest/);
  });

  it('hareket süresi tema profilinden geliyor', () => {
    // "Batarya modunda animasyonu kıs" kararı tek yerden uygulanmalı.
    expect(button).toContain('theme.motion.timing.duration');
  });
});

describe('Ekranlar satır içi buton stili tanımlamıyor', () => {
  // Ortak bileşen varken ekranda `backgroundColor: theme.colors.accent`
  // ile elle kurulmuş bir tuş, sistemin dışına kaçmış demektir.
  const screens = files.filter(({ file }) => file.includes('/ui/screens/'));

  it('ekran sayısı okunabildi', () => {
    expect(screens.length).toBeGreaterThan(10);
  });

  it.each(screens.map(({ file }) => file.slice(src.length + 1)))(
    '%s elle tuş kurmuyor',
    (relative) => {
      const entry = screens.find(({ file }) => file.endsWith(relative));
      const text = entry?.text ?? '';

      // Seçili durum göstergesi (radio kartları) bu kuralın dışında:
      // onlar tuş değil, seçim yüzeyi.
      const handmade = [...text.matchAll(/styles\.(primaryButton|ctaButton|confirmButton)\b/g)];
      expect(handmade.map((m) => m[0])).toEqual([]);
    },
  );
});
