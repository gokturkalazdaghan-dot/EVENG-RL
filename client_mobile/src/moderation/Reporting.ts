/**
 * Reporting — kullanıcı üretimi içerik (UGC) moderasyon mekanizmaları.
 *
 * APPLE GUIDELINE 1.2, UGC barındıran uygulamalardan DÖRT şey ister:
 *   1. Sakıncalı içeriği filtreleme yöntemi   → moderation/ContentRating.ts
 *   2. Rapor mekanizması + ZAMANINDA yanıt    → bu dosya (+ backend SLA)
 *   3. Taciz eden kullanıcıyı engelleme       → bu dosya
 *   4. Yayınlanmış iletişim bilgisi           → support/FeedbackComposer.ts
 *
 * Dördü de olmadan uygulama reddedilir. Bu yüzden hepsi tek yerde belgelendi.
 *
 * ENGELLEME NEDEN YERELDE DE TUTULUR
 * Engel listesi sunucuda tutulur (cihazlar arası taşınmalı) ama YEREL bir
 * kopya da vardır: sunucu yanıtı gecikirse veya çevrimdışıysa, engellenen
 * kişinin içeriği bir kez bile görünmemelidir. Tek bir kare bile göstermek,
 * engellemenin amacını bozar.
 */
import { MMKV } from 'react-native-mmkv';

import { createLogger } from '@/core/logging/Logger';
import { appError, Err, Ok, type Result } from '@/core/result/Result';
import { pinnedRequest } from '@/security/SslPinning';

const log = createLogger('Reporting');

/**
 * Rapor gerekçeleri.
 *
 * Serbest metin YOK: yapılandırılmış gerekçe, moderasyon kuyruğunun
 * önceliklendirilmesini mümkün kılar. `csam` ve `minor-safety` en yüksek
 * öncelikle işlenir ve otomatik olarak içeriği askıya alır.
 */
export type ReportReason =
  /** Reşit olmayan kişinin cinsel içeriği — en yüksek öncelik. */
  | 'minor-safety'
  | 'nonconsensual-intimate'
  | 'sexual-content-unlabeled'
  | 'harassment'
  | 'hate-speech'
  | 'violence'
  | 'impersonation'
  | 'copyright'
  | 'spam'
  | 'other';

/** Bildirim anında içeriği otomatik gizleyen gerekçeler. */
const AUTO_SUSPEND_REASONS: readonly ReportReason[] = [
  'minor-safety',
  'nonconsensual-intimate',
];

export function suspendsImmediately(reason: ReportReason): boolean {
  return AUTO_SUSPEND_REASONS.includes(reason);
}

export interface ReportInput {
  readonly contentId: string;
  readonly authorId: string;
  readonly reason: ReportReason;
  /** Kullanıcının eklediği isteğe bağlı not — 500 karakterle sınırlı. */
  readonly note?: string;
}

const store = new MMKV({ id: 'evengirl.moderation' });
const BLOCKED_KEY = 'blocked.author.ids';
/** Aynı içeriği tekrar tekrar raporlamayı önler (kuyruk kirlenmesi). */
const REPORTED_KEY = 'reported.content.ids';

function readSet(key: string): Set<string> {
  try {
    const raw = store.getString(key);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function writeSet(key: string, value: Set<string>): void {
  store.set(key, JSON.stringify([...value]));
}

class ModerationImpl {
  private blocked = readSet(BLOCKED_KEY);
  private reported = readSet(REPORTED_KEY);
  private readonly listeners = new Set<(blocked: ReadonlySet<string>) => void>();

  /** Görünürlük kalkanının okuduğu engel listesi. */
  get blockedAuthorIds(): ReadonlySet<string> {
    return this.blocked;
  }

  isBlocked(authorId: string): boolean {
    return this.blocked.has(authorId);
  }

  hasReported(contentId: string): boolean {
    return this.reported.has(contentId);
  }

  subscribe(listener: (blocked: ReadonlySet<string>) => void): () => void {
    this.listeners.add(listener);
    listener(this.blocked);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Kullanıcıyı engeller.
   *
   * YEREL ÖNCE: engel derhal uygulanır ve UI güncellenir; sunucu senkronu
   * arka planda yapılır. Sunucuyu beklemek, kullanıcının "engelle"ye basıp
   * içeriği görmeye devam etmesi demektir.
   */
  async block(authorId: string): Promise<Result<void>> {
    this.blocked.add(authorId);
    writeSet(BLOCKED_KEY, this.blocked);
    this.listeners.forEach((listener) => listener(this.blocked));

    const result = await pinnedRequest<{ ok: boolean }>({
      path: '/v1/moderation/block',
      method: 'POST',
      body: { authorId },
    });

    if (!result.ok) {
      // Yerel engel DURUYOR. Sunucu senkronu başarısız olsa bile kullanıcı
      // korunur; senkron bir sonraki açılışta yeniden denenir.
      log.warn('Engel sunucuya iletilemedi — yerel engel geçerli');
    }
    return Ok(undefined);
  }

  async unblock(authorId: string): Promise<Result<void>> {
    this.blocked.delete(authorId);
    writeSet(BLOCKED_KEY, this.blocked);
    this.listeners.forEach((listener) => listener(this.blocked));

    await pinnedRequest<{ ok: boolean }>({
      path: '/v1/moderation/unblock',
      method: 'POST',
      body: { authorId },
    });
    return Ok(undefined);
  }

  /**
   * İçeriği raporlar.
   *
   * Rapor sunucuya ULAŞMALIDIR — yerel bir "raporladım" işareti moderasyon
   * yapmaz. Bu yüzden ağ hatası burada gerçek bir hatadır ve kullanıcıya
   * söylenir; sessizce yutulmaz.
   */
  async report(input: ReportInput): Promise<Result<{ suspended: boolean }>> {
    if (this.reported.has(input.contentId)) {
      // Tekrar rapor kuyruğu kirletir; kullanıcıya zaten raporladığını
      // söylemek, "çalışmadı" sanmasını da önler.
      return Ok({ suspended: suspendsImmediately(input.reason) });
    }

    const result = await pinnedRequest<{ suspended: boolean }>({
      path: '/v1/moderation/report',
      method: 'POST',
      body: {
        contentId: input.contentId,
        authorId: input.authorId,
        reason: input.reason,
        note: input.note?.slice(0, 500) ?? '',
      },
    });

    if (!result.ok) {
      log.warn('Rapor gönderilemedi');
      return Err(
        appError('NETWORK_UNAVAILABLE', 'report failed', {
          i18nKey: 'moderation.report.failed',
          retryable: true,
        }),
      );
    }

    this.reported.add(input.contentId);
    writeSet(REPORTED_KEY, this.reported);

    return Ok(result.value);
  }

  /** Ayarlar > Engellenen hesaplar ekranı için. */
  list(): readonly string[] {
    return [...this.blocked];
  }
}

export const Moderation = new ModerationImpl();
