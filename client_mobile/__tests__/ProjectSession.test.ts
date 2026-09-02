/**
 * ProjectSession — açık projeyi tutan katman.
 *
 * NEDEN TEST EDİLİYOR
 * Bu katman kullanıcı yolculuğunun ORTASINDA duruyor: proje listesi
 * buradan proje açıyor, editör kaynağını buradan alıyor, araç çıktısı
 * buraya dönüyor. Buradaki bir hata "hiçbir şey olmuyor" biçiminde
 * görünür — en zor teşhis edilen hata türü.
 *
 * DİSKE YAZMA HER DEĞİŞİKLİKTE: mobilde uygulama haber vermeden
 * öldürülür; "çıkışta kaydet" diye bir an yoktur.
 */

/**
 * Dönüş tipi AÇIKÇA yazılıyor: `jest.fn(async () => ({ ok: true as const }))`
 * mock'u `{ ok: true }` olarak daraltır ve başarısızlık senaryosu için
 * `mockResolvedValueOnce({ ok: false, … })` tip hatası verir. Testler yine
 * de geçer (Babel tipleri siler) ama `tsc` kapısı kırmızıya döner — iki
 * sinyalin ayrışması.
 */
type SaveResult = { ok: true; value: undefined } | { ok: false; error: { code: string } };

const mockSave = jest.fn<Promise<SaveResult>, []>(async () => ({
  ok: true,
  value: undefined,
}));
const mockLoad = jest.fn();

jest.mock('@/projects/ProjectStore', () => ({
  ProjectStore: {
    save: (...args: unknown[]) => mockSave(...(args as [])),
    load: (...args: unknown[]) => mockLoad(...(args as [])),
    list: async () => [],
  },
}));

import { currentVersion, lineage } from '@/projects/ProjectModel';
import { ProjectSession } from '@/projects/ProjectSession';

beforeEach(() => {
  mockSave.mockClear();
  mockLoad.mockReset();
  ProjectSession.close();
});

describe('Proje açma', () => {
  it('açılan proje DİSKE yazılır', async () => {
    await ProjectSession.open({ sourceUri: 'file:///a.jpg', kind: 'photo', title: 'Deneme' });

    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(ProjectSession.current?.title).toBe('Deneme');
  });

  it('aynı milisaniyede açılan iki proje AYNI kimliği almaz', async () => {
    // Çakışan kimlik, ikinci projenin birincinin dosyasının üzerine
    // yazması demektir.
    const a = await ProjectSession.open({ sourceUri: 'file:///a.jpg', kind: 'photo', title: 'A' });
    const b = await ProjectSession.open({ sourceUri: 'file:///b.jpg', kind: 'photo', title: 'B' });

    expect(a.projectId).not.toBe(b.projectId);
  });

  it('abone açılışta mevcut durumu ALIR', () => {
    const seen: unknown[] = [];
    const unsubscribe = ProjectSession.subscribe((p) => seen.push(p));

    // İlk çağrı hemen yapılır: aksi halde ekran, ilk değişikliğe kadar
    // boş durur ve kullanıcı açık projesini göremez.
    expect(seen).toHaveLength(1);
    unsubscribe();
  });

  it('abonelik iptali sonrası bildirim GELMEZ', async () => {
    const seen: unknown[] = [];
    const unsubscribe = ProjectSession.subscribe((p) => seen.push(p));
    unsubscribe();

    await ProjectSession.open({ sourceUri: 'file:///a.jpg', kind: 'photo', title: 'A' });
    expect(seen).toHaveLength(1);
  });
});

describe('Araç çıktısı', () => {
  it('geçmişe eklenir ve diske yazılır', async () => {
    await ProjectSession.open({ sourceUri: 'file:///a.jpg', kind: 'photo', title: 'A' });
    mockSave.mockClear();

    const next = await ProjectSession.recordResult('face-restore', 'file:///out.jpg');

    expect(next?.versions).toHaveLength(2);
    expect(currentVersion(next!).uri).toBe('file:///out.jpg');
    expect(currentVersion(next!).capability).toBe('face-restore');
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it('orijinal KORUNUR', async () => {
    await ProjectSession.open({ sourceUri: 'file:///a.jpg', kind: 'photo', title: 'A' });
    await ProjectSession.recordResult('face-restore', 'file:///1.jpg');
    await ProjectSession.recordResult('hd-upscale', 'file:///2.jpg');

    const chain = lineage(ProjectSession.current!);
    expect(chain[chain.length - 1]?.uri).toBe('file:///a.jpg');
  });

  it('açık proje yokken çıktı SESSİZCE yok sayılmaz', async () => {
    // `null` dönmesi çağıran tarafın çıktıyı kaybettiğini bilmesini
    // sağlar; sessizce başarı dönmek, kullanıcının işleminin sonucunu bir
    // daha bulamaması demektir.
    const result = await ProjectSession.recordResult('face-restore', 'file:///out.jpg');

    expect(result).toBeNull();
    expect(mockSave).not.toHaveBeenCalled();
  });
});

describe('Kaydetme hatası', () => {
  it('diske yazılamasa bile bellekteki durum İLERLER', async () => {
    // Kullanıcı düzenlemeye devam edebilmeli; kayıp riski loglanır ama
    // ekran donmaz.
    await ProjectSession.open({ sourceUri: 'file:///a.jpg', kind: 'photo', title: 'A' });
    mockSave.mockResolvedValueOnce({ ok: false, error: { code: 'CACHE_WRITE_FAILED' } });

    const next = await ProjectSession.recordResult('face-restore', 'file:///out.jpg');
    expect(next?.versions).toHaveLength(2);
  });
});

describe('Var olan projeyi sürdürme', () => {
  it('okunamayan proje null döner ve oturumu BOZMAZ', async () => {
    await ProjectSession.open({ sourceUri: 'file:///a.jpg', kind: 'photo', title: 'A' });
    const before = ProjectSession.current;

    mockLoad.mockResolvedValueOnce({ ok: false, error: { code: 'UNKNOWN' } });
    const resumed = await ProjectSession.resume('yok');

    expect(resumed).toBeNull();
    // Açık proje DEĞİŞMEZ: başarısız bir açma, kullanıcının üzerinde
    // çalıştığı projeyi kapatmamalı.
    expect(ProjectSession.current).toBe(before);
  });

  it('okunabilen proje açık proje olur', async () => {
    const stored = {
      projectId: 'p9',
      title: 'Eski',
      kind: 'photo' as const,
      versions: [
        { versionId: 'v0', uri: 'file:///eski.jpg', capability: null, createdAtMs: 1, parentVersionId: null },
      ],
      currentVersionId: 'v0',
      createdAtMs: 1,
      updatedAtMs: 1,
    };
    mockLoad.mockResolvedValueOnce({ ok: true, value: stored });

    const resumed = await ProjectSession.resume('p9');
    expect(resumed?.projectId).toBe('p9');
    expect(ProjectSession.current?.projectId).toBe('p9');
  });
});

describe('İşaretçi değişiklikleri', () => {
  it('değişiklik yoksa diske YAZILMAZ', async () => {
    await ProjectSession.open({ sourceUri: 'file:///a.jpg', kind: 'photo', title: 'A' });
    mockSave.mockClear();

    // Aynı nesneyi döndüren bir dönüşüm gereksiz disk yazması üretmemeli.
    await ProjectSession.apply((project) => project);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('gerçek değişiklik diske yazılır', async () => {
    await ProjectSession.open({ sourceUri: 'file:///a.jpg', kind: 'photo', title: 'A' });
    mockSave.mockClear();

    await ProjectSession.apply((project) => ({ ...project, title: 'Yeni' }));

    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(ProjectSession.current?.title).toBe('Yeni');
  });
});
