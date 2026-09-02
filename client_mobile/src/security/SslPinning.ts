/**
 * SSL Pinning istemcisi.
 *
 * JS'teki `fetch`, işletim sisteminin güven deposunu kullanır; kullanıcı kendi
 * CA'sını yüklediğinde (veya cihaz rootluysa) trafiği okunabilir. Bu yüzden
 * pinlenmesi gereken TÜM istekler native köprüden geçer: sertifika zincirinin
 * SPKI SHA-256 özeti ENV.pinnedHosts ile karşılaştırılır, uyuşmazsa bağlantı
 * TLS el sıkışması seviyesinde kesilir.
 */
import { ENV } from '@/core/config/env';
import { createLogger } from '@/core/logging/Logger';
import { appError, Err, Ok, type Result } from '@/core/result/Result';
import { NativeSecurity } from '@/security/native/NativeSecurity';

const log = createLogger('SslPinning');

export interface PinnedRequest {
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  baseUrl?: string;
}

export function isPinned(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return Object.prototype.hasOwnProperty.call(ENV.pinnedHosts, host);
  } catch {
    return false;
  }
}

export async function pinnedRequest<T>(req: PinnedRequest): Promise<Result<T>> {
  const base = req.baseUrl ?? ENV.apiBaseUrl;
  const url = `${base}${req.path}`;

  if (!isPinned(url)) {
    // Pin tanımsız bir host'a istek atmak, pinning'i sessizce devre dışı
    // bırakmakla eşdeğerdir; bu yüzden hata veriyoruz.
    return Err(appError('PINNING_FAILED', `pin tanımı yok: ${url}`));
  }

  try {
    const res = await NativeSecurity.pinnedFetch(url, {
      method: req.method ?? 'GET',
      headers: { 'content-type': 'application/json', ...(req.headers ?? {}) },
      ...(req.body !== undefined ? { body: JSON.stringify(req.body) } : {}),
    });

    if (res.status >= 400) {
      return Err(
        appError('NETWORK_UNAVAILABLE', `HTTP ${res.status}`, { retryable: res.status >= 500 }),
      );
    }
    return Ok(JSON.parse(res.body) as T);
  } catch (e) {
    // Native taraf pin uyuşmazlığında da buraya düşer. Kullanıcıya "ağ hatası"
    // deriz; "sertifika sahte" demek saldırgana geri bildirim vermektir.
    log.warn('Pinlenmiş istek başarısız');
    return Err(
      appError('PINNING_FAILED', 'pinned request rejected', { retryable: true }),
    );
  }
}
