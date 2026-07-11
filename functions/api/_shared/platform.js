import { nowIso, requireDb } from './http.js';

export const TENANT_STATUSES = ['trial', 'active', 'past_due', 'paused', 'cancelled'];
export const PLANS = ['starter', 'growth', 'pro'];

export function slugify(value, fallback = 'negocio') {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || fallback;
}

export function makeId(prefix) {
  const random = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${prefix}_${String(random).replace(/-/g, '').slice(0, 18)}`;
}

export async function ensurePlatformTables(env) {
  const db = requireDb(env);
  await db.prepare(`CREATE TABLE IF NOT EXISTS saas_tenants (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    legal_name TEXT,
    contact_name TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    status TEXT NOT NULL DEFAULT 'trial',
    plan TEXT NOT NULL DEFAULT 'starter',
    domain TEXT,
    subdomain TEXT,
    brand_json TEXT NOT NULL DEFAULT '{}',
    settings_json TEXT NOT NULL DEFAULT '{}',
    notes TEXT,
    created_at_utc TEXT NOT NULL,
    updated_at_utc TEXT NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS saas_users (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    role TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    password_hint TEXT,
    created_at_utc TEXT NOT NULL,
    updated_at_utc TEXT NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS saas_subscriptions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    plan TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'trial',
    monthly_price_cents INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'MXN',
    trial_ends_at TEXT,
    current_period_starts_at TEXT,
    current_period_ends_at TEXT,
    last_payment_at TEXT,
    next_payment_due_at TEXT,
    notes TEXT,
    created_at_utc TEXT NOT NULL,
    updated_at_utc TEXT NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT,
    actor_role TEXT NOT NULL,
    actor_name TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at_utc TEXT NOT NULL
  )`).run();
}

export function sanitizeTenant(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    legalName: row.legal_name || '',
    contactName: row.contact_name || '',
    contactEmail: row.contact_email || '',
    contactPhone: row.contact_phone || '',
    status: row.status,
    plan: row.plan,
    domain: row.domain || '',
    subdomain: row.subdomain || '',
    brand: safeJson(row.brand_json, {}),
    settings: safeJson(row.settings_json, {}),
    notes: row.notes || '',
    subscriptionStatus: row.subscription_status || row.status,
    monthlyPriceCents: Number(row.monthly_price_cents || 0),
    nextPaymentDueAt: row.next_payment_due_at || '',
    createdAtUtc: row.created_at_utc,
    updatedAtUtc: row.updated_at_utc,
  };
}

export function safeJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export async function audit(env, { tenantId = null, actorRole = 'platform_admin', actorName = 'Soporte', action, entityType, entityId, metadata = {} }) {
  const db = requireDb(env);
  await db.prepare(`INSERT INTO audit_log (tenant_id, actor_role, actor_name, action, entity_type, entity_id, metadata_json, created_at_utc)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(tenantId, actorRole, actorName, action, entityType, entityId, JSON.stringify(metadata || {}), nowIso())
    .run();
}

export async function listTenants(env) {
  await ensurePlatformTables(env);
  const result = await requireDb(env).prepare(`
    SELECT t.*, s.status AS subscription_status, s.monthly_price_cents, s.next_payment_due_at
    FROM saas_tenants t
    LEFT JOIN saas_subscriptions s ON s.tenant_id = t.id
    ORDER BY t.created_at_utc DESC
  `).all();
  return (result.results || []).map(sanitizeTenant);
}

export async function createTenant(env, input = {}) {
  await ensurePlatformTables(env);
  const db = requireDb(env);
  const timestamp = nowIso();
  const name = String(input.name || '').trim();
  if (!name) throw new Error('El nombre del negocio es obligatorio.');

  const slug = slugify(input.slug || name);
  const status = TENANT_STATUSES.includes(input.status) ? input.status : 'trial';
  const plan = PLANS.includes(input.plan) ? input.plan : 'starter';
  const tenantId = makeId('biz');
  const subscriptionId = makeId('sub');
  const inputBrand = input.brand || {};
  const brand = {
    logoUrl: String(inputBrand.logoUrl ?? input.logoUrl ?? '').trim(),
    displayName: String(inputBrand.displayName ?? input.displayName ?? name).trim(),
    tagline: String(inputBrand.tagline ?? input.tagline ?? '').trim(),
    heroEyebrow: String(inputBrand.heroEyebrow ?? input.heroEyebrow ?? '').trim(),
    heroTitle: String(inputBrand.heroTitle ?? input.heroTitle ?? name).trim(),
    heroText: String(inputBrand.heroText ?? input.heroText ?? '').trim(),
    primaryActionLabel: String(inputBrand.primaryActionLabel ?? input.primaryActionLabel ?? 'Ordenar ahora').trim(),
    secondaryActionLabel: String(inputBrand.secondaryActionLabel ?? input.secondaryActionLabel ?? 'Ver carrito').trim(),
    orderMessageIntro: String(inputBrand.orderMessageIntro ?? input.orderMessageIntro ?? `Hola ${name}, quiero hacer un pedido:`).trim(),
    menuEyebrow: String(inputBrand.menuEyebrow ?? input.menuEyebrow ?? 'Menu').trim(),
    menuTitle: String(inputBrand.menuTitle ?? input.menuTitle ?? 'Elige una categoria').trim(),
    emptyCatalogTitle: String(inputBrand.emptyCatalogTitle ?? input.emptyCatalogTitle ?? 'Catalogo en preparacion').trim(),
    emptyCatalogText: String(inputBrand.emptyCatalogText ?? input.emptyCatalogText ?? 'Este negocio todavia no tiene productos publicados.').trim(),
    primaryColor: String(inputBrand.primaryColor ?? input.primaryColor ?? '#111827').trim(),
    accentColor: String(inputBrand.accentColor ?? input.accentColor ?? '#ef4444').trim(),
  };
  const settings = {
    timezone: input.timezone || 'America/Mexico_City',
    whatsappNumber: String(input.whatsappNumber || '').trim(),
    supportNotes: String(input.supportNotes || '').trim(),
  };

  await db.prepare(`INSERT INTO saas_tenants (
    id, slug, name, legal_name, contact_name, contact_email, contact_phone, status, plan, domain, subdomain,
    brand_json, settings_json, notes, created_at_utc, updated_at_utc
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      tenantId,
      slug,
      name,
      String(input.legalName || '').trim(),
      String(input.contactName || '').trim(),
      String(input.contactEmail || '').trim(),
      String(input.contactPhone || '').trim(),
      status,
      plan,
      String(input.domain || '').trim(),
      String(input.subdomain || slug).trim(),
      JSON.stringify(brand),
      JSON.stringify(settings),
      String(input.notes || '').trim(),
      timestamp,
      timestamp,
    )
    .run();

  await db.prepare(`INSERT INTO saas_subscriptions (
    id, tenant_id, plan, status, monthly_price_cents, currency, trial_ends_at, next_payment_due_at, notes, created_at_utc, updated_at_utc
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      subscriptionId,
      tenantId,
      plan,
      status,
      Number(input.monthlyPriceCents || 0),
      input.currency || 'MXN',
      input.trialEndsAt || null,
      input.nextPaymentDueAt || null,
      String(input.subscriptionNotes || '').trim(),
      timestamp,
      timestamp,
    )
    .run();

  await audit(env, {
    tenantId,
    action: 'tenant.created',
    entityType: 'tenant',
    entityId: tenantId,
    metadata: { slug, plan, status },
  });

  const row = await db.prepare(`SELECT * FROM saas_tenants WHERE id = ?`).bind(tenantId).first();
  return sanitizeTenant(row);
}

export async function updateTenant(env, tenantId, input = {}) {
  await ensurePlatformTables(env);
  const db = requireDb(env);
  const current = await db.prepare(`SELECT * FROM saas_tenants WHERE id = ?`).bind(tenantId).first();
  if (!current) throw new Error('Negocio no encontrado.');

  const nextStatus = TENANT_STATUSES.includes(input.status) ? input.status : current.status;
  const nextPlan = PLANS.includes(input.plan) ? input.plan : current.plan;
  const nextSlug = slugify(input.slug ?? current.slug, current.slug);
  const currentBrand = safeJson(current.brand_json, {});
  const inputBrand = input.brand || {};
  const brand = {
    ...currentBrand,
    ...inputBrand,
  };
  for (const key of ['logoUrl', 'displayName', 'tagline', 'heroEyebrow', 'heroTitle', 'heroText', 'primaryActionLabel', 'secondaryActionLabel', 'orderMessageIntro', 'menuEyebrow', 'menuTitle', 'emptyCatalogTitle', 'emptyCatalogText', 'primaryColor', 'accentColor']) {
    if (Object.prototype.hasOwnProperty.call(input, key)) brand[key] = String(input[key] || '').trim();
  }
  const settings = {
    ...safeJson(current.settings_json, {}),
    ...(input.settings || {}),
    ...(Object.prototype.hasOwnProperty.call(input, 'whatsappNumber') ? { whatsappNumber: String(input.whatsappNumber || '').trim() } : {}),
  };

  await db.prepare(`UPDATE saas_tenants SET
    slug = ?, name = ?, legal_name = ?, contact_name = ?, contact_email = ?, contact_phone = ?, status = ?, plan = ?,
    domain = ?, subdomain = ?, brand_json = ?, settings_json = ?, notes = ?, updated_at_utc = ?
    WHERE id = ?`)
    .bind(
      nextSlug,
      String(input.name ?? current.name).trim(),
      String(input.legalName ?? current.legal_name ?? '').trim(),
      String(input.contactName ?? current.contact_name ?? '').trim(),
      String(input.contactEmail ?? current.contact_email ?? '').trim(),
      String(input.contactPhone ?? current.contact_phone ?? '').trim(),
      nextStatus,
      nextPlan,
      String(input.domain ?? current.domain ?? '').trim(),
      String(input.subdomain ?? current.subdomain ?? '').trim(),
      JSON.stringify(brand),
      JSON.stringify(settings),
      String(input.notes ?? current.notes ?? '').trim(),
      nowIso(),
      tenantId,
    )
    .run();

  await audit(env, {
    tenantId,
    action: 'tenant.updated',
    entityType: 'tenant',
    entityId: tenantId,
    metadata: { plan: nextPlan, status: nextStatus },
  });

  const row = await db.prepare(`SELECT * FROM saas_tenants WHERE id = ?`).bind(tenantId).first();
  return sanitizeTenant(row);
}

