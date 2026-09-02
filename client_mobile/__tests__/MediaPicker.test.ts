/**
 * MediaPicker sözleşme testleri.
 *
 * İPTAL İLE ARIZA AYRIMI bu katmanın tek işidir ve ikisi de sessizce
 * karıştırılabilir:
 *   - İptali hata saymak → kullanıcı her vazgeçişte hata mesajı görür.
 *   - Köprü yokluğunu iptal saymak → uygulama bozukken hiçbir şey olmaz ve
 *     kullanıcı sebebini asla öğrenemez.
 */

/**
 * Köprü `object` olarak alınıyor, `jest.Mock` alanlı bir arayüz olarak
 * DEĞİL: `jest.fn(async () => null)` `jest.Mock<Promise<null>, []>` üretir
 * ve bu, `jest.Mock` (varsayılan genel) parametresine atanamaz. Testin
 * kendisi tip hatası verdiğinde `tsc` kapısı kırmızıya döner ama testler
 * (Babel tipleri sildiği için) yeşil görünür — iki sinyalin ayrışması.
 */
function loadPicker(bridge: object | undefined) {
  jest.resetModules();
  jest.doMock('react-native', () => ({
    NativeModules: bridge ? { EvenGirlMediaPicker: bridge } : {},
    Platform: { OS: 'ios', select: (spec: Record<string, unknown>) => spec.ios },
  }));
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('@/media/MediaPicker') as typeof import('@/media/MediaPicker');
}

const OK = { uri: 'file:///Inbox/1.jpg', kind: 'photo' as const, sizeBytes: 1024 };

describe('Köprü yokluğu', () => {
  it('isAvailable false döner', () => {
    expect(loadPicker(undefined).MediaPicker.isAvailable).toBe(false);
  });

  it('köprü yoksa SESSİZCE null DÖNMEZ — kurulum hatası görünmeli', async () => {
    const result = await loadPicker(undefined).MediaPicker.pick();
    expect(result.ok).toBe(false);
  });
});

describe('İptal hata değildir', () => {
  it('native null döndürünce Ok(null) olur', async () => {
    const bridge = { pick: jest.fn(async () => null) };
    const result = await loadPicker(bridge).MediaPicker.pick();

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it('seçici zaten açıkken çift dokunuş hata göstermez', async () => {
    // Kullanıcının önünde zaten açık bir seçici var; hata basmak anlamsız.
    const bridge = {
      pick: jest.fn(async () => {
        throw Object.assign(new Error('busy'), { code: 'busy' });
      }),
    };
    const result = await loadPicker(bridge).MediaPicker.pick();

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });
});

describe('Native sonucu DOĞRULANIR', () => {
  it('geçerli sonuç aynen döner', async () => {
    const bridge = { pick: jest.fn(async () => OK) };
    const result = await loadPicker(bridge).MediaPicker.pick('any');

    expect(bridge.pick).toHaveBeenCalledWith('any');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value?.uri).toBe(OK.uri);
  });

  it('boş URI reddedilir — var olmayan dosya editöre gitmez', async () => {
    const bridge = { pick: jest.fn(async () => ({ ...OK, uri: '' })) };
    const result = await loadPicker(bridge).MediaPicker.pick();
    expect(result.ok).toBe(false);
  });

  it('bilinmeyen kind fotoğraf sayılır', async () => {
    const bridge = { pick: jest.fn(async () => ({ ...OK, kind: 'gif' })) };
    const result = await loadPicker(bridge).MediaPicker.pick();
    if (result.ok) expect(result.value?.kind).toBe('photo');
  });

  it('geçersiz boyut 0 olur — NaN arayüze sızmaz', async () => {
    // "NaN B" yazan bir arayüz ve boyutu bilemeyen bir ölçülü bağlantı
    // uyarısı, sessizce yanlış davranışın iki yüzü.
    const bridge = { pick: jest.fn(async () => ({ ...OK, sizeBytes: Number.NaN })) };
    const result = await loadPicker(bridge).MediaPicker.pick();
    if (result.ok) expect(result.value?.sizeBytes).toBe(0);
  });

  it('varsayılan tür fotoğraftır', async () => {
    const bridge = { pick: jest.fn(async () => OK) };
    await loadPicker(bridge).MediaPicker.pick();
    expect(bridge.pick).toHaveBeenCalledWith('photo');
  });
});

describe('Gerçek arıza gizlenmez', () => {
  it('beklenmeyen hata Err olur', async () => {
    const bridge = {
      pick: jest.fn(async () => {
        throw new Error('load_failed');
      }),
    };
    const result = await loadPicker(bridge).MediaPicker.pick();
    expect(result.ok).toBe(false);
  });
});
