/**
 * Proje sürüm geçmişi testleri.
 *
 * Bu mantıktaki hatalar SESSİZDİR: kullanıcı ancak işini kaybettiğinde fark
 * eder. Üzerine yazan bir `appendVersion`, silen bir `undo` ya da sonsuz
 * döngüye giren bir `lineage` hiçbir log üretmez.
 */
import {
  appendVersion,
  canRedo,
  canUndo,
  children,
  createProject,
  currentVersion,
  lineage,
  redo,
  resetToOriginal,
  undo,
  type Project,
} from '@/projects/ProjectModel';

const T0 = 1_700_000_000_000;

function fresh(): Project {
  return createProject({
    projectId: 'p1',
    title: 'Deneme',
    kind: 'photo',
    sourceUri: 'file:///inbox/a.jpg',
    nowMs: T0,
  });
}

describe('Orijinal her zaman durur', () => {
  it('yeni proje tek sürümle başlar ve o sürüm orijinaldir', () => {
    const project = fresh();
    expect(project.versions).toHaveLength(1);
    expect(project.versions[0]?.capability).toBeNull();
    expect(currentVersion(project).uri).toBe('file:///inbox/a.jpg');
  });

  it('araç çıktısı orijinalin ÜZERİNE YAZMAZ', () => {
    let project = fresh();
    project = appendVersion(project, { uri: 'file:///out/1.jpg', capability: 'face-restore', nowMs: T0 + 1 });
    project = appendVersion(project, { uri: 'file:///out/2.jpg', capability: 'hd-upscale', nowMs: T0 + 2 });

    expect(project.versions).toHaveLength(3);
    // Kullanıcı bir saat uğraştıktan sonra da orijinaline dönebilmeli.
    expect(project.versions[0]?.uri).toBe('file:///inbox/a.jpg');
    expect(currentVersion(project).uri).toBe('file:///out/2.jpg');
  });

  it('aynı milisaniyede iki araç bitse bile kimlikler ÇAKIŞMAZ', () => {
    // Yalnızca zaman damgası kullanılsaydı ikinci sürüm birincinin yerine
    // geçmiş gibi görünürdü.
    let project = fresh();
    project = appendVersion(project, { uri: 'file:///out/1.jpg', capability: 'a', nowMs: T0 });
    project = appendVersion(project, { uri: 'file:///out/2.jpg', capability: 'b', nowMs: T0 });

    const ids = new Set(project.versions.map((v) => v.versionId));
    expect(ids.size).toBe(3);
  });
});

describe('Geri alma silmez', () => {
  it('undo sürümü ATMAZ, yalnızca işaretçiyi taşır', () => {
    let project = fresh();
    project = appendVersion(project, { uri: 'file:///out/1.jpg', capability: 'a', nowMs: T0 + 1 });

    const before = project.versions.length;
    project = undo(project);

    expect(project.versions).toHaveLength(before);
    expect(currentVersion(project).uri).toBe('file:///inbox/a.jpg');
  });

  it('undo sonrası redo aynı sürüme döner', () => {
    let project = fresh();
    project = appendVersion(project, { uri: 'file:///out/1.jpg', capability: 'a', nowMs: T0 + 1 });
    project = redo(undo(project));

    expect(currentVersion(project).uri).toBe('file:///out/1.jpg');
  });

  it('orijinaldeyken undo bir şey yapmaz', () => {
    const project = fresh();
    expect(canUndo(project)).toBe(false);
    expect(undo(project)).toEqual(project);
  });

  it('en son sürümdeyken redo bir şey yapmaz', () => {
    let project = fresh();
    project = appendVersion(project, { uri: 'file:///out/1.jpg', capability: 'a', nowMs: T0 + 1 });
    expect(canRedo(project)).toBe(false);
    expect(redo(project)).toEqual(project);
  });
});

describe('Dallanma eski dalı kaybetmez', () => {
  it('geri alıp farklı araç çalıştırmak ESKİ DALI SİLMEZ', () => {
    let project = fresh();
    project = appendVersion(project, { uri: 'file:///out/a.jpg', capability: 'a', nowMs: T0 + 1 });
    const branchA = currentVersion(project).versionId;

    project = undo(project);
    project = appendVersion(project, { uri: 'file:///out/b.jpg', capability: 'b', nowMs: T0 + 2 });

    // İki dal da duruyor: kullanıcı fikrini değiştirirse ilkine dönebilir.
    expect(project.versions).toHaveLength(3);
    expect(project.versions.some((v) => v.versionId === branchA)).toBe(true);
    expect(children(project, project.versions[0]!.versionId)).toHaveLength(2);
  });

  it('redo dallanmada EN YENİ dalı seçer', () => {
    let project = fresh();
    project = appendVersion(project, { uri: 'file:///out/a.jpg', capability: 'a', nowMs: T0 + 1 });
    project = undo(project);
    project = appendVersion(project, { uri: 'file:///out/b.jpg', capability: 'b', nowMs: T0 + 2 });
    project = undo(project);

    // Kullanıcının son denediği yol.
    expect(currentVersion(redo(project)).uri).toBe('file:///out/b.jpg');
  });
});

describe('Soy zinciri', () => {
  it('geçerli sürümden orijinale uzanır', () => {
    let project = fresh();
    project = appendVersion(project, { uri: 'file:///out/1.jpg', capability: 'a', nowMs: T0 + 1 });
    project = appendVersion(project, { uri: 'file:///out/2.jpg', capability: 'b', nowMs: T0 + 2 });

    const chain = lineage(project);
    expect(chain.map((v) => v.uri)).toEqual([
      'file:///out/2.jpg',
      'file:///out/1.jpg',
      'file:///inbox/a.jpg',
    ]);
  });

  it('bozuk ata halkasında SONSUZ DÖNGÜYE girmez', () => {
    // Bozuk bir kayıt arayüzü dondurmamalı.
    const project = fresh();
    const looped: Project = {
      ...project,
      versions: [
        { versionId: 'x', uri: 'a', capability: null, createdAtMs: T0, parentVersionId: 'y' },
        { versionId: 'y', uri: 'b', capability: null, createdAtMs: T0, parentVersionId: 'x' },
      ],
      currentVersionId: 'x',
    };

    expect(lineage(looped)).toHaveLength(2);
  });

  it('geçerli sürüm bulunamazsa ORİJİNALE düşülür, boş ekrana değil', () => {
    const project = fresh();
    const broken: Project = { ...project, currentVersionId: 'olmayan' };
    expect(currentVersion(broken).uri).toBe('file:///inbox/a.jpg');
  });
});

describe('Sıfırla geçmişi temizlemez', () => {
  it('orijinale döner ama sürümleri KORUR', () => {
    let project = fresh();
    project = appendVersion(project, { uri: 'file:///out/1.jpg', capability: 'a', nowMs: T0 + 1 });
    project = appendVersion(project, { uri: 'file:///out/2.jpg', capability: 'b', nowMs: T0 + 2 });

    const reset = resetToOriginal(project);

    expect(currentVersion(reset).uri).toBe('file:///inbox/a.jpg');
    expect(reset.versions).toHaveLength(3);
    // Kullanıcı fikrini değiştirirse ileri alabilir.
    expect(canRedo(reset)).toBe(true);
  });
});
