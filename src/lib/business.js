import { WHATSAPP_NUMBER } from '../data/menu.js';

export const WEEKDAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export const DEFAULT_BUSINESS_HOURS = {
  messageWhenClosed: 'Estamos cerrados. Puedes mandar tu pedido y lo tomamos cuando abramos.',
  allowClosedOrders: true,
  days: [
    { day: 0, active: true, open: '17:00', close: '23:00' },
    { day: 1, active: true, open: '17:00', close: '23:00' },
    { day: 2, active: true, open: '17:00', close: '23:00' },
    { day: 3, active: true, open: '17:00', close: '23:00' },
    { day: 4, active: true, open: '17:00', close: '23:00' },
    { day: 5, active: true, open: '17:00', close: '23:00' },
    { day: 6, active: true, open: '17:00', close: '23:00' },
  ],
};

export const DEFAULT_BRANCH_SETTINGS = {
  multiBranchEnabled: false,
  defaultBranchId: 'dominio',
  branches: [
    { id: 'dominio', name: 'Dominio', active: true, ordersPassword: '', stockPassword: '', cashierPassword: '', whatsappNumber: '' },
  ],
};

export const BRANCH_STORAGE_KEY = 'pecas_selected_branch';

export function normalizeWhatsAppNumber(value, fallback = WHATSAPP_NUMBER) {
  const raw = String(value || fallback || '').trim();
  const digits = raw.replace(/[^0-9]/g, '');
  return digits || String(fallback || '').replace(/[^0-9]/g, '');
}

export function normalizeBranchId(value, fallback = 'sucursal') {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || fallback;
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
  const defaultBranchId = normalizeBranchId(settings.defaultBranchId || branches[0]?.id || DEFAULT_BRANCH_SETTINGS.defaultBranchId, DEFAULT_BRANCH_SETTINGS.defaultBranchId);
  return {
    multiBranchEnabled: Boolean(settings.multiBranchEnabled),
    defaultBranchId,
    branches,
  };
}

export function activeBranches(settings = DEFAULT_BRANCH_SETTINGS) {
  const normalized = normalizeBranchSettings(settings);
  return normalized.branches.filter((branch) => branch.active !== false);
}

export function selectedBranchFrom(settings, selectedBranchId) {
  const normalized = normalizeBranchSettings(settings);
  const available = activeBranches(normalized);
  return available.find((branch) => branch.id === selectedBranchId)
    || available.find((branch) => branch.id === normalized.defaultBranchId)
    || available[0]
    || normalized.branches[0]
    || DEFAULT_BRANCH_SETTINGS.branches[0];
}

export function normalizeBusinessHours(hours = {}) {
  const byDay = new Map((Array.isArray(hours.days) ? hours.days : []).map((row) => [Number(row.day), row]));
  return {
    ...DEFAULT_BUSINESS_HOURS,
    ...(hours || {}),
    allowClosedOrders: hours.allowClosedOrders !== undefined ? Boolean(hours.allowClosedOrders) : DEFAULT_BUSINESS_HOURS.allowClosedOrders,
    messageWhenClosed: hours.messageWhenClosed || DEFAULT_BUSINESS_HOURS.messageWhenClosed,
    days: DEFAULT_BUSINESS_HOURS.days.map((fallback) => {
      const saved = byDay.get(fallback.day) || {};
      return {
        day: fallback.day,
        active: saved.active !== undefined ? Boolean(saved.active) : fallback.active,
        open: saved.open || fallback.open,
        close: saved.close || fallback.close,
      };
    }),
  };
}

export function timeToMinutes(value) {
  const [hh, mm] = String(value || '').split(':').map((part) => Number(part));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

export function formatHour(value) {
  const minutes = timeToMinutes(value);
  if (minutes === null) return value || '';
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  const suffix = hh >= 12 ? 'PM' : 'AM';
  const displayHour = hh % 12 || 12;
  return `${displayHour}:${String(mm).padStart(2, '0')} ${suffix}`;
}

export function businessStatus(hours = DEFAULT_BUSINESS_HOURS) {
  const normalized = normalizeBusinessHours(hours);
  const now = new Date();
  const today = normalized.days.find((day) => day.day === now.getDay());
  if (!today?.active) return { open: false, label: 'Cerrado hoy' };
  const open = timeToMinutes(today.open);
  const close = timeToMinutes(today.close);
  if (open === null || close === null) return { open: false, label: 'Horario no configurado' };
  const current = now.getHours() * 60 + now.getMinutes();
  const isOpen = close > open ? current >= open && current < close : current >= open || current < close;
  return {
    open: isOpen,
    label: isOpen ? `Abierto ahora · cerramos ${formatHour(today.close)}` : `Cerrado · abrimos ${formatHour(today.open)}`,
    messageWhenClosed: normalized.messageWhenClosed,
    allowClosedOrders: normalized.allowClosedOrders,
  };
}
