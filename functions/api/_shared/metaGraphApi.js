// Helpers genericos de la Graph API de Meta, compartidos entre
// whatsapp.js y metaMessaging.js (antes duplicados byte a byte en
// ambos archivos).

// -----------------------------------------------------------------------
// Versión de la Graph API — Meta deprecha versiones viejas en un
// calendario público. Verifica la versión vigente antes de desplegar:
// https://developers.facebook.com/docs/graph-api/changelog
// -----------------------------------------------------------------------
export function graphVersion(env) {
  return env.META_GRAPH_API_VERSION || 'v22.0';
}

export function graphUrl(env, path) {
  return `https://graph.facebook.com/${graphVersion(env)}/${path}`;
}

// -----------------------------------------------------------------------
// Verificación de firma de webhook (X-Hub-Signature-256, App Secret)
// -----------------------------------------------------------------------
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyMetaWebhookSignature(request, env, rawBody) {
  const header = request.headers.get('x-hub-signature-256') || '';
  const provided = header.startsWith('sha256=') ? header.slice('sha256='.length) : '';
  if (!provided || !env.META_APP_SECRET) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.META_APP_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const expected = Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqual(expected, provided);
}
