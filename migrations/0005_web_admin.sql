-- Durable sessions and login throttling shared by Workers/D1 and Node/Turso.
-- No password, session token or raw client IP is stored in the database.
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  csrf_token TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);
CREATE TABLE IF NOT EXISTS admin_login_limits (
  id TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  reset_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_login_limits_reset ON admin_login_limits(reset_at);
CREATE TABLE IF NOT EXISTS admin_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit(created_at DESC);
