-- EVEN GIRL — kalıcılık şeması
--
-- TAŞINABİLİR ALT KÜME
-- Bu şema hem SQLite hem PostgreSQL'de çalışır. Bunun bir bedeli var
-- (SERIAL/AUTOINCREMENT yok, JSONB yok, kısmi indeks yok) ama karşılığında
-- tek bir şema iki motorda da doğrulanabiliyor. Kimlikler zaten uygulama
-- tarafından üretiliyor (UUID), zaman damgaları epoch milisaniye tutuluyor;
-- ikisi de motor bağımsız.
--
-- ZAMAN: her yerde INTEGER epoch ms (UTC). Motorların tarih tipleri
-- birbirinden farklı davranır ve saat dilimi hataları sessizdir.
--
-- KİMLİK BİLGİSİ YOK: e-posta, telefon, isim, cinsiyet için sütun YOKTUR.
-- Şemada olmayan bir alan yanlışlıkla doldurulamaz.

-- ============================================================ hesaplar ====

CREATE TABLE IF NOT EXISTS accounts (
  -- Mağazanın ürettiği anonim kimlik. "Kim" değil, "hangi satın alma kaydı".
  app_user_id        TEXT PRIMARY KEY,
  -- 'unverified' | 'safe' | 'adult' — AgePolicy.AccessTier ile aynı.
  tier               TEXT NOT NULL DEFAULT 'unverified',
  adult_opt_in       INTEGER NOT NULL DEFAULT 0,
  -- 'app_store' | 'play_store' — ödül kodu hangi mağazadan üretilecek.
  store              TEXT,
  handle             TEXT,
  -- 'female' | 'male' | 'unspecified' — yalnızca çelenk rengi için.
  gender             TEXT NOT NULL DEFAULT 'unspecified',
  created_at_ms      INTEGER NOT NULL,
  updated_at_ms      INTEGER NOT NULL
);

-- ============================================================== yetki ====

CREATE TABLE IF NOT EXISTS entitlements (
  app_user_id        TEXT PRIMARY KEY,
  is_pro             INTEGER NOT NULL DEFAULT 0,
  -- Mağazadan gelen bitiş anı. Ödül motoru buraya YAZMAZ.
  expires_at_ms      INTEGER,
  product_id         TEXT,
  -- 'active' | 'grace' | 'billing_issue' | 'will_not_renew' | 'expired'
  status             TEXT NOT NULL DEFAULT 'expired',
  -- 'normal' | 'trial' | 'intro' — mağazadan gelir (RevenueCat period_type).
  -- Deneme sürümündeki kullanıcıya farklı metin gösterilir; bu bilgi
  -- olmadan `inTrial` her zaman false döner ve deneme mesajı hiç çıkmaz.
  period_type        TEXT NOT NULL DEFAULT 'normal',
  updated_at_ms      INTEGER NOT NULL
);

-- ==================================================== içerik ve akış ====

CREATE TABLE IF NOT EXISTS content (
  content_id         TEXT PRIMARY KEY,
  author_id          TEXT NOT NULL,
  -- 'post' | 'story' | 'template' | 'dm-attachment'
  kind               TEXT NOT NULL,
  media_ref          TEXT,
  caption            TEXT NOT NULL DEFAULT '',
  -- ContentRating: general | sensitive | adult | review | blocked
  rating             TEXT NOT NULL DEFAULT 'review',
  -- 'pending' | 'approved' | 'blocked' — approved DEĞİLSE hiçbir yere gitmez.
  moderation_state   TEXT NOT NULL DEFAULT 'pending',
  reported_pending   INTEGER NOT NULL DEFAULT 0,
  published_at_ms    INTEGER NOT NULL,
  scanned_at_ms      INTEGER,
  removed_at_ms      INTEGER
);

CREATE INDEX IF NOT EXISTS idx_content_feed
  ON content (kind, moderation_state, published_at_ms);
CREATE INDEX IF NOT EXISTS idx_content_author ON content (author_id);

-- ========================================================== engelleme ====

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id         TEXT NOT NULL,
  blocked_id         TEXT NOT NULL,
  created_at_ms      INTEGER NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);

-- ========================================================== raporlar ====

CREATE TABLE IF NOT EXISTS reports (
  report_id          TEXT PRIMARY KEY,
  content_id         TEXT,
  author_id          TEXT,
  reporter_id        TEXT NOT NULL,
  reason             TEXT NOT NULL,
  note               TEXT NOT NULL DEFAULT '',
  suspended          INTEGER NOT NULL DEFAULT 0,
  created_at_ms      INTEGER NOT NULL
);

-- E2EE altında sunucu mesajı okuyamaz; bağlam İSTEMCİDEN, kullanıcının
-- açık onayıyla gelir.
CREATE TABLE IF NOT EXISTS message_reports (
  report_id          TEXT PRIMARY KEY,
  conversation_id    TEXT NOT NULL,
  reported_message_id TEXT NOT NULL,
  reported_user_id   TEXT,
  reporter_id        TEXT NOT NULL,
  reason             TEXT NOT NULL,
  context_json       TEXT NOT NULL DEFAULT '[]',
  created_at_ms      INTEGER NOT NULL
);

-- =================================================== moderasyon kuyruğu ====

CREATE TABLE IF NOT EXISTS moderation_queue (
  item_id            TEXT PRIMARY KEY,
  content_id         TEXT NOT NULL,
  author_id          TEXT,
  kind               TEXT NOT NULL DEFAULT 'post',
  reasons_json       TEXT NOT NULL DEFAULT '[]',
  -- 'proxy' (otomatik tarama) | 'report' (kullanıcı bildirimi)
  source             TEXT NOT NULL DEFAULT 'report',
  reporter_id        TEXT,
  -- 'critical' | 'high' | 'normal'
  priority           TEXT NOT NULL DEFAULT 'normal',
  created_at_ms      INTEGER NOT NULL,
  -- Kayıt anında sabitlenir; SONRADAN UZATILAMAZ.
  due_at_ms          INTEGER NOT NULL,
  state              TEXT NOT NULL DEFAULT 'open',
  claimed_by         TEXT,
  decision           TEXT,
  decided_by         TEXT,
  decided_at_ms      INTEGER,
  within_sla         INTEGER,
  note               TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_queue_open
  ON moderation_queue (state, priority, due_at_ms);

-- ========================================================== yaptırımlar ====

CREATE TABLE IF NOT EXISTS sanctions (
  sanction_id        TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL,
  -- 'shadow' | 'suspend' | 'ban' | 'terminate'
  sanction           TEXT NOT NULL,
  reason             TEXT NOT NULL,
  evidence_json      TEXT NOT NULL DEFAULT '[]',
  moderator_id       TEXT,
  automatic          INTEGER NOT NULL DEFAULT 0,
  applied_at_ms      INTEGER NOT NULL,
  expires_at_ms      INTEGER,
  lifted_at_ms       INTEGER,
  lifted_by          TEXT,
  appealable         INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_sanctions_user ON sanctions (user_id, lifted_at_ms);

-- Yaptırım ve karar denetim kaydı. Gerekçesiz yaptırım API'den geçmez;
-- bu tablo "kim, ne zaman, hangi gerekçe" sorusunu yanıtlar.
CREATE TABLE IF NOT EXISTS audit_log (
  audit_id           TEXT PRIMARY KEY,
  action             TEXT NOT NULL,
  subject_id         TEXT,
  actor_id           TEXT,
  detail_json        TEXT NOT NULL DEFAULT '{}',
  at_ms              INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_subject ON audit_log (subject_id, at_ms);

-- Yalnızca `terminate` kademesinde yazılır.
CREATE TABLE IF NOT EXISTS device_blocks (
  fingerprint        TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL,
  created_at_ms      INTEGER NOT NULL
);

-- ================================================================= DM ====

-- Sunucu YALNIZCA açık anahtar taşır. Özel anahtar hiçbir zaman gelmez.
CREATE TABLE IF NOT EXISTS dm_keys (
  app_user_id        TEXT PRIMARY KEY,
  public_key         TEXT NOT NULL,
  updated_at_ms      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS dm_envelopes (
  message_id         TEXT PRIMARY KEY,
  conversation_id    TEXT NOT NULL,
  sender_id          TEXT NOT NULL,
  -- Şifreli gövde — sunucu bunu ÇÖZEMEZ.
  ciphertext         TEXT NOT NULL,
  attachment_json    TEXT NOT NULL DEFAULT '[]',
  sent_at_ms         INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_envelopes_conv
  ON dm_envelopes (conversation_id, sent_at_ms);

CREATE TABLE IF NOT EXISTS conversations (
  conversation_id    TEXT NOT NULL,
  member_id          TEXT NOT NULL,
  PRIMARY KEY (conversation_id, member_id)
);

-- =========================================================== şablonlar ====

CREATE TABLE IF NOT EXISTS templates (
  template_id        TEXT PRIMARY KEY,
  author_id          TEXT NOT NULL,
  title              TEXT NOT NULL,
  preview_uri        TEXT NOT NULL,
  steps_json         TEXT NOT NULL DEFAULT '[]',
  pro_only           INTEGER NOT NULL DEFAULT 0,
  creator_only       INTEGER NOT NULL DEFAULT 0,
  use_count          INTEGER NOT NULL DEFAULT 0,
  rating             TEXT NOT NULL DEFAULT 'general',
  moderation_state   TEXT NOT NULL DEFAULT 'pending',
  created_at_ms      INTEGER NOT NULL
);

-- ==================================================== dışa aktarım kotası ====

CREATE TABLE IF NOT EXISTS export_quota (
  app_user_id        TEXT PRIMARY KEY,
  used_free_exports  INTEGER NOT NULL DEFAULT 0,
  updated_at_ms      INTEGER NOT NULL
);

-- ============================================================== ödüller ====

CREATE TABLE IF NOT EXISTS reward_awards (
  award_id           TEXT PRIMARY KEY,
  -- ISO hafta anahtarı (2026-W35) — scoring.weekKey ile aynı biçim.
  week               TEXT NOT NULL,
  app_user_id        TEXT NOT NULL,
  rank               INTEGER NOT NULL,
  days               INTEGER NOT NULL,
  store              TEXT NOT NULL,
  offer_id           TEXT NOT NULL,
  -- KODUN KENDİSİ SAKLANMAZ. Tek kullanımlık kod taşıyıcısına değer taşır;
  -- yalnızca korelasyon için özetin ilk 8 karakteri tutulur.
  code_fingerprint   TEXT NOT NULL,
  redemption_url     TEXT NOT NULL,
  expires_at_ms      INTEGER NOT NULL,
  issued_at_ms       INTEGER NOT NULL,
  acknowledged_at_ms INTEGER
);

-- Aynı kullanıcıya aynı hafta ikinci kod çıkmaz.
CREATE UNIQUE INDEX IF NOT EXISTS idx_award_week_user
  ON reward_awards (week, app_user_id);

-- =============================================== kısıtlı kimlik kaydı ====

-- Deepfake ve telif kapısı. Anahtar `restrictedRegistry.matchKey` biçimidir
-- (küçük harf, noktalama ve boşluk kaldırılmış) — sorgu bu biçimde gelir.
CREATE TABLE IF NOT EXISTS restricted_identities (
  match_key          TEXT PRIMARY KEY,
  canonical          TEXT NOT NULL,
  -- 'public_figure' | 'political' | 'trademark' | 'private_opt_out'
  category           TEXT NOT NULL,
  created_at_ms      INTEGER NOT NULL
);

-- =================================================== satın alma kaydı ====

-- Ürün bazında satın alma.
--
-- `entitlements` kullanıcı başına TEK satırdır ve PRO durumunu özetler.
-- Creator abonelikleri ayrı ürünlerdir (`...creator.tier1` vb.); PRO
-- satırına bakarak creator erişimi vermek, PRO alan herkese ÜCRETSİZ
-- creator erişimi vermek olurdu.
--
-- Kayıt SİLİNMEZ; süresi dolan `status = 'expired'` olur. Satın alma
-- geçmişi kullanıcının kendi kaydıdır ve iade/itiraz durumunda gerekir.
CREATE TABLE IF NOT EXISTS store_purchases (
  app_user_id        TEXT NOT NULL,
  product_id         TEXT NOT NULL,
  expires_at_ms      INTEGER,
  -- 'active' | 'expired'
  status             TEXT NOT NULL DEFAULT 'active',
  updated_at_ms      INTEGER NOT NULL,
  PRIMARY KEY (app_user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_store_purchases_user ON store_purchases (app_user_id);

-- ================================================== beğeni ve kullanım ====

-- Beğeni AYRI TABLODA, content üzerinde sayaç olarak DEĞİL.
--
-- Sayaç tutmak, ağ yeniden denemesinde (istemci `like` isteğini tekrar
-- gönderdiğinde) sayının şişmesi demektir. Birincil anahtar (post, kullanıcı)
-- olduğu için ikinci beğeni sessizce yok sayılır; sayı her zaman GERÇEK
-- beğenen sayısıdır.
CREATE TABLE IF NOT EXISTS post_likes (
  post_id            TEXT NOT NULL,
  app_user_id        TEXT NOT NULL,
  created_at_ms      INTEGER NOT NULL,
  PRIMARY KEY (post_id, app_user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_likes_user ON post_likes (app_user_id);

-- Şablon kullanımı da AYRI TABLODA ve KULLANICI BAŞINA TEK.
--
-- `templates.use_count` creator gelir payını etkiliyor: aynı kullanıcının
-- şablonu yüzlerce kez uygulaması ile yüz farklı kullanıcının bir kez
-- uygulaması aynı şey değildir. Tekil kullanıcı sayması, sayacı hem
-- yeniden denemeye hem de çiftlemeye karşı dayanıklı kılar.
CREATE TABLE IF NOT EXISTS template_uses (
  template_id        TEXT NOT NULL,
  app_user_id        TEXT NOT NULL,
  used_at_ms         INTEGER NOT NULL,
  PRIMARY KEY (template_id, app_user_id)
);

-- ======================================================= creator teklifi ====

-- Creator VIP abonelik teklifi.
--
-- FİYAT SÜTUNU YOKTUR — bilerek. Gösterilecek fiyat MAĞAZADAN okunur;
-- sunucudan gelen bir fiyatı göstermek, gösterilen ile tahsil edilenin
-- ayrışmasına ve Guideline 3.1.2 ihlaline yol açar. Burada yalnızca hangi
-- kademe ürününün sorgulanacağı tutulur.
CREATE TABLE IF NOT EXISTS creator_offers (
  creator_id         TEXT PRIMARY KEY,
  creator_handle     TEXT NOT NULL,
  -- 'tier1' | 'tier2' | 'tier3' — istemcideki CREATOR_TIERS ile aynı.
  tier               TEXT NOT NULL,
  perks_json         TEXT NOT NULL DEFAULT '[]',
  active             INTEGER NOT NULL DEFAULT 1,
  updated_at_ms      INTEGER NOT NULL
);

-- Kullanıcının bir creator'a aboneliği.
--
-- Bitiş anı MAĞAZADAN gelir (RevenueCat webhook'u). Sunucu kendi başına
-- süre uzatmaz; uzatsaydı, iptal edilmiş bir abonelik erişim vermeye
-- devam ederdi.
CREATE TABLE IF NOT EXISTS creator_subscriptions (
  creator_id         TEXT NOT NULL,
  app_user_id        TEXT NOT NULL,
  expires_at_ms      INTEGER,
  will_renew         INTEGER NOT NULL DEFAULT 0,
  updated_at_ms      INTEGER NOT NULL,
  PRIMARY KEY (creator_id, app_user_id)
);

CREATE INDEX IF NOT EXISTS idx_creator_subs_user
  ON creator_subscriptions (app_user_id);

-- ================================================== şema sürüm kaydı ====

CREATE TABLE IF NOT EXISTS schema_migrations (
  version            INTEGER PRIMARY KEY,
  applied_at_ms      INTEGER NOT NULL
);
