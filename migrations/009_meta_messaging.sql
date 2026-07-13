-- 009_meta_messaging.sql
-- Messenger + Instagram (dos caminos de conexion) + estado de conversacion
-- del bot de catalogo + log de mensajes, compartido entre ambos canales.

CREATE TABLE IF NOT EXISTS tenant_meta_page_connections (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,

  page_id TEXT,
  page_name TEXT,
  page_access_token_encrypted TEXT,

  instagram_business_account_id TEXT,
  instagram_username TEXT,

  connection_status TEXT NOT NULL DEFAULT 'disconnected',
  connected_at TEXT,
  disconnected_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (tenant_id) REFERENCES saas_tenants(id),
  UNIQUE (tenant_id)
);
-- connection_status: disconnected | connecting | connected | expired | error
-- instagram_business_account_id queda NULL si la pagina no tiene Instagram
-- profesional vinculado -- Messenger sigue funcionando igual. Se puede
-- revisar de nuevo mas tarde sin repetir el login (ver
-- integrations/meta-page/recheck-instagram.js).

CREATE INDEX IF NOT EXISTS idx_meta_page_connections_page_id ON tenant_meta_page_connections(page_id);
CREATE INDEX IF NOT EXISTS idx_meta_page_connections_ig_id ON tenant_meta_page_connections(instagram_business_account_id);

CREATE TABLE IF NOT EXISTS tenant_instagram_login_connections (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,

  ig_user_id TEXT,
  ig_username TEXT,

  access_token_encrypted TEXT,
  token_expires_at TEXT,

  connection_status TEXT NOT NULL DEFAULT 'disconnected',
  connected_at TEXT,
  disconnected_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (tenant_id) REFERENCES saas_tenants(id),
  UNIQUE (tenant_id)
);
-- Camino standalone (Instagram API with Instagram Login), para negocios
-- cuyo Instagram no esta vinculado a ninguna Pagina de Facebook. Igual que
-- WhatsApp Embedded Signup: sin refresh automatico, hay que reconectar al
-- expirar token_expires_at.

CREATE INDEX IF NOT EXISTS idx_instagram_login_connections_ig_user_id ON tenant_instagram_login_connections(ig_user_id);

-- Conversacion + mensajes + idempotencia de webhooks, COMPARTIDO entre
-- Messenger e Instagram (vinculado o standalone) -- las tres variantes
-- mandan/reciben con el mismo shape de Send API, solo cambia de donde sale
-- el access token y el id del endpoint (ver metaMessaging.js).
CREATE TABLE IF NOT EXISTS meta_channel_conversations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  channel TEXT NOT NULL, -- messenger | instagram
  customer_id TEXT NOT NULL, -- PSID (messenger) o IGSID (instagram)
  state TEXT NOT NULL DEFAULT 'idle',
  cart_json TEXT NOT NULL DEFAULT '{}',
  order_id INTEGER,
  last_message_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, channel, customer_id)
);
-- state: idle | browsing_category | reviewing_cart | awaiting_name |
--        awaiting_address | awaiting_confirmation | completed

CREATE TABLE IF NOT EXISTS meta_channel_messages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  direction TEXT NOT NULL, -- inbound | outbound
  message_type TEXT,
  provider_message_id TEXT,
  content_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_meta_channel_messages_tenant_customer ON meta_channel_messages(tenant_id, channel, customer_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_meta_channel_messages_provider_id ON meta_channel_messages(channel, provider_message_id) WHERE provider_message_id IS NOT NULL;

-- Idempotencia de webhooks, mismo patron que whatsapp_webhook_events /
-- payment_webhook_events.
CREATE TABLE IF NOT EXISTS meta_channel_webhook_events (
  id TEXT PRIMARY KEY,
  provider_event_id TEXT NOT NULL UNIQUE,
  tenant_id TEXT,
  channel TEXT,
  event_type TEXT,
  processing_status TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT,
  error_message TEXT
);
