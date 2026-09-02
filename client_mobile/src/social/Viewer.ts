/**
 * Viewer — oturumdaki anonim kimlik.
 *
 * NE DEĞİLDİR: bu bir "kullanıcı hesabı" değildir. E-posta, telefon, isim
 * veya cinsiyet YOKTUR ve hiçbir zaman istenmez. Buradaki kimlik, mağazanın
 * ürettiği anonim `originalAppUserId`'dir — "hangi satın alma kaydı"
 * sorusunu yanıtlar, "kim" sorusunu değil.
 *
 * NEDEN GEREKLİ: sosyal yüzeyler "bu içerik benim mi" sorusunu sormak
 * zorunda (kendi içeriğini raporlamak anlamsızdır, kendi hikayenin
 * görüntüleyenlerini görürsün). Bu soru cevaplanamazsa ekranlar tahmin
 * yürütür.
 *
 * BİLİNMİYORSA BOŞ DİZE: `''` hiçbir gerçek kimlikle eşleşmez, dolayısıyla
 * "bu benim içeriğim" kontrolü fail-safe olarak `false` döner — rapor düğmesi
 * etkin kalır. Ters varsayım (bilinmeyeni "benim" saymak) rapor düğmesini
 * sessizce devre dışı bırakırdı.
 */
import Purchases from 'react-native-purchases';

import { createLogger } from '@/core/logging/Logger';

const log = createLogger('Viewer');

class ViewerImpl {
  private id = '';

  get anonymousId(): string {
    return this.id;
  }

  /** Uygulama açılışında `BillingService.configure()` sonrası çağrılır. */
  async resolve(): Promise<string> {
    try {
      const info = await Purchases.getCustomerInfo();
      this.id = info.originalAppUserId;
    } catch {
      // Mağaza yanıt vermiyorsa kimlik boş kalır; sosyal yüzeyler
      // fail-safe davranır (bkz. dosya başlığı).
      log.warn('Anonim kimlik çözülemedi — rapor düğmeleri etkin kalır');
      this.id = '';
    }
    return this.id;
  }
}

export const Viewer = new ViewerImpl();
