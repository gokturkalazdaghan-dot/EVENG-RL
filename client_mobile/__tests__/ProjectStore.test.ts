/**
 * ProjectStore testleri — sahte bir dosya sistemi ÜZERİNDE.
 *
 * Buradaki hatalar kullanıcının işini kaybetmesiyle sonuçlanır:
 *   - Atomik olmayan yazma → yarım JSON, proje bir daha açılmaz.
 *   - Bozuk tek dosyanın listeyi boşaltması → "hiç projen yok" yalanı.
 *   - Doğrulanmamış JSON.parse → elle düzenlenmiş dosya arayüzü çökertir.
 */

// `mock` önekli değişkenler jest.mock fabrikasından erişilebilir; öneksiz
// olanlar "out-of-scope variable" hatası verir (fabrika hoisted edilir).
const mockFiles = new Map<string, string>();
const mockMoves: Array<[string, string]> = [];

jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: {
    DocumentDirectoryPath: '/doc',
    CachesDirectoryPath: '/cache',
    mkdir: jest.fn(async () => undefined),
    writeFile: jest.fn(async (path: string, data: string) => {
      mockFiles.set(path, data);
    }),
    readFile: jest.fn(async (path: string) => {
      const value = mockFiles.get(path);
      if (value === undefined) throw new Error(`ENOENT ${path}`);
      return value;
    }),
    moveFile: jest.fn(async (from: string, to: string) => {
      const value = mockFiles.get(from);
      if (value === undefined) throw new Error(`ENOENT ${from}`);
      mockFiles.delete(from);
      mockFiles.set(to, value);
      mockMoves.push([from, to]);
    }),
    readDir: jest.fn(async () =>
      [...mockFiles.keys()].map((path) => ({
        path,
        name: path.split('/').pop() ?? '',
        isFile: () => true,
        isDirectory: () => false,
      })),
    ),
    unlink: jest.fn(async () => undefined),
  },
}));

import { createProject, type Project } from '@/projects/ProjectModel';
import { ProjectStore } from '@/projects/ProjectStore';

const T0 = 1_700_000_000_000;

function make(id: string, updatedAtMs = T0): Project {
  return {
    ...createProject({
      projectId: id,
      title: id,
      kind: 'photo',
      sourceUri: `file:///inbox/${id}.jpg`,
      nowMs: T0,
    }),
    updatedAtMs,
  };
}

beforeEach(() => {
  mockFiles.clear();
  mockMoves.length = 0;
});

describe('Yazma ATOMİKTİR', () => {
  it('önce .tmp yazılır, sonra taşınır', async () => {
    const result = await ProjectStore.save(make('p1'));

    expect(result.ok).toBe(true);
    // Doğrudan üzerine yazmak, yazma sırasında uygulama öldürülürse yarım
    // bir JSON bırakır ve proje bir daha açılmaz.
    expect(mockMoves).toHaveLength(1);
    expect(mockMoves[0]?.[0]).toContain('.tmp');
    expect(mockMoves[0]?.[1]).not.toContain('.tmp');
  });

  it('kaydedilen proje geri okunur', async () => {
    await ProjectStore.save(make('p1'));
    const loaded = await ProjectStore.load('p1');

    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.value.projectId).toBe('p1');
  });
});

describe('Bozuk dosya kullanıcının diğer projelerini GİZLEMEZ', () => {
  it('okunamayan dosya atlanır, diğerleri listelenir', async () => {
    await ProjectStore.save(make('iyi-1'));
    await ProjectStore.save(make('iyi-2'));
    mockFiles.set('/doc/projects/bozuk.evengirl.json', '{ yarım json');

    const list = await ProjectStore.list();

    // Tek bir bozuk kayıt yüzünden "hiç projen yok" demek, en kötü hata
    // mesajıdır.
    expect(list.map((p) => p.projectId).sort()).toEqual(['iyi-1', 'iyi-2']);
  });

  it('şekli bozuk JSON de atlanır', async () => {
    await ProjectStore.save(make('iyi'));
    mockFiles.set('/doc/projects/sahte.evengirl.json', JSON.stringify({ projectId: 'x' }));

    const list = await ProjectStore.list();
    expect(list).toHaveLength(1);
  });

  it('sürümsüz proje geçersizdir', async () => {
    // Sürüm listesi boş bir proje, editörde boş ekran demektir.
    mockFiles.set(
      '/doc/projects/bos.evengirl.json',
      JSON.stringify({ ...make('bos'), versions: [] }),
    );
    expect(await ProjectStore.list()).toHaveLength(0);
  });

  it('bozuk dosya SİLİNMEZ — kullanıcının verisi olabilir', async () => {
    mockFiles.set('/doc/projects/bozuk.evengirl.json', 'çöp');
    await ProjectStore.list();
    expect(mockFiles.has('/doc/projects/bozuk.evengirl.json')).toBe(true);
  });
});

describe('Sıralama', () => {
  it('en son güncellenen başta', async () => {
    await ProjectStore.save(make('eski', T0));
    await ProjectStore.save(make('yeni', T0 + 5000));

    const list = await ProjectStore.list();
    expect(list[0]?.projectId).toBe('yeni');
  });
});

describe('Zero-Deletion', () => {
  it('depo SİLME METODU AÇMAZ', () => {
    // Otomatik bakım, kota ya da "eski proje" gerekçesiyle silme yolu
    // bulunmamalı; metodun yokluğu en güçlü belgedir.
    const surface = Object.keys(ProjectStore);
    expect(surface).not.toContain('delete');
    expect(surface).not.toContain('remove');
    expect(surface).not.toContain('purge');
    expect(surface).not.toContain('clear');
  });
});

describe('Olmayan proje', () => {
  it('yükleme Err döner, çökmez', async () => {
    expect((await ProjectStore.load('yok')).ok).toBe(false);
  });
});
