CREATE TABLE IF NOT EXISTS saas_tenants (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'trial',
  plan TEXT NOT NULL DEFAULT 'starter',
  brand_json TEXT NOT NULL DEFAULT '{}',
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS saas_tenant_domains (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  hostname TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'subdomain',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES saas_tenants(id)
);

CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id TEXT PRIMARY KEY,
  menu_json TEXT NOT NULL DEFAULT '{}',
  business_hours_json TEXT NOT NULL DEFAULT '{}',
  branch_settings_json TEXT NOT NULL DEFAULT '{}',
  updated_at_utc TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES saas_tenants(id)
);

-- Migraciones sugeridas para tablas existentes:
-- ALTER TABLE orders ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'tenant_demo';
-- ALTER TABLE order_items ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'tenant_demo';
-- ALTER TABLE order_events ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'tenant_demo';
-- ALTER TABLE inventory_items ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'tenant_demo';
-- ALTER TABLE stock_movements ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'tenant_demo';
-- ALTER TABLE waste_requests ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'tenant_demo';
-- ALTER TABLE app_settings ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'tenant_demo';

CREATE INDEX IF NOT EXISTS idx_tenant_domains_hostname ON saas_tenant_domains(hostname);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_status ON orders(tenant_id, status, created_at_monterrey);
CREATE INDEX IF NOT EXISTS idx_inventory_items_tenant ON inventory_items(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant ON stock_movements(tenant_id, created_at_utc);
