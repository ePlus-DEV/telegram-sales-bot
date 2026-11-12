PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK (kind IN ('physical','digital')),
  price_vnd INTEGER NOT NULL DEFAULT 0 CHECK (price_vnd >= 0),
  price_stars INTEGER NOT NULL DEFAULT 0 CHECK (price_stars >= 0),
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id),
  kind TEXT NOT NULL CHECK (kind IN ('physical','digital')),
  provider TEXT NOT NULL CHECK (provider IN ('sepay','stars')),
  total_vnd INTEGER NOT NULL DEFAULT 0,
  total_stars INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','PAID','FULFILLED')),
  payment_ref TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status,created_at DESC);

CREATE TABLE IF NOT EXISTS digital_inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  secret_value TEXT NOT NULL,
  reserved_order_id TEXT UNIQUE REFERENCES orders(id),
  delivered_order_id TEXT UNIQUE REFERENCES orders(id)
);
CREATE INDEX IF NOT EXISTS idx_stock_available ON digital_inventory(product_id,reserved_order_id,delivered_order_id);

CREATE TABLE IF NOT EXISTS payment_events (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(provider,event_id)
);
