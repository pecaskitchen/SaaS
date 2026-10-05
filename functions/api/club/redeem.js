import { jsonResponse, readJson, requireDb } from '../_shared/http.js';
import { createRedemption, ensureClubSchema, requireClubAuth } from '../_shared/pecasClub.js';

export async function onRequestPost({ request, env }) {
  try {
    await ensureClubSchema(env);
    const auth = await requireClubAuth(request, env);
    if (!auth.ok) return auth.response;
    const body = await readJson(request);
    if (!body.rewardId) return jsonResponse({ ok: false, error: 'Selecciona una recompensa.' }, 400);
    const redemption = await createRedemption(requireDb(env), { tenantId: auth.tenant.id, customerId: auth.customer.id, rewardId: String(body.rewardId) });
    return jsonResponse({ ok: true, redemption });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || 'No se pudo realizar el canje.' }, error.status || 500);
  }
}
