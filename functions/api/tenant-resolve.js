import { jsonResponse, requireDb } from './_shared/http.js';
import { ensurePlatformTables } from './_shared/platform.js';
import { ensureTenantDomainTable } from './_shared/tenant.js';

function publicTenantSummary(row) {
  if (!row) return null;
  let brand = {};
  try { brand = JSON.parse(row.brand_json || '{}'); } catch { brand = {}; }
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    domain: row.domain || '',
    subdomain: row.subdomain || '',
    brand,
  };
}

function normalizeLookup(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

function tenantUrl(tenant, domainRow) {
  const hostname = domainRow?.hostname || tenant.domain || tenant.subdomain || '';
  if (!hostname) return '';
  return `https://${String(hostname).replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
}

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const lookup = normalizeLookup(url.searchParams.get('q'));
    if (!lookup) return jsonResponse({ ok: false, error: 'Escribe el nombre o dominio del negocio.' }, 400);

    const db = requireDb(env);
    await ensurePlatformTables(env);
    await ensureTenantDomainTable(env);

    const tenant = await db.prepare(`
      SELECT *
      FROM saas_tenants
      WHERE status IN ('trial', 'active', 'past_due')
        AND (
          lower(slug) = lower(?)
          OR lower(domain) = lower(?)
          OR lower(subdomain) = lower(?)
          OR lower(replace(domain, 'www.', '')) = lower(?)
        )
      LIMIT 1
    `).bind(lookup, lookup, lookup, lookup).first();

    const domainRow = tenant
      ? await db.prepare(`
          SELECT *
          FROM saas_tenant_domains
          WHERE tenant_id = ? AND status IN ('active', 'pending', 'pending_validation')
          ORDER BY CASE
            WHEN lower(hostname) = lower(?) THEN 0
            WHEN kind = 'custom' THEN 1
            ELSE 2
          END, created_at_utc DESC
          LIMIT 1
        `).bind(tenant.id, lookup).first()
      : await db.prepare(`
          SELECT d.*, t.id AS tenant_id, t.slug, t.name, t.status, t.plan, t.domain, t.subdomain, t.brand_json, t.settings_json,
                 t.created_at_utc, t.updated_at_utc
          FROM saas_tenant_domains d
          JOIN saas_tenants t ON t.id = d.tenant_id
          WHERE t.status IN ('trial', 'active', 'past_due') AND lower(d.hostname) = lower(?)
          LIMIT 1
        `).bind(lookup).first();

    const resolvedTenant = tenant || domainRow;
    if (!resolvedTenant) return jsonResponse({ ok: false, error: 'No encontre ese negocio.' }, 404);

    const target = tenantUrl(resolvedTenant, domainRow);
    if (!target) return jsonResponse({ ok: false, error: 'Ese negocio aun no tiene dominio configurado.' }, 409);

    return jsonResponse({
      ok: true,
      business: publicTenantSummary(resolvedTenant),
      url: target,
      adminUrl: `${target.replace(/\/+$/, '')}/admin`,
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo buscar el negocio.', detail: error.message }, 500);
  }
}
