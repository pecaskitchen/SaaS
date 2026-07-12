import { resolveTenantId, tenantSettingKey } from './_shared/tenant.js';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const DEFAULT_BRANCH_SETTINGS = {
  multiBranchEnabled: false,
  defaultBranchId: 'dominio',
  branches: [
    { id: 'dominio', name: 'Dominio', active: true, ordersPassword: '', stockPassword: '', cashierPassword: '', whatsappNumber: '' },
  ],
};

function normalizeBranchId(value, fallback = 'dominio') {
  return String(value || fallback).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || fallback;
}

function normalizeBranchSettings(settings = {}) {
  const branches = Array.isArray(settings.branches) && settings.branches.length
    ? settings.branches.map((branch, index) => ({
        id: normalizeBranchId(branch.id || branch.name, `sucursal-${index + 1}`),
        name: String(branch.name || branch.id || `Sucursal ${index + 1}`).trim() || `Sucursal ${index + 1}`,
        active: branch.active !== false,
        ordersPassword: String(branch.ordersPassword || branch.orders_password || '').trim(),
        stockPassword: String(branch.stockPassword || branch.stock_password || '').trim(),
        cashierPassword: String(branch.cashierPassword || branch.cashier_password || '').trim(),
        whatsappNumber: String(branch.whatsappNumber || branch.whatsapp_number || branch.whatsapp || '').trim(),
      }))
    : DEFAULT_BRANCH_SETTINGS.branches;
  const defaultBranchId = normalizeBranchId(settings.defaultBranchId || branches[0]?.id || DEFAULT_BRANCH_SETTINGS.defaultBranchId);
  return { multiBranchEnabled: Boolean(settings.multiBranchEnabled), defaultBranchId, branches };
}

function normalizeSavedMenu(raw) {
  try {
    if (!raw) return { branchSettings: normalizeBranchSettings(DEFAULT_BRANCH_SETTINGS) };
    const parsed = JSON.parse(raw);
    return { branchSettings: normalizeBranchSettings(parsed.branchSettings || DEFAULT_BRANCH_SETTINGS) };
  } catch {
    return { branchSettings: normalizeBranchSettings(DEFAULT_BRANCH_SETTINGS) };
  }
}

// CORREGIDO: leía siempre la key global 'menu_overrides', comparando el PIN
// de sucursal ingresado contra las sucursales de UN SOLO tenant (el que
// haya escrito primero esa key), sin importar desde qué hostname se hizo el
// login. Ahora se resuelve el tenant real de la petición.
async function readSavedMenu(env, tenantId) {
  if (!env.DB) return normalizeSavedMenu('');
  try {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `).run();
    const row = await env.DB.prepare('SELECT value_json FROM app_settings WHERE key = ?').bind(tenantSettingKey('menu_overrides', tenantId, env)).first();
    return normalizeSavedMenu(row?.value_json || '');
  } catch {
    return normalizeSavedMenu('');
  }
}

function branchPayload(branch) {
  if (!branch) return null;
  return { id: branch.id, name: branch.name, active: branch.active };
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}));
    const password = String(body.password || '').trim();
    if (!password) return jsonResponse({ ok: false, error: 'Ingresa una contraseña.' }, 400);

    const platformPassword = env.PLATFORM_ADMIN_PASSWORD || env.PLATFORM_ADMIN_TOKEN || '';
    if (platformPassword && password === platformPassword) {
      return jsonResponse({
        ok: true,
        role: 'platform_admin',
        redirect: '#platform',
        accessScope: 'platform',
        sessionToken: env.PLATFORM_ADMIN_TOKEN || env.PLATFORM_ADMIN_PASSWORD,
      });
    }

    if (env.ADMIN_PASSWORD && password === env.ADMIN_PASSWORD) {
      return jsonResponse({ ok: true, role: 'admin', redirect: '#admin', accessScope: 'admin' });
    }

    if (env.SUPER_PASSWORD && password === env.SUPER_PASSWORD) {
      return jsonResponse({ ok: true, role: 'super', redirect: '#super', accessScope: 'super' });
    }

    const saved = await readSavedMenu(env, await resolveTenantId(request, env));
    const branchSettings = normalizeBranchSettings(saved.branchSettings || DEFAULT_BRANCH_SETTINGS);
    const activeBranches = (branchSettings.branches || []).filter((branch) => branch.active !== false);

    for (const branch of activeBranches) {
      if (branch.cashierPassword && password === branch.cashierPassword) {
        return jsonResponse({ ok: true, role: 'cashier', redirect: '#cashier', accessScope: 'branch', branch: branchPayload(branch) });
      }
      if (branch.ordersPassword && password === branch.ordersPassword) {
        return jsonResponse({ ok: true, role: 'orders', redirect: '#orders', accessScope: 'branch', branch: branchPayload(branch) });
      }
      if (branch.stockPassword && password === branch.stockPassword) {
        return jsonResponse({ ok: true, role: 'stock', redirect: '#stock', accessScope: 'branch', branch: branchPayload(branch) });
      }
    }

    if (env.ORDERS_PASSWORD && password === env.ORDERS_PASSWORD) {
      return jsonResponse({ ok: true, role: 'orders', redirect: '#orders', accessScope: 'legacy' });
    }
    if (env.KITCHEN_PASSWORD && password === env.KITCHEN_PASSWORD) {
      return jsonResponse({ ok: true, role: 'stock', redirect: '#stock', accessScope: 'legacy' });
    }

    return jsonResponse({ ok: false, error: 'Contraseña incorrecta.' }, 401);
  } catch (error) {
    return jsonResponse({ ok: false, error: 'No se pudo validar el acceso.', detail: error.message }, 500);
  }
}
