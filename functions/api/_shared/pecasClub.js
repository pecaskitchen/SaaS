import { hashPassword, signToken, verifyPassword, verifyToken } from './crypto.js';
import { jwtSecret } from './auth.js';
import { jsonResponse, nowIso, requireDb } from './http.js';
import { normalizePhone } from './crm.js';
import { resolveTenantId } from './tenant.js';

export const CLUB_PRIVACY_VERSION = '2026-10-04';
export const CLUB_TERMS_VERSION = '2026-10-04';
export const CLUB_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
export const POINTS_SPEND_UNIT = 20;
export const REFERRAL_BONUS = 5;

export function pointsForPurchase(total) {
  return Math.max(0, Math.floor(Number(total || 0) / POINTS_SPEND_UNIT));
}

export function normalizeDeliveryAddress(value) {
  return String(value || '').trim().toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function bearerToken(request) {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function codeFromBytes(length = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

export async function ensurePecasTenant(request, env) {
  const tenantId = await resolveTenantId(request, env);
  const tenant = await requireDb(env).prepare(`SELECT id, slug, name FROM saas_tenants WHERE id = ? LIMIT 1`).bind(tenantId).first();
  if (!tenant || tenant.slug !== 'pecas') {
    const error = new Error('Pecas Club solo está disponible en Pecas.');
    error.status = 404;
    throw error;
  }
  return tenant;
}

export async function ensureClubSchema(env) {
  const db = requireDb(env);
  const statements = [
    `CREATE TABLE IF NOT EXISTS club_customers (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, crm_customer_id INTEGER, name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT, pin_hash TEXT NOT NULL, birthday_day INTEGER, birthday_month INTEGER, status TEXT NOT NULL DEFAULT 'active', referral_code TEXT NOT NULL, referred_by_customer_id TEXT, privacy_notice_version TEXT NOT NULL, privacy_accepted_at_utc TEXT NOT NULL, terms_version TEXT NOT NULL, terms_accepted_at_utc TEXT NOT NULL, marketing_consent INTEGER NOT NULL DEFAULT 0, marketing_consent_at_utc TEXT, last_login_at_utc TEXT, created_at_utc TEXT NOT NULL, updated_at_utc TEXT NOT NULL, UNIQUE (tenant_id, phone), UNIQUE (tenant_id, referral_code))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_club_customers_tenant_email ON club_customers (tenant_id, lower(email)) WHERE email IS NOT NULL AND email != ''`,
    `CREATE TABLE IF NOT EXISTS club_sessions (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, customer_id TEXT NOT NULL, expires_at_utc TEXT NOT NULL, created_at_utc TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS club_order_awards (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, customer_id TEXT NOT NULL, order_id INTEGER NOT NULL, points_awarded INTEGER NOT NULL DEFAULT 0, created_at_utc TEXT NOT NULL, UNIQUE (tenant_id, order_id))`,
    `CREATE TABLE IF NOT EXISTS club_points_transactions (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, customer_id TEXT NOT NULL, order_id INTEGER, redemption_id TEXT, referral_id TEXT, type TEXT NOT NULL, points INTEGER NOT NULL, description TEXT NOT NULL, created_by_user_id TEXT, created_by_name TEXT, created_at_utc TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_club_points_customer_date ON club_points_transactions (tenant_id, customer_id, created_at_utc DESC)`,
    `CREATE TABLE IF NOT EXISTS club_rewards (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT, points_required INTEGER NOT NULL, estimated_cost REAL, image_url TEXT, active INTEGER NOT NULL DEFAULT 1, stock INTEGER, sort_order INTEGER NOT NULL DEFAULT 0, created_at_utc TEXT NOT NULL, updated_at_utc TEXT NOT NULL, UNIQUE (tenant_id, name))`,
    `CREATE TABLE IF NOT EXISTS club_redemptions (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, customer_id TEXT NOT NULL, reward_id TEXT NOT NULL, reward_name TEXT NOT NULL, points_spent INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'issued', redemption_code TEXT NOT NULL, redeemed_at_utc TEXT NOT NULL, used_at_utc TEXT, created_by_user_id TEXT, created_by_name TEXT, UNIQUE (tenant_id, redemption_code))`,
    `CREATE TABLE IF NOT EXISTS club_promotions (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT, image_url TEXT, starts_at_utc TEXT, ends_at_utc TEXT, active INTEGER NOT NULL DEFAULT 1, club_only INTEGER NOT NULL DEFAULT 1, terms TEXT, sort_order INTEGER NOT NULL DEFAULT 0, created_at_utc TEXT NOT NULL, updated_at_utc TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS club_referrals (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, referrer_customer_id TEXT NOT NULL, referred_customer_id TEXT NOT NULL, qualifying_order_id INTEGER, status TEXT NOT NULL DEFAULT 'pending', review_reason TEXT, referrer_points INTEGER NOT NULL DEFAULT 5, referred_points INTEGER NOT NULL DEFAULT 5, completed_at_utc TEXT, created_at_utc TEXT NOT NULL, updated_at_utc TEXT NOT NULL, UNIQUE (tenant_id, referred_customer_id))`,
  ];
  await db.batch(statements.map((sql) => db.prepare(sql)));
  const rewardInfo = await db.prepare(`PRAGMA table_info(club_rewards)`).all();
  const rewardColumns = new Set((rewardInfo.results || []).map((row) => row.name));
  const rewardAlters = [];
  if (!rewardColumns.has('reward_type')) rewardAlters.push(`ALTER TABLE club_rewards ADD COLUMN reward_type TEXT NOT NULL DEFAULT 'product'`);
  if (!rewardColumns.has('eligible_product_ids_json')) rewardAlters.push(`ALTER TABLE club_rewards ADD COLUMN eligible_product_ids_json TEXT NOT NULL DEFAULT '[]'`);
  if (!rewardColumns.has('discount_amount')) rewardAlters.push(`ALTER TABLE club_rewards ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0`);
  if (rewardAlters.length) await db.batch(rewardAlters.map((sql) => db.prepare(sql)));
  const redemptionInfo = await db.prepare(`PRAGMA table_info(club_redemptions)`).all();
  const redemptionColumns = new Set((redemptionInfo.results || []).map((row) => row.name));
  if (!redemptionColumns.has('order_id')) await db.prepare(`ALTER TABLE club_redemptions ADD COLUMN order_id INTEGER`).run();
  await seedDefaultRewards(db, await pecasTenantId(db));
}

export async function validateRedemptionForItems(db, { tenantId, customerId, code, items }) {
  if (!code) return null;
  const row = await db.prepare(`SELECT r.*, w.reward_type, w.eligible_product_ids_json, w.discount_amount
    FROM club_redemptions r JOIN club_rewards w ON w.tenant_id = r.tenant_id AND w.id = r.reward_id
    WHERE r.tenant_id = ? AND r.customer_id = ? AND upper(r.redemption_code) = upper(?) AND r.status = 'issued' LIMIT 1`)
    .bind(tenantId, customerId, String(code).trim()).first();
  if (!row) throw Object.assign(new Error('El código no existe, ya fue usado o no pertenece a esta cuenta.'), { status: 409 });
  let eligibleIds = [];
  try { eligibleIds = JSON.parse(row.eligible_product_ids_json || '[]'); } catch { eligibleIds = []; }
  const nonPromoItems = (items || []).filter((item) => String(item.product_id || item.id || '') !== 'promo' && !item.options?.promo);
  const candidates = nonPromoItems.filter((item) => row.reward_type === 'fixed_discount' && eligibleIds.length === 0
    ? true : eligibleIds.includes(String(item.product_id || item.id || '')));
  if (!candidates.length) throw Object.assign(new Error('Agrega un producto elegible separado de cualquier promoción para utilizar este código.'), { status: 409 });
  const target = candidates.reduce((lowest, item) => Number(item.unit_price ?? item.price ?? 0) < Number(lowest.unit_price ?? lowest.price ?? 0) ? item : lowest);
  const basePrice = Math.max(0, Number(target.basePrice ?? target.unit_price ?? target.price ?? 0));
  const configured = Number(row.discount_amount || 0);
  const discount = row.reward_type === 'fixed_discount' ? Math.min(configured, (items || []).reduce((sum, item) => sum + Number(item.line_total ?? Number(item.price || 0) * Number(item.quantity || 1)), 0)) : Math.min(basePrice, configured > 0 ? configured : basePrice);
  return { redemptionId: row.id, code: row.redemption_code, rewardName: row.reward_name, targetProductId: String(target.product_id || target.id), discount: Math.max(0, Math.round(discount)) };
}

export async function consumeRedemption(db, { tenantId, redemptionId, orderId }) {
  const result = await db.prepare(`UPDATE club_redemptions SET status = 'used', used_at_utc = ?, order_id = ? WHERE tenant_id = ? AND id = ? AND status = 'issued'`)
    .bind(nowIso(), orderId, tenantId, redemptionId).run();
  if (Number(result.meta?.changes || 0) !== 1) throw Object.assign(new Error('El código ya fue utilizado.'), { status: 409 });
}

async function pecasTenantId(db) {
  const row = await db.prepare(`SELECT id FROM saas_tenants WHERE slug = 'pecas' LIMIT 1`).first();
  return row?.id || '';
}

async function seedDefaultRewards(db, tenantId) {
  if (!tenantId) return;
  const now = nowIso();
  const defaults = [
    ['pecas_reward_extra', 'Extra premium gratis', 'Agrega un extra premium sin costo.', 5, 15],
    ['pecas_reward_latte', 'Latte', 'Latte gratis.', 10, 35],
    ['pecas_reward_crepa', 'Crepa clásica', 'Crepa clásica gratis.', 15, 50],
    ['pecas_reward_panini', 'Panini', 'Panini gratis.', 20, 65],
    ['pecas_reward_150', '$150 de descuento', '$150 de descuento en una compra elegible.', 25, 150],
  ];
  const statement = db.prepare(`INSERT OR IGNORE INTO club_rewards (id, tenant_id, name, description, points_required, estimated_cost, active, sort_order, created_at_utc, updated_at_utc) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`);
  await db.batch(defaults.map((reward, index) => statement.bind(reward[0], tenantId, reward[1], reward[2], reward[3], reward[4], index + 1, now, now)));
}

export async function uniqueReferralCode(db, tenantId, name = '') {
  const prefix = String(name || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'PEC';
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = `${prefix}${codeFromBytes(3)}`;
    const existing = await db.prepare(`SELECT id FROM club_customers WHERE tenant_id = ? AND referral_code = ?`).bind(tenantId, code).first();
    if (!existing) return code;
  }
  return `PEC${codeFromBytes(8)}`;
}

export async function createClubSession(env, customer) {
  const db = requireDb(env);
  const sessionId = crypto.randomUUID();
  const expiresAtUtc = new Date(Date.now() + CLUB_SESSION_TTL_SECONDS * 1000).toISOString();
  await db.prepare(`INSERT INTO club_sessions (id, tenant_id, customer_id, expires_at_utc, created_at_utc) VALUES (?, ?, ?, ?, ?)`)
    .bind(sessionId, customer.tenant_id, customer.id, expiresAtUtc, nowIso()).run();
  const token = await signToken({ role: 'club_customer', tenantId: customer.tenant_id, customerId: customer.id, sessionId }, jwtSecret(env), CLUB_SESSION_TTL_SECONDS);
  return { token, expiresAtUtc };
}

export async function requireClubAuth(request, env) {
  const token = bearerToken(request);
  if (!token) return { ok: false, response: jsonResponse({ ok: false, error: 'Inicia sesión en Pecas Club.' }, 401) };
  try {
    const payload = await verifyToken(token, jwtSecret(env));
    if (payload.role !== 'club_customer') throw new Error('Rol inválido.');
    const tenant = await ensurePecasTenant(request, env);
    if (payload.tenantId !== tenant.id) throw new Error('Tenant inválido.');
    const row = await requireDb(env).prepare(`
      SELECT c.* FROM club_sessions s
      JOIN club_customers c ON c.id = s.customer_id AND c.tenant_id = s.tenant_id
      WHERE s.id = ? AND s.customer_id = ? AND s.tenant_id = ? AND s.expires_at_utc > ? AND c.status = 'active'
      LIMIT 1
    `).bind(payload.sessionId, payload.customerId, tenant.id, nowIso()).first();
    if (!row) throw new Error('Sesión vencida.');
    return { ok: true, customer: row, payload, tenant };
  } catch {
    return { ok: false, response: jsonResponse({ ok: false, error: 'Tu sesión de Pecas Club es inválida o expiró.' }, 401) };
  }
}

export async function authenticateClubCustomer(env, tenantId, phone, pin) {
  const db = requireDb(env);
  const customer = await db.prepare(`SELECT * FROM club_customers WHERE tenant_id = ? AND phone = ? AND status = 'active' LIMIT 1`)
    .bind(tenantId, normalizePhone(phone)).first();
  if (!customer || !(await verifyPassword(pin, customer.pin_hash))) return null;
  await db.prepare(`UPDATE club_customers SET last_login_at_utc = ?, updated_at_utc = ? WHERE id = ?`).bind(nowIso(), nowIso(), customer.id).run();
  return customer;
}

export async function clubBalance(db, tenantId, customerId) {
  const row = await db.prepare(`SELECT COALESCE(SUM(points), 0) AS balance FROM club_points_transactions WHERE tenant_id = ? AND customer_id = ?`).bind(tenantId, customerId).first();
  return Number(row?.balance || 0);
}

export async function createRedemption(db, { tenantId, customerId, rewardId, userId = null, userName = null }) {
  const reward = await db.prepare(`SELECT * FROM club_rewards WHERE tenant_id = ? AND id = ? AND active = 1 LIMIT 1`).bind(tenantId, rewardId).first();
  if (!reward) throw Object.assign(new Error('Recompensa no disponible.'), { status: 404 });
  const balance = await clubBalance(db, tenantId, customerId);
  const cost = Number(reward.points_required || 0);
  if (balance < cost) throw Object.assign(new Error('No hay suficientes Pecas para este canje.'), { status: 409 });
  if (reward.stock !== null && Number(reward.stock) <= 0) throw Object.assign(new Error('Recompensa agotada.'), { status: 409 });
  const redemptionId = crypto.randomUUID();
  const transactionId = crypto.randomUUID();
  const code = `PEC-${codeFromBytes(6)}`;
  const now = nowIso();
  const statements = [
    db.prepare(`INSERT INTO club_redemptions (id, tenant_id, customer_id, reward_id, reward_name, points_spent, status, redemption_code, redeemed_at_utc, created_by_user_id, created_by_name) VALUES (?, ?, ?, ?, ?, ?, 'issued', ?, ?, ?, ?)`)
      .bind(redemptionId, tenantId, customerId, reward.id, reward.name, cost, code, now, userId, userName),
    db.prepare(`INSERT INTO club_points_transactions (id, tenant_id, customer_id, redemption_id, type, points, description, created_by_user_id, created_by_name, created_at_utc) VALUES (?, ?, ?, ?, 'redeem', ?, ?, ?, ?, ?)`)
      .bind(transactionId, tenantId, customerId, redemptionId, -cost, `${reward.name} · canje ${code}`, userId, userName, now),
  ];
  if (reward.stock !== null) statements.push(db.prepare(`UPDATE club_rewards SET stock = stock - 1, updated_at_utc = ? WHERE tenant_id = ? AND id = ? AND stock > 0`).bind(now, tenantId, reward.id));
  await db.batch(statements);
  return { id: redemptionId, code, reward: reward.name, pointsSpent: cost, balance: balance - cost };
}

export async function awardOrderPoints(env, tenantId, orderId) {
  const db = requireDb(env);
  const tenant = await db.prepare(`SELECT slug FROM saas_tenants WHERE id = ? LIMIT 1`).bind(tenantId).first();
  if (tenant?.slug !== 'pecas') return { awarded: false, reason: 'club_not_enabled' };
  await ensureClubSchema(env);
  const order = await db.prepare(`SELECT id, order_number, tenant_id, customer_phone, customer_address, total, status, payment_status FROM orders WHERE tenant_id = ? AND id = ? LIMIT 1`).bind(tenantId, orderId).first();
  if (!order || order.status === 'cancelled') return { awarded: false, reason: 'order_not_eligible' };
  if (order.payment_status !== 'paid' && order.status !== 'delivered') return { awarded: false, reason: 'order_not_paid_or_completed' };
  const phone = normalizePhone(order.customer_phone);
  if (!phone) return { awarded: false, reason: 'missing_phone' };
  const customer = await db.prepare(`SELECT * FROM club_customers WHERE tenant_id = ? AND phone = ? AND status = 'active' LIMIT 1`).bind(tenantId, phone).first();
  if (!customer) return { awarded: false, reason: 'club_customer_not_found' };
  const points = pointsForPurchase(order.total);
  const now = nowIso();
  const statements = [
    db.prepare(`INSERT INTO club_order_awards (id, tenant_id, customer_id, order_id, points_awarded, created_at_utc) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), tenantId, customer.id, order.id, points, now),
  ];
  if (points > 0) {
    statements.push(db.prepare(`INSERT INTO club_points_transactions (id, tenant_id, customer_id, order_id, type, points, description, created_at_utc) VALUES (?, ?, ?, ?, 'earn', ?, ?, ?)`)
      .bind(crypto.randomUUID(), tenantId, customer.id, order.id, points, `Pedido #${order.order_number} · $${Number(order.total || 0)}`, now));
  }

  const referral = await db.prepare(`SELECT * FROM club_referrals WHERE tenant_id = ? AND referred_customer_id = ? AND status = 'pending' LIMIT 1`).bind(tenantId, customer.id).first();
  if (referral) {
    const prior = await db.prepare(`SELECT COUNT(*) AS count FROM club_order_awards WHERE tenant_id = ? AND customer_id = ?`).bind(tenantId, customer.id).first();
    if (Number(prior?.count || 0) === 0) {
      const inviterOrder = await db.prepare(`
        SELECT o.customer_address
        FROM club_customers c
        JOIN orders o ON o.tenant_id = c.tenant_id
          AND replace(replace(replace(replace(replace(replace(o.customer_phone, ' ', ''), '+', ''), '-', ''), '(', ''), ')', ''), '.', '') = c.phone
        WHERE c.tenant_id = ? AND c.id = ?
          AND o.status != 'cancelled'
          AND (o.payment_status = 'paid' OR o.status = 'delivered')
        ORDER BY o.created_at_utc DESC LIMIT 1
      `).bind(tenantId, referral.referrer_customer_id).first();
      const sameAddress = normalizeDeliveryAddress(order.customer_address)
        && normalizeDeliveryAddress(order.customer_address) === normalizeDeliveryAddress(inviterOrder?.customer_address);
      if (sameAddress) {
        statements.push(db.prepare(`UPDATE club_referrals SET qualifying_order_id = ?, status = 'under_review', review_reason = 'Coincidencia de domicilio de entrega', updated_at_utc = ? WHERE id = ? AND status = 'pending'`).bind(order.id, now, referral.id));
      } else {
        statements.push(
          db.prepare(`INSERT INTO club_points_transactions (id, tenant_id, customer_id, order_id, referral_id, type, points, description, created_at_utc) VALUES (?, ?, ?, ?, ?, 'referral', ?, 'Bono por primera compra referida', ?)`)
            .bind(crypto.randomUUID(), tenantId, customer.id, order.id, referral.id, Number(referral.referred_points || REFERRAL_BONUS), now),
          db.prepare(`INSERT INTO club_points_transactions (id, tenant_id, customer_id, order_id, referral_id, type, points, description, created_at_utc) VALUES (?, ?, ?, ?, ?, 'referral', ?, 'Bono por referido', ?)`)
            .bind(crypto.randomUUID(), tenantId, referral.referrer_customer_id, order.id, referral.id, Number(referral.referrer_points || REFERRAL_BONUS), now),
          db.prepare(`UPDATE club_referrals SET qualifying_order_id = ?, status = 'rewarded', completed_at_utc = ?, updated_at_utc = ? WHERE id = ? AND status = 'pending'`).bind(order.id, now, now, referral.id),
        );
      }
    }
  }

  try {
    await db.batch(statements);
  } catch (error) {
    if (/UNIQUE|constraint/i.test(String(error.message || ''))) return { awarded: false, reason: 'already_awarded' };
    throw error;
  }
  return { awarded: true, customerId: customer.id, points };
}

export { hashPassword, normalizePhone };
