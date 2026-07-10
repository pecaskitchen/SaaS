CREATE TABLE IF NOT EXISTS stock_units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'general',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS stock_purchase_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS stock_suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  brand TEXT,
  item_type TEXT NOT NULL DEFAULT 'Ingrediente comprado',
  unit_id INTEGER NOT NULL,
  current_stock REAL NOT NULL DEFAULT 0,
  min_stock REAL NOT NULL DEFAULT 0,
  max_stock REAL NOT NULL DEFAULT 0,
  accuracy_target REAL NOT NULL DEFAULT 85,
  primary_supplier_id INTEGER,
  alt_supplier_id INTEGER,
  purchase_category_id INTEGER,
  purchase_unit_label TEXT,
  purchase_unit_quantity REAL NOT NULL DEFAULT 0,
  purchase_price REAL NOT NULL DEFAULT 0,
  expiry_date TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  client_visible INTEGER NOT NULL DEFAULT 0,
  client_removable INTEGER NOT NULL DEFAULT 0,
  client_changeable INTEGER NOT NULL DEFAULT 0,
  deducts_inventory INTEGER NOT NULL DEFAULT 1,
  is_packaging INTEGER NOT NULL DEFAULT 0,
  is_internal_dressing INTEGER NOT NULL DEFAULT 0,
  is_side_dressing INTEGER NOT NULL DEFAULT 0,
  is_sellable_extra INTEGER NOT NULL DEFAULT 0,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  FOREIGN KEY (unit_id) REFERENCES stock_units(id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  movement_type TEXT NOT NULL,
  quantity REAL NOT NULL,
  stock_before REAL NOT NULL,
  stock_after REAL NOT NULL,
  reason TEXT,
  source_type TEXT,
  source_id TEXT,
  reported_by TEXT,
  reported_role TEXT,
  reported_shift TEXT,
  approved_by TEXT,
  created_at_utc TEXT NOT NULL,
  created_at_monterrey TEXT NOT NULL,
  FOREIGN KEY (item_id) REFERENCES inventory_items(id)
);

CREATE TABLE IF NOT EXISTS waste_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  quantity REAL NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reported_by TEXT NOT NULL,
  reported_role TEXT NOT NULL,
  reported_shift TEXT NOT NULL,
  approved_by TEXT,
  created_at_utc TEXT NOT NULL,
  created_at_monterrey TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  updated_at_monterrey TEXT NOT NULL,
  FOREIGN KEY (item_id) REFERENCES inventory_items(id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_name ON inventory_items(name);
CREATE INDEX IF NOT EXISTS idx_inventory_items_active ON inventory_items(is_active);
CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(item_id, created_at_utc);
CREATE INDEX IF NOT EXISTS idx_waste_requests_status ON waste_requests(status, created_at_utc);
