/**
 * persistence/registry.js
 *
 * Uçların depolara ulaştığı tek nokta.
 *
 * NEDEN MODÜL DÜZEYİNDE DEĞİL, İSTEK ANINDA ÇÖZÜLÜYOR
 * Router'lar `getRepositories()`'i İSTEK İŞLENİRKEN çağırır, modül
 * yüklenirken değil. Bu iki şeyi mümkün kılar:
 *   - `server.js` açılışta gerçek veritabanını enjekte edebilir
 *     (PostgreSQL kurulumu asenkrondur; modül yükleme anında beklenemez),
 *   - testler her senaryo için temiz bir veritabanı verebilir.
 *
 * VARSAYILAN BELLEK İÇİDİR VE ÜRETİMDE REDDEDİLİR
 * `NODE_ENV=production` iken `DATABASE_URL` yoksa `createDriverFromEnv`
 * hata verir. Sessizce bellek içi çalışmak, her yeniden başlatmada tüm
 * verinin kaybolması demektir.
 */

'use strict';

const { createDriverFromEnv } = require('./index');
const { createRepositories } = require('./repositories');

let current = null;

/**
 * Açılışta gerçek veritabanını bağlar.
 *
 * `server.js` bunu `await openDatabase()` sonucuyla çağırır; böylece
 * PostgreSQL'in asenkron kurulumu tamamlanmadan hiçbir istek işlenmez.
 */
function setRepositories(repositories) {
  current = repositories;
  return current;
}

/**
 * Geçerli depolar. Enjekte edilmemişse SQLite bellek içi kurulur —
 * yalnızca geliştirme ve test için.
 */
function getRepositories() {
  if (current) return current;

  const driver = createDriverFromEnv();
  const result = driver.migrate();
  if (result && typeof result.then === 'function') {
    // Asenkron sürücü modül yükleme anında kurulamaz; açılışta
    // `setRepositories` çağrılmalıydı.
    throw new Error(
      'Asenkron veritabanı sürücüsü açılışta enjekte edilmelidir: ' +
        'server.js içinde `setRepositories(await openDatabase())` çağırın.',
    );
  }

  current = createRepositories(driver);
  return current;
}

/** Testler arasında temiz durum için. */
function resetRepositories() {
  current = null;
}

module.exports = { getRepositories, setRepositories, resetRepositories };
