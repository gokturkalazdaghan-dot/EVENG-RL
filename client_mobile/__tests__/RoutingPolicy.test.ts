import {
  canFallbackToRemote,
  decideRoute,
  refusalI18nKey,
  type RoutingInput,
} from '@/ai/engine/RoutingPolicy';

const input = (overrides: Partial<RoutingInput> = {}): RoutingInput => ({
  localSupported: true,
  hasRemoteEndpoint: true,
  isOnline: true,
  thermalCritical: false,
  preferRemote: false,
  entitled: true,
  consentGranted: true,
  isFree: false,
  ...overrides,
});

describe('decideRoute — kapı kontrolleri', () => {
  it('ücretli yeteneği abone olmayana açmaz', () => {
    expect(decideRoute(input({ entitled: false }))).toEqual({
      kind: 'refuse',
      reason: 'entitlement-required',
    });
  });

  it('ücretsiz yetenek için abonelik aramaz', () => {
    expect(decideRoute(input({ entitled: false, isFree: true }))).toEqual({
      kind: 'run',
      site: 'local',
    });
  });

  it('etik onayı olmadan çalıştırmaz', () => {
    expect(decideRoute(input({ consentGranted: false }))).toEqual({
      kind: 'refuse',
      reason: 'consent-required',
    });
  });

  it('yetki kontrolü etik onayından ÖNCE gelir', () => {
    // İkisi de eksikse önce abonelik istenir: kullanıcıya etik onayı modalı
    // gösterip ardından "zaten abone değilsin" demek kötü bir sıralamadır.
    expect(decideRoute(input({ entitled: false, consentGranted: false })).kind).toBe('refuse');
    expect(
      decideRoute(input({ entitled: false, consentGranted: false })),
    ).toEqual({ kind: 'refuse', reason: 'entitlement-required' });
  });
});

describe('decideRoute — yönlendirme', () => {
  it('varsayılan olarak yereli seçer', () => {
    // Veri cihazdan çıkmaz, gecikme ve bant genişliği maliyeti yoktur.
    expect(decideRoute(input())).toEqual({ kind: 'run', site: 'local' });
  });

  it('kullanıcı açıkça isterse sunucuyu seçer', () => {
    expect(decideRoute(input({ preferRemote: true }))).toEqual({ kind: 'run', site: 'remote' });
  });

  it('kritik termal durumda sunucuyu tercih eder', () => {
    // Cihazı daha fazla ısıtmak işlemi yavaşlatmakla kalmaz, sistemin
    // uygulamayı kısıtlamasına yol açar.
    expect(decideRoute(input({ thermalCritical: true }))).toEqual({
      kind: 'run',
      site: 'remote',
    });
  });

  it('kritik termal durumda ağ yoksa yine de yerelde çalışır', () => {
    // Çevrimdışı kullanıcıya "cihazın sıcak" deyip özelliği kapatmak,
    // yavaş çalıştırmaktan kötüdür.
    expect(decideRoute(input({ thermalCritical: true, isOnline: false }))).toEqual({
      kind: 'run',
      site: 'local',
    });
  });

  it('yerel desteklenmiyorsa sunucuya gider', () => {
    expect(decideRoute(input({ localSupported: false }))).toEqual({
      kind: 'run',
      site: 'remote',
    });
  });

  it('kullanıcı sunucu istese de ağ yoksa yerelde çalışır', () => {
    expect(decideRoute(input({ preferRemote: true, isOnline: false }))).toEqual({
      kind: 'run',
      site: 'local',
    });
  });
});

describe('decideRoute — reddetme sebepleri ayırt edilir', () => {
  it('çevrimdışı ve yerel model yoksa ağ eksikliğini bildirir', () => {
    // Kullanıcıya "internete bağlan" demek doğru eylemdir.
    expect(decideRoute(input({ localSupported: false, isOnline: false }))).toEqual({
      kind: 'refuse',
      reason: 'offline-and-no-local-model',
    });
  });

  it('çevrimdışı ve sunucu ucu da yoksa cihaz yetersizliğini bildirir', () => {
    expect(
      decideRoute(input({ localSupported: false, isOnline: false, hasRemoteEndpoint: false })),
    ).toEqual({ kind: 'refuse', reason: 'device-too-weak-and-offline' });
  });

  it('çevrimiçiyken hiçbir yol yoksa genel hata verir', () => {
    expect(
      decideRoute(input({ localSupported: false, hasRemoteEndpoint: false })),
    ).toEqual({ kind: 'refuse', reason: 'no-execution-path' });
  });

  it('her reddetme sebebinin bir kullanıcı mesajı vardır', () => {
    const reasons = [
      'offline-and-no-local-model',
      'device-too-weak-and-offline',
      'no-execution-path',
      'entitlement-required',
      'consent-required',
    ] as const;

    for (const reason of reasons) {
      expect(refusalI18nKey(reason)).toMatch(/^[a-z]+\./);
    }
  });
});

describe('canFallbackToRemote', () => {
  it('ağ ve sunucu ucu varken izin verir', () => {
    expect(canFallbackToRemote({ hasRemoteEndpoint: true, isOnline: true })).toBe(true);
  });

  it('ağ yokken izin vermez', () => {
    // Kullanıcıyı iki kez bekletip yine hata göstermek anlamsızdır.
    expect(canFallbackToRemote({ hasRemoteEndpoint: true, isOnline: false })).toBe(false);
  });

  it('sunucu ucu yoksa izin vermez', () => {
    expect(canFallbackToRemote({ hasRemoteEndpoint: false, isOnline: true })).toBe(false);
  });
});
