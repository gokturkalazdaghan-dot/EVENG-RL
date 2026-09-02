import {
  SUPPORT_EMAIL,
  buildBody,
  buildDiagnosticsBlock,
  buildMailtoUrl,
  buildSubject,
  type ComposeInput,
  type Diagnostics,
} from '@/support/FeedbackComposer';

const diagnostics: Diagnostics = {
  appVersion: '1.0.0',
  platform: 'ios',
  osMajor: '17',
  deviceClass: 'mid',
  language: 'tr',
  plan: 'free',
};

const input = (overrides: Partial<ComposeInput> = {}): ComposeInput => ({
  category: 'feedback',
  diagnostics,
  bodyPlaceholder: 'Mesajınızı buraya yazın:',
  diagnosticsHeading: 'Teknik bilgiler (destek için):',
  ...overrides,
});

describe('buildSubject', () => {
  it('kategoriyi konu satırına yazar', () => {
    // Gelen kutusunda filtrelemeyi mümkün kılar.
    expect(buildSubject('complaint', '1.0.0')).toContain('Sikayet');
    expect(buildSubject('request', '1.0.0')).toContain('Istek');
    expect(buildSubject('feedback', '1.0.0')).toContain('Geri Bildirim');
  });

  it('sürümü konu satırına yazar', () => {
    expect(buildSubject('feedback', '1.4.2')).toContain('1.4.2');
  });
});

describe('buildDiagnosticsBlock — ne EKLENİR', () => {
  it('sürüm, platform, cihaz sınıfı, dil ve plan içerir', () => {
    const block = buildDiagnosticsBlock(diagnostics, 'Teknik bilgiler:');
    expect(block).toContain('1.0.0');
    expect(block).toContain('ios 17');
    expect(block).toContain('mid');
    expect(block).toContain('tr');
    expect(block).toContain('free');
  });
});

describe('buildDiagnosticsBlock — ne EKLENMEZ', () => {
  const block = buildDiagnosticsBlock(diagnostics, 'Teknik bilgiler:');

  it('cihaz veya kurulum kimliği içermez', () => {
    // Kimlik eklemek, hesap olmayan bir uygulamada kimlik yaratmaktır.
    expect(block).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
    expect(block.toLowerCase()).not.toContain('deviceid');
    expect(block.toLowerCase()).not.toContain('installid');
  });

  it('tam cihaz modeli içermez', () => {
    // "iPhone15,3 + tr + 03:14" küçük popülasyonlarda tekilleştiricidir.
    expect(block).not.toMatch(/iPhone\d+,\d+/);
    expect(block).not.toMatch(/SM-[A-Z]\d+/);
  });

  it('tam OS sürümü değil yalnızca ana sürüm içerir', () => {
    const detailed = buildDiagnosticsBlock({ ...diagnostics, osMajor: '17' }, 'x');
    expect(detailed).toContain('17');
    expect(detailed).not.toContain('17.4.1');
  });

  it('zaman damgası içermez', () => {
    // E-postanın kendi başlığında zaten var; ikinci kez eklemek korelasyon
    // yüzeyi büyütür.
    expect(block).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});

describe('buildBody', () => {
  it('kullanıcının yazacağı alanı EN ÜSTE koyar', () => {
    // Posta uygulaması açıldığında imleç orada olur; kullanıcı teşhis
    // bloğunu kaydırıp geçmek zorunda kalmaz.
    const body = buildBody(input());
    expect(body.indexOf('Mesajınızı')).toBeLessThan(body.indexOf('Teknik bilgiler'));
  });

  it('teşhis bloğunu ayırıcıyla ayırır', () => {
    // Kullanıcı isterse tamamını silebilsin diye görünür sınır var.
    expect(buildBody(input())).toContain('---');
  });
});

describe('buildMailtoUrl', () => {
  it('destek adresine yönlendirir', () => {
    expect(buildMailtoUrl(input()).startsWith(`mailto:${SUPPORT_EMAIL}`)).toBe(true);
  });

  it('Türkçe karakterleri kaçırır', () => {
    // Kaçırılmazsa posta uygulaması ya açılmaz ya da gövdeyi bozar.
    const url = buildMailtoUrl(input({ bodyPlaceholder: 'Mesajınızı yazın şğüöçİ' }));
    expect(url).not.toContain('ş');
    expect(url).not.toContain('İ');
    expect(url).toContain('%');
  });

  it('satır sonlarını kaçırır', () => {
    expect(buildMailtoUrl(input())).not.toContain('\n');
  });

  it('& ve # karakterlerini kaçırır', () => {
    // encodeURI bunları KAÇIRMAZ; kaçırılmazsa gövde yarıda kesilir.
    const url = buildMailtoUrl(input({ bodyPlaceholder: 'a & b # c' }));
    expect(url).toContain('%26');
    expect(url).toContain('%23');
    // İlk & ayırıcıdan sonra ikinci bir ham & olmamalı.
    expect(url.split('&body=')[1]).not.toContain('&');
  });

  it('konu ve gövdeyi ayrı parametre olarak taşır', () => {
    const url = buildMailtoUrl(input());
    expect(url).toContain('?subject=');
    expect(url).toContain('&body=');
  });

  it('geri çözüldüğünde özgün metni verir', () => {
    const url = buildMailtoUrl(input({ bodyPlaceholder: 'Şikayetim: %50 & #1' }));
    const encodedBody = url.split('&body=')[1] ?? '';
    expect(decodeURIComponent(encodedBody)).toContain('Şikayetim: %50 & #1');
  });
});
