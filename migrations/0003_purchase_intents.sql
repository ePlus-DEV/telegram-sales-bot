-- Persist one purchase intent per Telegram callback_query.id. The intent and
-- order are written in one atomic D1/libSQL batch, avoiding duplicate orders
-- when Telegram redelivers a callback or two workers race.
CREATE TABLE IF NOT EXISTS purchase_intents (
  callback_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
  user_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id),
  invoice_url TEXT,
  checkout_query_id TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_purchase_intents_user ON purchase_intents(user_id,created_at DESC);
