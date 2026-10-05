-- Pecas Club: cuentas de clientes, libro mayor, recompensas y referidos.
-- Todo queda aislado por tenant_id aunque inicialmente solo Pecas lo active.

CREATE TABLE IF NOT EXISTS club_customers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  crm_customer_id INTEGER,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  pin_hash TEXT NOT NULL,
  birthday_day INTEGER,
  birthday_month INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  referral_code TEXT NOT NULL,
  referred_by_customer_id TEXT,
  privacy_notice_version TEXT NOT NULL,
  privacy_accepted_at_utc TEXT NOT NULL,
  terms_version TEXT NOT NULL,
  terms_accepted_at_utc TEXT NOT NULL,
  marketing_consent INTEGER NOT NULL DEFAULT 0,
  marketing_consent_at_utc TEXT,
  last_login_at_utc TEXT,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  CHECK (status IN ('active', 'blocked', 'closed')),
  UNIQUE (tenant_id, phone),
  UNIQUE (tenant_id, referral_code)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_club_customers_tenant_email
  ON club_customers (tenant_id, lower(email)) WHERE email IS NOT NULL AND email != '';
CREATE INDEX IF NOT EXISTS idx_club_customers_tenant_name
  ON club_customers (tenant_id, name);

CREATE TABLE IF NOT EXISTS club_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  expires_at_utc TEXT NOT NULL,
  created_at_utc TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES club_customers(id)
);
CREATE INDEX IF NOT EXISTS idx_club_sessions_customer
  ON club_sessions (tenant_id, customer_id, expires_at_utc);

CREATE TABLE IF NOT EXISTS club_order_awards (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  order_id INTEGER NOT NULL,
  points_awarded INTEGER NOT NULL DEFAULT 0,
  created_at_utc TEXT NOT NULL,
  UNIQUE (tenant_id, order_id),
  FOREIGN KEY (customer_id) REFERENCES club_customers(id)
);

CREATE TABLE IF NOT EXISTS club_points_transactions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  order_id INTEGER,
  redemption_id TEXT,
  referral_id TEXT,
  type TEXT NOT NULL,
  points INTEGER NOT NULL,
  description TEXT NOT NULL,
  created_by_user_id TEXT,
  created_by_name TEXT,
  created_at_utc TEXT NOT NULL,
  CHECK (type IN ('earn', 'redeem', 'adjustment', 'expire', 'refund', 'referral')),
  FOREIGN KEY (customer_id) REFERENCES club_customers(id)
);
CREATE INDEX IF NOT EXISTS idx_club_points_customer_date
  ON club_points_transactions (tenant_id, customer_id, created_at_utc DESC);

CREATE TABLE IF NOT EXISTS club_rewards (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  points_required INTEGER NOT NULL,
  estimated_cost REAL,
  image_url TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  stock INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  CHECK (points_required > 0),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS club_redemptions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  reward_id TEXT NOT NULL,
  reward_name TEXT NOT NULL,
  points_spent INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'issued',
  redemption_code TEXT NOT NULL,
  redeemed_at_utc TEXT NOT NULL,
  used_at_utc TEXT,
  created_by_user_id TEXT,
  created_by_name TEXT,
  CHECK (status IN ('issued', 'used', 'cancelled', 'expired')),
  UNIQUE (tenant_id, redemption_code),
  FOREIGN KEY (customer_id) REFERENCES club_customers(id),
  FOREIGN KEY (reward_id) REFERENCES club_rewards(id)
);
CREATE INDEX IF NOT EXISTS idx_club_redemptions_customer
  ON club_redemptions (tenant_id, customer_id, redeemed_at_utc DESC);

CREATE TABLE IF NOT EXISTS club_promotions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  starts_at_utc TEXT,
  ends_at_utc TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  club_only INTEGER NOT NULL DEFAULT 1,
  terms TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS club_referrals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  referrer_customer_id TEXT NOT NULL,
  referred_customer_id TEXT NOT NULL,
  qualifying_order_id INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  review_reason TEXT,
  referrer_points INTEGER NOT NULL DEFAULT 5,
  referred_points INTEGER NOT NULL DEFAULT 5,
  completed_at_utc TEXT,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  CHECK (status IN ('pending', 'qualified', 'under_review', 'rewarded', 'rejected', 'cancelled')),
  UNIQUE (tenant_id, referred_customer_id),
  FOREIGN KEY (referrer_customer_id) REFERENCES club_customers(id),
  FOREIGN KEY (referred_customer_id) REFERENCES club_customers(id)
);
CREATE INDEX IF NOT EXISTS idx_club_referrals_referrer
  ON club_referrals (tenant_id, referrer_customer_id, status);

INSERT OR IGNORE INTO club_rewards
  (id, tenant_id, name, description, points_required, estimated_cost, active, sort_order, created_at_utc, updated_at_utc)
SELECT 'pecas_reward_extra', id, 'Extra premium gratis', 'Agrega un extra premium sin costo.', 5, 15, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM saas_tenants WHERE slug = 'pecas';
INSERT OR IGNORE INTO club_rewards
  (id, tenant_id, name, description, points_required, estimated_cost, active, sort_order, created_at_utc, updated_at_utc)
SELECT 'pecas_reward_latte', id, 'Latte', 'Latte gratis.', 10, 35, 1, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM saas_tenants WHERE slug = 'pecas';
INSERT OR IGNORE INTO club_rewards
  (id, tenant_id, name, description, points_required, estimated_cost, active, sort_order, created_at_utc, updated_at_utc)
SELECT 'pecas_reward_crepa', id, 'Crepa clásica', 'Crepa clásica gratis.', 15, 50, 1, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM saas_tenants WHERE slug = 'pecas';
INSERT OR IGNORE INTO club_rewards
  (id, tenant_id, name, description, points_required, estimated_cost, active, sort_order, created_at_utc, updated_at_utc)
SELECT 'pecas_reward_panini', id, 'Panini', 'Panini gratis.', 20, 65, 1, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM saas_tenants WHERE slug = 'pecas';
INSERT OR IGNORE INTO club_rewards
  (id, tenant_id, name, description, points_required, estimated_cost, active, sort_order, created_at_utc, updated_at_utc)
SELECT 'pecas_reward_150', id, '$150 de descuento', '$150 de descuento en una compra elegible.', 25, 150, 1, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM saas_tenants WHERE slug = 'pecas';
