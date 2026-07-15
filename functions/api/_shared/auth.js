import { jsonResponse, requireDb } from './http.js';
import { verifyToken } from './crypto.js';
import { resolveTenantId } from './tenant.js';

// ---------------------------------------------------------------------------
// Sistema de autenticación por usuario (JWT), Fase 2 del roadmap.
// Reemplaza las contraseñas globales por rol (env.ADMIN_PASSWORD, etc.) por
// sesiones firmadas con tenant_id + role embebidos, verificadas en cada
// petición. Ver auditoria-saas-multitenant.md, hallazgos #3 y #6.
// ---------------------------------------------------------------------------

export function jwtSecret(env) {
  const secret = env.JWT_SECRET || env.PLATFORM_ADMIN_TOKEN || env.ADMIN_PASSWORD || '';
  if (!secret) throw new Error('No hay JWT_SECRET configurado en el Worker.');
  return secret;
}

function bearerToken(request) {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

export async function ensureSessionsTable(env) {
  const db = requireDb(env);
  await db.prepare(`CREATE TABLE IF NOT EXISTS user_sessions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    expires_at_utc TEXT NOT NULL,
    created_at_utc TEXT NOT NULL
  )`).run();
}

/**
 * Verifica el JWT de la petición, confirma que su tenant_id coincide con el
 * tenant resuelto por hostname (salvo platform_admin, que puede operar sobre
 * cualquiera), confirma que el rol está permitido, y confirma que la sesión
 * sigue activa en D1 (permite revocar por logout o baja de empleado sin
 * esperar a que expire el token).
 *
 * @param {Request} request
 * @param {object} env
 * @param {string[]} allowedRoles - vacío = cualquier usuario autenticado sirve
 * @returns {{ok:true, session:object}|{ok:false, response:Response}}
 */
export async function requireAuth(request, env, allowedRoles = []) {
  const token = bearerToken(request);
  if (!token) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'Falta iniciar sesión.' }, 401) };
  }

  let payload;
  try {
    payload = await verifyToken(token, jwtSecret(env));
  } catch {
    return { ok: false, response: jsonResponse({ ok: false, error: 'Sesión inválida o expirada.' }, 401) };
  }

  if (payload.role !== 'platform_admin') {
    const tenantId = await resolveTenantId(request, env);
    if (!payload.tenantId || payload.tenantId !== tenantId) {
      return { ok: false, response: jsonResponse({ ok: false, error: 'La sesión no pertenece a este negocio.' }, 403) };
    }
  }

  if (allowedRoles.length && !allowedRoles.includes(payload.role)) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'Tu rol no tiene permiso para esta acción.' }, 403) };
  }

  if (payload.sessionId) {
    try {
      const db = requireDb(env);
      const row = await db.prepare(`SELECT id FROM user_sessions WHERE id = ? AND user_id = ? LIMIT 1`)
        .bind(payload.sessionId, payload.userId).first();
      if (!row) {
        return { ok: false, response: jsonResponse({ ok: false, error: 'Tu sesión fue cerrada. Inicia sesión de nuevo.' }, 401) };
      }
    } catch {
      // La tabla podría no existir aún si no se corrió la migración 002;
      // no bloqueamos por eso, pero perdemos la capacidad de revocar.
    }
  }

  return { ok: true, session: payload };
}

export function platformToken(env) {
  return env.PLATFORM_ADMIN_TOKEN || env.PLATFORM_ADMIN_PASSWORD || '';
}

export function requestToken(request) {
  return request.headers.get('x-platform-admin-token') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
}

// Rediseno de roles: acepta el token estatico de plataforma (como antes)
// O una sesion JWT real con rol platform_admin, para que el login unificado
// tambien sirva para entrar al panel de Plataforma. El token estatico NO se
// retira todavia -- coexiste hasta Fase B (ver plan de rediseno de roles).
export async function requirePlatformAdmin(request, env) {
  const expected = platformToken(env);
  const provided = requestToken(request);
  if (expected && provided === expected) {
    return { ok: true };
  }

  if (provided) {
    try {
      const payload = await verifyToken(provided, jwtSecret(env));
      if (payload.role === 'platform_admin') {
        if (payload.sessionId) {
          try {
            const db = requireDb(env);
            const row = await db.prepare(`SELECT id FROM user_sessions WHERE id = ? AND user_id = ? LIMIT 1`)
              .bind(payload.sessionId, payload.userId).first();
            if (!row) {
              return { ok: false, response: jsonResponse({ ok: false, error: 'Tu sesión fue cerrada. Inicia sesión de nuevo.' }, 401) };
            }
          } catch {
            // La tabla podría no existir aún; no bloqueamos por eso.
          }
        }
        return { ok: true, session: payload };
      }
    } catch {
      // No era un JWT valido; cae al 401 generico de abajo.
    }
  }

  return { ok: false, response: jsonResponse({ ok: false, error: 'No autorizado como admin de plataforma.' }, 401) };
}
