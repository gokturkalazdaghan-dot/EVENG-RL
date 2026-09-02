/**
 * OfflineCapability — "bu araç şu anda çalışır mı?" sorusunun tek cevabı.
 *
 * Araç çubuğundaki her düğme bu fonksiyonla boyanır: çevrimdışı çalışanlar
 * aktif ve "ÇEVRİMDIŞI" rozetli, çalışmayanlar pasif ve nedeni yazılı görünür.
 *
 * Kullanıcıyı önce tıklatıp sonra hata göstermek, bu kategorideki en sinir
 * bozucu kalıptır — ve uçakta/metroda uygulamayı açan kullanıcı tam olarak
 * bunu yaşar.
 */
import { LocalInferenceRuntime } from '@/ai/engine/LocalInferenceRuntime';
import { ModelStore } from '@/ai/engine/ModelStore';
import { describe, type Capability } from '@/ai/engine/ModelRegistry';
import { NetworkMonitor } from '@/connectivity/NetworkMonitor';

export type Availability =
  | { readonly available: true; readonly site: 'local' | 'remote' }
  | {
      readonly available: false;
      readonly reason: 'requires-network' | 'device-too-weak' | 'model-not-downloaded';
    };

export async function availabilityOf(capability: Capability): Promise<Availability> {
  const descriptor = describe(capability);

  // Model dosyası gerektirmeyen temel araçlar (kırpma, filtre, kesme)
  // her zaman yereldir ve her koşulda çalışır.
  if (!descriptor.localModel && !descriptor.remoteEndpoint) {
    return { available: true, site: 'local' };
  }

  if (await LocalInferenceRuntime.isSupported(capability)) {
    return { available: true, site: 'local' };
  }

  const remoteUsable = descriptor.remoteEndpoint !== undefined && NetworkMonitor.isOnline;
  if (remoteUsable) {
    return { available: true, site: 'remote' };
  }

  // Neden çalışmadığını AYIRT EDİYORUZ: "modeli indir" ile "cihazın yetersiz"
  // farklı eylemler gerektirir ve yanlışını göstermek kullanıcıyı boş yere
  // uğraştırır.
  if (descriptor.localModel) {
    const installed = await ModelStore.isInstalled(capability);
    if (!installed) {
      return {
        available: false,
        reason: NetworkMonitor.isOnline ? 'model-not-downloaded' : 'requires-network',
      };
    }
    return { available: false, reason: 'device-too-weak' };
  }

  return { available: false, reason: 'requires-network' };
}

/** Editör açılışında tüm araç çubuğu durumunu tek seferde hesaplar. */
export async function availabilityMap(
  capabilities: readonly Capability[],
): Promise<Map<Capability, Availability>> {
  const entries = await Promise.all(
    capabilities.map(async (capability) => [capability, await availabilityOf(capability)] as const),
  );
  return new Map(entries);
}
