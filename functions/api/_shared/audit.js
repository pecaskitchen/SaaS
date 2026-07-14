import { nowIso, requireDb } from './http.js';

export async function ensureAuditTables(env) {
  const db = requireDb(env);
  await db.prepare(`
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
    )
  `).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_created ON audit_log(tenant_id, created_at_utc)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_log_action_created ON audit_log(action, created_at_utc)`).run();
}

export async function writeAudit(env, {
  tenantId = null,
  actorRole = 'system',
  actorName = '',
  action,
  entityType = '',
  entityId = '',
  metadata = {},
} = {}) {
  if (!action) return;
  await ensureAuditTables(env);
  await requireDb(env).prepare(`
    INSERT INTO audit_log (tenant_id, actor_role, actor_name, action, entity_type, entity_id, metadata_json, created_at_utc)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    tenantId,
    String(actorRole || 'system'),
    String(actorName || ''),
    String(action),
    String(entityType || ''),
    String(entityId || ''),
    JSON.stringify(metadata || {}),
    nowIso(),
  ).run();
}

export function actorFromSession(session = {}) {
  return {
    actorRole: session.role || 'system',
    actorName: session.name || session.email || session.userId || '',
  };
}

