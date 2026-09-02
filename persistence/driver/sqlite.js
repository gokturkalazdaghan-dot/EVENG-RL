/**
 * persistence/driver/sqlite.js
 *
 * `node:sqlite` sürücüsü — BAĞIMLILIK YOK.
 *
 * NEDEN SQLite
 * Backend testleri bağımlılıksız kalmalı (bkz. CLAUDE.md). `node:sqlite`
 * Node 22 ile birlikte gelir, yani depo katmanı GERÇEK SQL üzerinde
 * çalıştırılıp test edilebiliyor — sahte bir bellek nesnesi üzerinde değil.
 * Sahte depo ile test etmek, SQL'in kendisini test etmemek demektir; bir
 * sözdizimi hatası, eksik indeks veya yanlış JOIN sessizce geçerdi.
 *
 * ÜRETİMDE NE KULLANILMALI
 * Tek örnekli dağıtımda SQLite yeterlidir (WAL modu açık). Çok örnekli
 * yatay ölçekte `driver/postgres.js` kullanılır; ŞEMA VE SORGULAR AYNIDIR,
 * yalnızca sürücü değişir.
 */

'use strict';

const { DatabaseSync } = require('node:sqlite');
const { SCHEMA_VERSION } = require('../version');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

/**
 * @param {string} filename  Dosya yolu veya ':memory:'.
 */
function createSqliteDriver(filename = ':memory:') {
  const db = new DatabaseSync(filename);

  // WAL: okuma yazmayı bloklamaz. Dosya tabanlı dağıtımda moderasyon
  // kuyruğunu okumak, bir hikaye yüklemesini bekletmemeli.
  if (filename !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  // Yabancı anahtar kısıtları SQLite'ta VARSAYILAN OLARAK KAPALIDIR.
  db.exec('PRAGMA foreign_keys = ON');

  return {
    dialect: 'sqlite',

    /** Sonuç döndürmeyen ifade. */
    run(sql, params = []) {
      const stmt = db.prepare(sql);
      const info = stmt.run(...params);
      return { changes: Number(info.changes) };
    },

    /** Tek satır veya null. */
    get(sql, params = []) {
      return db.prepare(sql).get(...params) ?? null;
    },

    /** Satır dizisi. */
    all(sql, params = []) {
      return db.prepare(sql).all(...params);
    },

    /**
     * İşlem (transaction).
     *
     * Atomik sahiplenme ve çok adımlı yaptırım uygulaması bunu gerektirir:
     * yetenekler kapatılıp içerik kaldırılırken araya bir okuma girerse,
     * kullanıcı yarı uygulanmış bir yaptırım durumunda görünür.
     */
    transaction(fn) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = fn();
        db.exec('COMMIT');
        return result;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },

    /** Şemayı uygular. Yeniden çalıştırılabilir (IF NOT EXISTS). */
    migrate() {
      const schema = readFileSync(join(__dirname, '..', 'schema.sql'), 'utf8');
      db.exec(schema);
      const now = Date.now();
      db.prepare(
        'INSERT OR IGNORE INTO schema_migrations (version, applied_at_ms) VALUES (?, ?)',
      ).run(SCHEMA_VERSION, now);
      return { version: SCHEMA_VERSION };
    },

    close() {
      db.close();
    },
  };
}

module.exports = { createSqliteDriver };
