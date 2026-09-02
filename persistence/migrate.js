#!/usr/bin/env node
/**
 * Şemayı uygular. Yeniden çalıştırılabilir.
 *
 *   DATABASE_URL=file:./even.db node persistence/migrate.js
 */

'use strict';

const { createDriverFromEnv } = require('./index');

async function main() {
  const url = process.env.DATABASE_URL;
  const driver = createDriverFromEnv(url);

  const result = await driver.migrate();
  console.log(`[migrate] Şema uygulandı (sürüm ${result.version}, ${driver.dialect}).`);

  await driver.close();
}

main().catch((err) => {
  console.error('[migrate] BAŞARISIZ:', err.message);
  process.exit(1);
});
