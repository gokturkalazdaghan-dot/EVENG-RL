/**
 * AgeGate — yaş doğrulama kaydının saklanması ve erişim kademesinin dağıtımı.
 *
 * SAKLAMA: Karar şifreli depoda (Keychain / EncryptedSharedPreferences)
 * tutulur. Düz `AsyncStorage`/MMKV kullanmak, rootlu bir cihazda tek satır
 * düzenleyerek Safe Mode'dan çıkmak demektir.
 *
 * DÜRÜST SINIR: Bu, istemci tarafında yapılabilecek en güçlü şeydir ama
 * mutlak değildir. Yetişkin içeriğe erişimin ASIL kapısı sunucudadır: akış ve
 * arama sonuçları, istemcinin iddia ettiği yaşa değil, hesabın sunucudaki
 * doğrulanmış kademesine göre filtrelenir (bkz. moderation/VisibilityShield.ts
 * ve docs/SAFETY.md). İstemci kaydı kurcalansa bile sunucu +18 içerik döndürmez.
 *
 * YENİDEN SORMA: Kayıt bir SÜRÜM taşır. Yaş politikası değişirse
 * (`AGE_RECORD_VERSION` artırılır) tüm kullanıcılara yeniden sorulur.
 */
import { createLogger } from '@/core/logging/Logger';
import { SecureStore } from '@/security/SecureStore';
import {
  capabilitiesFor,
  decideAccess,
  type AccessCapabilities,
  type AccessTier,
  type AgeDecision,
  type BirthDate,
} from '@/age/AgePolicy';

const log = createLogger('AgeGate');

export const AGE_RECORD_VERSION = 1;

interface AgeRecord {
  readonly version: number;
  readonly tier: Exclude<AccessTier, 'unverified'>;
  /** Doğum tarihi SAKLANMAZ — yalnızca doğrulama anındaki yaş ve tarih.
   *  Tam doğum tarihi kişisel veridir; kademe kararı için gerekli değildir. */
  readonly ageAtVerification: number;
  readonly verifiedAtMs: number;
}

type Listener = (tier: AccessTier) => void;

class AgeGateImpl {
  private tier: AccessTier = 'unverified';
  private capabilities: AccessCapabilities = capabilitiesFor('unverified');
  private readonly listeners = new Set<Listener>();
  private loaded = false;

  /** Açılışta çağrılır. Kayıt yoksa 'unverified' kalır ve kapı gösterilir. */
  async load(): Promise<AccessTier> {
    if (this.loaded) return this.tier;

    const raw = await SecureStore.get('age.verification.record');
    this.loaded = true;

    if (!raw) return this.tier;

    try {
      const record = JSON.parse(raw) as AgeRecord;

      // Sürüm uyuşmuyorsa yeniden sor. Eski bir kaydı "yakın olduğu için"
      // kabul etmek, politika değişikliğini anlamsız kılar.
      if (record.version !== AGE_RECORD_VERSION) {
        log.info('Yaş kaydı sürümü eski — yeniden doğrulama gerekiyor');
        return this.tier;
      }

      // Kademe alanı beklenen değerlerden biri değilse kayıt bozulmuş veya
      // kurcalanmıştır: güvenli tarafta kalıp yeniden soruyoruz.
      if (record.tier !== 'adult' && record.tier !== 'safe') {
        log.warn('Yaş kaydı geçersiz — yeniden doğrulama gerekiyor');
        return this.tier;
      }

      this.applyTier(record.tier);
    } catch {
      log.warn('Yaş kaydı okunamadı — yeniden doğrulama gerekiyor');
    }
    return this.tier;
  }

  /**
   * Kullanıcının girdiği doğum tarihini değerlendirir ve kaydeder.
   * Reddedilen girdilerde kayıt YAZILMAZ — kapı açık kalır.
   */
  async submit(birth: BirthDate, nowMs: number = Date.now()): Promise<AgeDecision> {
    const decision = decideAccess(birth, nowMs);
    if (!decision.ok) return decision;

    const record: AgeRecord = {
      version: AGE_RECORD_VERSION,
      tier: decision.tier,
      ageAtVerification: decision.age,
      verifiedAtMs: nowMs,
    };

    await SecureStore.set('age.verification.record', JSON.stringify(record));
    this.applyTier(decision.tier);

    // Kullanıcının yaşı LOGLANMAZ; yalnızca kademe. Yaş, tek başına
    // tanımlayıcı olmasa da gereksiz yere kaydedilmemesi gereken bir veridir.
    log.info(`Erişim kademesi: ${decision.tier}`);
    return decision;
  }

  /**
   * Kullanıcı Safe Mode'dayken 18'ini doldurmuş olabilir. Kayıttaki yaş ile
   * geçen süreye bakıp yeniden doğrulama gerekip gerekmediğini söyler.
   *
   * Otomatik terfi ETMİYORUZ: "artık 18 oldun" diye kendiliğinden yetişkin
   * içeriği açmak, ilk girişte yanlış tarih girmiş bir kullanıcıyı da
   * otomatik açar. Kullanıcı tarihi yeniden girer.
   */
  async needsRecheck(nowMs: number = Date.now()): Promise<boolean> {
    if (this.tier !== 'safe') return false;

    const raw = await SecureStore.get('age.verification.record');
    if (!raw) return true;

    try {
      const record = JSON.parse(raw) as AgeRecord;
      const yearsSince = (nowMs - record.verifiedAtMs) / (365.25 * 24 * 60 * 60 * 1000);
      return record.ageAtVerification + yearsSince >= 18;
    } catch {
      return true;
    }
  }

  /** Ayarlar > "Yaşımı yeniden doğrula" akışı. */
  async reset(): Promise<void> {
    await SecureStore.delete('age.verification.record');
    this.loaded = false;
    this.applyTier('unverified');
  }

  private applyTier(tier: AccessTier): void {
    this.tier = tier;
    this.capabilities = capabilitiesFor(tier);
    this.listeners.forEach((listener) => listener(tier));
  }

  get current(): AccessTier {
    return this.tier;
  }

  get can(): AccessCapabilities {
    return this.capabilities;
  }

  get isVerified(): boolean {
    return this.tier !== 'unverified';
  }

  get isAdult(): boolean {
    return this.tier === 'adult';
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.tier);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const AgeGate = new AgeGateImpl();
