import { jsonResponse } from '../../_shared/http.js';
import { requireAuth } from '../../_shared/auth.js';

// appId y configId NO son secretos (viajan al navegador en cualquier
// integración de Embedded Signup) — pero igual esto queda detrás de login
// de admin para no exponer que este tenant está configurando WhatsApp a
// visitantes anónimos.
export async function onRequestGet({ request, env }) {
  const auth = await requireAuth(request, env, ['admin', 'platform_admin']);
  if (!auth.ok) return auth.response;

  if (!env.META_APP_ID || !env.META_CONFIG_ID) {
    return jsonResponse({ ok: false, error: 'WhatsApp no está configurado en este servidor (faltan META_APP_ID / META_CONFIG_ID).' }, 500);
  }

  return jsonResponse({
    ok: true,
    appId: env.META_APP_ID,
    configId: env.META_CONFIG_ID,
    graphVersion: env.META_GRAPH_API_VERSION || 'v22.0',
  });
}
