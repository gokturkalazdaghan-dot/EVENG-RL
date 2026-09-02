/**
 * ExportFlow testleri.
 *
 * Bu akıştaki hatalar doğrudan PARAYA ve kullanıcı güvenine dokunur:
 *   - Başarısız kayıtta sayacı ilerletmek → kullanıcı hakkını boşa yakar.
 *   - Hak yokken galeriye yazıp silmek → galeride bir an dosya belirir.
 *   - Sunucuya ulaşılamayınca hakkı kapatmak → ödediği şeyi vermemek.
 */

const mockRequest = jest.fn();
const mockGateCheck = jest.fn(() => ({ allowed: true, remainingFree: 3 }));
const mockGateCommit = jest.fn(async () => undefined);

jest.mock('@/security/SslPinning', () => ({
  pinnedRequest: (...args: unknown[]) => mockRequest(...(args as [])),
}));

jest.mock('@/export/ExportGate', () => ({
  ExportGate: {
    check: () => mockGateCheck(),
    commit: () => mockGateCommit(),
    get remaining() {
      return 3;
    },
  },
}));

jest.mock('@/share/CrossShare', () => ({
  CrossShare: { share: jest.fn(async () => ({ ok: true, value: undefined })) },
}));

import { ExportFlow } from '@/export/ExportFlow';

const ok = <T,>(value: T) => ({ ok: true as const, value });
const err = () => ({ ok: false as const, error: { code: 'NETWORK_UNAVAILABLE' } });

beforeEach(() => {
  mockRequest.mockReset();
  mockGateCommit.mockClear();
  mockGateCheck.mockReturnValue({ allowed: true, remainingFree: 3 });
});

describe('Kota kapısı', () => {
  it('hak yoksa galeriye YAZILMAZ', async () => {
    mockRequest.mockResolvedValueOnce(
      ok({ allowed: false, watermarked: false, remainingFree: 0, protectScreen: true }),
    );
    const save = jest.fn(async () => undefined);

    const outcome = await ExportFlow.save('/tmp/a.jpg', save);

    expect(outcome.kind).toBe('paywall');
    // Yazıp sonra silmek, kullanıcının galerisinde bir an için dosya
    // oluşturur — deneme bile yapılmamalı.
    expect(save).not.toHaveBeenCalled();
  });

  it('hak varsa kaydedilir ve sayaç ilerler', async () => {
    mockRequest
      .mockResolvedValueOnce(
        ok({ allowed: true, watermarked: false, remainingFree: 2, protectScreen: false }),
      )
      .mockResolvedValueOnce(ok({ remainingFree: 1 }));
    const save = jest.fn(async () => undefined);

    const outcome = await ExportFlow.save('/tmp/a.jpg', save);

    expect(save).toHaveBeenCalledWith('/tmp/a.jpg');
    expect(outcome).toEqual({ kind: 'saved', remainingFree: 1 });
    expect(mockGateCommit).toHaveBeenCalled();
  });
});

describe('Başarısız kayıt hakkı YAKMAZ', () => {
  it('galeriye yazma hata verirse sayaç ilerlemez', async () => {
    mockRequest.mockResolvedValueOnce(
      ok({ allowed: true, watermarked: false, remainingFree: 2, protectScreen: false }),
    );
    const save = jest.fn(async () => {
      throw new Error('permission_denied');
    });

    const outcome = await ExportFlow.save('/tmp/a.jpg', save);

    expect(outcome).toEqual({ kind: 'failed', retryable: true });
    // Kullanıcı hiçbir şey almadı; ücretsiz hakkı da gitmemeli.
    expect(mockGateCommit).not.toHaveBeenCalled();
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });
});

describe('Sunucuya ulaşılamadığında', () => {
  it('istemci sayacına düşülür — hak kapatılmaz', async () => {
    // Uçaktaki bir kullanıcıya "kota bilinmiyor" deyip hakkını
    // kullandırmamak, ödediği şeyi vermemektir.
    mockRequest.mockResolvedValueOnce(err()).mockResolvedValueOnce(err());
    mockGateCheck.mockReturnValue({ allowed: true, remainingFree: 3 });
    const save = jest.fn(async () => undefined);

    const outcome = await ExportFlow.save('/tmp/a.jpg', save);

    expect(save).toHaveBeenCalled();
    expect(outcome.kind).toBe('saved');
  });

  it('istemci sayacı da tükendiyse paywall açılır', async () => {
    mockRequest.mockResolvedValueOnce(err());
    mockGateCheck.mockReturnValue({ allowed: false, remainingFree: 0 });
    const save = jest.fn(async () => undefined);

    const outcome = await ExportFlow.save('/tmp/a.jpg', save);

    expect(outcome.kind).toBe('paywall');
    expect(save).not.toHaveBeenCalled();
  });
});

describe('Paylaşım kota tüketmez', () => {
  it('paylaşım sunucu kotasına HİÇ sormaz', async () => {
    // Kullanıcı içeriği zaten üretti; başka bir uygulamaya göndermek ayrı
    // bir kota gerektirmez. Kota yalnızca cihaza indirmede uygulanır.
    const result = await ExportFlow.share('instagram-stories', {
      filePath: '/tmp/a.jpg',
      kind: 'photo',
    } as never);

    expect(result.ok).toBe(true);
    expect(mockRequest).not.toHaveBeenCalled();
    expect(mockGateCommit).not.toHaveBeenCalled();
  });
});
