import { jsonResponse } from './_shared/http.js';
import { readOmdexaConfig } from './_shared/omdexaConfig.js';

export async function onRequestGet({ env }) {
  try {
    const config = await readOmdexaConfig(env);
    return jsonResponse({ ok: true, config });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo cargar la configuracion de Omdexa.', detail: error.message }, 500);
  }
}
