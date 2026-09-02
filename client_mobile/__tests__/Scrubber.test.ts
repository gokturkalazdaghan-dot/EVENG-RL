import {
  containsLikelyPii,
  scrubFrame,
  scrubMessage,
  scrubStack,
  scrubText,
} from '@/telemetry/Scrubber';

describe('scrubText — kişisel veri kalıpları', () => {
  it('e-posta adresini çıkarır', () => {
    expect(scrubText('login failed for ali.veli+test@example.com')).not.toContain('example.com');
  });

  it('URL ve sorgu dizesini çıkarır', () => {
    // Sorgu dizesi token taşıyabilir; tamamı gider.
    const scrubbed = scrubText('GET https://api.example.com/v1/user?token=abc123&id=42 failed');
    expect(scrubbed).not.toContain('token=abc123');
    expect(scrubbed).not.toContain('api.example.com');
  });

  it('IPv4 ve IPv6 adreslerini çıkarır', () => {
    expect(scrubText('connect 192.168.1.114 refused')).not.toContain('192.168.1.114');
    expect(scrubText('host 2001:0db8:85a3:0000:0000:8a2e:0370:7334')).not.toContain('8a2e');
  });

  it('UUID biçimindeki kimlikleri çıkarır', () => {
    const uuid = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    expect(scrubText(`session ${uuid}`)).not.toContain(uuid);
  });

  it('JWT ve uzun jetonları çıkarır', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhbm9uLTEyMyJ9.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    expect(scrubText(`auth ${jwt}`)).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });
});

describe('scrubText — dosya yolları (kullanıcı adı sızıntısı)', () => {
  it('iOS kullanıcı dizinini çıkarır', () => {
    // /Users/<isim>/ doğrudan kullanıcının adını taşır.
    expect(scrubText('/Users/gokturk/projects/app.js')).not.toContain('gokturk');
  });

  it('iOS uygulama konteyner yolunu çıkarır', () => {
    const path = '/var/mobile/Containers/Data/Application/ABC-123/Documents/proje.json';
    expect(scrubText(path)).not.toContain('Containers');
  });

  it('Android veri dizinini çıkarır', () => {
    expect(scrubText('/data/user/0/com.evengirl.app/files/x')).not.toContain('armanalabs');
  });

  it('Android paylaşılan depolama yolunu çıkarır', () => {
    expect(scrubText('/storage/emulated/0/DCIM/Camera/foto.jpg')).not.toContain('DCIM');
  });

  it('content:// URI çıkarır', () => {
    expect(scrubText('content://media/external/images/media/1042')).not.toContain('media/external');
  });
});

describe('scrubText — medya dosyası adları', () => {
  it('fotoğraf adındaki tarih ve konumu çıkarır', () => {
    // "IMG_20240612_Antalya.jpg" hem tarih hem konum sızdırır.
    const scrubbed = scrubText('decode failed: IMG_20240612_Antalya.jpg');
    expect(scrubbed).not.toContain('Antalya');
    expect(scrubbed).not.toContain('20240612');
  });

  it('video dosyası adını çıkarır', () => {
    expect(scrubText('open VID_dugun_kayit.mp4')).not.toContain('dugun');
  });
});

describe('scrubText — teşhis değeri korunur', () => {
  it('kaynak dosya adını ve hata türünü korur', () => {
    // Temizlemek her şeyi silmek değildir: bunlar olmadan rapor işe yaramaz.
    const scrubbed = scrubText('TypeError in AiEngine.ts');
    expect(scrubbed).toContain('AiEngine.ts');
    expect(scrubbed).toContain('TypeError');
  });

  it('satır numarası gibi kısa sayıları korur', () => {
    expect(scrubText('line 142')).toContain('142');
  });

  it('uzun sayı dizilerini çıkarır', () => {
    // Telefon, kart, zaman damgası, koordinat.
    expect(scrubText('value 905321234567')).not.toContain('905321234567');
  });
});

describe('scrubMessage', () => {
  it('yalnızca ilk satırı alır', () => {
    const message = 'Request failed\n  at /Users/gokturk/app.js\n  details: secret';
    expect(scrubMessage(message)).not.toContain('secret');
  });

  it('200 karakterde keser', () => {
    // Serileştirilmiş nesne taşıyan uzun mesajlar sızıntı yüzeyidir.
    expect(scrubMessage('x'.repeat(500)).length).toBeLessThanOrEqual(200);
  });
});

describe('scrubFrame', () => {
  it('Hermes biçimini ayrıştırır ve yolu dosya adına indirger', () => {
    const frame = scrubFrame('    at runInference (/Users/gokturk/src/AiEngine.ts:88:12)');
    expect(frame?.fn).toBe('runInference');
    expect(frame?.file).toBe('AiEngine.ts');
    expect(frame?.line).toBe(88);
  });

  it('JSC (@) biçimini ayrıştırır', () => {
    const frame = scrubFrame('runInference@/data/user/0/com.evengirl.app/AiEngine.ts:88:12');
    expect(frame?.fn).toBe('runInference');
    expect(frame?.file).toBe('AiEngine.ts');
  });

  it('tanınmayan biçimi olduğu gibi göndermez, temizler', () => {
    const frame = scrubFrame('garbage line with ali@example.com');
    expect(frame?.fn).not.toContain('example.com');
  });

  it('boş satırı atar', () => {
    expect(scrubFrame('   ')).toBeNull();
  });
});

describe('scrubStack', () => {
  it('kare sayısını sınırlar', () => {
    const stack = Array.from({ length: 100 }, (_, i) => `    at fn${i} (/src/a.ts:${i}:1)`).join('\n');
    expect(scrubStack(stack, 30)).toHaveLength(30);
  });

  it('gerçekçi bir yığın izinden hiçbir yol sızdırmaz', () => {
    const stack = [
      'Error: upload failed',
      '    at upload (/Users/gokturk/evengirl/src/net.ts:42:7)',
      '    at process (/data/user/0/com.evengirl.app/index.android.bundle:1:20345)',
      '    at retry (https://cdn.example.com/bundle.js?token=abcdef1234567890:9:1)',
    ].join('\n');

    const serialized = JSON.stringify(scrubStack(stack));
    expect(serialized).not.toContain('gokturk');
    expect(serialized).not.toContain('armanalabs');
    expect(serialized).not.toContain('cdn.example.com');
    expect(serialized).not.toContain('token=');
  });
});

describe('containsLikelyPii — son savunma hattı', () => {
  it('temizlenmiş çıktıyı temiz sayar', () => {
    const clean = JSON.stringify(scrubStack('    at fn (/Users/x/src/a.ts:1:1)'));
    expect(containsLikelyPii(clean)).toBe(false);
  });

  it('kaçırılmış e-postayı yakalar', () => {
    expect(containsLikelyPii('{"m":"contact ali@example.com"}')).toBe(true);
  });

  it('kaçırılmış kullanıcı dizinini yakalar', () => {
    expect(containsLikelyPii('{"f":"/Users/gokturk/x"}')).toBe(true);
  });

  it('kaçırılmış ham URL yakalar', () => {
    expect(containsLikelyPii('{"u":"https://x.example.com/a"}')).toBe(true);
  });
});
