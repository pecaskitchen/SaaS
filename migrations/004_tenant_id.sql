-- Adds tenant_id to existing operational tables.
-- Run once with Wrangler/D1 migrations after 003_custom_hostnames.sql.

ALTER TABLE app_settings ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';

ALTER TABLE orders ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE order_items ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE order_events ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';

ALTER TABLE stock_units ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE stock_purchase_categories ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE stock_suppliers ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE stock_branches ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE inventory_items ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE inventory_branch_stock ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE stock_movements ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE waste_requests ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE inventory_count_requests ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE stock_recipes ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE stock_recipe_lines ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE stock_option_families ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE stock_option_family_items ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE stock_option_family_item_components ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE stock_product_option_groups ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_app_settings_tenant_key ON app_settings(tenant_id, key);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_status ON orders(tenant_id, status, created_at_monterrey);
CREATE INDEX IF NOT EXISTS idx_order_items_tenant_order ON order_items(tenant_id, order_id);
CREATE INDEX IF NOT EXISTS idx_order_events_tenant_order ON order_events(tenant_id, order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_tenant_active ON inventory_items(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_inventory_branch_stock_tenant_branch ON inventory_branch_stock(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant_branch ON stock_movements(tenant_id, branch_id, created_at_utc);
CREATE INDEX IF NOT EXISTS idx_stock_recipes_tenant_type ON stock_recipes(tenant_id, recipe_type, is_active);
CREATE INDEX IF NOT EXISTS idx_stock_option_families_tenant_key ON stock_option_families(tenant_id, family_key);
