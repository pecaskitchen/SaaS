import { requireAuth } from '../_shared/auth.js';
import { jsonResponse, nowIso, readJson, requireDb } from '../_shared/http.js';
import { clubBalance, createRedemption, ensureClubSchema, ensurePecasTenant } from '../_shared/pecasClub.js';

async function access(request, env) {
  const tenant = await ensurePecasTenant(request, env);
  const auth = await requireAuth(request, env, ['admin', 'manager', 'platform_admin']);
  if (!auth.ok) return { response: auth.response };
  return { tenant, session: auth.session };
}

function reward(row) {
  return { id: row.id, name: row.name, description: row.description || '', pointsRequired: Number(row.points_required), estimatedCost: Number(row.estimated_cost || 0), active: Boolean(row.active), stock: row.stock === null ? null : Number(row.stock), sortOrder: Number(row.sort_order || 0) };
}

function promotion(row) {
  return { id: row.id, title: row.title, description: row.description || '', imageUrl: row.image_url || '', startsAtUtc: row.starts_at_utc || '', endsAtUtc: row.ends_at_utc || '', active: Boolean(row.active), terms: row.terms || '', sortOrder: Number(row.sort_order || 0) };
}

export async function onRequestGet({ request, env }) {
  try {
    await ensureClubSchema(env);
    const granted = await access(request, env);
    if (granted.response) return granted.response;
    const db = requireDb(env);
    const url = new URL(request.url);
    const q = String(url.searchParams.get('q') || '').trim();
    const customerId = String(url.searchParams.get('customer_id') || '');
    const like = `%${q.toLowerCase()}%`;
    const customersResult = await db.prepare(`
      SELECT c.*,
        COALESCE((SELECT SUM(t.points) FROM club_points_transactions t WHERE t.tenant_id = c.tenant_id AND t.customer_id = c.id), 0) AS balance,
        COALESCE(crm.order_count, 0) AS order_count,
        COALESCE(crm.total_spent, 0) AS total_spent,
        crm.last_order_at_utc
      FROM club_customers c
      LEFT JOIN crm_customers crm ON crm.tenant_id = c.tenant_id AND crm.phone = c.phone
      WHERE c.tenant_id = ? AND (? = '' OR lower(c.name) LIKE ? OR c.phone LIKE ? OR lower(COALESCE(c.email, '')) LIKE ?)
      ORDER BY c.updated_at_utc DESC LIMIT 100
    `).bind(granted.tenant.id, q, like, `%${q.replace(/\D/g, '')}%`, like).all();
    const [rewardsResult, promotionsResult, referralResult, transactionsResult] = await Promise.all([
      db.prepare(`SELECT * FROM club_rewards WHERE tenant_id = ? ORDER BY sort_order, points_required`).bind(granted.tenant.id).all(),
      db.prepare(`SELECT * FROM club_promotions WHERE tenant_id = ? ORDER BY sort_order, created_at_utc DESC`).bind(granted.tenant.id).all(),
      db.prepare(`SELECT r.*, a.name AS referrer_name, b.name AS referred_name FROM club_referrals r JOIN club_customers a ON a.id = r.referrer_customer_id JOIN club_customers b ON b.id = r.referred_customer_id WHERE r.tenant_id = ? AND r.status = 'under_review' ORDER BY r.updated_at_utc DESC`).bind(granted.tenant.id).all(),
      customerId ? db.prepare(`SELECT * FROM club_points_transactions WHERE tenant_id = ? AND customer_id = ? ORDER BY created_at_utc DESC LIMIT 100`).bind(granted.tenant.id, customerId).all() : Promise.resolve({ results: [] }),
    ]);
    return jsonResponse({
      ok: true,
      customers: (customersResult.results || []).map((row) => ({ id: row.id, name: row.name, phone: row.phone, email: row.email || '', balance: Number(row.balance || 0), orderCount: Number(row.order_count || 0), totalSpent: Number(row.total_spent || 0), lastOrderAtUtc: row.last_order_at_utc || '', referralCode: row.referral_code, status: row.status })),
      rewards: (rewardsResult.results || []).map(reward),
      promotions: (promotionsResult.results || []).map(promotion),
      referralsUnderReview: referralResult.results || [],
      transactions: transactionsResult.results || [],
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || 'No se pudo cargar la administración de Pecas Club.' }, error.status || 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    await ensureClubSchema(env);
    const granted = await access(request, env);
    if (granted.response) return granted.response;
    const body = await readJson(request);
    const db = requireDb(env);
    const action = String(body.action || 'adjust');
    const customerId = String(body.customerId || '');
    if (action === 'redeem') {
      const redemption = await createRedemption(db, { tenantId: granted.tenant.id, customerId, rewardId: String(body.rewardId || ''), userId: granted.session.userId, userName: granted.session.name });
      return jsonResponse({ ok: true, redemption });
    }
    if (action === 'referral-review') {
      const referral = await db.prepare(`SELECT * FROM club_referrals WHERE tenant_id = ? AND id = ? AND status = 'under_review'`).bind(granted.tenant.id, String(body.referralId || '')).first();
      if (!referral) return jsonResponse({ ok: false, error: 'Referido no encontrado.' }, 404);
      const now = nowIso();
      if (body.decision === 'approve') {
        await db.batch([
          db.prepare(`INSERT INTO club_points_transactions (id, tenant_id, customer_id, order_id, referral_id, type, points, description, created_by_user_id, created_by_name, created_at_utc) VALUES (?, ?, ?, ?, ?, 'referral', ?, 'Bono por referido aprobado', ?, ?, ?)`)
            .bind(crypto.randomUUID(), granted.tenant.id, referral.referrer_customer_id, referral.qualifying_order_id, referral.id, Number(referral.referrer_points || 5), granted.session.userId, granted.session.name, now),
          db.prepare(`INSERT INTO club_points_transactions (id, tenant_id, customer_id, order_id, referral_id, type, points, description, created_by_user_id, created_by_name, created_at_utc) VALUES (?, ?, ?, ?, ?, 'referral', ?, 'Bono de primera compra aprobado', ?, ?, ?)`)
            .bind(crypto.randomUUID(), granted.tenant.id, referral.referred_customer_id, referral.qualifying_order_id, referral.id, Number(referral.referred_points || 5), granted.session.userId, granted.session.name, now),
          db.prepare(`UPDATE club_referrals SET status = 'rewarded', completed_at_utc = ?, updated_at_utc = ? WHERE id = ?`).bind(now, now, referral.id),
        ]);
      } else {
        await db.prepare(`UPDATE club_referrals SET status = 'rejected', review_reason = ?, updated_at_utc = ? WHERE id = ?`).bind(String(body.reason || 'Rechazado por administración'), now, referral.id).run();
      }
      return jsonResponse({ ok: true });
    }
    const points = Math.trunc(Number(body.points || 0));
    if (!customerId || !points) return jsonResponse({ ok: false, error: 'Selecciona cliente e indica una cantidad distinta de cero.' }, 400);
    const balance = await clubBalance(db, granted.tenant.id, customerId);
    if (balance + points < 0) return jsonResponse({ ok: false, error: 'El ajuste dejaría un saldo negativo.' }, 409);
    const description = String(body.description || '').trim();
    if (description.length < 3) return jsonResponse({ ok: false, error: 'Escribe el motivo del ajuste.' }, 400);
    await db.prepare(`INSERT INTO club_points_transactions (id, tenant_id, customer_id, type, points, description, created_by_user_id, created_by_name, created_at_utc) VALUES (?, ?, ?, 'adjustment', ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), granted.tenant.id, customerId, points, description, granted.session.userId, granted.session.name, nowIso()).run();
    return jsonResponse({ ok: true, balance: balance + points });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || 'No se pudo completar la operación.' }, error.status || 500);
  }
}

export async function onRequestPatch({ request, env }) {
  try {
    await ensureClubSchema(env);
    const granted = await access(request, env);
    if (granted.response) return granted.response;
    const body = await readJson(request);
    const db = requireDb(env);
    const now = nowIso();
    if (body.entity === 'reward') {
      const id = String(body.id || crypto.randomUUID());
      await db.prepare(`INSERT INTO club_rewards (id, tenant_id, name, description, points_required, estimated_cost, active, stock, sort_order, created_at_utc, updated_at_utc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, points_required = excluded.points_required, estimated_cost = excluded.estimated_cost, active = excluded.active, stock = excluded.stock, sort_order = excluded.sort_order, updated_at_utc = excluded.updated_at_utc`)
        .bind(id, granted.tenant.id, String(body.name || '').trim(), String(body.description || '').trim(), Math.max(1, Number(body.pointsRequired || 1)), Number(body.estimatedCost || 0), body.active === false ? 0 : 1, body.stock === '' || body.stock === null ? null : Math.max(0, Number(body.stock)), Number(body.sortOrder || 0), now, now).run();
      return jsonResponse({ ok: true, id });
    }
    if (body.entity === 'promotion') {
      const id = String(body.id || crypto.randomUUID());
      await db.prepare(`INSERT INTO club_promotions (id, tenant_id, title, description, image_url, starts_at_utc, ends_at_utc, active, club_only, terms, sort_order, created_at_utc, updated_at_utc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title = excluded.title, description = excluded.description, image_url = excluded.image_url, starts_at_utc = excluded.starts_at_utc, ends_at_utc = excluded.ends_at_utc, active = excluded.active, terms = excluded.terms, sort_order = excluded.sort_order, updated_at_utc = excluded.updated_at_utc`)
        .bind(id, granted.tenant.id, String(body.title || '').trim(), String(body.description || '').trim(), String(body.imageUrl || '').trim(), body.startsAtUtc || null, body.endsAtUtc || null, body.active === false ? 0 : 1, String(body.terms || '').trim(), Number(body.sortOrder || 0), now, now).run();
      return jsonResponse({ ok: true, id });
    }
    return jsonResponse({ ok: false, error: 'Entidad no reconocida.' }, 400);
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || 'No se pudo guardar.' }, error.status || 500);
  }
}
