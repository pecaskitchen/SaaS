import { jsonResponse, requireDb } from '../_shared/http.js';
import { resolveTenantId, UNRESOLVED_TENANT_ID } from '../_shared/tenant.js';

const ASSET_PATTERN = /^([a-z0-9-]+)-(480|960|1600)\.webp$/i;

export async function onRequestGet({ request, env, params }) {
  try {
    const match = String(params.asset || '').match(ASSET_PATTERN);
    if (!match) return jsonResponse({ ok: false, error: 'Imagen no encontrada.' }, 404);
    const tenantId = await resolveTenantId(request, env);
    if (tenantId === UNRESOLVED_TENANT_ID) return jsonResponse({ ok: false, error: 'Imagen no encontrada.' }, 404);
    const [, assetId, widthText] = match;
    const width = Number(widthText);
    let bytes;
    if (env.MEDIA_BUCKET) {
      const object = await env.MEDIA_BUCKET.get(`${tenantId}/${assetId}/${width}.webp`);
      if (!object) return jsonResponse({ ok: false, error: 'Imagen no encontrada.' }, 404);
      bytes = object.body;
    } else {
      const db = requireDb(env);
      const row = await db.prepare(`SELECT data FROM media_assets WHERE tenant_id = ? AND asset_id = ? AND width = ? LIMIT 1`).bind(tenantId, assetId, width).first();
      if (!row?.data) return jsonResponse({ ok: false, error: 'Imagen no encontrada.' }, 404);
      bytes = row.data;
    }
    return new Response(bytes, { headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo cargar la imagen.', detail: error.message }, 500);
  }
}
