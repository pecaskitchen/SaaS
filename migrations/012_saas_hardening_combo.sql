-- Omdexa SaaS hardening combo
-- Audit log and support tickets.
-- Nota: los indices operativos sobre orders/items se crean desde el codigo
-- cuando esas tablas existen. Dejarlos aqui haria que una DB nueva falle si
-- todavia no se ha creado inventario o pedidos.

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT,
  actor_role TEXT NOT NULL,
  actor_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at_utc TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_created
ON audit_log(tenant_id, created_at_utc);

CREATE INDEX IF NOT EXISTS idx_audit_log_action_created
ON audit_log(action, created_at_utc);

CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'normal',
  requested_by TEXT,
  message TEXT NOT NULL DEFAULT '',
  created_at_utc TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at_utc TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_tenant_status
ON support_tickets(tenant_id, status, updated_at_utc);

