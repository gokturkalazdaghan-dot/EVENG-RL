/**
 * ProjectSession — açık projeyi tutan tek yer.
 *
 * NEDEN AYRI BİR KATMAN
 * Editör ekranı ile proje listesi aynı projeyi görmek zorunda: kullanıcı
 * listeden bir proje açtığında editör onu göstermeli, editörde bir araç
 * çalıştığında liste güncellenmeli. Bunu prop geçirerek yapmak, iki ekranın
 * arasındaki her bileşene proje taşımak demekti.
 *
 * DİSKE YAZMA HER DEĞİŞİKLİKTE
 * Kullanıcı uygulamayı kapattığında ya da sistem süreci öldürdüğünde
 * çalışması kaybolmamalı. "Çıkışta kaydet" diye bir an yoktur: mobilde
 * uygulama haber vermeden öldürülür.
 */
import { createLogger } from '@/core/logging/Logger';
import { appendVersion, createProject, type Project } from '@/projects/ProjectModel';
import { ProjectStore } from '@/projects/ProjectStore';

const log = createLogger('ProjectSession');

type Listener = (project: Project | null) => void;

class ProjectSessionImpl {
  private project: Project | null = null;
  private readonly listeners = new Set<Listener>();

  get current(): Project | null {
    return this.project;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.project);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.project);
  }

  /** Seçilen medyadan yeni proje açar ve diske yazar. */
  async open(input: {
    sourceUri: string;
    kind: 'photo' | 'video';
    title: string;
  }): Promise<Project> {
    const nowMs = Date.now();
    const project = createProject({
      // Zaman damgası + rastgele son ek: aynı milisaniyede iki proje
      // açılırsa kimlikler çakışır ve ikincisi birincinin dosyasının
      // üzerine yazardı.
      projectId: `${nowMs}-${Math.random().toString(36).slice(2, 10)}`,
      title: input.title,
      kind: input.kind,
      sourceUri: input.sourceUri,
      nowMs,
    });

    this.project = project;
    this.emit();
    await this.persist(project);
    return project;
  }

  /** Var olan projeyi açar. */
  async resume(projectId: string): Promise<Project | null> {
    const result = await ProjectStore.load(projectId);
    if (!result.ok) return null;
    this.project = result.value;
    this.emit();
    return result.value;
  }

  close(): void {
    this.project = null;
    this.emit();
  }

  /**
   * Araç çıktısını geçmişe ekler.
   *
   * Açık proje yoksa SESSİZCE yok saymaz: çağıran taraf çıktıyı kaybettiğini
   * bilmeli, yoksa kullanıcı işleminin sonucunu bir daha bulamaz.
   */
  async recordResult(capability: string, outputUri: string): Promise<Project | null> {
    if (!this.project) {
      log.warn(`Açık proje yok, çıktı iliştirilemedi: ${capability}`);
      return null;
    }

    const next = appendVersion(this.project, {
      uri: outputUri,
      capability,
      nowMs: Date.now(),
    });
    this.project = next;
    this.emit();
    await this.persist(next);
    return next;
  }

  /** Geri/ileri alma gibi işaretçi değişikliklerini uygular ve yazar. */
  async apply(transform: (project: Project) => Project): Promise<Project | null> {
    if (!this.project) return null;
    const next = transform(this.project);
    if (next === this.project) return this.project;

    this.project = next;
    this.emit();
    await this.persist(next);
    return next;
  }

  private async persist(project: Project): Promise<void> {
    const saved = await ProjectStore.save(project);
    if (!saved.ok) {
      // Kaydedilemeyen bir değişiklik sessiz kalmamalı: bellekte doğru,
      // diskte yanlış bir durum, uygulamanın bir sonraki açılışında
      // kullanıcının işini kaybetmesi demektir.
      log.error(`Proje diske yazılamadı: ${project.projectId}`);
    }
  }
}

export const ProjectSession = new ProjectSessionImpl();
