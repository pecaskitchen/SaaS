import { forbidden, requireDb, unauthorized } from './http.js';

function hostnameFromRequest(request) {
  const forwarded = request.headers.get('x-forwarded-host');
  const host = forwarded || new URL(request.url).hostname;
  return String(host || '').toLowerCase().replace(/:\d+$/, '');
}

export function defaultTenantId(env) {
  return String(env.DEFAULT_TENANT_ID || env.TENANT_ID || 'default').trim() || 'default';
}

export async function ensureTenantDomainTable(env) {
  const db = requireDb(env);
  await db.prepare(`CREATE TABLE IF NOT EXISTS saas_tenant_domains (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    hostname TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL DEFAULT 'custom',
    status TEXT NOT NULL DEFAULT 'active',
    cf_hostname_id TEXT,
    ssl_status TEXT,
    created_at_utc TEXT NOT NULL,
    updated_at_utc TEXT NOT NULL
  )`).run();
}

export async function resolveTenantByHostname(env, hostname) {
  const db = requireDb(env);
  await ensureTenantDomainTable(env);
  const row = await db.prepare(`
    SELECT t.*
    FROM saas_tenant_domains d
    JOIN saas_tenants t ON t.id = d.tenant_id
    WHERE lower(d.hostname) = lower(?) AND t.status IN ('trial', 'active', 'past_due')
    LIMIT 1
  `).bind(hostname).first();
  return row || null;
}

export async function resolveTenantId(request, env) {
  try {
    const explicit = request.headers.get('x-tenant-id') || new URL(request.url).searchParams.get('tenant_id');
    if (explicit) return String(explicit).trim();
    const hostname = hostnameFromRequest(request);
    const tenant = await resolveTenantByHostname(env, hostname);
    return tenant?.id || defaultTenantId(env);
  } catch {
    return defaultTenantId(env);
  }
}

export async function requireTenant(request, env, session = null) {
  const hostname = hostnameFromRequest(request);
  const tenant = await resolveTenantByHostname(env, hostname);

  if (!tenant) {
    return { ok: false, response: unauthorized('No se encontro negocio para este dominio.') };
  }

  if (tenant.status === 'paused' || tenant.status === 'cancelled') {
    return { ok: false, response: forbidden('Este negocio esta pausado.') };
  }

  if (session?.tenantId && session.tenantId !== tenant.id && session.role !== 'platform_admin') {
    return { ok: false, response: forbidden('La sesion no pertenece a este negocio.') };
  }

  return { ok: true, tenant };
}

export function bindTenant(sql, tenantId) {
  if (!/\btenant_id\b/i.test(sql)) {
    throw new Error('Consulta sin tenant_id bloqueada.');
  }
  return { sql, tenantId };
}

export async function ensureTenantColumns(env, tables = []) {
  const db = requireDb(env);
  for (const table of tables) {
    try {
      const info = await db.prepare(`PRAGMA table_info(${table})`).all();
      const columns = new Set((info.results || []).map((row) => row.name));
      if (!columns.has('tenant_id')) {
        const fallback = defaultTenantId(env).replace(/'/g, "''");
        await db.prepare(`ALTER TABLE ${table} ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '${fallback}'`).run();
      }
    } catch {
      // Table may not exist yet. Its CREATE TABLE path should add tenant_id.
    }
  }
}

export function tenantSettingKey(key, tenantId, env) {
  const cleanTenant = String(tenantId || defaultTenantId(env)).trim() || defaultTenantId(env);
  const cleanKey = String(key || '').trim();
  return cleanTenant === defaultTenantId(env) ? cleanKey : `${cleanTenant}:${cleanKey}`;
}
