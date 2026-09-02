import {
  PROFILE_LADDER,
  UPGRADE_STABLE_MS,
  nextProfile,
  targetProfileFor,
  type DeviceSignals,
} from '@/performance/ThermalPolicy';

const signals = (overrides: Partial<DeviceSignals> = {}): DeviceSignals => ({
  thermal: 'nominal',
  batteryLevel: 0.8,
  isCharging: false,
  lowPowerMode: false,
  ...overrides,
});

describe('targetProfileFor', () => {
  it('şarjda ve her şey iyiyken tam performansa izin verir', () => {
    expect(targetProfileFor(signals({ isCharging: true }))).toBe('performance');
  });

  it('pille çalışırken sağlıklı cihazda bile performance seçmez', () => {
    // Pil ile 'performance', kullanıcının fark ettiği tek şeyin hızla eriyen
    // pil olmasına yol açar.
    expect(targetProfileFor(signals({ isCharging: false }))).toBe('balanced');
  });

  it('kritik sıcaklıkta şarjda olmak profili yükseltmez', () => {
    expect(targetProfileFor(signals({ thermal: 'critical', isCharging: true }))).toBe('critical');
  });

  it('şarjsız %10 ve altı pilde kritik profile düşer', () => {
    expect(targetProfileFor(signals({ batteryLevel: 0.1 }))).toBe('critical');
    expect(targetProfileFor(signals({ batteryLevel: 0.05 }))).toBe('critical');
  });

  it('şarjdayken düşük pil kritik sayılmaz', () => {
    expect(targetProfileFor(signals({ batteryLevel: 0.05, isCharging: true }))).toBe('performance');
  });

  it('düşük güç modu şarjda olsa bile saver uygular', () => {
    expect(targetProfileFor(signals({ lowPowerMode: true, isCharging: true }))).toBe('saver');
  });

  it('serious sıcaklıkta saver seçer', () => {
    expect(targetProfileFor(signals({ thermal: 'serious', isCharging: true }))).toBe('saver');
  });

  it('fair sıcaklıkta balanced seçer', () => {
    expect(targetProfileFor(signals({ thermal: 'fair', isCharging: true }))).toBe('balanced');
  });

  it('şarjsız %25 ve altı pilde balanced seçer', () => {
    expect(targetProfileFor(signals({ batteryLevel: 0.25 }))).toBe('balanced');
  });
});

describe('nextProfile — kısıtlama yönü', () => {
  it('kısıtlamayı beklemeden uygular', () => {
    expect(
      nextProfile({ current: 'performance', target: 'critical', targetStableForMs: 0 }),
    ).toBe('balanced');
  });

  it('bir seferde yalnızca tek kademe iner', () => {
    // performance -> critical iki kademe atlamaz; ani sıçrama yeni bir
    // ısınma döngüsü başlatır.
    const step1 = nextProfile({ current: 'performance', target: 'critical', targetStableForMs: 0 });
    const step2 = nextProfile({ current: step1, target: 'critical', targetStableForMs: 0 });
    const step3 = nextProfile({ current: step2, target: 'critical', targetStableForMs: 0 });
    expect([step1, step2, step3]).toEqual(['balanced', 'saver', 'critical']);
  });
});

describe('nextProfile — gevşetme yönü', () => {
  it('hedef stabil olana kadar profili yükseltmez', () => {
    expect(
      nextProfile({ current: 'critical', target: 'performance', targetStableForMs: UPGRADE_STABLE_MS - 1 }),
    ).toBe('critical');
  });

  it('hedef yeterince stabil kaldığında tek kademe yükselir', () => {
    expect(
      nextProfile({ current: 'critical', target: 'performance', targetStableForMs: UPGRADE_STABLE_MS }),
    ).toBe('saver');
  });

  it('eşik sınırında salınım üretmez', () => {
    // Sıcaklık eşiğinde hedef sürekli değişirse stabilite sayacı sıfırlanır ve
    // profil olduğu yerde kalır — kullanıcı kalite zıplaması görmez.
    let current: (typeof PROFILE_LADDER)[number] = 'saver';
    for (let i = 0; i < 50; i++) {
      const target = i % 2 === 0 ? 'balanced' : 'saver';
      current = nextProfile({ current, target, targetStableForMs: 0 });
    }
    expect(current).toBe('saver');
  });
});

describe('nextProfile — sınır durumları', () => {
  it('hedef mevcut profile eşitse değişiklik yapmaz', () => {
    expect(nextProfile({ current: 'saver', target: 'saver', targetStableForMs: 999_999 })).toBe('saver');
  });

  it('bilinmeyen profilde güvenli varsayılana döner', () => {
    expect(
      nextProfile({
        current: 'bogus' as (typeof PROFILE_LADDER)[number],
        target: 'saver',
        targetStableForMs: 0,
      }),
    ).toBe('balanced');
  });
});
