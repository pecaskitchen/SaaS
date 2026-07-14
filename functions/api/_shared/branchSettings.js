export const DEFAULT_CASHIER_ORDER_SOURCES = ['Grupo de WhatsApp', 'Facebook', 'Instagram', 'Llamada', 'Tienda'];

export const DEFAULT_BRANCH_SETTINGS = {
  multiBranchEnabled: false,
  defaultBranchId: 'dominio',
  cashierOrderSources: DEFAULT_CASHIER_ORDER_SOURCES,
  defaultCashierOrderSource: 'Tienda',
  branches: [
    { id: 'dominio', name: 'Dominio', active: true, ordersPassword: '', stockPassword: '', cashierPassword: '', whatsappNumber: '' },
  ],
};

export function normalizeCashierOrderSources(value) {
  const list = Array.isArray(value) ? value : DEFAULT_CASHIER_ORDER_SOURCES;
  const clean = list.map((item) => String(item || '').trim()).filter(Boolean);
  return [...new Set(clean)].length ? [...new Set(clean)] : DEFAULT_CASHIER_ORDER_SOURCES;
}

export function normalizeBranchId(value, fallback = 'dominio') {
  return String(value || fallback).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || fallback;
}

export function normalizeBranchSettings(settings = {}) {
  const branches = Array.isArray(settings.branches) && settings.branches.length
    ? settings.branches.map((branch, index) => ({
        id: normalizeBranchId(branch.id || branch.name, `sucursal-${index + 1}`),
        name: String(branch.name || branch.id || `Sucursal ${index + 1}`).trim() || `Sucursal ${index + 1}`,
        active: branch.active !== false,
        ordersPassword: String(branch.ordersPassword || branch.orders_password || '').trim(),
        stockPassword: String(branch.stockPassword || branch.stock_password || '').trim(),
        cashierPassword: String(branch.cashierPassword || branch.cashier_password || '').trim(),
        whatsappNumber: String(branch.whatsappNumber || branch.whatsapp_number || branch.whatsapp || '').trim(),
        businessHours: branch.businessHours || branch.business_hours || null,
        soldOut: branch.soldOut || branch.sold_out || {},
      }))
    : DEFAULT_BRANCH_SETTINGS.branches;
  const defaultBranchId = normalizeBranchId(settings.defaultBranchId || settings.default_branch_id || branches[0]?.id || DEFAULT_BRANCH_SETTINGS.defaultBranchId, DEFAULT_BRANCH_SETTINGS.defaultBranchId);
  const cashierOrderSources = normalizeCashierOrderSources(settings.cashierOrderSources || settings.cashier_order_sources);
  const requestedDefaultSource = String(settings.defaultCashierOrderSource || settings.default_cashier_order_source || '').trim();
  const defaultCashierOrderSource = cashierOrderSources.includes(requestedDefaultSource)
    ? requestedDefaultSource
    : (cashierOrderSources.includes(DEFAULT_BRANCH_SETTINGS.defaultCashierOrderSource) ? DEFAULT_BRANCH_SETTINGS.defaultCashierOrderSource : cashierOrderSources[0]);
  return { multiBranchEnabled: Boolean(settings.multiBranchEnabled), defaultBranchId, cashierOrderSources, defaultCashierOrderSource, branches };
}

export function publicBranchSettings(settings = DEFAULT_BRANCH_SETTINGS) {
  const normalized = normalizeBranchSettings(settings);
  return { ...normalized, branches: normalized.branches.map(({ ordersPassword, stockPassword, cashierPassword, ...branch }) => branch) };
}

export function hideBranchPasswords(settings = DEFAULT_BRANCH_SETTINGS) {
  return publicBranchSettings(settings);
}

export function selectedBranchFrom(settings, selectedBranchId) {
  const normalized = normalizeBranchSettings(settings);
  const active = normalized.branches.filter((branch) => branch.active !== false);
  return active.find((branch) => branch.id === selectedBranchId) || active.find((branch) => branch.id === normalized.defaultBranchId) || active[0] || normalized.branches[0] || DEFAULT_BRANCH_SETTINGS.branches[0];
}
