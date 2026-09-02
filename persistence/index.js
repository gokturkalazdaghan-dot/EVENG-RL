/**
 * persistence/index.js
 *
 * Sürücü seçimi ve depo kurulumu.
 *
 * SESSİZ DÜŞÜŞ YOK: `DATABASE_URL` bir PostgreSQL adresiyse ve `pg` kurulu
 * değilse hata verilir. SQLite'a sessizce düşmek, üretimde yanlış
 * veritabanına yazmak demektir — ve bu, hata vermemekten çok daha kötüdür.
 */

'use strict';

const { createSqliteDriver } = require('./driver/sqlite');
const { createRepositories } = require('./repositories');

/**
 * Ortam değişkeninden sürücü kurar.
 *
 *   DATABASE_URL=postgres://...   → PostgreSQL
 *   DATABASE_URL=file:./even.db   → SQLite dosyası
 *   (tanımsız)                    → SQLite bellek içi (yalnızca geliştirme)
 */
function createDriverFromEnv(url = process.env.DATABASE_URL) {
  if (!url) {
    if (process.env.NODE_ENV === 'production') {
      // Üretimde bellek içi veritabanı, her yeniden başlatmada TÜM verinin
      // kaybolması demektir. Sessizce çalışmak yerine durmalı.
      throw new Error('DATABASE_URL üretimde zorunludur — bellek içi veritabanı veri kaybeder');
    }
    return createSqliteDriver(':memory:');
  }

  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    const { createPostgresDriver } = require('./driver/postgres');
    return createPostgresDriver(url);
  }

  if (url.startsWith('file:')) {
    return createSqliteDriver(url.slice('file:'.length));
  }

  throw new Error(`Tanınmayan DATABASE_URL biçimi: ${url.split(':')[0]}:`);
}

/** Sürücüyü kurar, şemayı uygular ve depoları döndürür. */
async function openDatabase(url) {
  const driver = createDriverFromEnv(url);
  await driver.migrate();
  return createRepositories(driver);
}

module.exports = { createDriverFromEnv, openDatabase, createRepositories, createSqliteDriver };
