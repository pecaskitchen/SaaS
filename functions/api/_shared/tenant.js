import { forbidden, requireDb, unauthorized } from '../../../00-sin-cambio/functions/api/_shared/http.js';

function hostnameFromRequest(request) {
  const forwarded = request.headers.get('x-forwarded-host');
  const host = forwarded || new URL(request.url).hostname;
  return String(host || '').toLowerCase().replace(/:\d+$/, '');
}

export async function resolveTenantByHostname(env, hostname) {
  const db = requireDb(env);
  const row = await db.prepare(`
    SELECT t.*
    FROM saas_tenant_domains d
    JOIN saas_tenants t ON t.id = d.tenant_id
    WHERE lower(d.hostname) = lower(?) AND t.status IN ('trial', 'active', 'past_due')
    LIMIT 1
  `).bind(hostname).first();
  return row || null;
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
