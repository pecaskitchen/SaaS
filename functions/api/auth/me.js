import { jsonResponse } from '../_shared/http.js';
import { requireAuth } from '../_shared/auth.js';

export async function onRequestGet({ request, env }) {
  const auth = await requireAuth(request, env, []);
  if (!auth.ok) return auth.response;

  const { userId, tenantId, role, name, email } = auth.session;
  return jsonResponse({ ok: true, user: { id: userId, tenantId, role, name, email } });
}
