// Resolución del tenantId para endpoints de integración (status/disconnect
// de mercadopago, whatsapp, meta-page, instagram-login) -- antes era el
// mismo bloque de ~5 líneas copiado en los 8 archivos.
//
// Regla: el tenant SIEMPRE sale de la sesión verificada, salvo
// platform_admin, que administra conexiones de cualquier tenant (ej. para
// dar soporte) y por eso puede mandarlo explícito.

// Para endpoints GET (status.js) -- el tenantId de platform_admin viene
// por query string.
export function resolveIntegrationTenantIdFromQuery(auth, request) {
  let tenantId = auth.session.tenantId;
  if (auth.session.role === 'platform_admin') {
    const url = new URL(request.url);
    tenantId = url.searchParams.get('tenantId') || tenantId;
  }
  return tenantId;
}

// Para endpoints POST (disconnect.js/complete.js) -- el tenantId de
// platform_admin viene en el body ya parseado.
export function resolveIntegrationTenantIdFromBody(auth, body) {
  let tenantId = auth.session.tenantId;
  if (auth.session.role === 'platform_admin') {
    tenantId = String(body.tenantId || tenantId || '').trim();
  }
  return tenantId;
}
