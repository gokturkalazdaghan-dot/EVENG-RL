/**
 * persistence/driver/postgres.js
 *
 * PostgreSQL sürücüsü — çok örnekli üretim dağıtımı için.
 *
 * ŞEMA VE SORGULAR SQLite İLE AYNIDIR. Tek fark yer tutucu biçimidir:
 * SQLite `?`, PostgreSQL `$1, $2` kullanır. Çeviri tek bir yerde yapılır
 * (`toPgPlaceholders`) ve testi vardır — sorguları iki kez yazmak, ikisinin
 * zamanla ayrışması demektir.
 *
 * `pg` PAKETİ İSTEĞE BAĞLIDIR
 * Backend testleri bağımlılıksız kalmalı. `pg` yalnızca bu sürücü
 * kullanıldığında yüklenir; kurulu değilse anlaşılır bir hata verir,
 * sessizce SQLite'a düşmez — sessiz düşüş, üretimde yanlış veritabanına
 * yazmak demektir.
 */

'use strict';

const { readFileSync } = require('node:fs');
const { SCHEMA_VERSION } = require('../version');
const { join } = require('node:path');

/**
 * `?` yer tutucularını `$1, $2, ...` biçimine çevirir.
 *
 * DİZE İÇİNDEKİ `?` KARAKTERİNE DOKUNMAZ. Bir soru işareti tek tırnak
 * içindeyse (ör. `WHERE note = 'neden?'`) yer tutucu değildir; naif bir
 * `replace` onu da numaralandırıp parametre sayısını kaydırırdı.
 */
function toPgPlaceholders(sql) {
  let out = '';
  let index = 0;
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];

    if (ch === "'" && !inDouble) {
      // SQL'de tırnak kaçışı '' biçimindedir; çift tırnağı tek karakter say.
      if (inSingle && sql[i + 1] === "'") {
        out += "''";
        i += 1;
        continue;
      }
      inSingle = !inSingle;
      out += ch;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      out += ch;
      continue;
    }
    if (ch === '?' && !inSingle && !inDouble) {
      index += 1;
      out += `$${index}`;
      continue;
    }
    out += ch;
  }

  return out;
}

/**
 * @param {string} connectionString  DATABASE_URL
 */
function createPostgresDriver(connectionString) {
  let Pool;
  try {
    ({ Pool } = require('pg'));
  } catch {
    throw new Error(
      'PostgreSQL sürücüsü için `pg` paketi gerekli: npm install pg. ' +
        'SQLite sürücüsüne SESSİZCE düşülmez — yanlış veritabanına yazmak, ' +
        'hata vermemekten çok daha kötüdür.',
    );
  }

  const pool = new Pool({ connectionString });

  // Bu sürücü asenkron; depo katmanı her iki sürücüyü de `await` ile
  // çağırır, böylece tek bir depo kodu iki motorda da çalışır.
  return {
    dialect: 'postgres',

    async run(sql, params = []) {
      const result = await pool.query(toPgPlaceholders(sql), params);
      return { changes: result.rowCount };
    },

    async get(sql, params = []) {
      const result = await pool.query(toPgPlaceholders(sql), params);
      return result.rows[0] ?? null;
    },

    async all(sql, params = []) {
      const result = await pool.query(toPgPlaceholders(sql), params);
      return result.rows;
    },

    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn();
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },

    async migrate() {
      const schema = readFileSync(join(__dirname, '..', 'schema.sql'), 'utf8');
      // PostgreSQL'de INTEGER PRIMARY KEY otomatik artmaz; şema zaten
      // uygulama tarafından üretilen kimlikler kullanıyor, dönüşüm gerekmez.
      await pool.query(schema);
      await pool.query(
        'INSERT INTO schema_migrations (version, applied_at_ms) VALUES ($1, $2) ' +
          'ON CONFLICT (version) DO NOTHING',
        [SCHEMA_VERSION, Date.now()],
      );
      return { version: SCHEMA_VERSION };
    },

    async close() {
      await pool.end();
    },
  };
}

module.exports = { createPostgresDriver, toPgPlaceholders };
