CREATE TABLE IF NOT EXISTS saas_tenants (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  legal_name TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  status TEXT NOT NULL DEFAULT 'trial',
  plan TEXT NOT NULL DEFAULT 'starter',
  domain TEXT,
  subdomain TEXT,
  brand_json TEXT NOT NULL DEFAULT '{}',
  settings_json TEXT NOT NULL DEFAULT '{}',
  notes TEXT,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS saas_users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  password_hint TEXT,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES saas_tenants(id)
);

CREATE TABLE IF NOT EXISTS saas_subscriptions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'trial',
  monthly_price_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'MXN',
  trial_ends_at TEXT,
  current_period_starts_at TEXT,
  current_period_ends_at TEXT,
  last_payment_at TEXT,
  next_payment_due_at TEXT,
  notes TEXT,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES saas_tenants(id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT,
  actor_role TEXT NOT NULL,
  actor_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at_utc TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_saas_tenants_slug ON saas_tenants(slug);
CREATE INDEX IF NOT EXISTS idx_saas_tenants_status ON saas_tenants(status);
CREATE INDEX IF NOT EXISTS idx_saas_users_tenant_role ON saas_users(tenant_id, role);
CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_tenant ON saas_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_time ON audit_log(tenant_id, created_at_utc);
