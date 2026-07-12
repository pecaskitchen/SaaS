-- SaaS menu catalog v2: tenant-scoped categories/products with legacy app_settings fallback.

CREATE TABLE IF NOT EXISTS menu_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  category_key TEXT NOT NULL,
  label TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_visible INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  UNIQUE(tenant_id, category_key)
);

CREATE TABLE IF NOT EXISTS menu_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  product_key TEXT NOT NULL,
  category_key TEXT NOT NULL,
  recipe_id INTEGER,
  name TEXT NOT NULL,
  product_type TEXT NOT NULL DEFAULT 'custom',
  price REAL NOT NULL DEFAULT 0,
  badge TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  ingredients TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  is_published INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  UNIQUE(tenant_id, product_key),
  FOREIGN KEY (tenant_id, category_key) REFERENCES menu_categories(tenant_id, category_key),
  FOREIGN KEY (recipe_id) REFERENCES stock_recipes(id)
);

CREATE TABLE IF NOT EXISTS menu_product_recipe_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  product_key TEXT NOT NULL,
  recipe_id INTEGER NOT NULL,
  link_type TEXT NOT NULL DEFAULT 'primary',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  UNIQUE(tenant_id, product_key, recipe_id, link_type),
  FOREIGN KEY (tenant_id, product_key) REFERENCES menu_products(tenant_id, product_key),
  FOREIGN KEY (recipe_id) REFERENCES stock_recipes(id)
);

CREATE INDEX IF NOT EXISTS idx_menu_categories_tenant_active ON menu_categories(tenant_id, is_active, is_visible, sort_order);
CREATE INDEX IF NOT EXISTS idx_menu_products_tenant_category ON menu_products(tenant_id, category_key, is_active, is_published, sort_order);
CREATE INDEX IF NOT EXISTS idx_menu_products_recipe ON menu_products(tenant_id, recipe_id);
CREATE INDEX IF NOT EXISTS idx_menu_recipe_links_tenant_product ON menu_product_recipe_links(tenant_id, product_key, is_active);
