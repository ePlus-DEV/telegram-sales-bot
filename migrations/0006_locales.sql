-- Per-user Telegram locale. Keep manual preferences across all hosting backends.
CREATE TABLE IF NOT EXISTS user_locales (
  user_id TEXT PRIMARY KEY,
  locale TEXT NOT NULL CHECK (locale IN ('vi','en')),
  source TEXT NOT NULL CHECK (source IN ('auto','manual')),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_user_locales_locale ON user_locales(locale);
