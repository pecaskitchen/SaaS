import { requirePlatformAdmin } from '../_shared/auth.js';
import { jsonResponse, readJson } from '../_shared/http.js';
import { readOmdexaConfig, saveOmdexaConfig } from '../_shared/omdexaConfig.js';

export async function onRequestGet({ request, env }) {
  try {
    const auth = requirePlatformAdmin(request, env);
    if (!auth.ok) return auth.response;
    const config = await readOmdexaConfig(env);
    return jsonResponse({ ok: true, config });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo cargar la configuracion de Omdexa.', detail: error.message }, 500);
  }
}

export async function onRequestPatch({ request, env }) {
  try {
    const auth = requirePlatformAdmin(request, env);
    if (!auth.ok) return auth.response;
    const body = await readJson(request);
    const config = await saveOmdexaConfig(env, body.config || body);
    return jsonResponse({ ok: true, config });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo guardar la configuracion de Omdexa.', detail: error.message }, 400);
  }
}
