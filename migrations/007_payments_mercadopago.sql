-- 005_payments_mercadopago.sql
-- Conexiones de pago por tenant (OAuth Marketplace de Mercado Pago) y lo
-- necesario para checkout online + webhooks idempotentes.
--
-- Nota: los nombres de tabla/columna siguen la convención ya usada en el
-- resto del proyecto (saas_tenants, tenant_id TEXT, timestamps *_utc).
-- La FK apunta a saas_tenants(id), que es la tabla real del proyecto
-- (el documento original decía "tenants(id)", pero esa tabla no existe aquí).

CREATE TABLE IF NOT EXISTS tenant_payment_connections (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'mercado_pago',

  provider_user_id TEXT,
  public_key TEXT,

  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TEXT,
  scopes TEXT,

  connection_status TEXT NOT NULL DEFAULT 'disconnected',
  connected_at TEXT,
  disconnected_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (tenant_id) REFERENCES saas_tenants(id),
  UNIQUE (tenant_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_payment_connections_tenant
ON tenant_payment_connections(tenant_id);

-- connection_status: disconnected | connecting | connected | expired | revoked | error

CREATE TABLE IF NOT EXISTS oauth_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  state_hash TEXT NOT NULL UNIQUE,
  code_verifier_encrypted TEXT,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  tenant_id TEXT,
  event_type TEXT,
  resource_id TEXT,
  processing_status TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT,
  error_message TEXT,

  UNIQUE(provider, provider_event_id)
);

-- orders ya tiene payment_method y payment_status (agregadas por
-- reports.js/ensureOrderColumns en una ronda anterior) — solo se agregan
-- las columnas genuinamente nuevas para el flujo de Mercado Pago.
ALTER TABLE orders ADD COLUMN payment_provider TEXT;
ALTER TABLE orders ADD COLUMN payment_preference_id TEXT;
ALTER TABLE orders ADD COLUMN provider_payment_id TEXT;
ALTER TABLE orders ADD COLUMN provider_merchant_order_id TEXT;
ALTER TABLE orders ADD COLUMN payment_amount INTEGER;
ALTER TABLE orders ADD COLUMN marketplace_fee INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN paid_at TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_preference ON orders(payment_preference_id);
CREATE INDEX IF NOT EXISTS idx_orders_provider_payment ON orders(provider_payment_id);
