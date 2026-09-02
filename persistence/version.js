/**
 * Şema sürümü TEK YERDE.
 *
 * Sürüm iki sürücüde ayrı ayrı yazılıydı; biri güncellenip diğeri
 * unutulduğunda aynı şema PostgreSQL'de "sürüm 1", SQLite'ta "sürüm 2"
 * görünüyordu. Bu tür bir sapma sessizdir: hiçbir şey hata vermez, yalnızca
 * göç kayıtları yalan söyler.
 *
 * Tabloya EKLEME yapıldığında artırılır. Şema `CREATE TABLE IF NOT EXISTS`
 * ile idempotent uygulandığı için, artan sürüm bir davranış değil bir KAYIT
 * değişikliğidir: hangi kurulumun hangi tabloları gördüğünü söyler.
 *
 * 1 — ilk şema (18 tablo)
 * 2 — post_likes, template_uses, creator_offers, creator_subscriptions,
 *     store_purchases
 * 3 — entitlements.period_type (deneme sürümü göstergesi)
 */

'use strict';

const SCHEMA_VERSION = 3;

module.exports = { SCHEMA_VERSION };
