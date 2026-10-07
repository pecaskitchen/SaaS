import { jsonResponse, nowIso, requireDb } from '../_shared/http.js';
import { clubBalance, ensureClubSchema, expireIssuedRedemptions, requireClubAuth } from '../_shared/pecasClub.js';

function mapReward(row) {
  return { id: row.id, name: row.name, description: row.description || '', pointsRequired: Number(row.points_required), imageUrl: row.image_url || '', stock: row.stock === null ? null : Number(row.stock), active: Boolean(row.active) };
}

function mapTransaction(row) {
  return { id: row.id, type: row.type, points: Number(row.points), description: row.description, orderId: row.order_id || null, createdAtUtc: row.created_at_utc };
}

export async function onRequestGet({ request, env }) {
  try {
    await ensureClubSchema(env);
    const auth = await requireClubAuth(request, env);
    if (!auth.ok) return auth.response;
    const db = requireDb(env);
    await expireIssuedRedemptions(db, auth.tenant.id, auth.customer.id);
    const balance = await clubBalance(db, auth.tenant.id, auth.customer.id);
    const [rewardsResult, transactionsResult, promotionsResult, referralStats, crm, redemptionsResult] = await Promise.all([
      db.prepare(`SELECT * FROM club_rewards WHERE tenant_id = ? AND active = 1 ORDER BY points_required, sort_order, name`).bind(auth.tenant.id).all(),
      db.prepare(`SELECT * FROM club_points_transactions WHERE tenant_id = ? AND customer_id = ? ORDER BY created_at_utc DESC LIMIT 50`).bind(auth.tenant.id, auth.customer.id).all(),
      db.prepare(`SELECT * FROM club_promotions WHERE tenant_id = ? AND active = 1 AND (starts_at_utc IS NULL OR starts_at_utc <= ?) AND (ends_at_utc IS NULL OR ends_at_utc >= ?) ORDER BY sort_order, created_at_utc DESC`).bind(auth.tenant.id, nowIso(), nowIso()).all(),
      db.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN status = 'rewarded' THEN 1 ELSE 0 END), 0) AS rewarded FROM club_referrals WHERE tenant_id = ? AND referrer_customer_id = ?`).bind(auth.tenant.id, auth.customer.id).first(),
      db.prepare(`SELECT order_count, total_spent, last_order_at_utc FROM crm_customers WHERE tenant_id = ? AND phone = ? LIMIT 1`).bind(auth.tenant.id, auth.customer.phone).first().catch(() => null),
      db.prepare(`SELECT r.redemption_code, r.reward_name, r.redeemed_at_utc, r.expires_at_utc, w.reward_type, w.eligible_product_ids_json, w.discount_amount FROM club_redemptions r JOIN club_rewards w ON w.tenant_id = r.tenant_id AND w.id = r.reward_id WHERE r.tenant_id = ? AND r.customer_id = ? AND r.status = 'issued' ORDER BY r.redeemed_at_utc DESC`).bind(auth.tenant.id, auth.customer.id).all(),
    ]);
    const rewards = (rewardsResult.results || []).map(mapReward);
    const nextReward = rewards.find((reward) => reward.pointsRequired > balance) || null;
    return jsonResponse({
      ok: true,
      customer: { id: auth.customer.id, name: auth.customer.name, phone: auth.customer.phone, email: auth.customer.email || '', referralCode: auth.customer.referral_code, marketingConsent: Boolean(auth.customer.marketing_consent) },
      balance,
      nextReward,
      rewards,
      pendingRedemptions: (redemptionsResult.results || []).map((row) => ({ code: row.redemption_code, rewardName: row.reward_name, rewardType: row.reward_type, eligibleProductIds: JSON.parse(row.eligible_product_ids_json || '[]'), discountAmount: Number(row.discount_amount || 0), redeemedAtUtc: row.redeemed_at_utc, expiresAtUtc: row.expires_at_utc })),
      transactions: (transactionsResult.results || []).map(mapTransaction),
      promotions: (promotionsResult.results || []).map((row) => ({ id: row.id, title: row.title, description: row.description || '', imageUrl: row.image_url || '', terms: row.terms || '', endsAtUtc: row.ends_at_utc || '', storePromotionId: row.store_promotion_id || '' })),
      referrals: { invited: Number(referralStats?.total || 0), rewarded: Number(referralStats?.rewarded || 0), bonus: 5 },
      stats: { orderCount: Number(crm?.order_count || 0), totalSpent: Number(crm?.total_spent || 0), lastOrderAtUtc: crm?.last_order_at_utc || '' },
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || 'No se pudo cargar Pecas Club.' }, error.status || 500);
  }
}
