/**
 * EthicsConsent — telif ve deepfake kötüye kullanımına karşı yasal sorumluluk
 * reddi (disclaimer) akışı.
 *
 * İki katman:
 *   1. Genel onay — ilk açılışta bir kez (üretken AI'nın doğası, telif sorumluluğu).
 *   2. Yüz onayı — yüz üzerinde çalışan araçlar ilk kez kullanıldığında ayrıca
 *      "bu kişinin rızası var" beyanı istenir (FaceApp/Lensa sınıfı araçlar için
 *      hem etik hem de mağaza gereksinimi).
 *
 * Onaylar cihazda tutulur; sunucuya gönderilmez (kimlik oluşturur).
 * Uygulama sürümü değil, DISCLAIMER_VERSION değiştiğinde yeniden sorulur.
 */
import { MMKV } from 'react-native-mmkv';

import type { ModelDescriptor } from '@/ai/engine/ModelRegistry';

export const DISCLAIMER_VERSION = 2;

const store = new MMKV({ id: 'evengirl.consent' });

const KEY_GENERAL = `ethics.general.v${DISCLAIMER_VERSION}`;
const KEY_FACE = `ethics.face.v${DISCLAIMER_VERSION}`;

export type ConsentKind = 'general' | 'face';

type Prompter = (kind: ConsentKind) => Promise<boolean>;

/** UI katmanı açılışta kendi modal sunucusunu bağlar (bkz. EthicsDisclaimer). */
let prompter: Prompter | null = null;

export const EthicsConsent = {
  registerPrompter(fn: Prompter): void {
    prompter = fn;
  },

  has(kind: ConsentKind): boolean {
    return store.getBoolean(kind === 'general' ? KEY_GENERAL : KEY_FACE) === true;
  },

  record(kind: ConsentKind, accepted: boolean): void {
    store.set(kind === 'general' ? KEY_GENERAL : KEY_FACE, accepted);
  },

  /** İlk açılış akışı — genel disclaimer gösterilmediyse gösterir. */
  async ensureGeneral(): Promise<boolean> {
    if (this.has('general')) return true;
    const accepted = (await prompter?.('general')) ?? false;
    this.record('general', accepted);
    return accepted;
  },

  /** Özellik bazlı kontrol — AiEngine her üretken/yüz işleminde çağırır. */
  async ensureAcceptedFor(model: ModelDescriptor): Promise<boolean> {
    if (!(await this.ensureGeneral())) return false;
    if (!model.operatesOnFaces) return true;
    if (this.has('face')) return true;

    const accepted = (await prompter?.('face')) ?? false;
    this.record('face', accepted);
    return accepted;
  },

  /** Ayarlar > Gizlilik ekranından onayı geri çekme. */
  revokeAll(): void {
    store.delete(KEY_GENERAL);
    store.delete(KEY_FACE);
  },
};
