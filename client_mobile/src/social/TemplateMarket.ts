/**
 * TemplateMarket — kullanıcıların AI şablonlarını paylaştığı pazar yeri.
 *
 * ŞABLON NEDİR: Bir düzenleme tarifidir — hangi araçlar, hangi sırayla,
 * hangi parametrelerle. Medya İÇERMEZ. Bu ayrım önemlidir:
 *   - Şablon paylaşmak, kullanıcının fotoğrafını paylaşmak değildir.
 *   - Şablon uygulamak, kullanıcının medyasını hiçbir yere göndermez;
 *     tarif indirilir ve YERELDE uygulanır.
 *
 * ÖNİZLEME GÖRSELİ: Şablonun nasıl göründüğünü göstermek için yazarın
 * seçtiği bir örnek görsel taşınır ve o görsel, akış içeriğiyle AYNI
 * moderasyondan geçer.
 */
import { appError, Err, Ok, type Result } from '@/core/result/Result';
import { pinnedRequest } from '@/security/SslPinning';
import { AgeGate } from '@/age/AgeGate';
import { Moderation } from '@/moderation/Reporting';
import { filterVisible, type ContentItem } from '@/moderation/VisibilityShield';
import type { Capability } from '@/ai/engine/ModelRegistry';

/** Şablonun tek adımı. */
export interface TemplateStep {
  readonly capability: Capability;
  readonly params: Readonly<Record<string, number | string | boolean>>;
}

export interface Template extends ContentItem {
  readonly templateId: string;
  readonly title: string;
  readonly authorHandle: string;
  /** Önizleme görseli — akışla aynı moderasyondan geçer. */
  readonly previewUri: string;
  readonly steps: readonly TemplateStep[];
  readonly useCount: number;
  /** Yalnızca PRO abonelerine açık şablon. */
  readonly proOnly: boolean;
  /** Yazarın creator aboneliğine özel şablon. */
  readonly creatorOnly: boolean;
}

export const TemplateMarket = {
  async browse(options: {
    query?: string;
    cursor?: string;
    adultContentOptIn: boolean;
  }): Promise<Result<{ templates: readonly Template[]; nextCursor: string | null }>> {
    const params = new URLSearchParams();
    if (options.query) params.set('q', options.query);
    if (options.cursor) params.set('cursor', options.cursor);

    const result = await pinnedRequest<{
      templates: Template[];
      nextCursor: string | null;
    }>({ path: `/v1/templates?${params.toString()}` });

    if (!result.ok) {
      return Err(
        appError('NETWORK_UNAVAILABLE', 'template browse failed', {
          i18nKey: 'market.loadFailed',
          retryable: true,
        }),
      );
    }

    // Şablon önizlemeleri de kalkandan geçer: pazar yeri, moderasyonun
    // atlandığı bir arka kapı olamaz.
    const visible = filterVisible(
      result.value.templates,
      {
        tier: AgeGate.current,
        adultContentOptIn: options.adultContentOptIn,
        revealSensitiveByDefault: false,
      },
      Moderation.blockedAuthorIds,
    ).map((entry) => entry.item);

    return Ok({ templates: visible, nextCursor: result.value.nextCursor });
  },

  /** Şablonu yayınla. Adımlar sunucuda doğrulanır (bilinmeyen yetenek reddedilir). */
  async publish(input: {
    title: string;
    previewUri: string;
    steps: readonly TemplateStep[];
    proOnly: boolean;
  }): Promise<Result<{ templateId: string }>> {
    const result = await pinnedRequest<{ templateId: string }>({
      path: '/v1/templates',
      method: 'POST',
      body: input,
    });
    return result.ok ? Ok(result.value) : Err(appError('NETWORK_UNAVAILABLE', 'publish failed'));
  },

  /** Kullanım sayacı — sıralama ve creator gelir payı için. */
  async recordUse(templateId: string): Promise<void> {
    await pinnedRequest<{ ok: boolean }>({
      path: '/v1/templates/use',
      method: 'POST',
      body: { templateId },
    });
  },
};
