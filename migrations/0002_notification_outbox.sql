-- Persist a delivery intent before calling Telegram. Telegram sendMessage has no
-- idempotency key, so messages are at-least-once after a crash between send and ACK.
CREATE TABLE IF NOT EXISTS notification_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id),
  kind TEXT NOT NULL CHECK (kind IN (
    'stars_key', 'stars_review_customer', 'stars_review_admin',
    'physical_paid_customer', 'physical_paid_admin'
  )),
  recipient_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (state IN ('PENDING','SENDING','SENT')),
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_until TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(order_id,kind)
);
CREATE INDEX IF NOT EXISTS idx_outbox_retry
  ON notification_outbox(state,lease_until,id);
