import { jsonResponse, readJson, requireDb } from '../_shared/http.js';
import { makeId } from '../_shared/ids.js';

async function cloudflareRequest(env, path, options = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await response.json();
  if (!response.ok || data.success === false) throw new Error(data.errors?.[0]?.message || 'Error de Cloudflare.');
  return data.result;
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await readJson(request);
    const tenantId = String(body.tenantId || '').trim();
    const hostname = String(body.hostname || '').trim().toLowerCase();
    if (!tenantId || !hostname) return jsonResponse({ ok: false, error: 'tenantId y hostname son obligatorios.' }, 400);

    let cfHostname = null;
    if (env.CLOUDFLARE_ZONE_ID && env.CLOUDFLARE_API_TOKEN) {
      cfHostname = await cloudflareRequest(env, `/zones/${env.CLOUDFLARE_ZONE_ID}/custom_hostnames`, {
        method: 'POST',
        body: JSON.stringify({
          hostname,
          ssl: { method: 'http', type: 'dv', settings: { http2: 'on' } },
        }),
      });
    }

    const db = requireDb(env);
    const domainId = makeId('dom');
    await db.prepare(`INSERT INTO saas_tenant_domains (
      id, tenant_id, hostname, kind, status, cf_hostname_id, ssl_status, created_at_utc, updated_at_utc
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`)
      .bind(domainId, tenantId, hostname, 'custom', cfHostname ? 'pending_validation' : 'pending', cfHostname?.id || null, cfHostname?.ssl?.status || null)
      .run();

    return jsonResponse({ ok: true, domain: { id: domainId, tenantId, hostname, cfHostname } });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo crear el custom hostname.', detail: error.message }, 500);
  }
}

export async function onRequestGet({ env }) {
  try {
    const db = requireDb(env);
    const result = await db.prepare(`SELECT * FROM saas_tenant_domains ORDER BY created_at_utc DESC`).all();
    return jsonResponse({ ok: true, domains: result.results || [] });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudieron cargar dominios.', detail: error.message }, 500);
  }
}
