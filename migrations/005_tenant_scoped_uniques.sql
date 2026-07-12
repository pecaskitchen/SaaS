-- Tenant-scoped uniqueness for operational SaaS tables.
-- Global catalog kept: stock_units.code.
-- Operational data must be isolated by tenant_id.

PRAGMA defer_foreign_keys = TRUE;
PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS orders_tenant_scope_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  order_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  branch_id TEXT NOT NULL DEFAULT 'dominio',
  branch_name TEXT NOT NULL DEFAULT 'Dominio',
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_address TEXT NOT NULL,
  customer_notes TEXT,
  subtotal INTEGER NOT NULL DEFAULT 0,
  delivery_fee INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  whatsapp_message TEXT,
  created_at_utc TEXT NOT NULL,
  created_at_monterrey TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Monterrey',
  updated_at_utc TEXT NOT NULL,
  updated_at_monterrey TEXT NOT NULL,
  stock_deducted INTEGER NOT NULL DEFAULT 0,
  stock_deducted_at_utc TEXT,
  stock_deducted_at_monterrey TEXT,
  stock_deduction_error TEXT,
  order_source TEXT NOT NULL DEFAULT 'online',
  cashier_name TEXT,
  cashier_shift TEXT,
  payment_method TEXT,
  payment_status TEXT
);
INSERT INTO orders_tenant_scope_new (
  id, tenant_id, order_number, status, branch_id, branch_name, customer_name, customer_phone,
  customer_address, customer_notes, subtotal, delivery_fee, total, whatsapp_message,
  created_at_utc, created_at_monterrey, timezone, updated_at_utc, updated_at_monterrey,
  stock_deducted, stock_deducted_at_utc, stock_deducted_at_monterrey, stock_deduction_error,
  order_source, cashier_name, cashier_shift, payment_method, payment_status
)
SELECT
  id, COALESCE(tenant_id, 'default'), order_number, status, COALESCE(branch_id, 'dominio'), COALESCE(branch_name, 'Dominio'),
  customer_name, customer_phone, customer_address, customer_notes, subtotal, delivery_fee, total, whatsapp_message,
  created_at_utc, created_at_monterrey, timezone, updated_at_utc, updated_at_monterrey,
  COALESCE(stock_deducted, 0), stock_deducted_at_utc, stock_deducted_at_monterrey, stock_deduction_error,
  COALESCE(order_source, 'online'), cashier_name, cashier_shift, payment_method, payment_status
FROM orders;
DROP TABLE orders;
ALTER TABLE orders_tenant_scope_new RENAME TO orders;

CREATE TABLE IF NOT EXISTS stock_purchase_categories_tenant_scope_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
INSERT INTO stock_purchase_categories_tenant_scope_new (id, tenant_id, name, sort_order)
SELECT id, COALESCE(tenant_id, 'default'), name, sort_order FROM stock_purchase_categories;
DROP TABLE stock_purchase_categories;
ALTER TABLE stock_purchase_categories_tenant_scope_new RENAME TO stock_purchase_categories;

CREATE TABLE IF NOT EXISTS stock_suppliers_tenant_scope_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  name TEXT NOT NULL,
  notes TEXT
);
INSERT INTO stock_suppliers_tenant_scope_new (id, tenant_id, name, notes)
SELECT id, COALESCE(tenant_id, 'default'), name, notes FROM stock_suppliers;
DROP TABLE stock_suppliers;
ALTER TABLE stock_suppliers_tenant_scope_new RENAME TO stock_suppliers;

CREATE TABLE IF NOT EXISTS inventory_items_tenant_scope_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  name TEXT NOT NULL,
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
INSERT INTO inventory_items_tenant_scope_new (
  id, tenant_id, name, brand, item_type, unit_id, current_stock, min_stock, max_stock,
  accuracy_target, primary_supplier_id, alt_supplier_id, purchase_category_id,
  purchase_unit_label, purchase_unit_quantity, purchase_price, expiry_date, is_active,
  client_visible, client_removable, client_changeable, deducts_inventory, is_packaging,
  is_internal_dressing, is_side_dressing, is_sellable_extra, created_at_utc, updated_at_utc
)
SELECT
  id, COALESCE(tenant_id, 'default'), name, brand, item_type, unit_id, current_stock, min_stock, max_stock,
  accuracy_target, primary_supplier_id, alt_supplier_id, purchase_category_id,
  purchase_unit_label, purchase_unit_quantity, purchase_price, expiry_date, is_active,
  client_visible, client_removable, client_changeable, deducts_inventory, is_packaging,
  is_internal_dressing, is_side_dressing, is_sellable_extra, created_at_utc, updated_at_utc
FROM inventory_items;
DROP TABLE inventory_items;
ALTER TABLE inventory_items_tenant_scope_new RENAME TO inventory_items;

CREATE TABLE IF NOT EXISTS stock_recipes_tenant_scope_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  recipe_key TEXT NOT NULL,
  recipe_type TEXT NOT NULL DEFAULT 'product',
  name TEXT NOT NULL,
  output_item_id INTEGER,
  output_quantity REAL NOT NULL DEFAULT 0,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  FOREIGN KEY (output_item_id) REFERENCES inventory_items(id)
);
INSERT INTO stock_recipes_tenant_scope_new (
  id, tenant_id, recipe_key, recipe_type, name, output_item_id, output_quantity,
  notes, is_active, created_at_utc, updated_at_utc
)
SELECT
  id, COALESCE(tenant_id, 'default'), recipe_key, recipe_type, name, output_item_id,
  output_quantity, notes, is_active, created_at_utc, updated_at_utc
FROM stock_recipes;
DROP TABLE stock_recipes;
ALTER TABLE stock_recipes_tenant_scope_new RENAME TO stock_recipes;

CREATE TABLE IF NOT EXISTS stock_option_families_tenant_scope_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  family_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL
);
INSERT INTO stock_option_families_tenant_scope_new (
  id, tenant_id, family_key, name, description, sort_order, is_active, created_at_utc, updated_at_utc
)
SELECT
  id, COALESCE(tenant_id, 'default'), family_key, name, description, sort_order, is_active, created_at_utc, updated_at_utc
FROM stock_option_families;
DROP TABLE stock_option_families;
ALTER TABLE stock_option_families_tenant_scope_new RENAME TO stock_option_families;

CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_tenant_order_number ON orders(tenant_id, order_number);
CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_purchase_categories_tenant_name ON stock_purchase_categories(tenant_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_suppliers_tenant_name ON stock_suppliers(tenant_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS ux_inventory_items_tenant_name ON inventory_items(tenant_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_recipes_tenant_key ON stock_recipes(tenant_id, recipe_key);
CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_option_families_tenant_key ON stock_option_families(tenant_id, family_key);
CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_option_family_items_tenant_family_name ON stock_option_family_items(tenant_id, family_id, option_name);
CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_product_option_groups_tenant_product_family ON stock_product_option_groups(tenant_id, product_id, family_id);

CREATE INDEX IF NOT EXISTS idx_orders_branch_id ON orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at_monterrey ON orders(created_at_monterrey);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_status ON orders(tenant_id, status, created_at_monterrey);
CREATE INDEX IF NOT EXISTS idx_inventory_items_name ON inventory_items(name);
CREATE INDEX IF NOT EXISTS idx_inventory_items_active ON inventory_items(is_active);
CREATE INDEX IF NOT EXISTS idx_inventory_items_tenant_active ON inventory_items(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_stock_recipes_type ON stock_recipes(recipe_type, is_active);
CREATE INDEX IF NOT EXISTS idx_stock_recipes_tenant_type ON stock_recipes(tenant_id, recipe_type, is_active);
CREATE INDEX IF NOT EXISTS idx_stock_option_families_key ON stock_option_families(family_key);
CREATE INDEX IF NOT EXISTS idx_stock_option_families_tenant_key ON stock_option_families(tenant_id, family_key);

PRAGMA foreign_keys = ON;
