import { jsonResponse, readJson, requireDb, nowIso } from '../_shared/http.js';
import { verifyPassword, signToken, hashPassword, isLegacyPasswordHash } from '../_shared/crypto.js';
import { ensureSessionsTable, jwtSecret } from '../_shared/auth.js';
import { checkLoginRateLimit, clearLoginFailures, recordLoginFailure } from '../_shared/loginRateLimit.js';
import { ensurePlatformTables, safeJson } from '../_shared/platform.js';
import { normalizeTenantSettings } from '../_shared/tenantSettings.js';

const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 horas

async function tenantPayload(env, tenantId, role) {
  if (!tenantId || role === 'platform_admin') return null;
  try {
    const row = await requireDb(env).prepare(`
      SELECT id, slug, name, settings_json
      FROM saas_tenants
      WHERE id = ?
      LIMIT 1
    `).bind(tenantId).first();
    if (!row) return null;
    const settings = safeJson(row.settings_json, {});
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      settings: { ...settings, ...normalizeTenantSettings(settings, {}) },
    };
  } catch {
    return null;
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await readJson(request);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const hostname = new URL(request.url).hostname.toLowerCase();
    if (!email || !password) return jsonResponse({ ok: false, error: 'Email y password son obligatorios.' }, 400);

    const rate = await checkLoginRateLimit(env, request, email);
    if (rate.limited) {
      return jsonResponse({ ok: false, error: `Demasiados intentos. Espera ${rate.retryMinutes} minutos e intenta de nuevo.` }, 429);
    }

    const db = requireDb(env);
    await ensurePlatformTables(env);
    await ensureSessionsTable(env);

    const user = await db.prepare(`
      SELECT u.*, t.slug AS tenant_slug
      FROM users u
      LEFT JOIN saas_tenants t ON t.id = u.tenant_id
      LEFT JOIN saas_tenant_domains d ON d.tenant_id = t.id
      WHERE lower(u.email) = lower(?) AND u.status = 'active'
        AND (u.role = 'platform_admin' OR lower(d.hostname) = lower(?))
      LIMIT 1
    `).bind(email, hostname).first();
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      await recordLoginFailure(env, request, email);
      return jsonResponse({ ok: false, error: 'Credenciales invalidas.' }, 401);
    }

    await clearLoginFailures(env, request, email);

    if (isLegacyPasswordHash(user.password_hash)) {
      try {
        const upgraded = await hashPassword(password);
        await db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).bind(upgraded, user.id).run();
      } catch { /* no bloquear el login si el upgrade falla */ }
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
    } catch { /* columna opcional, no bloquear el login */ }

    return jsonResponse({
      ok: true,
      token,
      expiresAtUtc,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenant_id,
        tenant: await tenantPayload(env, user.tenant_id, user.role),
      },
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo iniciar sesion.', detail: error.message }, 500);
  }
}
