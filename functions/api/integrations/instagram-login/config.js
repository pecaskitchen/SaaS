import { jsonResponse } from '../../_shared/http.js';
import { requireAuth } from '../../_shared/auth.js';

// A diferencia de meta-page (Facebook Login for Business, popup del SDK de
// JS), Instagram API with Instagram Login es un redirect OAuth clásico --
// no hay popup ni postMessage, el navegador navega a
// instagram.com/oauth/authorize y vuelve a tu redirect_uri con ?code=...
export async function onRequestGet({ request, env }) {
  const auth = await requireAuth(request, env, ['admin', 'platform_admin']);
  if (!auth.ok) return auth.response;

  const appId = env.META_IG_APP_ID || env.META_APP_ID;
  const redirectUri = env.META_IG_REDIRECT_URI;
  if (!appId || !redirectUri) {
    return jsonResponse({ ok: false, error: 'Instagram (login directo) no está configurado en este servidor (faltan META_IG_APP_ID / META_IG_REDIRECT_URI).' }, 500);
  }

  const authorizationUrl = new URL('https://www.instagram.com/oauth/authorize');
  authorizationUrl.searchParams.set('client_id', appId);
  authorizationUrl.searchParams.set('redirect_uri', redirectUri);
  authorizationUrl.searchParams.set('response_type', 'code');
  // Verifica el nombre exacto de estos scopes contra la documentación
  // vigente de Meta antes de ir a producción -- este producto es más
  // nuevo y los nombres de permisos han cambiado de versión en versión.
  authorizationUrl.searchParams.set('scope', 'instagram_business_basic,instagram_business_manage_messages');

  return jsonResponse({ ok: true, authorizationUrl: authorizationUrl.toString() });
}
