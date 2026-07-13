-- 008_whatsapp_cloud_api.sql
-- WhatsApp Cloud API por tenant (Embedded Signup) + estado de conversación
-- para el catálogo interactivo + log de mensajes.

CREATE TABLE IF NOT EXISTS tenant_whatsapp_connections (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,

  waba_id TEXT,
  phone_number_id TEXT,
  display_phone_number TEXT,
  business_name TEXT,

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
-- connection_status: disconnected | connecting | connected | expired | error
-- Nota: a diferencia de Mercado Pago, el token de Embedded Signup NO se
-- renueva solo con un refresh_token — cuando expira (token_expires_at),
-- hay que volver a pasar por Embedded Signup. Ver payments.js vs
-- whatsapp.js para la diferencia.

CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_waba ON tenant_whatsapp_connections(waba_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_phone_number_id ON tenant_whatsapp_connections(phone_number_id);

CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'idle',
  cart_json TEXT NOT NULL DEFAULT '{}',
  order_id INTEGER,
  last_message_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, customer_phone)
);
-- state: idle | browsing_category | reviewing_cart | awaiting_name |
--        awaiting_address | awaiting_confirmation | completed

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  direction TEXT NOT NULL, -- inbound | outbound
  message_type TEXT,
  wa_message_id TEXT,
  content_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_tenant_phone ON whatsapp_messages(tenant_id, customer_phone, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_messages_wa_id ON whatsapp_messages(wa_message_id) WHERE wa_message_id IS NOT NULL;

-- Idempotencia de webhooks, mismo patrón que payment_webhook_events.
CREATE TABLE IF NOT EXISTS whatsapp_webhook_events (
  id TEXT PRIMARY KEY,
  provider_event_id TEXT NOT NULL UNIQUE,
  tenant_id TEXT,
  event_type TEXT,
  processing_status TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT,
  error_message TEXT
);
