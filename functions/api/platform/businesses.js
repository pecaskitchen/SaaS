import { requirePlatformAdmin } from '../_shared/auth.js';
import { jsonResponse, readJson } from '../_shared/http.js';
import { createTenant, listTenants, updateTenant } from '../_shared/platform.js';

export async function onRequestGet({ request, env }) {
  try {
    const auth = requirePlatformAdmin(request, env);
    if (!auth.ok) return auth.response;
    const businesses = await listTenants(env);
    return jsonResponse({ ok: true, businesses });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudieron cargar los negocios.', detail: error.message }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const auth = requirePlatformAdmin(request, env);
    if (!auth.ok) return auth.response;
    const body = await readJson(request);
    const business = await createTenant(env, body);
    return jsonResponse({ ok: true, business }, 201);
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo crear el negocio.', detail: error.message }, 400);
  }
}

export async function onRequestPatch({ request, env }) {
  try {
    const auth = requirePlatformAdmin(request, env);
    if (!auth.ok) return auth.response;
    const body = await readJson(request);
    const tenantId = String(body.id || '').trim();
    if (!tenantId) return jsonResponse({ ok: false, error: 'Falta id del negocio.' }, 400);
    const business = await updateTenant(env, tenantId, body);
    return jsonResponse({ ok: true, business });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo actualizar el negocio.', detail: error.message }, 400);
  }
}
