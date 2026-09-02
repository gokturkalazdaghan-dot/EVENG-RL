/**
 * Proje modeli ve SÜRÜM GEÇMİŞİ — saf mantık.
 *
 * ZERO-DELETION BURADA BAŞLAR
 * Bir araç çalıştığında çıktı, kaynağın ÜZERİNE YAZILMAZ; geçmişe yeni bir
 * sürüm eklenir. Kullanıcının orijinali her zaman `versions[0]` olarak
 * durur. Üzerine yazmak, kullanıcının bir saat uğraşıp beğenmediği tek bir
 * adımdan sonra orijinaline dönememesi demektir.
 *
 * GERİ ALMA SİLMEZ
 * `undo` işaretçiyi geri taşır, sürümü ATMAZ. İleri alma (`redo`) bu
 * yüzden çalışır. Yeni bir düzenleme yapıldığında ileri sürümler yine
 * silinmez, DALLANIR: kullanıcı geri alıp farklı bir yol denediğinde eski
 * dalı kaybetmez.
 *
 * NEDEN SAF
 * Burada dosya sistemi yok, native yok, ağ yok. Geçmiş mantığındaki bir
 * hata sessizdir — kullanıcı ancak işini kaybettiğinde fark eder — bu
 * yüzden dosya sisteminden ayrı ve tamamen test edilebilir tutuluyor.
 */

export type ProjectMediaKind = 'photo' | 'video';

export interface ProjectVersion {
  readonly versionId: string;
  readonly uri: string;
  /** Bu sürümü üreten araç; ilk sürüm için `null` (kullanıcının orijinali). */
  readonly capability: string | null;
  readonly createdAtMs: number;
  /** Hangi sürümden türedi — dallanma bunu izlenebilir kılar. */
  readonly parentVersionId: string | null;
}

export interface Project {
  readonly projectId: string;
  readonly title: string;
  readonly kind: ProjectMediaKind;
  readonly versions: readonly ProjectVersion[];
  /** Şu an gösterilen sürüm — `versions` içindeki indeks DEĞİL, kimlik. */
  readonly currentVersionId: string;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
}

export function createProject(input: {
  projectId: string;
  title: string;
  kind: ProjectMediaKind;
  sourceUri: string;
  nowMs: number;
}): Project {
  const original: ProjectVersion = {
    versionId: `${input.nowMs}-0`,
    uri: input.sourceUri,
    // Orijinalin `capability`'si null: kullanıcı bunu bir araçla üretmedi,
    // kendi getirdi. Geçmişte her zaman en altta kalır.
    capability: null,
    createdAtMs: input.nowMs,
    parentVersionId: null,
  };

  return {
    projectId: input.projectId,
    title: input.title,
    kind: input.kind,
    versions: [original],
    currentVersionId: original.versionId,
    createdAtMs: input.nowMs,
    updatedAtMs: input.nowMs,
  };
}

export function currentVersion(project: Project): ProjectVersion {
  const found = project.versions.find((v) => v.versionId === project.currentVersionId);
  // Geçerli sürüm bulunamazsa ORİJİNALE düşülür, boş ekrana değil:
  // bozuk bir işaretçi yüzünden kullanıcının projesi görünmez olmamalı.
  return found ?? project.versions[0]!;
}

/**
 * Araç çıktısını geçmişe ekler.
 *
 * Mevcut sürümün ÜZERİNE YAZMAZ; ondan türeyen yeni bir sürüm ekler ve
 * işaretçiyi oraya taşır.
 */
export function appendVersion(
  project: Project,
  input: { uri: string; capability: string; nowMs: number },
): Project {
  const version: ProjectVersion = {
    // Sıra numarası uzunluktan alınıyor: aynı milisaniyede iki araç biterse
    // sadece zaman damgası kullanmak AYNI kimliği üretir ve ikinci sürüm
    // birincinin yerine geçmiş gibi görünürdü.
    versionId: `${input.nowMs}-${project.versions.length}`,
    uri: input.uri,
    capability: input.capability,
    createdAtMs: input.nowMs,
    parentVersionId: project.currentVersionId,
  };

  return {
    ...project,
    versions: [...project.versions, version],
    currentVersionId: version.versionId,
    updatedAtMs: input.nowMs,
  };
}

/** Geçerli sürümden orijinale uzanan zincir (yeniden eskiye). */
export function lineage(project: Project): readonly ProjectVersion[] {
  const byId = new Map(project.versions.map((v) => [v.versionId, v]));
  const chain: ProjectVersion[] = [];

  let cursor: ProjectVersion | undefined = currentVersion(project);
  // Döngü koruması: bozuk bir `parentVersionId` halkası sonsuz döngüye
  // sokardı ve arayüz donardı.
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor.versionId)) {
    seen.add(cursor.versionId);
    chain.push(cursor);
    cursor = cursor.parentVersionId ? byId.get(cursor.parentVersionId) : undefined;
  }
  return chain;
}

export function canUndo(project: Project): boolean {
  return currentVersion(project).parentVersionId !== null;
}

/**
 * Bir adım geri.
 *
 * Sürüm SİLİNMEZ, yalnızca işaretçi ataya taşınır — ileri alma bu yüzden
 * çalışır ve kullanıcı geri alıp fikrini değiştirdiğinde işini kaybetmez.
 */
export function undo(project: Project): Project {
  const parentId = currentVersion(project).parentVersionId;
  if (parentId === null) return project;
  return { ...project, currentVersionId: parentId };
}

/** Verilen sürümden türeyen sürümler — birden fazlaysa dallanma var. */
export function children(project: Project, versionId: string): readonly ProjectVersion[] {
  return project.versions.filter((v) => v.parentVersionId === versionId);
}

export function canRedo(project: Project): boolean {
  return children(project, project.currentVersionId).length > 0;
}

/**
 * Bir adım ileri.
 *
 * Dallanma varsa EN YENİ dal seçilir: kullanıcı geri alıp yeni bir yol
 * denediyse, ileri alma onun son denediği yola gitmeli.
 */
export function redo(project: Project): Project {
  const next = [...children(project, project.currentVersionId)].sort(
    (a, b) => b.createdAtMs - a.createdAtMs,
  )[0];
  if (!next) return project;
  return { ...project, currentVersionId: next.versionId };
}

/**
 * Orijinale dön.
 *
 * "Sıfırla" düğmesi geçmişi TEMİZLEMEZ; yalnızca işaretçiyi ilk sürüme
 * taşır. Kullanıcı fikrini değiştirirse ileri alabilir.
 */
export function resetToOriginal(project: Project): Project {
  const original = project.versions[0];
  if (!original) return project;
  return { ...project, currentVersionId: original.versionId };
}
