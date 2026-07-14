import { requirePlatformAdmin } from '../_shared/auth.js';
import { jsonResponse, requireDb } from '../_shared/http.js';
import { ensurePlatformTables, safeJson } from '../_shared/platform.js';

function daysAgo(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

async function tableExists(db, tableName) {
  const row = await db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).bind(tableName).first();
  return Boolean(row);
}

async function scalar(db, sql, bindings = []) {
  const row = await db.prepare(sql).bind(...bindings).first();
  return Number(Object.values(row || { value: 0 })[0] || 0);
}

function statusFromSignals(signals) {
  if (!signals.hasMenu) return 'setup_needed';
  if (signals.openErrors > 0) return 'attention';
  if (signals.lowStock > 0) return 'attention';
  if (signals.unconfirmedOrders > 0) return 'attention';
  return 'healthy';
}

export async function onRequestGet({ request, env }) {
  try {
    const auth = requirePlatformAdmin(request, env);
    if (!auth.ok) return auth.response;

    await ensurePlatformTables(env);
    const db = requireDb(env);

    const tenants = await db.prepare(`
      SELECT t.*, s.status AS subscription_status, s.monthly_price_cents, s.next_payment_due_at
      FROM saas_tenants t
      LEFT JOIN saas_subscriptions s ON s.tenant_id = t.id
      ORDER BY t.updated_at_utc DESC
    `).all().then((result) => result.results || []);

    const hasMenuProducts = await tableExists(db, 'menu_products');
    const hasMenuCategories = await tableExists(db, 'menu_categories');
    const hasOrders = await tableExists(db, 'orders');
    const hasItems = await tableExists(db, 'items');
    const hasPayments = await tableExists(db, 'tenant_payment_connections');
    const hasWhatsApp = await tableExists(db, 'tenant_whatsapp_connections');
    const hasAudit = await tableExists(db, 'audit_log');

    const cards = [];
    for (const tenant of tenants) {
      const tenantId = tenant.id;
      const brand = safeJson(tenant.brand_json, {});
      const settings = safeJson(tenant.settings_json, {});

      const menuProducts = hasMenuProducts
        ? await scalar(db, `SELECT COUNT(*) AS value FROM menu_products WHERE tenant_id = ? AND is_active = 1`, [tenantId])
        : 0;
      const menuCategories = hasMenuCategories
        ? await scalar(db, `SELECT COUNT(*) AS value FROM menu_categories WHERE tenant_id = ? AND is_active = 1`, [tenantId])
        : 0;
      const ordersToday = hasOrders
        ? await scalar(db, `SELECT COUNT(*) AS value FROM orders WHERE tenant_id = ? AND created_at_utc >= ?`, [tenantId, daysAgo(1)])
        : 0;
      const unconfirmedOrders = hasOrders
        ? await scalar(db, `SELECT COUNT(*) AS value FROM orders WHERE tenant_id = ? AND status IN ('pending', 'new')`, [tenantId])
        : 0;
      const lowStock = hasItems
        ? await scalar(db, `SELECT COUNT(*) AS value FROM items WHERE tenant_id = ? AND is_active = 1 AND min_stock IS NOT NULL AND current_stock <= min_stock`, [tenantId])
        : 0;
      const paymentConnected = hasPayments
        ? Boolean(await db.prepare(`SELECT id FROM tenant_payment_connections WHERE tenant_id = ? AND connection_status = 'connected' LIMIT 1`).bind(tenantId).first())
        : false;
      const whatsappConnected = hasWhatsApp
        ? Boolean(await db.prepare(`SELECT id FROM tenant_whatsapp_connections WHERE tenant_id = ? AND connection_status = 'connected' LIMIT 1`).bind(tenantId).first())
        : false;
      const openErrors = hasAudit
        ? await scalar(db, `SELECT COUNT(*) AS value FROM audit_log WHERE tenant_id = ? AND action LIKE 'error.%' AND created_at_utc >= ?`, [tenantId, daysAgo(7)])
        : 0;

      const signals = {
        hasMenu: menuProducts > 0 && menuCategories > 0,
        menuProducts,
        menuCategories,
        ordersToday,
        unconfirmedOrders,
        lowStock,
        paymentConnected,
        whatsappConnected,
        openErrors,
      };

      cards.push({
        id: tenantId,
        slug: tenant.slug,
        name: tenant.name,
        status: tenant.status,
        plan: tenant.plan,
        subscriptionStatus: tenant.subscription_status || tenant.status,
        domain: tenant.domain || tenant.subdomain || '',
        brand: {
          displayName: brand.displayName || tenant.name,
          themePreset: brand.themePreset || 'neutral',
          logoUrl: brand.logoUrl || '',
        },
        settings,
        health: statusFromSignals(signals),
        signals,
      });
    }

    return jsonResponse({ ok: true, tenants: cards });
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo cargar salud de clientes.', detail: error.message }, 500);
  }
}

