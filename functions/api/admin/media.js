import { requireAuth } from '../_shared/auth.js';
import { jsonResponse, requireDb } from '../_shared/http.js';
import { resolveTenantId } from '../_shared/tenant.js';

const VARIANTS = [480, 960, 1600];
const MAX_VARIANT_BYTES = 900_000;

async function ensureMediaTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS media_assets (
    tenant_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    width INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    data BLOB NOT NULL,
    created_at_utc TEXT NOT NULL,
    PRIMARY KEY (tenant_id, asset_id, width)
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_media_assets_tenant_created ON media_assets(tenant_id, created_at_utc)`).run();
}

export async function onRequestPost({ request, env }) {
  try {
    const auth = await requireAuth(request, env, ['admin', 'manager', 'platform_admin']);
    if (!auth.ok) return auth.response;
    const tenantId = await resolveTenantId(request, env);
    const form = await request.formData();
    const kind = String(form.get('kind') || 'image').replace(/[^a-z0-9-]/gi, '').slice(0, 24) || 'image';
    const assetId = `${kind}-${crypto.randomUUID()}`;
    const uploads = [];
    for (const width of VARIANTS) {
      const file = form.get(`image${width}`);
      if (!(file instanceof File) || file.size === 0) return jsonResponse({ ok: false, error: `Falta la variante de ${width}px.` }, 400);
      if (file.type !== 'image/webp') return jsonResponse({ ok: false, error: 'Las imágenes deben procesarse como WebP.' }, 400);
      if (file.size > MAX_VARIANT_BYTES) return jsonResponse({ ok: false, error: `La variante de ${width}px supera 900 KB.` }, 413);
      uploads.push({ width, bytes: await file.arrayBuffer(), size: file.size });
    }

    const now = new Date().toISOString();
    if (env.MEDIA_BUCKET) {
      await Promise.all(uploads.map(({ width, bytes }) => env.MEDIA_BUCKET.put(`${tenantId}/${assetId}/${width}.webp`, bytes, {
        httpMetadata: { contentType: 'image/webp', cacheControl: 'public, max-age=31536000, immutable' },
      })));
    } else {
      const db = requireDb(env);
      await ensureMediaTable(db);
      await db.batch(uploads.map(({ width, bytes, size }) => db.prepare(
        `INSERT INTO media_assets (tenant_id, asset_id, width, mime_type, byte_size, data, created_at_utc) VALUES (?, ?, ?, 'image/webp', ?, ?, ?)`
      ).bind(tenantId, assetId, width, size, bytes, now)));
    }

    const variants = Object.fromEntries(VARIANTS.map((width) => [width, `/api/media/${assetId}-${width}.webp`]));
    return jsonResponse({ ok: true, assetId, url: variants[1600], variants });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo subir la imagen.', detail: error.message }, 500);
  }
}
