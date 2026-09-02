/**
 * NetworkMonitor — ağ durumunun tek kaynağı.
 *
 * "Bağlı" olmak yetmez: captive portal'da (otel/havalimanı wifi) cihaz bağlı
 * görünür ama istekler başarısız olur. NetInfo'nun `isInternetReachable`
 * alanını da şart koşuyoruz, aksi halde offline'a düşmesi gereken akışlar
 * kullanıcıyı 30 sn timeout'ta bekletir.
 */
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

import { createLogger } from '@/core/logging/Logger';

const log = createLogger('NetworkMonitor');

export type Connection = 'online' | 'offline' | 'metered';

type Listener = (connection: Connection) => void;

class NetworkMonitorImpl {
  private connection: Connection = 'offline';
  private readonly listeners = new Set<Listener>();
  private unsubscribe: (() => void) | null = null;

  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = NetInfo.addEventListener((state) => this.apply(state));
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  apply(state: NetInfoState): void {
    const reachable = state.isConnected === true && state.isInternetReachable !== false;
    // Hücresel bağlantı "metered" sayılır: büyük model indirmeleri ve uzak
    // video işleme kullanıcıya sorulmadan başlatılmaz (fatura sürprizi).
    const next: Connection = !reachable ? 'offline' : state.type === 'cellular' ? 'metered' : 'online';

    if (next === this.connection) return;
    this.connection = next;
    log.info(`Bağlantı: ${next}`);
    this.listeners.forEach((l) => l(next));
  }

  get state(): Connection {
    return this.connection;
  }

  get isOnline(): boolean {
    return this.connection !== 'offline';
  }

  /** Ölçülü (hücresel) bağlantıda büyük transferler için onay gerekir. */
  get isMetered(): boolean {
    return this.connection === 'metered';
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.connection);
    return () => this.listeners.delete(listener);
  }
}

export const NetworkMonitor = new NetworkMonitorImpl();
