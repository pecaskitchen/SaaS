import { jsonResponse, readJson, requireDb } from '../_shared/http.js';
import { ensureClubSchema, requireClubAuth, validateRedemptionForItems } from '../_shared/pecasClub.js';

export async function onRequestPost({ request, env }) {
  try {
    await ensureClubSchema(env);
    const auth = await requireClubAuth(request, env);
    if (!auth.ok) return auth.response;
    const body = await readJson(request);
    const redemption = await validateRedemptionForItems(requireDb(env), {
      tenantId: auth.tenant.id,
      customerId: auth.customer.id,
      code: body.code,
      items: Array.isArray(body.items) ? body.items : [],
    });
    return jsonResponse({ ok: true, redemption });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || 'No se pudo validar el código.' }, error.status || 500);
  }
}
