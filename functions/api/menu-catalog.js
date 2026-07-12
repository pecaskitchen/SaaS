import { resolveTenantId } from './_shared/tenant.js';
import { requireAuth } from './_shared/auth.js';
import { emptySavedMenu, jsonResponse, readCatalogTables, saveCatalogTables } from './_shared/menuCatalog.js';

async function checkAuth(request, env) {
  return requireAuth(request, env, ['admin', 'platform_admin']);
}

export async function onRequestGet({ request, env }) {
  const auth = await checkAuth(request, env);
  if (!auth.ok) return auth.response;
  const tenantId = await resolveTenantId(request, env);
  const catalog = await readCatalogTables(env, tenantId);
  return jsonResponse({ ok: true, ...(catalog || emptySavedMenu()), catalogSource: catalog ? 'tables' : 'empty' });
}

export async function onRequestPost({ request, env }) {
  try {
    const auth = await checkAuth(request, env);
    if (!auth.ok) return auth.response;
    const tenantId = await resolveTenantId(request, env);
    const body = await request.json();
    const result = await saveCatalogTables(env, tenantId, body || {});
    const catalog = await readCatalogTables(env, tenantId);
    return jsonResponse({ ok: true, ...(catalog || emptySavedMenu()), catalogSource: 'tables', mojibakeWarnings: result.mojibakeWarnings || [] });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.validationErrors ? 'El catalogo tiene errores.' : 'No se pudo guardar el catalogo.', detail: error.message, validationErrors: error.validationErrors || [] }, error.validationErrors ? 400 : 500);
  }
}
