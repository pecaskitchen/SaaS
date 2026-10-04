ALTER TABLE whatsapp_webhook_events ADD COLUMN duplicate_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE whatsapp_webhook_events ADD COLUMN last_received_at TEXT;

CREATE INDEX IF NOT EXISTS idx_whatsapp_events_tenant_received
  ON whatsapp_webhook_events(tenant_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_tenant_created
  ON whatsapp_messages(tenant_id, created_at DESC);
