import { jsonResponse, requireDb } from '../_shared/http.js';
import { requireAuth } from '../_shared/auth.js';

export async function onRequestPost({ request, env }) {
  const auth = await requireAuth(request, env, []);
  if (!auth.ok) return auth.response;

  try {
    if (auth.session.sessionId) {
      const db = requireDb(env);
      await db.prepare(`DELETE FROM user_sessions WHERE id = ?`).bind(auth.session.sessionId).run();
    }
  } catch { /* si falla el borrado, el token igual expira solo en <=12h */ }

  return jsonResponse({ ok: true });
}
