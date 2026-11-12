-- Do not rebuild orders: older databases contain FK references and immutable
-- CHECK constraints. Add sidecar lifecycle records instead.
CREATE TABLE IF NOT EXISTS order_expirations (
  order_id TEXT PRIMARY KEY REFERENCES orders(id),
  expired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS bank_payment_reviews (
  event_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  bank_account TEXT NOT NULL,
  amount_vnd INTEGER NOT NULL CHECK (amount_vnd > 0),
  reason TEXT NOT NULL CHECK (reason IN
    ('UNKNOWN_ORDER','AMOUNT_MISMATCH','EXPIRED_ORDER','ALREADY_PAID')),
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_bank_reviews_open ON bank_payment_reviews(acknowledged_at,received_at);
CREATE TABLE IF NOT EXISTS star_refunds (
  order_id TEXT PRIMARY KEY REFERENCES orders(id),
  user_id TEXT NOT NULL,
  charge_id TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('CALLING','CONFIRMED','NEEDS_REVIEW')),
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_star_refunds_state ON star_refunds(state,requested_at);
