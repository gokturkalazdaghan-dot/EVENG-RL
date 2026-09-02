/**
 * Cihaz yeteneği okumalarının ÖNBELLEKLENMESİ.
 *
 * NEDEN
 * `this.deviceRamBytes ??= await bridge.deviceTotalRamBytes().catch(() => 0)`
 * yazımı, hata durumunda `0` saklıyordu. `0` null/undefined olmadığı için
 * `??=` bir daha ASLA yeniden denemiyordu: köprüde tek bir geçici hata,
 * oturumun geri kalanında HER yerel modeli reddediyordu. Kullanıcı gayet
 * güçlü bir telefonda "cihazın yetersiz" görüyor ve sebebi hiçbir yerde
 * yazmıyordu.
 */

const mockRam = jest.fn();
const mockUnits = jest.fn(async () => ['cpu']);
const mockInstalled = jest.fn(async () => true);

jest.mock('react-native', () => ({
  NativeModules: {
    EvenGirlInference: {
      deviceTotalRamBytes: () => mockRam(),
      supportedComputeUnits: () => mockUnits(),
      loadModel: jest.fn(),
      unloadModel: jest.fn(),
      run: jest.fn(),
    },
  },
  Platform: { OS: 'ios', select: (spec: Record<string, unknown>) => spec.ios },
}));

jest.mock('@/ai/engine/ModelStore', () => ({
  ModelStore: {
    isInstalled: () => mockInstalled(),
    pathFor: async () => '/models/x',
  },
}));

const GB = 1024 * 1024 * 1024;

/**
 * Çalışma zamanı bir TEKİL (singleton) ve cihaz yeteneğini örnek üzerinde
 * önbelleğe alıyor — zaten test edilen davranış bu. Bu yüzden her senaryo
 * modülü TAZE yüklüyor; aksi halde bir testin önbelleği diğerine sızar ve
 * testler birbirinin sonucunu belirler.
 */
function freshRuntime() {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return (require('@/ai/engine/LocalInferenceRuntime') as
    typeof import('@/ai/engine/LocalInferenceRuntime')).LocalInferenceRuntime;
}

beforeEach(() => {
  mockRam.mockReset();
  mockInstalled.mockClear();
});

describe('RAM okuması', () => {
  it('başarısız okuma ÖNBELLEĞE ALINMAZ — sonraki çağrı yeniden dener', async () => {
    // İlk çağrı hata, ikinci çağrı başarılı.
    mockRam.mockRejectedValueOnce(new Error('bridge hiccup'));
    mockRam.mockResolvedValueOnce(8 * GB);

    const runtime = freshRuntime();
    const first = await runtime.isSupported('face-restore');
    const second = await runtime.isSupported('face-restore');

    expect(first).toBe(false);
    // Eski davranışta bu da `false` kalırdı: oturum boyunca her yerel model
    // reddedilir, kullanıcı güçlü bir telefonda "cihaz yetersiz" görürdü.
    expect(second).toBe(true);
    expect(mockRam).toHaveBeenCalledTimes(2);
  });

  it('başarılı okuma önbelleğe alınır — köprü tekrar tekrar sorulmaz', async () => {
    mockRam.mockResolvedValue(8 * GB);

    const runtime = freshRuntime();
    await runtime.isSupported('face-restore');
    await runtime.isSupported('face-restore');
    await runtime.isSupported('hd-upscale');

    expect(mockRam).toHaveBeenCalledTimes(1);
  });

  it('RAM yetersizse model reddedilir', async () => {
    mockRam.mockResolvedValue(1 * GB);
    expect(await freshRuntime().isSupported('face-restore')).toBe(false);
  });

  it('model kurulu değilse RAM hiç sorulmaz', async () => {
    // İndirilmemiş bir model için cihaz yeteneği sorgulamak boşuna iş.
    mockInstalled.mockResolvedValueOnce(false);
    expect(await freshRuntime().isSupported('face-restore')).toBe(false);
    expect(mockRam).not.toHaveBeenCalled();
  });
});
