/**
 * CloudDraftSync sözleşme testleri.
 *
 * NEDEN BU KATMAN TEST EDİLİYOR
 * Bu servisin hataları SESSİZDİR: kullanıcı "yedeklendi" sanar ve hiçbir
 * şey yedeklenmemiştir, ya da hücresel bağlantıda 2 GB'lık bir proje
 * habersiz yüklenir ve faturaya yansır. İkisi de log'da değil, yalnızca
 * kullanıcıda görünür.
 *
 * Köprü taklidi (mock) `jest.doMock` ile KURULUM SIRASINDA verilir: modül
 * `NativeModules.EvenGirlCloudDrafts`'ı yükleme anında okuyup sabitler, bu
 * yüzden import'tan sonra taklidi değiştirmek etkisizdir.
 */

/**
 * Köprü alanları `jest.Mock` olarak TİPLENMİYOR: `jest.fn(async () => 'x')`
 * `jest.Mock<Promise<string>, []>` üretir ve varsayılan genel `jest.Mock`
 * parametresine atanamaz. Testin kendisi tip hatası verdiğinde `tsc`
 * kapısı kırmızıya döner ama testler (Babel tipleri sildiği için) yeşil
 * görünür — iki sinyal ayrışır.
 */
type FakeBridge = Record<string, unknown>;

function makeBridge(overrides: FakeBridge = {}): FakeBridge {
  return {
    provider: jest.fn(async () => 'icloud'),
    upload: jest.fn(async () => undefined),
    download: jest.fn(async () => undefined),
    list: jest.fn(async () => []),
    conflicts: jest.fn(async () => []),
    resolveConflict: jest.fn(async () => undefined),
    ...overrides,
  };
}

/**
 * Servisi TAZE yükler: köprü ve ağ durumu modül kapsamında okunduğu için
 * her senaryo kendi modül örneğini almalı.
 */
function loadSync(options: {
  bridge?: FakeBridge | undefined;
  online?: boolean;
  metered?: boolean;
}) {
  jest.resetModules();

  jest.doMock('react-native', () => ({
    NativeModules: options.bridge ? { EvenGirlCloudDrafts: options.bridge } : {},
    Platform: { OS: 'ios', select: (spec: Record<string, unknown>) => spec.ios },
  }));

  jest.doMock('@/connectivity/NetworkMonitor', () => ({
    NetworkMonitor: {
      get isOnline() {
        return options.online ?? true;
      },
      get isMetered() {
        return options.metered ?? false;
      },
    },
  }));

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('@/storage/CloudDraftSync') as typeof import('@/storage/CloudDraftSync');
}

describe('CloudDraftSync — köprü yokluğu', () => {
  it('köprü yoksa isAvailable false döner', () => {
    const { CloudDraftSync } = loadSync({ bridge: undefined });
    expect(CloudDraftSync.isAvailable).toBe(false);
  });

  it('köprü yoksa provider "none" döner — "icloud" varsayılmaz', async () => {
    const { CloudDraftSync } = loadSync({ bridge: undefined });
    await expect(CloudDraftSync.provider()).resolves.toBe('none');
  });

  it('köprü yokken yedekleme BAŞARI DÖNMEZ', async () => {
    // Sessiz başarı, kullanıcının yedeklendiğini sanması demektir.
    const { CloudDraftSync } = loadSync({ bridge: undefined });
    const result = await CloudDraftSync.backup('d1', '/tmp/a.evengirl', 'Proje');
    expect(result.ok).toBe(false);
  });

  it('köprü yokken liste ve çakışmalar boş dizi döner, çökmez', async () => {
    const { CloudDraftSync } = loadSync({ bridge: undefined });
    await expect(CloudDraftSync.list()).resolves.toEqual([]);
    await expect(CloudDraftSync.conflicts()).resolves.toEqual([]);
  });
});

describe('CloudDraftSync — ölçülü bağlantı', () => {
  it('hücresel bağlantıda onaysız YÜKLEMEZ', async () => {
    const bridge = makeBridge();
    const { CloudDraftSync } = loadSync({ bridge, online: true, metered: true });

    const result = await CloudDraftSync.backup('d1', '/tmp/a.evengirl', 'Proje');

    expect(result.ok).toBe(false);
    // Kritik: köprüye HİÇ dokunulmamalı. Hata döndürüp yine de yüklemek,
    // faturaya yansıyan gerçek bir zarardır.
    expect(bridge.upload).not.toHaveBeenCalled();
  });

  it('açık onayla hücresel bağlantıda yükler', async () => {
    const bridge = makeBridge();
    const { CloudDraftSync } = loadSync({ bridge, online: true, metered: true });

    const result = await CloudDraftSync.backup('d1', '/tmp/a.evengirl', 'Proje', {
      allowMetered: true,
    });

    expect(result.ok).toBe(true);
    expect(bridge.upload).toHaveBeenCalledWith('d1', '/tmp/a.evengirl', 'Proje');
  });

  it('allowMetered yalnızca kesin true iken geçer', async () => {
    const bridge = makeBridge();
    const { CloudDraftSync } = loadSync({ bridge, online: true, metered: true });

    // `!== true` kontrolü bilinçli: truthy bir değer (1, 'yes') onay sayılmaz.
    const result = await CloudDraftSync.backup('d1', '/tmp/a.evengirl', 'Proje', {
      allowMetered: undefined,
    });

    expect(result.ok).toBe(false);
    expect(bridge.upload).not.toHaveBeenCalled();
  });

  it('çevrimdışıyken yüklemeyi denemez', async () => {
    const bridge = makeBridge();
    const { CloudDraftSync } = loadSync({ bridge, online: false });

    const result = await CloudDraftSync.backup('d1', '/tmp/a.evengirl', 'Proje');

    expect(result.ok).toBe(false);
    expect(bridge.upload).not.toHaveBeenCalled();
  });
});

describe('CloudDraftSync — hata yayılımı', () => {
  it('köprü hatası Err olur, sessizce yutulmaz', async () => {
    const bridge = makeBridge({
      upload: jest.fn(async () => {
        throw new Error('no_folder');
      }),
    });
    const { CloudDraftSync } = loadSync({ bridge });

    const result = await CloudDraftSync.backup('d1', '/tmp/a.evengirl', 'Proje');
    expect(result.ok).toBe(false);
  });

  it('geri yükleme hatası Err olur', async () => {
    const bridge = makeBridge({
      download: jest.fn(async () => {
        throw new Error('not_found');
      }),
    });
    const { CloudDraftSync } = loadSync({ bridge });

    const result = await CloudDraftSync.restore('d1', '/tmp/a.evengirl');
    expect(result.ok).toBe(false);
  });

  it('provider hatası "none" ile karşılanır — çökme yok', async () => {
    const bridge = makeBridge({
      provider: jest.fn(async () => {
        throw new Error('boom');
      }),
    });
    const { CloudDraftSync } = loadSync({ bridge });
    await expect(CloudDraftSync.provider()).resolves.toBe('none');
  });

  it('list hatası boş dizi ile karşılanır', async () => {
    const bridge = makeBridge({
      list: jest.fn(async () => {
        throw new Error('boom');
      }),
    });
    const { CloudDraftSync } = loadSync({ bridge });
    await expect(CloudDraftSync.list()).resolves.toEqual([]);
  });
});

describe('CloudDraftSync — klasör seçimi (Android)', () => {
  it('setFolder olmayan köprüde (iOS) needsFolderSelection false', () => {
    const { CloudDraftSync } = loadSync({ bridge: makeBridge() });
    expect(CloudDraftSync.needsFolderSelection).toBe(false);
  });

  it('setFolder olan köprüde (Android) needsFolderSelection true', () => {
    const bridge = makeBridge({ setFolder: jest.fn(async () => 'folder') });
    const { CloudDraftSync } = loadSync({ bridge });
    expect(CloudDraftSync.needsFolderSelection).toBe(true);
  });

  it('desteklemeyen platformda setFolder sessizce başarı DÖNMEZ', async () => {
    const { CloudDraftSync } = loadSync({ bridge: makeBridge() });
    const result = await CloudDraftSync.setFolder('content://tree/x');
    expect(result.ok).toBe(false);
  });

  it('boş adres reddedilir — köprüye gitmez', async () => {
    const setFolder = jest.fn(async () => 'folder');
    const { CloudDraftSync } = loadSync({ bridge: makeBridge({ setFolder }) });

    const result = await CloudDraftSync.setFolder('   ');

    expect(result.ok).toBe(false);
    expect(setFolder).not.toHaveBeenCalled();
  });

  it('geçerli adres sağlayıcı adını döndürür', async () => {
    const setFolder = jest.fn(async () => 'drive');
    const { CloudDraftSync } = loadSync({ bridge: makeBridge({ setFolder }) });

    const result = await CloudDraftSync.setFolder('content://tree/primary%3ADrafts');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('drive');
  });

  it('izin reddi Err olur', async () => {
    const setFolder = jest.fn(async () => {
      throw new Error('permission_denied');
    });
    const { CloudDraftSync } = loadSync({ bridge: makeBridge({ setFolder }) });

    const result = await CloudDraftSync.setFolder('content://tree/x');
    expect(result.ok).toBe(false);
  });
});

describe('Zero-Deletion sözleşmesi', () => {
  it('servis SİLME METODU AÇMAZ', () => {
    // Metodun yokluğu bilinçli bir belgedir. Biri `delete` eklerse bu test
    // kırılır ve önce docs/STORAGE.md'yi okumak zorunda kalır.
    const { CloudDraftSync } = loadSync({ bridge: makeBridge() });
    const surface = Object.keys(CloudDraftSync);
    expect(surface).not.toContain('delete');
    expect(surface).not.toContain('remove');
    expect(surface).not.toContain('purge');
  });

  it('çakışma çözümü seçilen sürümü köprüye AYNEN iletir', async () => {
    const resolveConflict = jest.fn(async () => undefined);
    const { CloudDraftSync } = loadSync({ bridge: makeBridge({ resolveConflict }) });

    await CloudDraftSync.resolveConflict('d1', '1730000000000');

    expect(resolveConflict).toHaveBeenCalledWith('d1', '1730000000000');
  });
});
