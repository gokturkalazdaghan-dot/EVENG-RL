/**
 * SecureMessaging — uçtan uca şifreli birebir sohbet.
 *
 * KRİPTO ELLE YAZILMAZ
 * Anahtar değişimi, çift mandal (double ratchet) ve mesaj şifreleme NATIVE
 * tarafta, denetlenmiş bir kütüphaneyle yapılır (libsignal). Bu katman
 * yalnızca orkestrasyondur: oturum kurar, mesaj sırasını yönetir, UI'a
 * bağlar. Kendi protokolünü yazmak, bu sınıfta yapılabilecek en pahalı
 * hatadır ve hatanın sessiz olması işi daha da kötüleştirir.
 *
 * E2EE İLE MODERASYON ÇELİŞKİSİ — ve çözümü
 * Sunucu içeriği okuyamazsa raporlanan bir mesajı inceleyemez; bu, Apple
 * Guideline 1.2'nin "rapor mekanizması" şartını DM'de boşa düşürür.
 *
 * Çözüm (WhatsApp ve Signal'in kullandığı model): rapor İSTEMCİDEN gider.
 * Kullanıcı bir mesajı raporladığında, İSTEMCİ o mesajı ve bağlamı
 * (öncesindeki birkaç mesaj) düz metin olarak moderasyona gönderir. Sunucu
 * kendi başına hiçbir şey okuyamaz; yalnızca kullanıcının açıkça ilettiği
 * içeriği görür.
 *
 * Bağlamın gönderilmesi bilinçlidir: tek bir mesaj, çoğu zaman taciz olup
 * olmadığını göstermez ("tamam" mesajı, öncesindeki tehditle birlikte
 * anlam kazanır).
 */
import { NativeModules } from 'react-native';

import { createLogger } from '@/core/logging/Logger';
import { appError, Err, Ok, type Result } from '@/core/result/Result';
import { pinnedRequest } from '@/security/SslPinning';
import type { ReportReason } from '@/moderation/Reporting';

const log = createLogger('SecureMessaging');

/** Rapora eklenen bağlam mesajı sayısı. */
export const REPORT_CONTEXT_SIZE = 5;

export interface EncryptedEnvelope {
  readonly messageId: string;
  readonly conversationId: string;
  readonly senderId: string;
  /** Şifreli gövde — sunucu bunu ÇÖZEMEZ. */
  readonly ciphertext: string;
  readonly sentAtMs: number;
}

export interface PlainMessage {
  readonly messageId: string;
  readonly conversationId: string;
  readonly senderId: string;
  readonly text: string;
  readonly sentAtMs: number;
  /** Ek varsa: yerel URI (medya da şifreli taşınır). */
  readonly attachmentUri?: string;
}

interface NativeE2eeBridge {
  /** Cihazın kimlik anahtar çiftini üretir/döndürür (Keychain/Keystore'da). */
  ensureIdentity(): Promise<{ publicKey: string; fingerprint: string }>;
  /** Karşı tarafın ön anahtar paketiyle oturum kurar. */
  establishSession(peerId: string, preKeyBundle: string): Promise<void>;
  hasSession(peerId: string): Promise<boolean>;
  encrypt(peerId: string, plaintext: string): Promise<string>;
  decrypt(peerId: string, ciphertext: string): Promise<string>;
  /** Güvenlik numarası — kullanıcılar yüz yüze doğrulayabilsin diye. */
  safetyNumber(peerId: string): Promise<string>;
}

const bridge = NativeModules.EvenGirlE2EE as NativeE2eeBridge | undefined;

class SecureMessagingImpl {
  get isAvailable(): boolean {
    return bridge !== undefined;
  }

  /** Açılışta bir kez: kimlik anahtarı hazırlanır ve sunucuya yayınlanır. */
  async initialize(): Promise<Result<{ fingerprint: string }>> {
    if (!bridge) {
      return Err(appError('UNKNOWN', 'e2ee köprüsü yok', { i18nKey: 'dm.unavailable' }));
    }

    try {
      const identity = await bridge.ensureIdentity();

      // Yalnızca AÇIK anahtar yayınlanır. Özel anahtar cihazdan çıkmaz;
      // Keychain / Keystore içinde durur ve yedeğe dahil edilmez.
      await pinnedRequest<{ ok: boolean }>({
        path: '/v1/dm/keys',
        method: 'POST',
        body: { publicKey: identity.publicKey },
      });

      return Ok({ fingerprint: identity.fingerprint });
    } catch (e) {
      log.error('E2EE kimliği hazırlanamadı', e);
      return Err(appError('UNKNOWN', 'e2ee init failed', { retryable: true }));
    }
  }

  /** Sohbet açılırken oturum yoksa kurulur. */
  async ensureSession(peerId: string): Promise<Result<void>> {
    if (!bridge) return Err(appError('UNKNOWN', 'e2ee köprüsü yok'));

    try {
      if (await bridge.hasSession(peerId)) return Ok(undefined);

      const bundle = await pinnedRequest<{ preKeyBundle: string }>({
        path: `/v1/dm/keys/${encodeURIComponent(peerId)}`,
      });
      if (!bundle.ok) return bundle;

      await bridge.establishSession(peerId, bundle.value.preKeyBundle);
      return Ok(undefined);
    } catch (e) {
      log.warn('Oturum kurulamadı', e);
      return Err(appError('UNKNOWN', 'session setup failed', { retryable: true }));
    }
  }

  async send(peerId: string, message: PlainMessage): Promise<Result<void>> {
    if (!bridge) return Err(appError('UNKNOWN', 'e2ee köprüsü yok'));

    const session = await this.ensureSession(peerId);
    if (!session.ok) return session;

    try {
      const ciphertext = await bridge.encrypt(
        peerId,
        JSON.stringify({ text: message.text, attachmentUri: message.attachmentUri }),
      );

      const result = await pinnedRequest<{ ok: boolean }>({
        path: '/v1/dm/send',
        method: 'POST',
        body: {
          messageId: message.messageId,
          conversationId: message.conversationId,
          ciphertext,
        },
      });
      return result.ok ? Ok(undefined) : result;
    } catch (e) {
      log.warn('Mesaj gönderilemedi', e);
      return Err(appError('UNKNOWN', 'send failed', { retryable: true }));
    }
  }

  async decrypt(peerId: string, envelope: EncryptedEnvelope): Promise<Result<PlainMessage>> {
    if (!bridge) return Err(appError('UNKNOWN', 'e2ee köprüsü yok'));

    try {
      const plaintext = await bridge.decrypt(peerId, envelope.ciphertext);
      const payload = JSON.parse(plaintext) as { text: string; attachmentUri?: string };

      return Ok({
        messageId: envelope.messageId,
        conversationId: envelope.conversationId,
        senderId: envelope.senderId,
        text: payload.text,
        sentAtMs: envelope.sentAtMs,
        ...(payload.attachmentUri ? { attachmentUri: payload.attachmentUri } : {}),
      });
    } catch (e) {
      // Çözülemeyen mesaj SESSİZCE ATILMAZ: kullanıcı "mesaj gelmedi" sanır.
      // Oturum bozulmuş olabilir (cihaz değişimi, anahtar sıfırlama).
      log.warn('Mesaj çözülemedi — oturum yenilenmeli');
      return Err(appError('UNKNOWN', 'decrypt failed', { i18nKey: 'dm.decryptFailed' }));
    }
  }

  /**
   * Güvenlik numarası — iki kullanıcı bunu karşılaştırarak araya girme
   * (MitM) olmadığını doğrulayabilir. Göstermek zorunlu değil ama
   * göstermemek, E2EE iddiasını doğrulanamaz kılar.
   */
  async safetyNumber(peerId: string): Promise<string | null> {
    return (await bridge?.safetyNumber(peerId).catch(() => null)) ?? null;
  }

  /**
   * Mesaj raporlama — E2EE altında moderasyonun çalıştığı tek yol.
   *
   * İstemci, raporlanan mesajı ve ÖNCESİNDEKİ birkaç mesajı düz metin olarak
   * gönderir. Sunucu bunu kendi başına elde edemez; yalnızca kullanıcının
   * açıkça ilettiğini görür.
   *
   * Gönderilenler kullanıcıya ÖNCEDEN gösterilir (UI sözleşmesi): neyi
   * ilettiğini bilmeden rapor göndermek, E2EE vaadiyle çelişir.
   */
  async reportMessage(input: {
    conversationId: string;
    reportedMessageId: string;
    reportedUserId: string;
    reason: ReportReason;
    /** Raporlanan mesaj + bağlam, ÇÖZÜLMÜŞ hâlde. */
    decryptedContext: readonly PlainMessage[];
  }): Promise<Result<void>> {
    const context = input.decryptedContext.slice(-REPORT_CONTEXT_SIZE).map((message) => ({
      messageId: message.messageId,
      senderId: message.senderId,
      text: message.text.slice(0, 2000),
      sentAtMs: message.sentAtMs,
    }));

    const result = await pinnedRequest<{ received: boolean }>({
      path: '/v1/moderation/report-message',
      method: 'POST',
      body: {
        conversationId: input.conversationId,
        reportedMessageId: input.reportedMessageId,
        reportedUserId: input.reportedUserId,
        reason: input.reason,
        context,
      },
    });

    if (!result.ok) {
      return Err(
        appError('NETWORK_UNAVAILABLE', 'message report failed', {
          i18nKey: 'moderation.report.failed',
          retryable: true,
        }),
      );
    }
    return Ok(undefined);
  }
}

export const SecureMessaging = new SecureMessagingImpl();
