/**
 * Ekran yakalama kalkanı politikası testleri.
 */
import {
  decideCaptureResponse,
  shouldLiftShield,
  type CaptureContext,
} from '@/security/CaptureShield';

const exhausted: CaptureContext = {
  isPro: false,
  remainingFreeExports: 0,
  hasProtectedBuffer: true,
};

describe('PRO abone ve hakkı olan kullanıcı', () => {
  it('PRO abone hiçbir yakalama kısıtı görmez', () => {
    const pro: CaptureContext = { ...exhausted, isPro: true };

    expect(decideCaptureResponse({ kind: 'screenshot' }, pro)).toEqual({
      shield: false,
      purgeBuffers: false,
      routeToPaywall: false,
      noticeKey: null,
    });
    expect(decideCaptureResponse({ kind: 'recording', active: true }, pro).shield).toBe(false);
  });

  it('ücretsiz hakkı kalan kullanıcı da kısıt görmez', () => {
    const hasQuota: CaptureContext = { ...exhausted, remainingFreeExports: 1 };
    expect(decideCaptureResponse({ kind: 'screenshot' }, hasQuota).shield).toBe(false);
  });
});

describe('ekran kaydı', () => {
  it('kayıt başladığında kalkan gösterilir ve tampon boşaltılır', () => {
    const response = decideCaptureResponse({ kind: 'recording', active: true }, exhausted);
    expect(response.shield).toBe(true);
    expect(response.purgeBuffers).toBe(true);
    expect(response.noticeKey).toBe('export.capture.recordingBlocked');
  });

  it('kayıt sırasında paywall AÇILMAZ', () => {
    // Kayıt, kullanıcının kendi ekranını kaydetmesi olabilir (destek videosu).
    const response = decideCaptureResponse({ kind: 'recording', active: true }, exhausted);
    expect(response.routeToPaywall).toBe(false);
  });

  it('kayıt durduğunda kalkan kalkar', () => {
    const response = decideCaptureResponse({ kind: 'recording', active: false }, exhausted);
    expect(response.shield).toBe(false);
    expect(response.purgeBuffers).toBe(false);
  });

  it('korunan tampon yoksa boşaltma istenmez', () => {
    const noBuffer: CaptureContext = { ...exhausted, hasProtectedBuffer: false };
    const response = decideCaptureResponse({ kind: 'recording', active: true }, noBuffer);
    expect(response.shield).toBe(true);
    expect(response.purgeBuffers).toBe(false);
  });
});

describe('ekran görüntüsü', () => {
  it('kalkan gösterilir ve kullanıcı paywall’a yönlendirilir', () => {
    const response = decideCaptureResponse({ kind: 'screenshot' }, exhausted);
    expect(response.shield).toBe(true);
    expect(response.routeToPaywall).toBe(true);
    expect(response.purgeBuffers).toBe(true);
    expect(response.noticeKey).toBe('export.capture.screenshotNotice');
  });

  it('kullanıcıya bir açıklama anahtarı verilir — sessiz kalınmaz', () => {
    // Ekranın aniden kararması, açıklama olmadan bir arıza gibi görünür.
    expect(decideCaptureResponse({ kind: 'screenshot' }, exhausted).noticeKey).not.toBeNull();
  });
});

describe('shouldLiftShield', () => {
  it('abonelik alındığında kalkan DERHAL kalkar', () => {
    // "Bir sonraki açılışta düzelir" davranışı, ödeme yapmış kullanıcının
    // bozuk bir uygulamayla baş başa kalması demektir.
    expect(shouldLiftShield({ ...exhausted, isPro: true }, true)).toBe(true);
  });

  it('kayıt sürerken hakkı tükenmiş kullanıcıda kalkan durur', () => {
    expect(shouldLiftShield(exhausted, true)).toBe(false);
  });

  it('kayıt bittiğinde kalkan kalkar', () => {
    expect(shouldLiftShield(exhausted, false)).toBe(true);
  });
});
