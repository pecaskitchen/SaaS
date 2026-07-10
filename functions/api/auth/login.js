import { jsonResponse, readJson, requireDb } from '../_shared/http.js';
import { verifyPassword, signToken } from '../_shared/crypto.js';

export async function onRequestPost({ request, env }) {
  try {
    const body = await readJson(request);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const hostname = new URL(request.url).hostname.toLowerCase();
    if (!email || !password) return jsonResponse({ ok: false, error: 'Email y password son obligatorios.' }, 400);

    const db = requireDb(env);
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
      return jsonResponse({ ok: false, error: 'Credenciales invalidas.' }, 401);
    }

    const token = await signToken({
      userId: user.id,
      tenantId: user.tenant_id,
      role: user.role,
      name: user.name,
      email: user.email,
    }, env.JWT_SECRET || env.PLATFORM_ADMIN_TOKEN || env.ADMIN_PASSWORD);

    return jsonResponse({
      ok: true,
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, tenantId: user.tenant_id },
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo iniciar sesion.', detail: error.message }, 500);
  }
}
