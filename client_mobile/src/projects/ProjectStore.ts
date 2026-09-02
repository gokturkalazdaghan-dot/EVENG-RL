/**
 * ProjectStore — projelerin diske yazılması ve okunması.
 *
 * NEDEN MMKV DEĞİL DOSYA
 * MMKV küçük anahtar/değer için hızlıdır ama proje geçmişi sınırsız
 * büyür. Her projeyi kendi JSON dosyasında tutmak, bir projenin bozulmasının
 * diğerlerini etkilememesini sağlar: tek bir büyük kayıt bozulduğunda
 * kullanıcı TÜM projelerini kaybederdi.
 *
 * ZERO-DELETION
 * Bu modülün SİLME METODU YOKTUR. Projeler `PATHS.projects` altında,
 * yedeklenen korunan kovada durur ve otomatik temizlikten muaftır
 * (bkz. storage/CachePolicy.ts).
 *
 * ATOMİK YAZMA
 * Önce `.tmp` dosyasına yazılıp sonra taşınıyor. Doğrudan üzerine yazmak,
 * yazma sırasında uygulamanın öldürülmesi durumunda YARIM bir JSON bırakır
 * ve proje bir daha açılmaz.
 */
import RNFS from 'react-native-fs';

import { createLogger } from '@/core/logging/Logger';
import { appError, Err, Ok, type Result } from '@/core/result/Result';
import { PATHS } from '@/storage/paths';
import type { Project } from '@/projects/ProjectModel';

const log = createLogger('ProjectStore');

const EXTENSION = '.evengirl.json';

function fileFor(projectId: string): string {
  return `${PATHS.projects}/${projectId}${EXTENSION}`;
}

/**
 * Diskten okunan bir nesnenin gerçekten Project olduğunu doğrular.
 *
 * `JSON.parse` sonucuna güvenmek, elle düzenlenmiş ya da yarım yazılmış
 * bir dosyanın arayüzü çökertmesi demektir. Bozuk dosya ATLANIR, silinmez
 * — kullanıcının verisi olabilir.
 */
function isProject(value: unknown): value is Project {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Partial<Project>;
  return (
    typeof p.projectId === 'string' &&
    p.projectId.length > 0 &&
    typeof p.title === 'string' &&
    (p.kind === 'photo' || p.kind === 'video') &&
    Array.isArray(p.versions) &&
    p.versions.length > 0 &&
    typeof p.currentVersionId === 'string' &&
    typeof p.createdAtMs === 'number' &&
    typeof p.updatedAtMs === 'number'
  );
}

export const ProjectStore = {
  async save(project: Project): Promise<Result<void>> {
    try {
      await RNFS.mkdir(PATHS.projects);

      // ATOMİK: yarım yazılmış bir JSON, projeyi kalıcı olarak açılamaz
      // hale getirirdi.
      const temporary = `${fileFor(project.projectId)}.tmp`;
      await RNFS.writeFile(temporary, JSON.stringify(project), 'utf8');
      await RNFS.moveFile(temporary, fileFor(project.projectId));

      return Ok(undefined);
    } catch (e) {
      log.warn('Proje kaydedilemedi', e);
      return Err(appError('CACHE_WRITE_FAILED', 'project save failed', { retryable: true }));
    }
  },

  async load(projectId: string): Promise<Result<Project>> {
    try {
      const raw = await RNFS.readFile(fileFor(projectId), 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (!isProject(parsed)) {
        return Err(appError('UNKNOWN', 'bozuk proje dosyası'));
      }
      return Ok(parsed);
    } catch (e) {
      log.warn(`Proje okunamadı: ${projectId}`, e);
      return Err(appError('UNKNOWN', 'project load failed'));
    }
  },

  /**
   * Tüm projeler, en son güncellenen başta.
   *
   * Bozuk bir dosya listeyi BOŞ DÖNDÜRMEZ: o dosya atlanır ve diğerleri
   * gösterilir. Tek bir bozuk kayıt yüzünden kullanıcıya "hiç projen yok"
   * demek, en kötü hata mesajıdır.
   */
  async list(): Promise<readonly Project[]> {
    try {
      await RNFS.mkdir(PATHS.projects);
      const entries = await RNFS.readDir(PATHS.projects);

      const projects: Project[] = [];
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(EXTENSION)) continue;
        try {
          const parsed: unknown = JSON.parse(await RNFS.readFile(entry.path, 'utf8'));
          if (isProject(parsed)) projects.push(parsed);
          else log.warn(`Bozuk proje atlandı: ${entry.name}`);
        } catch {
          log.warn(`Okunamayan proje atlandı: ${entry.name}`);
        }
      }

      return projects.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
    } catch (e) {
      log.warn('Projeler listelenemedi', e);
      return [];
    }
  },

  // SİLME METODU BİLEREK YOKTUR (Zero-Deletion).
  //
  // Proje silme, yalnızca kullanıcının açık isteğiyle ve ayrı bir onay
  // akışıyla yapılabilecek bir eylemdir; otomatik bakım, kota ya da
  // "eski proje" gerekçesiyle asla. Metodun yokluğu en güçlü belgedir.
};
