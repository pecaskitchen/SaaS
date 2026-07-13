import { jsonResponse, readJson, requireDb } from '../../_shared/http.js';
import { requireAuth } from '../../_shared/auth.js';
import { encryptSecret } from '../../_shared/payments.js';
import {
  ensureWhatsappTables,
  exchangeCodeForToken,
  registerPhoneNumber,
  subscribeAppToWaba,
  fetchDisplayPhoneNumber,
} from '../../_shared/whatsapp.js';

// El popup de Embedded Signup (Facebook Login) corre ENTERAMENTE en el
// navegador — a diferencia de Mercado Pago no hay "URL de autorización"
// que generar en el backend. El frontend llama a este endpoint DESPUÉS de
// que el popup termina, con el code + waba_id + phone_number_id que
// devolvió el SDK de Facebook.
export async function onRequestPost({ request, env }) {
  try {
    const auth = await requireAuth(request, env, ['admin', 'platform_admin']);
    if (!auth.ok) return auth.response;

    const body = await readJson(request);
    let tenantId = auth.session.tenantId;
    if (auth.session.role === 'platform_admin') {
      tenantId = String(body.tenantId || tenantId || '').trim();
    }
    const code = String(body.code || '').trim();
    const wabaId = String(body.wabaId || body.waba_id || '').trim();
    const phoneNumberId = String(body.phoneNumberId || body.phone_number_id || '').trim();

    if (!tenantId) return jsonResponse({ ok: false, error: 'Falta tenantId.' }, 400);
    if (!code || !wabaId || !phoneNumberId) {
      return jsonResponse({ ok: false, error: 'Faltan datos del Embedded Signup (code, wabaId, phoneNumberId).' }, 400);
    }

    const db = requireDb(env);
    await ensureWhatsappTables(env);

    await db.prepare(`
      INSERT INTO tenant_whatsapp_connections (id, tenant_id, connection_status, created_at, updated_at)
      VALUES (?, ?, 'connecting', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(tenant_id) DO UPDATE SET connection_status = 'connecting', updated_at = CURRENT_TIMESTAMP
    `).bind(crypto.randomUUID(), tenantId).run();

    const tokenData = await exchangeCodeForToken(env, code);
    const accessToken = tokenData.access_token;

    // Registrar el número para Cloud API (no queda listo solo con
    // Embedded Signup) y suscribir el webhook de la app a este WABA.
    await registerPhoneNumber(env, phoneNumberId, accessToken);
    await subscribeAppToWaba(env, wabaId, accessToken);
    const { displayPhoneNumber, businessName } = await fetchDisplayPhoneNumber(env, phoneNumberId, accessToken);

    // expires_in no siempre viene — si no viene, se asume 60 días (el
    // template más común de configuración de Embedded Signup). Ajusta
    // según la configuración real de tu app.
    const expiresInSeconds = Number(tokenData.expires_in || 60 * 24 * 60 * 60);
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

    await db.prepare(`
      UPDATE tenant_whatsapp_connections
      SET waba_id = ?, phone_number_id = ?, display_phone_number = ?, business_name = ?,
          access_token_encrypted = ?, token_expires_at = ?,
          connection_status = 'connected', connected_at = CURRENT_TIMESTAMP, disconnected_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = ?
    `).bind(wabaId, phoneNumberId, displayPhoneNumber, businessName, await encryptSecret(accessToken, env), expiresAt, tenantId).run();

    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || 'No se pudo completar la conexión de WhatsApp.' }, error.status || 500);
  }
}
