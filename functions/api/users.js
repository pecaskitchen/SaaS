import { jsonResponse, readJson, requireDb, nowIso } from './_shared/http.js';
import { hashPassword } from './_shared/crypto.js';
import { requireAuth } from './_shared/auth.js';
import { resolveTenantId } from './_shared/tenant.js';

// CRUD de empleados para el login unificado (ver plan de rediseno de
// roles/menus/login). Gateado a admin/platform_admin: solo el dueno del
// negocio (o plataforma) puede crear/editar cuentas de su equipo.
// No incluye DELETE real -- se desactiva con status='inactive' para no
// perder el historial de auditoria (ordenes, sesiones, etc. referencian
// user_id).
const ALLOWED_ROLES = ['admin', 'manager', 'cashier', 'orders', 'inventory', 'reports'];

async function checkAuth(request, env) {
  return requireAuth(request, env, ['admin', 'platform_admin']);
}

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    lastLoginAtUtc: row.last_login_at_utc || null,
    createdAtUtc: row.created_at_utc,
  };
}

async function revokeSessions(db, userId) {
  await db.prepare(`DELETE FROM user_sessions WHERE user_id = ?`).bind(userId).run();
}

export async function onRequestGet({ request, env }) {
  try {
    const auth = await checkAuth(request, env);
    if (!auth.ok) return auth.response;
    const db = requireDb(env);
    const tenantId = await resolveTenantId(request, env);
    const rows = await db.prepare(
      `SELECT id, name, email, role, status, last_login_at_utc, created_at_utc
       FROM users WHERE tenant_id = ? ORDER BY created_at_utc ASC`
    ).bind(tenantId).all();
    return jsonResponse({ ok: true, users: (rows.results || []).map(publicUser) });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo cargar la lista de usuarios.', detail: error.message }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const auth = await checkAuth(request, env);
    if (!auth.ok) return auth.response;
    const db = requireDb(env);
    const tenantId = await resolveTenantId(request, env);
    const body = await readJson(request);
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const role = String(body.role || '').trim();

    if (!name || !email || !password || !role) {
      return jsonResponse({ ok: false, error: 'Nombre, email, password y rol son obligatorios.' }, 400);
    }
    if (!ALLOWED_ROLES.includes(role)) {
      return jsonResponse({ ok: false, error: 'Rol invalido.' }, 400);
    }
    if (password.length < 8) {
      return jsonResponse({ ok: false, error: 'La contrasena debe tener al menos 8 caracteres.' }, 400);
    }

    const existing = await db.prepare(
      `SELECT id FROM users WHERE tenant_id = ? AND lower(email) = lower(?) LIMIT 1`
    ).bind(tenantId, email).first();
    if (existing) {
      return jsonResponse({ ok: false, error: 'Ya existe un usuario con ese email.' }, 409);
    }

    const id = crypto.randomUUID();
    const passwordHash = await hashPassword(password);
    const now = nowIso();
    await db.prepare(`
      INSERT INTO users (id, tenant_id, email, name, password_hash, role, status, created_at_utc, updated_at_utc)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).bind(id, tenantId, email, name, passwordHash, role, now, now).run();

    return jsonResponse({
      ok: true,
      user: { id, name, email, role, status: 'active', lastLoginAtUtc: null, createdAtUtc: now },
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo crear el usuario.', detail: error.message }, 500);
  }
}

export async function onRequestPatch({ request, env }) {
  try {
    const auth = await checkAuth(request, env);
    if (!auth.ok) return auth.response;
    const db = requireDb(env);
    const tenantId = await resolveTenantId(request, env);
    const body = await readJson(request);
    const id = String(body.id || '').trim();
    if (!id) return jsonResponse({ ok: false, error: 'Falta el id del usuario.' }, 400);

    const user = await db.prepare(`SELECT id FROM users WHERE id = ? AND tenant_id = ? LIMIT 1`).bind(id, tenantId).first();
    if (!user) return jsonResponse({ ok: false, error: 'Usuario no encontrado.' }, 404);

    const sets = [];
    const values = [];
    let mustRevokeSessions = false;

    if (body.name !== undefined) {
      const name = String(body.name || '').trim();
      if (!name) return jsonResponse({ ok: false, error: 'El nombre no puede quedar vacio.' }, 400);
      sets.push('name = ?');
      values.push(name);
    }
    if (body.role !== undefined) {
      const role = String(body.role || '').trim();
      if (!ALLOWED_ROLES.includes(role)) return jsonResponse({ ok: false, error: 'Rol invalido.' }, 400);
      sets.push('role = ?');
      values.push(role);
      mustRevokeSessions = true;
    }
    if (body.status !== undefined) {
      const status = String(body.status || '').trim();
      if (!['active', 'inactive'].includes(status)) return jsonResponse({ ok: false, error: 'Status invalido.' }, 400);
      sets.push('status = ?');
      values.push(status);
      if (status === 'inactive') mustRevokeSessions = true;
    }
    if (body.password) {
      const password = String(body.password);
      if (password.length < 8) return jsonResponse({ ok: false, error: 'La contrasena debe tener al menos 8 caracteres.' }, 400);
      sets.push('password_hash = ?');
      values.push(await hashPassword(password));
      mustRevokeSessions = true;
    }
    if (!sets.length) return jsonResponse({ ok: false, error: 'No hay cambios que guardar.' }, 400);

    sets.push('updated_at_utc = ?');
    values.push(nowIso());
    values.push(id, tenantId);
    await db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`).bind(...values).run();

    // Cambios sensibles (rol, password, baja) invalidan sesiones activas de
    // inmediato en vez de esperar hasta 12h a que expire el JWT viejo.
    if (mustRevokeSessions) await revokeSessions(db, id);

    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo actualizar el usuario.', detail: error.message }, 500);
  }
}
