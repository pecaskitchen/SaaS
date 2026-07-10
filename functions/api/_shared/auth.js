import { forbidden, unauthorized } from '../../../00-sin-cambio/functions/api/_shared/http.js';
import { verifyToken } from './crypto.js';

const permissions = {
  platform_admin: ['*'],
  business_admin: ['menu:*', 'orders:*', 'stock:*', 'reports:*', 'users:*'],
  manager: ['orders:*', 'stock:*', 'reports:read'],
  cashier: ['pos:*', 'orders:create'],
  orders: ['orders:read', 'orders:update'],
  stock: ['stock:read', 'stock:update'],
  viewer: ['reports:read'],
};

export async function readSession(request, env) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  return verifyToken(token, env.JWT_SECRET || env.PLATFORM_ADMIN_TOKEN || env.ADMIN_PASSWORD);
}

export async function requireSession(request, env) {
  try {
    const session = await readSession(request, env);
    if (!session?.userId || !session?.role) return { ok: false, response: unauthorized('Sesion requerida.') };
    return { ok: true, session };
  } catch (error) {
    return { ok: false, response: unauthorized(error.message) };
  }
}

export function requirePermission(session, permission) {
  const allowed = permissions[session.role] || [];
  const [scope] = permission.split(':');
  const ok = allowed.includes('*') || allowed.includes(permission) || allowed.includes(`${scope}:*`);
  if (!ok) return { ok: false, response: forbidden('Permiso insuficiente.') };
  return { ok: true };
}
