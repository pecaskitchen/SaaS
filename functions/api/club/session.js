import { checkLoginRateLimit, clearLoginFailures, recordLoginFailure } from '../_shared/loginRateLimit.js';
import { jsonResponse, nowIso, readJson, requireDb } from '../_shared/http.js';
import {
  authenticateClubCustomer,
  CLUB_PRIVACY_VERSION,
  CLUB_TERMS_VERSION,
  createClubSession,
  ensureClubSchema,
  ensurePecasTenant,
  hashPassword,
  normalizePhone,
  requireClubAuth,
  uniqueReferralCode,
} from '../_shared/pecasClub.js';

function validEmail(value) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function publicCustomer(customer) {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email || '',
    birthdayDay: customer.birthday_day || null,
    birthdayMonth: customer.birthday_month || null,
    referralCode: customer.referral_code,
    marketingConsent: Boolean(customer.marketing_consent),
  };
}

export async function onRequestPost({ request, env }) {
  try {
    const tenant = await ensurePecasTenant(request, env);
    await ensureClubSchema(env);
    const body = await readJson(request);
    const action = String(body.action || 'login').toLowerCase();
    const phone = normalizePhone(body.phone);
    const pin = String(body.pin || '');
    if (phone.length < 10 || phone.length > 15) return jsonResponse({ ok: false, error: 'Ingresa un número celular válido.' }, 400);
    if (!/^\d{6}$/.test(pin)) return jsonResponse({ ok: false, error: 'El PIN debe tener exactamente seis dígitos.' }, 400);

    const rate = await checkLoginRateLimit(env, request, `club:${phone}`);
    if (rate.limited) return jsonResponse({ ok: false, error: `Demasiados intentos. Espera ${rate.retryMinutes} minutos.` }, 429);

    const db = requireDb(env);
    if (action === 'register') {
      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const referralCode = String(body.referralCode || '').trim().toUpperCase();
      const birthdayDay = body.birthdayDay ? Number(body.birthdayDay) : null;
      const birthdayMonth = body.birthdayMonth ? Number(body.birthdayMonth) : null;
      if (name.length < 2) return jsonResponse({ ok: false, error: 'Ingresa tu nombre.' }, 400);
      if (!validEmail(email)) return jsonResponse({ ok: false, error: 'El correo no es válido.' }, 400);
      if (body.acceptPrivacy !== true) return jsonResponse({ ok: false, error: 'Debes aceptar el Aviso de Privacidad y los términos.' }, 400);
      if ((birthdayDay && (!birthdayMonth || birthdayDay < 1 || birthdayDay > 31)) || (birthdayMonth && (birthdayMonth < 1 || birthdayMonth > 12))) {
        return jsonResponse({ ok: false, error: 'El día y mes de cumpleaños no son válidos.' }, 400);
      }
      const duplicatePhone = await db.prepare(`SELECT id FROM club_customers WHERE tenant_id = ? AND phone = ? LIMIT 1`).bind(tenant.id, phone).first();
      if (duplicatePhone) return jsonResponse({ ok: false, error: 'Este celular ya tiene una cuenta. Inicia sesión.' }, 409);
      if (email) {
        const duplicateEmail = await db.prepare(`SELECT id FROM club_customers WHERE tenant_id = ? AND lower(email) = lower(?) LIMIT 1`).bind(tenant.id, email).first();
        if (duplicateEmail) return jsonResponse({ ok: false, error: 'Este correo ya pertenece a otra cuenta.' }, 409);
      }
      let referrer = null;
      if (referralCode) {
        referrer = await db.prepare(`SELECT id, phone, email FROM club_customers WHERE tenant_id = ? AND referral_code = ? AND status = 'active' LIMIT 1`).bind(tenant.id, referralCode).first();
        if (!referrer) return jsonResponse({ ok: false, error: 'El código de referido no existe.' }, 400);
        if (referrer.phone === phone || (email && referrer.email && referrer.email.toLowerCase() === email)) {
          return jsonResponse({ ok: false, error: 'No puedes usar tu propio código de referido.' }, 400);
        }
      }
      const now = nowIso();
      const customerId = crypto.randomUUID();
      const ownReferralCode = await uniqueReferralCode(db, tenant.id, name);
      const crm = await db.prepare(`SELECT id FROM crm_customers WHERE tenant_id = ? AND phone = ? LIMIT 1`).bind(tenant.id, phone).first().catch(() => null);
      await db.prepare(`
        INSERT INTO club_customers (
          id, tenant_id, crm_customer_id, name, phone, email, pin_hash,
          birthday_day, birthday_month, referral_code, referred_by_customer_id,
          privacy_notice_version, privacy_accepted_at_utc, terms_version, terms_accepted_at_utc,
          marketing_consent, marketing_consent_at_utc, created_at_utc, updated_at_utc
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        customerId, tenant.id, crm?.id || null, name, phone, email || null, await hashPassword(pin),
        birthdayDay, birthdayMonth, ownReferralCode, referrer?.id || null,
        CLUB_PRIVACY_VERSION, now, CLUB_TERMS_VERSION, now,
        body.marketingConsent === true ? 1 : 0, body.marketingConsent === true ? now : null, now, now,
      ).run();
      if (referrer) {
        await db.prepare(`INSERT INTO club_referrals (id, tenant_id, referrer_customer_id, referred_customer_id, status, referrer_points, referred_points, created_at_utc, updated_at_utc) VALUES (?, ?, ?, ?, 'pending', 5, 5, ?, ?)`)
          .bind(crypto.randomUUID(), tenant.id, referrer.id, customerId, now, now).run();
      }
      const customer = await db.prepare(`SELECT * FROM club_customers WHERE id = ?`).bind(customerId).first();
      const session = await createClubSession(env, customer);
      await clearLoginFailures(env, request, `club:${phone}`);
      return jsonResponse({ ok: true, ...session, customer: publicCustomer(customer) }, 201);
    }

    const customer = await authenticateClubCustomer(env, tenant.id, phone, pin);
    if (!customer) {
      await recordLoginFailure(env, request, `club:${phone}`);
      return jsonResponse({ ok: false, error: 'Celular o PIN incorrectos.' }, 401);
    }
    await clearLoginFailures(env, request, `club:${phone}`);
    return jsonResponse({ ok: true, ...(await createClubSession(env, customer)), customer: publicCustomer(customer) });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || 'No se pudo acceder a Pecas Club.' }, error.status || 500);
  }
}

export async function onRequestDelete({ request, env }) {
  await ensureClubSchema(env);
  const auth = await requireClubAuth(request, env);
  if (!auth.ok) return auth.response;
  await requireDb(env).prepare(`DELETE FROM club_sessions WHERE id = ? AND tenant_id = ? AND customer_id = ?`)
    .bind(auth.payload.sessionId, auth.tenant.id, auth.customer.id).run();
  return jsonResponse({ ok: true });
}
