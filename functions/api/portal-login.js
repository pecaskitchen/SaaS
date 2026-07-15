import { ensureSessionsTable, jwtSecret } from './_shared/auth.js';
import { hashPassword, isLegacyPasswordHash, signToken, verifyPassword } from './_shared/crypto.js';
import { jsonResponse, nowIso, readJson, requireDb } from './_shared/http.js';
import { ensurePlatformTables } from './_shared/platform.js';
import { ensureTenantDomainTable } from './_shared/tenant.js';

const SESSION_TTL_SECONDS = 60 * 60 * 12;

function normalizeLookup(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

function tenantUrl(tenant, domainRow) {
  const hostname = domainRow?.hostname || tenant?.domain || tenant?.subdomain || '';
  if (!hostname) return '';
  return `https://${String(hostname).replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
}

async function findTenant(env, lookup) {
  const db = requireDb(env);
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
  if (!resolvedTenant) return null;
  return { tenant: resolvedTenant, domainRow };
}

async function createSession(env, user, password) {
  const db = requireDb(env);
  if (isLegacyPasswordHash(user.password_hash)) {
    try {
      const upgraded = await hashPassword(password);
      await db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).bind(upgraded, user.id).run();
    } catch {
      // Keep login working even if the transparent upgrade fails.
    }
  }

  const sessionId = crypto.randomUUID();
  const expiresAtUtc = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await db.prepare(`
    INSERT INTO user_sessions (id, tenant_id, user_id, role, expires_at_utc, created_at_utc)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(sessionId, user.tenant_id, user.id, user.role, expiresAtUtc, nowIso()).run();

  const token = await signToken({
    userId: user.id,
    tenantId: user.tenant_id,
    role: user.role,
    name: user.name,
    email: user.email,
    sessionId,
  }, jwtSecret(env), SESSION_TTL_SECONDS);

  try {
    await db.prepare(`UPDATE users SET last_login_at_utc = ? WHERE id = ?`).bind(nowIso(), user.id).run();
  } catch {
    // Optional column.
  }

  return { token, expiresAtUtc };
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await readJson(request);
    const lookup = normalizeLookup(body.business || body.lookup || body.tenant || '');
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!email || !password) return jsonResponse({ ok: false, error: 'Email y contrasena son obligatorios.' }, 400);

    const db = requireDb(env);
    await ensurePlatformTables(env);
    await ensureTenantDomainTable(env);
    await ensureSessionsTable(env);

    let user = null;
    let targetUrl = '';
    let next = 'panel';

    if (lookup) {
      const resolved = await findTenant(env, lookup);
      if (!resolved?.tenant) return jsonResponse({ ok: false, error: 'No encontre ese negocio.' }, 404);
      targetUrl = tenantUrl(resolved.tenant, resolved.domainRow);
      if (!targetUrl) return jsonResponse({ ok: false, error: 'Ese negocio aun no tiene dominio configurado.' }, 409);
      const tenantId = resolved.tenant.tenant_id || resolved.tenant.id;
      user = await db.prepare(`
        SELECT *
        FROM users
        WHERE tenant_id = ? AND lower(email) = lower(?) AND status = 'active'
        LIMIT 1
      `).bind(tenantId, email).first();
    } else {
      user = await db.prepare(`
        SELECT *
        FROM users
        WHERE role = 'platform_admin' AND lower(email) = lower(?) AND status = 'active'
        LIMIT 1
      `).bind(email).first();
      targetUrl = new URL(request.url).origin;
      next = 'plataforma';
    }

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return jsonResponse({ ok: false, error: 'Credenciales invalidas.' }, 401);
    }

    const session = await createSession(env, user, password);
    const redirectUrl = `${targetUrl.replace(/\/+$/, '')}/#login-token=${encodeURIComponent(session.token)}&next=${encodeURIComponent(next)}`;

    return jsonResponse({
      ok: true,
      redirectUrl,
      expiresAtUtc: session.expiresAtUtc,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, tenantId: user.tenant_id },
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo iniciar sesion desde Omdexa.', detail: error.message }, 500);
  }
}
