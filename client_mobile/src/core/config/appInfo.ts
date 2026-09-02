/**
 * Uygulama kimlik bilgileri — tek kaynak.
 *
 * Sürüm numarası app.json'da durur (React Native kayıt adı da oradadır) ve
 * yalnızca BURADAN okunur. Her bileşenin kendi göreli yoluyla app.json'a
 * ulaşması, dizin derinliği değiştiğinde sessizce kırılan importlar üretir.
 */
import { displayName, name, version } from '../../../app.json';

export const APP_NAME = name;
export const APP_DISPLAY_NAME = displayName;
export const APP_VERSION = version;

/** Markanın tek yazımı — arayüzde ve destek e-postasında aynı görünür. */
export const PUBLISHER = 'ARMANALABS';
