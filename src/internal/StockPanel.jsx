import React, { useEffect, useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
import '../styles.css';
import { parseCsvLine, rowsToCsv, downloadTextFile, parseGenericCsv } from '../lib/csv.js';
import { formatOrderDate } from '../lib/dates.js';
import { categoryMeta, mergeProductsWithExtras, slugifyCatalogId } from '../lib/catalog.js';
import {
  DEFAULT_BRANCH_SETTINGS,
  activeBranches,
  normalizeBranchSettings,
  selectedBranchFrom,
} from '../lib/business.js';

const STOCK_SESSION_STORAGE_KEY = 'pecas_stock_session';
const STOCK_BRANCH_STORAGE_KEY = 'pecas_stock_branch';

function Logo() {
  return (
    <div className="brand-area">
      <div className="brand-lockup">
        <div className="brand-logo brand-logo-placeholder">S</div>
        <div>
          <div className="brand-name">Sistema</div>
          <div className="brand-tagline">Operacion</div>
        </div>
      </div>
    </div>
  );
}

function productText(product) {
  return product || { name: '' };
}

const STOCK_OPERATION_TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'inventory', label: 'Inventario' },
  { id: 'receiveWaste', label: 'Entradas/Merma' },
  { id: 'soldOut', label: 'Agotados' },
  { id: 'movements', label: 'Movimientos' },
];

const STOCK_ADMIN_CONFIG_TABS = [
  { id: 'productSetup', label: 'Productos' },
  { id: 'items', label: 'Ingredientes' },
  { id: 'recipesSub', label: 'Recetas/Sub' },
  { id: 'families', label: 'Familias' },
  { id: 'import', label: 'Import' },
];

const ITEM_TYPES = [
  'Ingrediente comprado',
  'Sub-receta / preparado',
  'Empaque',
  'Bebida',
  'Hielo',
];

const ACCURACY_PRESETS = [
  { label: 'Empaque 92%', value: 92 },
  { label: 'Pan 95%', value: 95 },
  { label: 'Bebidas 95%', value: 95 },
  { label: 'Queso / jamón / pepperoni 85%', value: 85 },
  { label: 'Pollo 80%', value: 80 },
  { label: 'Fresa / lechuga / verduras 75%', value: 75 },
  { label: 'Aderezos 80%', value: 80 },
  { label: 'Hielo 65%', value: 65 },
];

const emptyStockItem = {
  name: '',
  brand: '',
  item_type: 'Ingrediente comprado',
  unit_id: '',
  current_stock: 0,
  min_stock: 0,
  max_stock: 0,
  accuracy_target: 85,
  primary_supplier_id: '',
  alt_supplier_id: '',
  purchase_category_id: '',
  purchase_unit_label: '',
  purchase_unit_quantity: 0,
  purchase_price: 0,
  expiry_date: '',
  is_active: true,
  client_visible: false,
  client_removable: false,
  client_changeable: false,
  deducts_inventory: true,
  is_packaging: false,
  is_internal_dressing: false,
  is_side_dressing: false,
  is_sellable_extra: false,
};

const LINE_ROLES = [
  'ingrediente',
  'empaque',
  'aderezo_interno',
  'aderezo_acompanamiento',
  'cubiertos',
  'hielo',
];

function cleanRecipeLineRole(role) {
  const value = String(role || 'ingrediente').trim();
  if (value === 'extra' || value === 'opcion_cliente' || value === 'porcion_estandar') return 'ingrediente';
  return LINE_ROLES.includes(value) ? value : 'ingrediente';
}

function normalizeRecipeLine(line) {
  return {
    ...line,
    line_role: cleanRecipeLineRole(line.line_role),
    client_visible: Boolean(line.client_visible || line.is_optional || line.is_extra_billable),
    is_optional: Boolean(line.is_optional || line.is_extra_billable),
    is_extra_billable: Boolean(line.is_extra_billable),
    extra_price: Number(line.extra_price || (line.is_extra_billable ? 10 : 0)),
  };
}

const emptyRecipeDraft = {
  id: null,
  recipe_key: '',
  recipe_type: 'product',
  name: '',
  output_item_id: '',
  output_quantity: '',
  notes: '',
  is_active: true,
  lines: [],
};

const emptyRecipeLineDraft = {
  item_id: '',
  quantity: '',
  line_role: 'ingrediente',
  client_visible: false,
  client_removable: false,
  client_changeable: false,
  is_default: false,
  is_optional: false,
  is_extra_billable: false,
  extra_price: 0,
};

const emptyOptionFamilyDraft = {
  id: null,
  family_key: '',
  name: '',
  description: '',
  is_active: true,
  options: [],
  productRules: [],
};

const emptyFamilyOptionDraft = {
  item_id: '',
  option_name: '',
  quantity: '',
  extra_price: 0,
  is_default: false,
  is_active: true,
  components: [],
};

const emptyFamilyComponentDraft = { item_id: '', quantity: '' };

const emptyProductFamilyRuleDraft = {
  product_id: '',
  label: '',
  min_select: 0,
  max_included: 0,
  max_total: 1,
  default_option_name: '',
  extra_price: 0,
  is_required: false,
  is_active: true,
};

function recipeLabel(recipe) {
  return `${recipe.name}${recipe.recipe_type === 'subrecipe' && recipe.output_quantity ? ` → ${formatStockQuantity(recipe.output_quantity, recipe.output_unit_code)}` : ''}`;
}

function formatStockQuantity(value, unitCode) {
  const number = Number(value || 0);
  const clean = Number.isInteger(number) ? number : Number(number.toFixed(2));
  return `${clean} ${unitCode || ''}`.trim();
}

function stockLevelClass(item) {
  const current = Number(item.current_stock || 0);
  const min = Number(item.min_stock || 0);
  if (current <= 0) return 'danger';
  if (min > 0 && current <= min) return 'warning';
  return 'ok';
}

function stockLevelLabel(item) {
  const current = Number(item.current_stock || 0);
  const min = Number(item.min_stock || 0);
  if (current <= 0) return 'Agotado';
  if (min > 0 && current <= min) return 'Stock bajo';
  return 'OK';
}

function daysUntilExpiry(expiryDate) {
  if (!expiryDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(`${expiryDate}T00:00:00`);
  if (Number.isNaN(expiry.getTime())) return null;
  return Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
}

function purchaseSuggestion(item) {
  const current = Number(item.current_stock || 0);
  const min = Number(item.min_stock || 0);
  const max = Number(item.max_stock || 0);
  const packQty = Number(item.purchase_unit_quantity || 0);
  if (!max || current > min) return null;
  const needed = Math.max(0, max - current);
  if (!needed) return null;
  if (packQty > 0) {
    const packs = Math.ceil(needed / packQty);
    return `${packs} ${item.purchase_unit_label || 'presentación(es)'}`;
  }
  return formatStockQuantity(needed, item.unit_code);
}


const STOCK_CSV_COLUMNS = [
  'name',
  'brand',
  'item_type',
  'unit_code',
  'current_stock',
  'min_stock',
  'max_stock',
  'accuracy_target',
  'primary_supplier',
  'alt_supplier',
  'purchase_category',
  'purchase_unit_label',
  'purchase_unit_quantity',
  'purchase_price',
  'expiry_date',
];

const STOCK_CSV_HEADER_ALIASES = {
  ingrediente: 'name',
  insumo: 'name',
  producto: 'name',
  nombre: 'name',
  name: 'name',
  marca: 'brand',
  brand: 'brand',
  tipo: 'item_type',
  item_type: 'item_type',
  categoria_tipo: 'item_type',
  unidad: 'unit_code',
  unidad_base: 'unit_code',
  unit: 'unit_code',
  unit_code: 'unit_code',
  stock: 'current_stock',
  stock_actual: 'current_stock',
  cantidad: 'current_stock',
  current_stock: 'current_stock',
  minimo: 'min_stock',
  'mínimo': 'min_stock',
  min: 'min_stock',
  min_stock: 'min_stock',
  maximo: 'max_stock',
  'máximo': 'max_stock',
  max: 'max_stock',
  max_stock: 'max_stock',
  precision: 'accuracy_target',
  accuracy: 'accuracy_target',
  accuracy_target: 'accuracy_target',
  proveedor: 'primary_supplier',
  proveedor_principal: 'primary_supplier',
  primary_supplier: 'primary_supplier',
  proveedor_alt: 'alt_supplier',
  proveedor_alterno: 'alt_supplier',
  alt_supplier: 'alt_supplier',
  categoria_compra: 'purchase_category',
  'categoría_compra': 'purchase_category',
  purchase_category: 'purchase_category',
  presentacion: 'purchase_unit_label',
  'presentación': 'purchase_unit_label',
  purchase_unit_label: 'purchase_unit_label',
  cantidad_presentacion: 'purchase_unit_quantity',
  'cantidad_presentación': 'purchase_unit_quantity',
  purchase_unit_quantity: 'purchase_unit_quantity',
  precio: 'purchase_price',
  costo: 'purchase_price',
  purchase_price: 'purchase_price',
  caducidad: 'expiry_date',
  expiry_date: 'expiry_date',
};

function normalizeStockCsvHeader(header) {
  const key = String(header || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return STOCK_CSV_HEADER_ALIASES[key] || key;
}

function parseStockCsv(text) {
  const lines = String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map(normalizeStockCsvHeader);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce((row, header, index) => {
      if (header) row[header] = values[index] ?? '';
      return row;
    }, {});
  }).filter((row) => String(row.name || '').trim());
}

function csvTemplateText() {
  const rows = [
    STOCK_CSV_COLUMNS.join(','),
    'Pan chapata,,Ingrediente comprado,pieza,24,10,50,95,Costco,HEB,Pan,bolsa 12 piezas,12,0,',
    'Queso manchego,,Ingrediente comprado,g,1000,300,2000,85,Costco,HEB,Refrigerados,paquete 1 kg,1000,180,',
    'Hielo en bolsa,,Hielo,bolsa,2,1,5,65,HEB,Costco,Café y bebidas,bolsa,1,35,',
  ];
  return rows.join('\n');
}

function downloadStockCsvTemplate() {
  downloadTextFile('pecas-stock-template.csv', csvTemplateText());
}


const RECIPE_CSV_COLUMNS = [
  'recipe_key',
  'recipe_type',
  'recipe_name',
  'output_item_name',
  'output_quantity',
  'ingredient_name',
  'quantity',
  'line_role',
  'client_visible',
  'client_removable',
  'client_changeable',
  'is_default',
  'is_optional',
  'is_extra_billable',
  'extra_price',
  'notes',
];

function parseRecipeCsv(text) {
  const lines = String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce((row, header, index) => {
      row[header] = values[index] ?? '';
      return row;
    }, {});
  }).filter((row) => String(row.recipe_key || '').trim() && String(row.recipe_name || '').trim());
}

function recipeCsvTemplateText() {
  const rows = [
    RECIPE_CSV_COLUMNS.join(','),
    'product:crepa-dulce,product,Crepa dulce,,,Masa crepa,120,ingrediente,0,0,0,1,0,0,0,Base interna: masa + empaque',
    'product:crepa-dulce,product,Crepa dulce,,,Contenedor crepa,1,empaque,0,0,0,1,0,0,0,',
    'product:crepa-dulce,product,Crepa dulce,,,Nutella,35,ingrediente,1,0,0,0,1,1,10,Cantidad por uso si el cliente la elige',
    'product:crepa-dulce,product,Crepa dulce,,,Fresa,40,ingrediente,1,0,0,0,1,1,10,Cantidad por uso si el cliente la elige',
    'subrecipe:aderezo-chipotle,subrecipe,Aderezo chipotle,Aderezo chipotle preparado,850,Mayonesa,500,ingrediente,0,0,0,1,0,0,0,',
    'subrecipe:aderezo-chipotle,subrecipe,Aderezo chipotle,Aderezo chipotle preparado,850,Chipotle,100,ingrediente,0,0,0,1,0,0,0,',
  ];
  return rows.join('\n');
}

function downloadRecipeCsvTemplate() {
  downloadTextFile('pecas-recipes-template.csv', recipeCsvTemplateText());
}

const FAMILY_CSV_COLUMNS = [
  'record_type',
  'family_key',
  'family_name',
  'family_description',
  'family_active',
  'family_sort_order',
  'row_type',
  'option_name',
  'ingredient_name',
  'quantity',
  'unit_code',
  'option_extra_price',
  'option_default',
  'option_active',
  'option_sort_order',
  'product_id',
  'label',
  'min_select',
  'max_included',
  'max_total',
  'default_option_name',
  'product_extra_price',
  'required',
  'rule_active',
  'rule_sort_order',
  'notes',
];

function familyCsvTemplateText() {
  const rows = [
    FAMILY_CSV_COLUMNS.join(','),
    'family_option,jarabes,Jarabes,Sabores para café,1,1,option,Vainilla francesa,Jarabe vainilla francesa,20,ml,10,0,1,1,,,,,,,,,,,',
    'family_component,aderezos-acompanamiento,Aderezos de acompañamiento,Aderezo aparte,1,2,component,Chipotle,Contenedor aderezo,1,pieza,0,0,1,1,,,,,,,,,,,',
    'family_product_rule,jarabes,Jarabes,Sabores para café,1,1,product_rule,,,,,,,,,latte,Jarabe,0,0,2,,10,0,1,1,Latte puede agregar jarabes con costo extra',
  ];
  return rows.join('\n');
}

function downloadFamilyCsvTemplate() {
  downloadTextFile('pecas-familias-template.csv', familyCsvTemplateText());
}

function parseFamilyCsv(text) {
  const rows = parseGenericCsv(text);
  return rows.filter((row) => String(row.family_key || '').trim() && String(row.row_type || '').trim());
}

function familyRowsFromCurrent(optionFamilies = []) {
  const rows = [];
  for (const family of optionFamilies || []) {
    const base = {
      family_key: family.family_key || '',
      family_name: family.name || '',
      family_description: family.description || '',
      family_active: Number(family.is_active || 0) ? 1 : 0,
      family_sort_order: family.sort_order ?? 0,
    };
    const options = family.options && family.options.length ? family.options : [];
    for (const option of options) {
      rows.push({
        record_type: 'family_option',
        ...base,
        row_type: 'option',
        option_name: option.option_name || '',
        ingredient_name: option.item_name || '',
        quantity: option.quantity ?? 0,
        unit_code: option.unit_code || '',
        option_extra_price: option.extra_price ?? 0,
        option_default: Number(option.is_default || 0) ? 1 : 0,
        option_active: Number(option.is_active || 0) ? 1 : 0,
        option_sort_order: option.sort_order ?? 0,
      });
      for (const component of option.components || []) {
        rows.push({
          record_type: 'family_component',
          ...base,
          row_type: 'component',
          option_name: option.option_name || '',
          ingredient_name: component.item_name || '',
          quantity: component.quantity ?? 0,
          unit_code: component.unit_code || '',
          option_sort_order: component.sort_order ?? 0,
        });
      }
    }
    const productRules = family.productRules && family.productRules.length ? family.productRules : [];
    for (const rule of productRules) {
      rows.push({
        record_type: 'family_product_rule',
        ...base,
        row_type: 'product_rule',
        product_id: rule.product_id || '',
        label: rule.label || family.name || '',
        min_select: rule.min_select ?? 0,
        max_included: rule.max_included ?? 0,
        max_total: rule.max_total ?? 1,
        default_option_name: rule.default_option_name || '',
        product_extra_price: rule.extra_price ?? 0,
        required: Number(rule.is_required || 0) ? 1 : 0,
        rule_active: Number(rule.is_active || 0) ? 1 : 0,
        rule_sort_order: rule.sort_order ?? 0,
      });
    }
    if (!options.length && !productRules.length) {
      rows.push({ record_type: 'family', ...base, row_type: 'family' });
    }
  }
  return rows;
}

function stockRowsFromCurrent(items) {
  return (items || []).map((item) => ({
    name: item.name || '',
    brand: item.brand || '',
    item_type: item.item_type || 'Ingrediente comprado',
    unit_code: item.unit_code || '',
    current_stock: item.current_stock ?? 0,
    min_stock: item.min_stock ?? 0,
    max_stock: item.max_stock ?? 0,
    accuracy_target: item.accuracy_target ?? 85,
    primary_supplier: item.supplier_name || '',
    alt_supplier: item.alt_supplier_name || '',
    purchase_category: item.purchase_category_name || '',
    purchase_unit_label: item.purchase_unit_label || '',
    purchase_unit_quantity: item.purchase_unit_quantity ?? 0,
    purchase_price: item.purchase_price ?? 0,
    expiry_date: item.expiry_date || '',
  }));
}

function recipeRowsFromCurrent(recipes, recipeType = 'all', items = []) {
  const itemNameById = new Map((items || []).map((item) => [Number(item.id), item.name]));
  const unitById = new Map((items || []).map((item) => [Number(item.id), item.unit_code]));

  return (recipes || [])
    .filter((recipe) => recipeType === 'all' || recipe.recipe_type === recipeType)
    .flatMap((recipe) => {
      const lines = recipe.lines && recipe.lines.length ? recipe.lines : [{}];
      return lines.map((line) => {
        const itemId = Number(line.item_id || line.itemId || 0);
        const ingredientName = line.item_name || line.ingredient_name || line.name || itemNameById.get(itemId) || '';
        return {
          recipe_key: recipe.recipe_key || '',
          recipe_type: recipe.recipe_type || 'product',
          recipe_name: recipe.name || '',
          output_item_name: recipe.output_item_name || '',
          output_quantity: recipe.output_quantity || '',
          ingredient_name: ingredientName,
          quantity: line.quantity || '',
          line_role: cleanRecipeLineRole(line.line_role),
          client_visible: Number(line.client_visible || 0) ? 1 : 0,
          client_removable: Number(line.client_removable || 0) ? 1 : 0,
          client_changeable: Number(line.client_changeable || 0) ? 1 : 0,
          is_default: Number(line.is_default || 0) ? 1 : 0,
          is_optional: Number(line.is_optional || 0) ? 1 : 0,
          is_extra_billable: Number(line.is_extra_billable || 0) ? 1 : 0,
          extra_price: line.extra_price || 0,
          notes: recipe.notes || '',
        };
      });
    });
}


function allCurrentRows(items, recipes, optionFamilies = []) {
  const columns = Array.from(new Set(['record_type', ...STOCK_CSV_COLUMNS, ...RECIPE_CSV_COLUMNS, ...FAMILY_CSV_COLUMNS]));
  const itemRows = stockRowsFromCurrent(items).map((row) => ({ record_type: 'ingredient', ...row }));
  const recipeRows = recipeRowsFromCurrent(recipes, 'all', items).map((row) => ({ record_type: row.recipe_type === 'subrecipe' ? 'subrecipe' : 'recipe', ...row }));
  const familyRows = familyRowsFromCurrent(optionFamilies);
  return { columns, rows: [...itemRows, ...recipeRows, ...familyRows] };
}

const PRODUCTION_BATCH_OPTIONS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4];

function makeQuickDrafts(items) {
  return (items || []).map((item) => ({
    id: item.id,
    name: item.name,
    brand: item.brand || '',
    unit_code: item.unit_code || '',
    current_stock: item.current_stock ?? 0,
    min_stock: item.min_stock ?? 0,
    max_stock: item.max_stock ?? 0,
    purchase_price: item.purchase_price ?? 0,
    expiry_date: item.expiry_date || '',
  }));
}

import { getSessionToken } from '../lib/apiClient.js';

// Si ya hay sesión de personal (login por email/password, ver AdminPanel /
// EmployeeLoginModal), se manda como Bearer y el backend la prioriza sobre
// el PIN de sucursal. El PIN (password/operatorName/shift) sigue funcionando
// tal cual para personal de cocina sin cuenta propia.
function authHeaders() {
  const token = getSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function StockPanel({ mode = 'stock', embeddedPassword = '' } = {}) {
  const isAdminConfigMode = mode === 'adminConfig';
  const hasSession = Boolean(getSessionToken());
  const visibleStockTabs = isAdminConfigMode ? STOCK_ADMIN_CONFIG_TABS : STOCK_OPERATION_TABS;
  const savedSession = (() => {
    try {
      return JSON.parse(window.sessionStorage.getItem(STOCK_SESSION_STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  })();

  const [password, setPassword] = useState(isAdminConfigMode ? '' : (savedSession.password || ''));
  const [operatorName, setOperatorName] = useState(isAdminConfigMode ? 'Admin' : (savedSession.operatorName || ''));
  const [shift, setShift] = useState(isAdminConfigMode ? 'Admin' : (savedSession.shift || 'Noche'));
  const [role, setRole] = useState(isAdminConfigMode ? 'admin' : (savedSession.role || ''));
  const [stockAccessScope, setStockAccessScope] = useState(savedSession.accessScope || 'legacy');
  const [stockLockedBranchId, setStockLockedBranchId] = useState(savedSession.lockedBranchId || null);
  const [unlocked, setUnlocked] = useState(isAdminConfigMode ? hasSession : Boolean(savedSession.password));
  const [activeTab, setActiveTab] = useState(isAdminConfigMode ? 'productSetup' : 'dashboard');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ items: [], units: [], categories: [], suppliers: [], movements: [], wasteRequests: [], inventoryCountRequests: [], recipes: [], optionFamilies: [], menuSettings: { overrides: {}, categoryHidden: {} }, branchSettings: normalizeBranchSettings(DEFAULT_BRANCH_SETTINGS), selectedBranch: DEFAULT_BRANCH_SETTINGS.branches[0] });
  const [itemDraft, setItemDraft] = useState(emptyStockItem);
  const [receiveDraft, setReceiveDraft] = useState({ itemId: '', quantity: '', note: '' });
  const [wasteDraft, setWasteDraft] = useState({ itemId: '', quantity: '', reason: '' });
  const [recipeDraft, setRecipeDraft] = useState(emptyRecipeDraft);
  const [recipeLineDraft, setRecipeLineDraft] = useState(emptyRecipeLineDraft);
  const [optionFamilyDraft, setOptionFamilyDraft] = useState(emptyOptionFamilyDraft);
  const [familyOptionDraft, setFamilyOptionDraft] = useState(emptyFamilyOptionDraft);
  const [familyComponentDraft, setFamilyComponentDraft] = useState(emptyFamilyComponentDraft);
  const [productFamilyRuleDraft, setProductFamilyRuleDraft] = useState(emptyProductFamilyRuleDraft);
  const [productionDraft, setProductionDraft] = useState({ recipeId: '', batchMultiplier: '1', note: '' });
  const [selectedProductSetupId, setSelectedProductSetupId] = useState('');
  const [productDraft, setProductDraft] = useState({ name: '', category: '', price: '', description: '', emoji: '🍽️' });

  const [quickDrafts, setQuickDrafts] = useState([]);
  const [inventoryCounts, setInventoryCounts] = useState({});
  const [inventoryReason, setInventoryReason] = useState('Conteo de inventario');
  const [csvText, setCsvText] = useState('');
  const [csvMode, setCsvMode] = useState('upsert');
  const [recipeCsvText, setRecipeCsvText] = useState('');
  const [recipeCsvMode, setRecipeCsvMode] = useState('upsert');
  const [familyCsvText, setFamilyCsvText] = useState('');
  const [familyCsvMode, setFamilyCsvMode] = useState('upsert');
  const [importKind, setImportKind] = useState('items');
  const [recipeEditorType, setRecipeEditorType] = useState('product');
  const [stockBranchId, setStockBranchId] = useState(() => {
    try { return window.sessionStorage.getItem(STOCK_BRANCH_STORAGE_KEY) || ''; } catch { return ''; }
  });

  const authPayload = () => ({
    password: String(password || '').trim(),
    operatorName: String(operatorName || '').trim(),
    shift: String(shift || '').trim() || 'Sin turno',
  });

  const loadStock = async () => {
    if (!hasSession && (!password || (!isAdminConfigMode && !operatorName.trim()))) {
      setStatus('Ingresa tu nombre y contraseña.');
      return;
    }

    setLoading(true);
    setStatus('Cargando stock...');
    try {
      const response = await fetch('/api/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
  action: 'list',
  branchId: stockBranchId || undefined,
  auth: {
    password: password.trim(),
    operatorName: (operatorName || 'Admin').trim(),
    shift: (shift || 'Admin').trim(),
  },
}),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        setUnlocked(false);
        setStatus(result.error || 'No se pudo cargar stock.');
        return;
      }
      const nextRole = result.role || 'kitchen';
      setRole(nextRole);
      setStockAccessScope(result.accessScope || 'legacy');
      setStockLockedBranchId(result.lockedBranchId || null);
      setUnlocked(true);
      const nextItems = result.items || [];
      setData({
        items: nextItems,
        units: result.units || [],
        categories: result.categories || [],
        suppliers: result.suppliers || [],
        movements: result.movements || [],
        wasteRequests: result.wasteRequests || [],
        recipes: result.recipes || [],
        optionFamilies: result.optionFamilies || [],
        menuSettings: result.menuSettings || { overrides: {}, categoryHidden: {} },
        branchSettings: normalizeBranchSettings(result.branchSettings || result.menuSettings?.branchSettings || DEFAULT_BRANCH_SETTINGS),
        selectedBranch: result.selectedBranch || selectedBranchFrom(result.branchSettings || result.menuSettings?.branchSettings || DEFAULT_BRANCH_SETTINGS, stockBranchId),
      });
      if (result.selectedBranch?.id && result.selectedBranch.id !== stockBranchId) {
        setStockBranchId(result.selectedBranch.id);
        try { window.sessionStorage.setItem(STOCK_BRANCH_STORAGE_KEY, result.selectedBranch.id); } catch { /* ignore */ }
      }
      setQuickDrafts(makeQuickDrafts(nextItems));
      try {
        if (!isAdminConfigMode) window.sessionStorage.setItem(STOCK_SESSION_STORAGE_KEY, JSON.stringify({ password, operatorName, shift, role: nextRole, accessScope: result.accessScope || 'legacy', lockedBranchId: result.lockedBranchId || null }));
      } catch {
        // ignore storage errors
      }
      setStatus('');
    } catch (error) {
      setStatus(`No se pudo cargar stock: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (password && operatorName && unlocked) loadStock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  useEffect(() => {
    if (isAdminConfigMode && hasSession) {
      loadStock();
    }
  }, []);

  const postStockAction = async (payload, successMessage = '', options = {}) => {
    setLoading(true);
    setStatus('Guardando...');
    try {
      const response = await fetch('/api/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ ...payload, branchId: stockBranchId || data.selectedBranch?.id || undefined, auth: authPayload() }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        if (options.returnData) return result;
        const firstValidation = Array.isArray(result.validationErrors) ? result.validationErrors[0] : null;
        setStatus(firstValidation ? `Línea ${firstValidation.line}: ${firstValidation.message}` : (result.error || result.detail || 'No se pudo guardar.'));
        return false;
      }
      setStatus(successMessage || 'Listo.');
      if (!options.skipReload) await loadStock();
      return options.returnData ? result : true;
    } catch (error) {
      setStatus(`No se pudo guardar: ${error.message}`);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    try {
      window.sessionStorage.removeItem(STOCK_SESSION_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
    setPassword('');
    setOperatorName('');
    setStockAccessScope('legacy');
    setStockLockedBranchId(null);
    setShift('Noche');
    setRole('');
    setUnlocked(false);
    setData({ items: [], units: [], categories: [], suppliers: [], movements: [], wasteRequests: [], inventoryCountRequests: [], recipes: [], optionFamilies: [], menuSettings: { overrides: {}, categoryHidden: {} }, branchSettings: normalizeBranchSettings(DEFAULT_BRANCH_SETTINGS), selectedBranch: DEFAULT_BRANCH_SETTINGS.branches[0] });
    setQuickDrafts([]);
  };

  const saveItem = async () => {
    if (role !== 'admin') return;
    if (!itemDraft.name.trim() || !itemDraft.unit_id) {
      setStatus('El ingrediente necesita nombre y unidad base.');
      return;
    }
    const ok = await postStockAction({ action: 'saveItem', item: itemDraft }, 'Ingrediente guardado.');
    if (ok) setItemDraft(emptyStockItem);
  };

  const seedDefaults = async () => {
    if (role !== 'admin') return;
    await postStockAction({ action: 'seedDefaults' }, 'Catálogo base creado.');
  };

  const receiveStock = async () => {
    if (!receiveDraft.itemId || !Number(receiveDraft.quantity)) {
      setStatus('Selecciona ingrediente y cantidad de entrada.');
      return;
    }
    const ok = await postStockAction({ action: 'receiveStock', ...receiveDraft }, 'Entrada registrada.');
    if (ok) setReceiveDraft({ itemId: '', quantity: '', note: '' });
  };

  const reportWaste = async () => {
    if (!wasteDraft.itemId || !Number(wasteDraft.quantity) || !wasteDraft.reason.trim()) {
      setStatus('La merma necesita ingrediente, cantidad y razón obligatoria.');
      return;
    }
    const ok = await postStockAction({ action: 'reportWaste', ...wasteDraft }, role === 'admin' ? 'Merma aplicada.' : 'Merma enviada para aprobación.');
    if (ok) setWasteDraft({ itemId: '', quantity: '', reason: '' });
  };

  const approveWaste = async (requestId, approved) => {
    await postStockAction({ action: approved ? 'approveWaste' : 'rejectWaste', requestId }, approved ? 'Merma aprobada.' : 'Merma rechazada.');
  };

  const seedRecipes = async () => {
    if (role !== 'admin') return;
    await postStockAction({ action: 'seedRecipeDefaults' }, 'Recetas base creadas. Revisa cantidades antes de usarlas como definitivas.');
  };

  const addRecipeLine = () => {
    if (!recipeLineDraft.item_id || !Number(recipeLineDraft.quantity)) {
      setStatus('La línea necesita ingrediente y cantidad.');
      return;
    }
    setRecipeDraft((current) => ({
      ...current,
      lines: [
        ...(current.lines || []),
        normalizeRecipeLine({
          ...recipeLineDraft,
          item_id: Number(recipeLineDraft.item_id),
          quantity: Number(recipeLineDraft.quantity),
        }),
      ],
    }));
    setRecipeLineDraft(emptyRecipeLineDraft);
  };

  const removeRecipeLine = (index) => {
    setRecipeDraft((current) => ({ ...current, lines: (current.lines || []).filter((_, lineIndex) => lineIndex !== index) }));
  };

  const editRecipe = (recipe) => {
    setActiveTab('recipesSub');
    setRecipeEditorType(recipe.recipe_type === 'subrecipe' ? 'subrecipe' : 'product');
    setRecipeDraft({
      ...emptyRecipeDraft,
      ...recipe,
      output_item_id: recipe.output_item_id || '',
      output_quantity: recipe.output_quantity || '',
      is_active: Boolean(recipe.is_active),
      lines: (recipe.lines || []).map((line) => normalizeRecipeLine({
        ...line,
        item_id: line.item_id,
        quantity: line.quantity,
        client_removable: Boolean(line.client_removable),
        client_changeable: Boolean(line.client_changeable),
        is_default: Boolean(line.is_default),
      })),
    });
  };

  const editProductRecipe = (product) => {
    const existing = data.recipes.find((recipe) => recipe.recipe_type === 'product' && recipe.recipe_key === `product:${product.id}`);
    if (existing) {
      editRecipe(existing);
      return;
    }
    setRecipeEditorType('product');
    setRecipeDraft({
      ...emptyRecipeDraft,
      recipe_type: 'product',
      recipe_key: `product:${product.id}`,
      name: product.name,
      is_active: true,
      lines: [],
    });
    setRecipeLineDraft(emptyRecipeLineDraft);
    setActiveTab('recipesSub');
  };

  const startProductFamilyAssignment = (product) => {
    setProductFamilyRuleDraft((current) => ({ ...emptyProductFamilyRuleDraft, ...current, product_id: product.id }));
    setActiveTab('families');
  };

  const startNewRecipe = (recipeType) => {
    setRecipeDraft({ ...emptyRecipeDraft, recipe_type: recipeType });
    setRecipeLineDraft(emptyRecipeLineDraft);
  };

  const saveRecipe = async () => {
    if (role !== 'admin') return;
    if (!recipeDraft.name.trim() || !recipeDraft.recipe_key.trim()) {
      setStatus('La receta necesita nombre y clave.');
      return;
    }
    const ok = await postStockAction({ action: 'saveRecipe', recipe: recipeDraft }, 'Receta guardada.');
    if (ok) setRecipeDraft(emptyRecipeDraft);
  };

  const saveCatalogProduct = async (productInput = productDraft, options = {}) => {
    if (role !== 'admin') return null;
    const name = String(productInput.name || '').trim();
    if (!name) {
      setStatus('El producto necesita nombre.');
      return null;
    }
    const id = slugifyCatalogId(productInput.id || name, 'producto');
    const category = productInput.category || stockMenuCategories[0]?.id || '';
    const selectedCategory = stockMenuCategories.find((item) => item.id === category);
    if (!stockMenuCategories.length) {
      setStatus('Primero crea una categoría en Secciones del menú. Después podrás agregar productos.');
      return null;
    }
    if (!selectedCategory) {
      setStatus('Selecciona una categoría existente para este producto.');
      return null;
    }
    const payload = {
      id,
      name,
      category,
      categoryLabel: selectedCategory.label || selectedCategory.id,
      price: Number(productInput.price || 0),
      description: productInput.description || '',
      emoji: productInput.emoji || '🍽️',
    };
    const ok = await postStockAction({ action: 'saveCatalogProduct', product: payload }, options.successMessage || 'Producto guardado en menú.');
    if (!ok) return null;
    setSelectedProductSetupId(id);
    if (!options.keepDraft) setProductDraft({ name: '', category, price: '', description: '', emoji: '🍽️' });
    return payload;
  };

  const createProductFromDraft = async () => {
    const product = await saveCatalogProduct(productDraft);
    if (!product) return;
    setRecipeEditorType('product');
    setRecipeDraft({
      ...emptyRecipeDraft,
      recipe_type: 'product',
      recipe_key: `product:${product.id}`,
      name: product.name,
      is_active: true,
      lines: [],
    });
  };

  const publishRecipeAsProduct = async (recipe) => {
    const cleanKey = String(recipe.recipe_key || '').replace(/^product:/, '');
    const product = await saveCatalogProduct({
      id: cleanKey || recipe.name,
      name: recipe.name,
      category: productDraft.category || stockMenuCategories[0]?.id || '',
      price: productDraft.price || 0,
      description: recipe.notes || '',
      emoji: productDraft.emoji || '🍽️',
    }, { keepDraft: true, successMessage: 'Receta publicada como producto del menú.' });
    if (product) setSelectedProductSetupId(product.id);
  };

  const archiveSelectedRecipe = async (recipe, archived = true) => {
    if (!recipe?.id || role !== 'admin') return;
    const ok = await postStockAction({ action: archived ? 'archiveRecipe' : 'restoreRecipe', recipeId: recipe.id }, archived ? 'Receta archivada.' : 'Receta restaurada.');
    if (ok) setRecipeDraft(emptyRecipeDraft);
  };



  const seedOptionFamilies = async () => {
    if (role !== 'admin') return;
    await postStockAction({ action: 'seedOptionFamilies' }, 'Familias base creadas/actualizadas.');
  };

  const editOptionFamily = (family) => {
    setActiveTab('families');
    setOptionFamilyDraft({
      ...emptyOptionFamilyDraft,
      ...family,
      is_active: Boolean(family.is_active),
      options: (family.options || []).map((option) => ({
        item_id: option.item_id || '',
        option_name: option.option_name || option.item_name || '',
        quantity: option.quantity || '',
        extra_price: option.extra_price || 0,
        is_default: Boolean(option.is_default),
        is_active: option.is_active !== 0,
        components: (option.components || []).map((component) => ({ item_id: component.item_id || '', item_name: component.item_name || '', quantity: component.quantity || '' })),
      })),
      productRules: (family.productRules || []).map((rule) => ({
        product_id: rule.product_id || '',
        label: rule.label || family.name || '',
        min_select: rule.min_select || 0,
        max_included: rule.max_included || 0,
        max_total: rule.max_total || 1,
        default_option_name: rule.default_option_name || '',
        extra_price: rule.extra_price || 0,
        is_required: Boolean(rule.is_required),
        is_active: rule.is_active !== 0,
      })),
    });
  };

  const addFamilyComponent = () => {
    if (!familyComponentDraft.item_id || Number(familyComponentDraft.quantity || 0) <= 0) {
      setStatus('Selecciona un componente adicional y una cantidad mayor a 0.');
      return;
    }
    setFamilyOptionDraft((current) => ({ ...current, components: [...(current.components || []), { ...familyComponentDraft }] }));
    setFamilyComponentDraft(emptyFamilyComponentDraft);
  };

  const removeFamilyComponent = (index) => setFamilyOptionDraft((current) => ({ ...current, components: (current.components || []).filter((_, i) => i !== index) }));

  const addFamilyOption = () => {
    if (!familyOptionDraft.item_id || !familyOptionDraft.option_name.trim() || !Number(familyOptionDraft.quantity)) {
      setStatus('La opción necesita ingrediente, nombre visible y cantidad por uso.');
      return;
    }
    setOptionFamilyDraft((current) => ({ ...current, options: [...(current.options || []), { ...familyOptionDraft }] }));
    setFamilyOptionDraft(emptyFamilyOptionDraft);
    setFamilyComponentDraft(emptyFamilyComponentDraft);
  };

  const removeFamilyOption = (index) => setOptionFamilyDraft((current) => ({ ...current, options: (current.options || []).filter((_, i) => i !== index) }));

  const addProductFamilyRule = () => {
    if (!productFamilyRuleDraft.product_id) {
      setStatus('Selecciona el producto donde se usará esta familia.');
      return;
    }
    setOptionFamilyDraft((current) => ({ ...current, productRules: [...(current.productRules || []), { ...productFamilyRuleDraft, label: productFamilyRuleDraft.label || current.name }] }));
    setProductFamilyRuleDraft(emptyProductFamilyRuleDraft);
  };

  const removeProductFamilyRule = async (index) => {
    const rule = (optionFamilyDraft.productRules || [])[index];
    setOptionFamilyDraft((current) => ({ ...current, productRules: (current.productRules || []).filter((_, i) => i !== index) }));
    if (optionFamilyDraft.family_key && rule?.product_id) {
      await postStockAction({
        action: 'removeProductFamilyRule',
        familyKey: optionFamilyDraft.family_key,
        familyId: optionFamilyDraft.id || null,
        productId: rule.product_id,
      }, 'Familia quitada del producto.');
    }
  };

  const saveOptionFamily = async () => {
    if (role !== 'admin') return;
    if (!optionFamilyDraft.family_key.trim() || !optionFamilyDraft.name.trim()) {
      setStatus('La familia necesita clave y nombre.');
      return;
    }
    const ok = await postStockAction({ action: 'saveOptionFamily', family: optionFamilyDraft }, 'Familia guardada.');
    if (ok) {
      setOptionFamilyDraft(emptyOptionFamilyDraft);
      setFamilyOptionDraft(emptyFamilyOptionDraft);
      setFamilyComponentDraft(emptyFamilyComponentDraft);
      setProductFamilyRuleDraft(emptyProductFamilyRuleDraft);
    }
  };


  const produceSubRecipe = async () => {    const selectedRecipe = data.recipes.find((recipe) => Number(recipe.id) === Number(productionDraft.recipeId));
    const multiplier = Number(productionDraft.batchMultiplier || 1);
    const outputQuantity = Number(selectedRecipe?.output_quantity || 0) * multiplier;
    if (!productionDraft.recipeId || !outputQuantity) {
      setStatus('Selecciona sub-receta y cantidad producida.');
      return;
    }
    const ok = await postStockAction({ action: 'produceSubRecipe', recipeId: productionDraft.recipeId, outputQuantity, batchMultiplier: multiplier, note: productionDraft.note }, 'Producción registrada.');
    if (ok) setProductionDraft({ recipeId: '', batchMultiplier: '1', note: '' });
  };



  const updateQuickDraft = (id, key, value) => {
    setQuickDrafts((current) => current.map((item) => (
      item.id === id ? { ...item, [key]: value } : item
    )));
  };

  const saveQuickEdits = async () => {
    if (role !== 'admin') return;
    const invalid = quickDrafts.find((item) => Number(item.current_stock) < 0 || Number(item.min_stock) < 0 || Number(item.max_stock) < 0);
    if (invalid) {
      setStatus(`No se permiten cantidades negativas en ${invalid.name}.`);
      return;
    }
    await postStockAction({ action: 'bulkUpdateItems', items: quickDrafts }, 'Cambios rápidos guardados.');
  };

  const updateInventoryCount = (itemId, value) => {
    setInventoryCounts((current) => ({ ...current, [itemId]: value }));
  };

  const submitInventoryCounts = async () => {
    const rows = Object.entries(inventoryCounts)
      .filter(([, value]) => String(value).trim() !== '')
      .map(([itemId, value]) => ({ itemId: Number(itemId), current_stock: Number(value) }));
    const invalid = rows.find((row) => !row.itemId || !Number.isFinite(row.current_stock) || row.current_stock < 0);
    if (invalid) {
      setStatus('Revisa inventario: no se permiten cantidades vacías, inválidas o negativas.');
      return;
    }
    if (rows.length === 0) {
      setStatus('No hay cantidades nuevas para guardar.');
      return;
    }
    const ok = await postStockAction({ action: 'submitInventoryCounts', items: rows, reason: inventoryReason }, role === 'admin' ? 'Inventario actualizado.' : 'Conteo enviado para aprobación.');
    if (ok) setInventoryCounts({});
  };

  const approveInventoryCount = async (requestId, approve) => {
    await postStockAction({ action: approve ? 'approveInventoryCount' : 'rejectInventoryCount', requestId }, approve ? 'Ajuste de inventario aprobado.' : 'Ajuste de inventario rechazado.');
  };

  const csvRows = useMemo(() => parseStockCsv(csvText), [csvText]);

  const importCsvRows = async () => {
    if (role !== 'admin') return;
    if (csvRows.length === 0) {
      setStatus('Pega un CSV válido con encabezados y al menos un ingrediente.');
      return;
    }
    const invalid = csvRows.find((row) => Number(row.current_stock || 0) < 0 || Number(row.min_stock || 0) < 0 || Number(row.max_stock || 0) < 0);
    if (invalid) {
      setStatus(`El CSV tiene cantidades negativas en ${invalid.name}.`);
      return;
    }
    const result = await postStockAction({ action: 'importItems', mode: csvMode, rows: csvRows }, '', { returnData: true });
    if (result?.ok) {
      setStatus(`Ingredientes importados: ${result.created || 0} creados, ${result.updated || 0} actualizados, ${result.skipped || 0} omitidos.`);
      setCsvText('');
      await loadStock();
    }
  };

  const handleCsvFile = async (file) => {
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
  };


  const recipeCsvRows = useMemo(() => parseRecipeCsv(recipeCsvText), [recipeCsvText]);

  const importRecipeCsvRows = async () => {
    if (role !== 'admin') return;
    if (recipeCsvRows.length === 0) {
      setStatus('Pega un CSV válido con encabezados y al menos una línea de receta.');
      return;
    }
    const invalidIndex = invalidRecipeRowIndex(recipeCsvRows);
    if (invalidIndex >= 0) {
      const invalid = recipeCsvRows[invalidIndex];
      setStatus(`Línea ${invalidIndex + 2}: receta inválida (${invalid.recipe_key || 'sin clave'}). Revisa recipe_key, recipe_name y que quantity exista cuando haya ingrediente.`);
      return;
    }
    const ok = await postStockAction({ action: 'importRecipes', mode: recipeCsvMode, rows: recipeCsvRows }, 'Recetas importadas.');
    if (ok) setRecipeCsvText('');
  };

  const handleRecipeCsvFile = async (file) => {
    if (!file) return;
    const text = await file.text();
    setRecipeCsvText(text);
  };


  const allImportRows = useMemo(() => parseGenericCsv(csvText || recipeCsvText || familyCsvText), [csvText, recipeCsvText, familyCsvText]);
  const allImportItemRows = useMemo(() => allImportRows.filter((row) => String(row.record_type || '').toLowerCase() === 'ingredient' || (row.name && !row.recipe_key && !row.family_key)), [allImportRows]);
  const allImportRecipeRows = useMemo(() => allImportRows.filter((row) => ['recipe', 'subrecipe'].includes(String(row.record_type || '').toLowerCase()) || row.recipe_key), [allImportRows]);
  const allImportFamilyRows = useMemo(() => allImportRows.filter((row) => ['family', 'family_option', 'family_component', 'family_product_rule'].includes(String(row.record_type || '').toLowerCase()) || row.family_key), [allImportRows]);
  const familyCsvRows = useMemo(() => parseFamilyCsv(familyCsvText), [familyCsvText]);

  const visibleRecipeCsvRows = useMemo(() => {
    const rows = importKind === 'all' ? allImportRecipeRows : recipeCsvRows;
    if (importKind === 'recipes') return rows.filter((row) => String(row.recipe_type || 'product') === 'product');
    if (importKind === 'subrecipes') return rows.filter((row) => String(row.recipe_type || '') === 'subrecipe');
    return rows;
  }, [allImportRecipeRows, importKind, recipeCsvRows]);

  const visibleFamilyCsvRows = useMemo(() => (importKind === 'all' ? allImportFamilyRows : (importKind === 'families' ? familyCsvRows : [])), [allImportFamilyRows, familyCsvRows, importKind]);

  const visibleCsvRows = useMemo(() => (importKind === 'all' ? allImportItemRows : csvRows), [allImportItemRows, importKind, csvRows]);

  const invalidRecipeRowIndex = (rows) => rows.findIndex((row) => {
    if (!row.recipe_key || !row.recipe_name) return true;
    const hasIngredient = String(row.ingredient_name || '').trim();
    const quantity = Number(row.quantity || 0);
    return Boolean(hasIngredient) && !quantity;
  });

  const invalidFamilyRowIndex = (rows) => rows.findIndex((row) => {
    const rowType = String(row.row_type || row.record_type || '').toLowerCase().replace('family_', '');
    if (!row.family_key) return true;
    if (!row.row_type && !row.record_type) return true;
    if (rowType === 'family') return false;
    if (rowType === 'option' && (!row.option_name || !row.ingredient_name)) return true;
    if (rowType === 'component' && (!row.option_name || !row.ingredient_name || Number(row.quantity || 0) <= 0)) return true;
    if (rowType === 'product_rule' && !row.product_id) return true;
    return false;
  });

  const itemImportPreview = useMemo(() => {
    const existingNames = new Set(data.items.map((item) => String(item.name || '').trim().toLowerCase()));
    return visibleCsvRows.map((row) => {
      const exists = existingNames.has(String(row.name || '').trim().toLowerCase());
      return { ...row, import_action: exists ? 'Actualizar existente' : (csvMode === 'updateOnly' ? 'Omitir: no existe' : 'Crear nuevo') };
    });
  }, [csvMode, data.items, visibleCsvRows]);

  const recipeImportPreview = useMemo(() => {
    const existingKeys = new Set(data.recipes.map((recipe) => String(recipe.recipe_key || '').trim().toLowerCase()));
    const grouped = new Map();
    for (const row of visibleRecipeCsvRows) {
      const key = String(row.recipe_key || '').trim();
      if (!key) continue;
      if (!grouped.has(key)) grouped.set(key, { ...row, line_count: 0 });
      grouped.get(key).line_count += 1;
    }
    return Array.from(grouped.values()).map((row) => {
      const exists = existingKeys.has(String(row.recipe_key || '').trim().toLowerCase());
      return { ...row, import_action: exists ? 'Actualizar receta existente' : (recipeCsvMode === 'updateOnly' ? 'Omitir: no existe' : 'Crear receta nueva') };
    });
  }, [data.recipes, recipeCsvMode, visibleRecipeCsvRows]);

  const familyImportPreview = useMemo(() => {
    const existingKeys = new Set((data.optionFamilies || []).map((family) => String(family.family_key || '').trim().toLowerCase()));
    const grouped = new Map();
    for (const row of visibleFamilyCsvRows) {
      const key = String(row.family_key || '').trim();
      if (!key) continue;
      if (!grouped.has(key)) grouped.set(key, { ...row, option_count: 0, component_count: 0, rule_count: 0 });
      const rowType = String(row.row_type || row.record_type || '').toLowerCase().replace('family_', '');
      if (rowType === 'product_rule') grouped.get(key).rule_count += 1;
      else if (rowType === 'component') grouped.get(key).component_count += 1;
      else if (rowType === 'option') grouped.get(key).option_count += 1;
    }
    return Array.from(grouped.values()).map((row) => {
      const exists = existingKeys.has(String(row.family_key || '').trim().toLowerCase());
      return { ...row, import_action: exists ? 'Actualizar familia existente' : (familyCsvMode === 'updateOnly' ? 'Omitir: no existe' : 'Crear familia nueva') };
    });
  }, [data.optionFamilies, familyCsvMode, visibleFamilyCsvRows]);

  const downloadCurrentData = () => {
    if (importKind === 'items') {
      downloadTextFile('pecas-ingredientes-actuales.csv', rowsToCsv(STOCK_CSV_COLUMNS, stockRowsFromCurrent(data.items)));
      return;
    }
    if (importKind === 'recipes') {
      downloadTextFile('pecas-recetas-actuales.csv', rowsToCsv(RECIPE_CSV_COLUMNS, recipeRowsFromCurrent(data.recipes, 'product', data.items)));
      return;
    }
    if (importKind === 'subrecipes') {
      downloadTextFile('pecas-subrecetas-actuales.csv', rowsToCsv(RECIPE_CSV_COLUMNS, recipeRowsFromCurrent(data.recipes, 'subrecipe', data.items)));
      return;
    }
    if (importKind === 'families') {
      downloadTextFile('pecas-familias-actuales.csv', rowsToCsv(FAMILY_CSV_COLUMNS, familyRowsFromCurrent(data.optionFamilies)));
      return;
    }
    const all = allCurrentRows(data.items, data.recipes, data.optionFamilies);
    downloadTextFile('pecas-stock-recetas-familias-actuales.csv', rowsToCsv(all.columns, all.rows));
  };

  const downloadEmptyTemplate = () => {
    if (importKind === 'items') downloadStockCsvTemplate();
    else if (importKind === 'families') downloadFamilyCsvTemplate();
    else if (importKind === 'all') {
      const all = allCurrentRows([], [], []);
      downloadTextFile('pecas-todo-template.csv', rowsToCsv(all.columns, []));
    } else downloadRecipeCsvTemplate();
  };

  const handleUnifiedCsvFile = async (file) => {
    if (!file) return;
    const text = await file.text();
    if (importKind === 'items') setCsvText(text);
    else if (importKind === 'families') setFamilyCsvText(text);
    else if (importKind === 'all') setCsvText(text);
    else setRecipeCsvText(text);
  };

  const importVisibleRows = async () => {
    if (role !== 'admin') return;
    if (importKind === 'items') {
      await importCsvRows();
      return;
    }
    if (importKind === 'families') {
      const rows = visibleFamilyCsvRows;
      if (rows.length === 0) {
        setStatus('Pega un CSV válido con familias de opciones.');
        return;
      }
      const invalidIndex = invalidFamilyRowIndex(rows);
      if (invalidIndex >= 0) {
        const invalid = rows[invalidIndex];
        setStatus(`Línea ${invalidIndex + 2}: familia inválida (${invalid.family_key || 'sin familia'}). Revisa family_key, row_type, option_name/product_id.`);
        return;
      }
      const validation = await postStockAction({ action: 'validateOptionFamilies', rows }, '', { returnData: true });
      if (!validation?.ok) {
        const first = validation?.errors?.[0];
        setStatus(first ? `Línea ${first.line}: ${first.message}` : 'El CSV de familias tiene errores.');
        return;
      }
      const ok = await postStockAction({ action: 'importOptionFamilies', mode: familyCsvMode, rows }, 'Familias importadas.');
      if (ok) setFamilyCsvText('');
      return;
    }
    if (importKind === 'recipes' || importKind === 'subrecipes') {
      const rows = visibleRecipeCsvRows;
      if (rows.length === 0) {
        setStatus('Pega un CSV válido con al menos una línea para el tipo seleccionado.');
        return;
      }
      const invalidIndex = invalidRecipeRowIndex(rows);
      if (invalidIndex >= 0) {
        const invalid = rows[invalidIndex];
        setStatus(`Línea ${invalidIndex + 2}: receta inválida (${invalid.recipe_key || 'sin clave'}). Revisa recipe_key, recipe_name y que quantity exista cuando haya ingrediente.`);
        return;
      }
      const ok = await postStockAction({ action: 'importRecipes', mode: recipeCsvMode, rows }, 'Recetas importadas.');
      if (ok) setRecipeCsvText('');
      return;
    }

    const itemRows = visibleCsvRows;
    const recipeRows = visibleRecipeCsvRows;
    const familyRows = visibleFamilyCsvRows;
    if (itemRows.length === 0 && recipeRows.length === 0 && familyRows.length === 0) {
      setStatus('Pega un CSV válido de datos actuales o plantilla todo.');
      return;
    }
    if (itemRows.length > 0) {
      const invalidItem = itemRows.find((row) => Number(row.current_stock || 0) < 0 || Number(row.min_stock || 0) < 0 || Number(row.max_stock || 0) < 0);
      if (invalidItem) {
        setStatus(`Ingredientes: hay cantidades negativas en ${invalidItem.name || 'una línea del CSV'}.`);
        return;
      }
      const okItems = await postStockAction({ action: 'importItems', mode: csvMode, rows: itemRows }, 'Ingredientes importados.');
      if (!okItems) return;
    }
    if (recipeRows.length > 0) {
      const invalidRecipeIndex = invalidRecipeRowIndex(recipeRows);
      if (invalidRecipeIndex >= 0) {
        const invalidRecipe = recipeRows[invalidRecipeIndex];
        setStatus(`Recetas: línea ${invalidRecipeIndex + 2} inválida (${invalidRecipe.recipe_key || 'sin clave'}).`);
        return;
      }
      const okRecipes = await postStockAction({ action: 'importRecipes', mode: recipeCsvMode, rows: recipeRows }, 'Recetas importadas.');
      if (!okRecipes) return;
    }
    if (familyRows.length > 0) {
      const invalidFamilyIndex = invalidFamilyRowIndex(familyRows);
      if (invalidFamilyIndex >= 0) {
        const invalidFamily = familyRows[invalidFamilyIndex];
        setStatus(`Familias: línea ${invalidFamilyIndex + 2} inválida (${invalidFamily.family_key || 'sin familia'}).`);
        return;
      }
      const okFamilies = await postStockAction({ action: 'importOptionFamilies', mode: familyCsvMode, rows: familyRows }, 'Todo importado.');
      if (!okFamilies) return;
    }
    setCsvText('');
    setRecipeCsvText('');
    setFamilyCsvText('');
  };

  const editItem = (item) => {
    setActiveTab('items');
    setItemDraft({
      ...emptyStockItem,
      ...item,
      is_active: Boolean(item.is_active),
      client_visible: Boolean(item.client_visible),
      client_removable: Boolean(item.client_removable),
      client_changeable: Boolean(item.client_changeable),
      deducts_inventory: Boolean(item.deducts_inventory),
      is_packaging: Boolean(item.is_packaging),
      is_internal_dressing: Boolean(item.is_internal_dressing),
      is_side_dressing: Boolean(item.is_side_dressing),
      is_sellable_extra: Boolean(item.is_sellable_extra),
      expiry_date: item.expiry_date || '',
    });
  };

  const stockLow = data.items.filter((item) => Number(item.current_stock || 0) <= Number(item.min_stock || 0));
  const expiredSoon = data.items.filter((item) => {
    const days = daysUntilExpiry(item.expiry_date);
    return days !== null && days <= 3;
  });
  const pendingWaste = data.wasteRequests.filter((request) => request.status === 'pending');
  const pendingInventoryCounts = (data.inventoryCountRequests || []).filter((request) => request.status === 'pending');
  const purchaseItems = data.items.filter((item) => purchaseSuggestion(item));
  const purchaseGroups = Object.values(purchaseItems.reduce((groups, item) => {
    const key = item.supplier_name || 'Sin proveedor';
    if (!groups[key]) groups[key] = { supplier: key, items: [] };
    groups[key].items.push(item);
    return groups;
  }, {}));
  const productRecipes = data.recipes.filter((recipe) => recipe.recipe_type === 'product');
  const subRecipes = data.recipes.filter((recipe) => recipe.recipe_type === 'subrecipe');
  const currentRecipeList = recipeEditorType === 'subrecipe' ? subRecipes : productRecipes;
  const menuOverridesForStock = data.menuSettings?.overrides || {};
  const stockCatalogProducts = mergeProductsWithExtras([], data.menuSettings?.extraProducts || []);
  const stockMenuProducts = stockCatalogProducts.map((product) => ({
    ...product,
    ...(menuOverridesForStock[product.id] || {}),
    soldOut: Boolean(menuOverridesForStock[product.id]?.soldOut),
  }));
  const stockMenuCategories = Array.isArray(data.menuSettings?.extraCategories) ? data.menuSettings.extraCategories : [];
  const menuCategoryById = new Map(stockMenuCategories.map((category) => [category.id, category]));
  const stockCategoryLabel = (categoryId) => {
    const category = menuCategoryById.get(categoryId);
    if (category) return `${category.emoji ? `${category.emoji} ` : ''}${category.label || category.id}`;
    return categoryMeta(categoryId).label;
  };
  const productById = new Map(stockMenuProducts.map((product) => [product.id, product]));
  const itemById = new Map(data.items.map((item) => [Number(item.id), item]));
  const productStockSuggestions = productRecipes.map((recipe) => {
    const productId = String(recipe.recipe_key || '').replace('product:', '');
    const product = productById.get(productId);
    if (!product) return null;
    const blockingLines = (recipe.lines || [])
      .filter((line) => Number(line.is_default ?? 1) !== 0 && Number(line.is_optional || 0) === 0 && Number(line.quantity || 0) > 0)
      .map((line) => ({ ...line, item: itemById.get(Number(line.item_id)) }))
      .filter((line) => line.item && Number(line.item.current_stock || 0) <= 0);
    const lowLines = (recipe.lines || [])
      .filter((line) => Number(line.is_default ?? 1) !== 0 && Number(line.is_optional || 0) === 0 && Number(line.quantity || 0) > 0)
      .map((line) => ({ ...line, item: itemById.get(Number(line.item_id)) }))
      .filter((line) => line.item && Number(line.item.current_stock || 0) > 0 && Number(line.item.min_stock || 0) > 0 && Number(line.item.current_stock || 0) <= Number(line.item.min_stock || 0));
    return { recipe, product, blockingLines, lowLines, shouldSuggestSoldOut: blockingLines.length > 0 };
  }).filter(Boolean);
  const soldOutProducts = stockMenuProducts.filter((product) => product.soldOut);
  const suggestedSoldOutProducts = productStockSuggestions.filter((item) => item.shouldSuggestSoldOut && !item.product.soldOut);
  const veryLowItems = data.items.filter((item) => Number(item.current_stock || 0) > 0 && Number(item.min_stock || 0) > 0 && Number(item.current_stock || 0) <= Number(item.min_stock || 0) * 0.5);
  const selectedProductSetup = stockMenuProducts.find((product) => product.id === selectedProductSetupId) || stockMenuProducts[0] || null;
  const selectedProductRecipe = selectedProductSetup ? productRecipes.find((recipe) => recipe.recipe_key === `product:${selectedProductSetup.id}`) : null;
  const selectedProductFamilyRules = selectedProductSetup ? (data.optionFamilies || []).flatMap((family) => (
    (family.productRules || [])
      .filter((rule) => rule.product_id === selectedProductSetup.id)
      .map((rule) => ({ ...rule, family }))
  )) : [];
  const selectedProductRecipeLines = (selectedProductRecipe?.lines || []).map((line) => ({
    ...line,
    item: itemById.get(Number(line.item_id)),
  }));
  const orphanProductRecipes = productRecipes.filter((recipe) => {
    const productId = String(recipe.recipe_key || '').replace(/^product:/, '');
    return productId && !productById.has(productId);
  });

  const setProductSoldOut = async (productId, soldOut) => {
    await postStockAction({ action: 'setProductSoldOut', productId, soldOut }, soldOut ? 'Producto marcado como agotado.' : 'Producto disponible de nuevo.');
  };

  const stockBranchSettings = normalizeBranchSettings(data.branchSettings || data.menuSettings?.branchSettings || DEFAULT_BRANCH_SETTINGS);
  const stockBranches = activeBranches(stockBranchSettings);
  const selectedStockBranch = selectedBranchFrom(stockBranchSettings, stockLockedBranchId || stockBranchId || data.selectedBranch?.id);
  const changeStockBranch = (nextBranchId) => {
    setStockBranchId(nextBranchId);
    try { window.sessionStorage.setItem(STOCK_BRANCH_STORAGE_KEY, nextBranchId); } catch { /* ignore */ }
    setStatus('Cambia de sucursal y presiona Actualizar para cargar su stock.');
  };

  if (!unlocked && !isAdminConfigMode) {
    return (
      <main className="stock-page">
        <section className="stock-shell stock-login-shell">
          <Logo />
          <h1>Stock</h1>
          <p>Inventario, mermas, entradas de compra y alertas operativas.</p>
          <div className="stock-login-grid">
            <label className="field full">
              <span>Nombre de quien entra</span>
              <input value={operatorName} onChange={(e) => setOperatorName(e.target.value)} placeholder="Ej. César" />
            </label>
            <label className="field">
              <span>Turno</span>
              <input value={shift} onChange={(e) => setShift(e.target.value)} placeholder="Ej. Noche" />
            </label>
            <label className="field">
              <span>Contraseña</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Admin o cocina" />
            </label>
          </div>
          <button type="button" className="primary" onClick={loadStock}>Entrar</button>
          {status && <p className="admin-status">{status}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className={isAdminConfigMode ? "stock-page admin-stock-config-page" : "stock-page"}>
      <section className={isAdminConfigMode ? "stock-shell admin-stock-config-shell" : "stock-shell"}>
        <div className="stock-header">
          <div>
            <Logo />
            <h1>{isAdminConfigMode ? 'Catálogo operativo' : 'Stock'}</h1>
            <p>{isAdminConfigMode ? 'Ingredientes, recetas, sub-recetas, familias e importación.' : `${operatorName} · ${shift} · ${role === 'admin' ? 'Admin' : 'Cocina'}`}</p>
          </div>
          <div className="stock-header-actions">
            {role === 'admin' && <button type="button" className="ghost" onClick={seedDefaults}>Crear catálogo base</button>}
            <button type="button" className="ghost" onClick={loadStock} disabled={loading}>{loading ? 'Cargando...' : 'Actualizar'}</button>
            {!isAdminConfigMode && <button type="button" className="ghost danger-text" onClick={logout}>Salir</button>}
          </div>
        </div>

        {stockAccessScope === 'branch' ? (
          <div className="branch-locked-note">Acceso de sucursal: <b>{selectedStockBranch.name}</b></div>
        ) : null}
        {stockAccessScope !== 'branch' && (
        <div className="stock-branch-bar">
          <label className="field">
            <span>Sucursal de stock</span>
            <select value={selectedStockBranch.id} onChange={(e) => changeStockBranch(e.target.value)}>
              {stockBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
          <p>Viendo inventario, movimientos, entradas, mermas, conteos y compra sugerida de <b>{selectedStockBranch.name}</b>.</p>
        </div>
        )}

        <div className="stock-tabs">
          {visibleStockTabs.map((tab) => (
            <button key={tab.id} type="button" className={activeTab === tab.id ? 'active' : ''} onClick={() => setActiveTab(tab.id)}>
              {tab.label}
            </button>
          ))}
        </div>

        {status && <p className="admin-status">{status}</p>}

        {activeTab === 'productSetup' && (
          <div className="stock-dashboard-grid recipes-layout">
            <section className="stock-card-block">
              <div className="stock-section-head">
                <div>
                  <h2>Productos</h2>
                  <p>Elige un producto y configura desde aquí su receta, modificadores, sub-recetas e ingredientes.</p>
                </div>
                {selectedProductSetup && <button type="button" className="primary" onClick={() => editProductRecipe(selectedProductSetup)}>Editar receta</button>}
              </div>
              <label className="field full">
                <span>Producto</span>
                <select value={selectedProductSetup?.id || ''} onChange={(e) => setSelectedProductSetupId(e.target.value)}>
                  {stockMenuProducts.map((product) => <option key={product.id} value={product.id}>{stockCategoryLabel(product.category)} · {product.name}</option>)}
                </select>
              </label>

              {role === 'admin' && (
                <div className="recipe-line-builder">
                  <h3>Agregar producto</h3>
                  <div className="stock-form-grid compact-grid">
                    <label className="field"><span>Nombre</span><input value={productDraft.name} onChange={(e) => setProductDraft((current) => ({ ...current, name: e.target.value }))} placeholder="Ej. Producto test" /></label>
                    <label className="field"><span>Categoría existente</span><select value={productDraft.category || stockMenuCategories[0]?.id || ''} onChange={(e) => setProductDraft((current) => ({ ...current, category: e.target.value }))} disabled={!stockMenuCategories.length}><option value="">Selecciona</option>{stockMenuCategories.map((category) => <option key={category.id} value={category.id}>{stockCategoryLabel(category.id)}</option>)}</select></label>
                    <label className="field"><span>Precio</span><input type="number" value={productDraft.price} onChange={(e) => setProductDraft((current) => ({ ...current, price: e.target.value }))} /></label>
                    <label className="field"><span>Icono</span><input value={productDraft.emoji} onChange={(e) => setProductDraft((current) => ({ ...current, emoji: e.target.value }))} /></label>
                    <label className="field full"><span>Descripcion</span><input value={productDraft.description} onChange={(e) => setProductDraft((current) => ({ ...current, description: e.target.value }))} placeholder="Descripcion corta para el menu" /></label>
                  </div>
                  <button type="button" className="ghost" onClick={createProductFromDraft} disabled={!stockMenuCategories.length}>Agregar producto y preparar receta</button>
                </div>
              )}

              {selectedProductSetup ? (
                <div className="stock-alert">
                  <b>{selectedProductSetup.name}</b>
                  <span>{stockCategoryLabel(selectedProductSetup.category)} · ${selectedProductSetup.price || 0}</span>
                  <small>{selectedProductSetup.description || 'Sin descripción'}</small>
                </div>
              ) : <p>No hay productos configurados todavía.</p>}

              <div className="inline-actions">
                {selectedProductSetup && <button type="button" className="ghost" onClick={() => editProductRecipe(selectedProductSetup)}>{selectedProductRecipe ? 'Editar receta del producto' : 'Crear receta del producto'}</button>}
                {selectedProductSetup && <button type="button" className="ghost" onClick={() => startProductFamilyAssignment(selectedProductSetup)}>Asignar familia/modificador</button>}
                {selectedProductRecipe && <button type="button" className="ghost danger-text" onClick={() => archiveSelectedRecipe(selectedProductRecipe, Boolean(selectedProductRecipe.is_active))}>{selectedProductRecipe.is_active ? 'Archivar receta' : 'Restaurar receta'}</button>}
                <button type="button" className="ghost" onClick={() => { setRecipeEditorType('subrecipe'); startNewRecipe('subrecipe'); }}>Crear sub-receta</button>
              </div>
            </section>

            <section className="stock-card-block">
              <h2>Receta del producto</h2>
              {!selectedProductRecipe ? <p>Este producto todavía no tiene receta. Crea una para descontar stock cuando el pedido pase a Listo.</p> : null}
              {selectedProductRecipe ? (
                <div className="stock-table-wrap">
                  <table className="stock-table">
                    <thead><tr><th>Ingrediente</th><th>Cantidad</th><th>Rol</th><th>Stock</th></tr></thead>
                    <tbody>
                      {selectedProductRecipeLines.map((line, index) => (
                        <tr key={`${line.item_id}-${index}`}>
                          <td><b>{line.item?.name || line.item_name || 'Ingrediente'}</b><span>{line.item?.item_type || ''}</span></td>
                          <td>{formatStockQuantity(line.quantity, line.item?.unit_code || line.unit_code)}</td>
                          <td>{cleanRecipeLineRole(line.line_role)}</td>
                          <td><span className={`stock-pill ${line.item ? stockLevelClass(line.item) : 'warning'}`}>{line.item ? formatStockQuantity(line.item.current_stock, line.item.unit_code) : 'Sin stock'}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>

            <section className="stock-card-block">
              <h2>Familias y modificadores</h2>
              {selectedProductFamilyRules.length === 0 ? <p>Este producto no tiene familias asignadas todavía.</p> : null}
              {selectedProductFamilyRules.map((rule) => (
                <div className="recipe-card-mini" key={`${rule.family.family_key}-${rule.product_id}`}>
                  <div>
                    <b>{rule.label || rule.family.name}</b>
                    <span>{rule.family.name} · {rule.family.family_key}</span>
                    <small>{rule.min_select || 0} mínimo · {rule.max_included || 0} incluido(s) · máximo {rule.max_total || 1} · extra ${rule.extra_price || 0}</small>
                  </div>
                  <button type="button" className="ghost" onClick={() => editOptionFamily(rule.family)}>Editar familia</button>
                </div>
              ))}
            </section>

            <section className="stock-card-block">
              <h2>Sub-recetas disponibles</h2>
              {subRecipes.length === 0 ? <p>No hay sub-recetas todavía. Úsalas para preparados internos como aderezos, masas, salsas o bases.</p> : null}
              <div className="recipe-list">
                {subRecipes.slice(0, 8).map((recipe) => (
                  <div className="recipe-card-mini" key={recipe.id}>
                    <div><b>{recipeLabel(recipe)}</b><span>{recipe.output_item_name || 'Sin ingrediente producido'}</span><small>{(recipe.lines || []).length} ingrediente(s)</small></div>
                    <button type="button" className="ghost" onClick={() => editRecipe(recipe)}>Editar</button>
                  </div>
                ))}
              </div>
            </section>

            <section className="stock-card-block">
              <h2>Recetas sin producto publicado</h2>
              {orphanProductRecipes.length === 0 ? <p>No hay recetas de producto fuera del menu.</p> : null}
              <div className="recipe-list">
                {orphanProductRecipes.map((recipe) => (
                  <div className="recipe-card-mini" key={recipe.id}>
                    <div><b>{recipeLabel(recipe)}</b><span>{recipe.recipe_key}</span><small>{(recipe.lines || []).length} ingrediente(s)</small></div>
                    <div className="inline-actions">
                      <button type="button" className="ghost" onClick={() => editRecipe(recipe)}>Editar</button>
                      <button type="button" className="ghost" onClick={() => publishRecipeAsProduct(recipe)}>Publicar producto</button>
                      <button type="button" className="ghost danger-text" onClick={() => archiveSelectedRecipe(recipe, true)}>Archivar</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="stock-dashboard">
            <div className="stock-summary-grid">
              <div><span>Ingredientes</span><b>{data.items.length}</b></div>
              <div><span>Stock bajo</span><b>{stockLow.length}</b></div>
              <div><span>Por caducar</span><b>{expiredSoon.length}</b></div>
              <div><span>Mermas pendientes</span><b>{pendingWaste.length}</b></div>
              <div><span>Muy bajos</span><b>{veryLowItems.length}</b></div>
              <div><span>Sugerir agotado</span><b>{suggestedSoldOutProducts.length}</b></div>
            </div>

            <div className="stock-dashboard-grid">
              <section className="stock-card-block">
                <h2>Alertas</h2>
                {[...stockLow, ...expiredSoon].length === 0 ? <p>No hay alertas por ahora.</p> : null}
                {stockLow.map((item) => (
                  <div className="stock-alert" key={`low-${item.id}`}>
                    <b>{item.name}</b>
                    <span>{formatStockQuantity(item.current_stock, item.unit_code)} · mínimo {formatStockQuantity(item.min_stock, item.unit_code)}</span>
                  </div>
                ))}
                {expiredSoon.map((item) => {
                  const days = daysUntilExpiry(item.expiry_date);
                  return (
                    <div className="stock-alert warning" key={`exp-${item.id}`}>
                      <b>{item.name}</b>
                      <span>{days < 0 ? 'Caducado' : `Caduca en ${days} día(s)`} · {item.expiry_date}</span>
                    </div>
                  );
                })}
              </section>

              <section className="stock-card-block">
                <h2>Sugerencias de agotado</h2>
                {suggestedSoldOutProducts.length === 0 ? <p>No hay productos sugeridos para marcar como agotados.</p> : null}
                {suggestedSoldOutProducts.slice(0, 8).map(({ product, blockingLines }) => (
                  <div className="stock-alert danger" key={product.id}>
                    <b>{product.name}</b>
                    <span>Falta: {blockingLines.map((line) => line.item.name).join(', ')}</span>
                    <button type="button" className="ghost mini" onClick={() => setProductSoldOut(product.id, true)}>Marcar agotado</button>
                  </div>
                ))}
              </section>

              <section className="stock-card-block">
                <h2>Compra sugerida</h2>
                {purchaseItems.length === 0 ? <p>No hay compras sugeridas.</p> : null}
                {purchaseGroups.map((group) => (
                  <div className="purchase-store-group" key={group.supplier}>
                    <h3>{group.supplier}</h3>
                    {group.items.map((item) => (
                      <div className="purchase-line" key={item.id}>
                        <div>
                          <b>{item.name}</b>
                          <span>{item.purchase_category_name || 'Sin categoría'}</span>
                        </div>
                        <strong>{purchaseSuggestion(item)}</strong>
                      </div>
                    ))}
                  </div>
                ))}
              </section>

              <section className="stock-card-block">
                <h2>Mermas pendientes</h2>
                {pendingWaste.length === 0 ? <p>No hay mermas pendientes.</p> : null}
                {pendingWaste.map((request) => (
                  <div className="waste-request" key={request.id}>
                    <div>
                      <b>{request.item_name}</b>
                      <span>{formatStockQuantity(request.quantity, request.unit_code)} · {request.reason}</span>
                      <small>Reportó {request.reported_by} · {request.reported_shift}</small>
                    </div>
                    {role === 'admin' && (
                      <div className="inline-actions">
                        <button type="button" className="primary small" onClick={() => approveWaste(request.id, true)}>Aprobar</button>
                        <button type="button" className="ghost danger-text" onClick={() => approveWaste(request.id, false)}>Rechazar</button>
                      </div>
                    )}
                  </div>
                ))}
              </section>
            </div>
          </div>
        )}

        {activeTab === 'items' && (
          <div className="stock-items-view">
            {role === 'admin' && (
              <section className="stock-card-block stock-item-form">
                <h2>{itemDraft.id ? 'Editar ingrediente' : 'Nuevo ingrediente'}</h2>
                <div className="stock-form-grid">
                  <label className="field"><span>Nombre</span><input value={itemDraft.name} onChange={(e) => setItemDraft((c) => ({ ...c, name: e.target.value }))} /></label>
                  <label className="field"><span>Marca</span><input value={itemDraft.brand || ''} onChange={(e) => setItemDraft((c) => ({ ...c, brand: e.target.value }))} placeholder="Ej. McCormick" /></label>
                  <label className="field"><span>Tipo</span><select value={itemDraft.item_type} onChange={(e) => setItemDraft((c) => ({ ...c, item_type: e.target.value }))}>{ITEM_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
                  <label className="field"><span>Unidad base</span><select value={itemDraft.unit_id || ''} onChange={(e) => setItemDraft((c) => ({ ...c, unit_id: e.target.value }))}><option value="">Selecciona</option>{data.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} ({unit.code})</option>)}</select></label>
                  <label className="field"><span>Stock actual</span><input type="number" step="0.01" value={itemDraft.current_stock} onChange={(e) => setItemDraft((c) => ({ ...c, current_stock: e.target.value }))} /></label>
                  <label className="field"><span>Mínimo</span><input type="number" step="0.01" value={itemDraft.min_stock} onChange={(e) => setItemDraft((c) => ({ ...c, min_stock: e.target.value }))} /></label>
                  <label className="field"><span>Máximo</span><input type="number" step="0.01" value={itemDraft.max_stock} onChange={(e) => setItemDraft((c) => ({ ...c, max_stock: e.target.value }))} /></label>
                  <label className="field"><span>Precisión esperada</span><select value={itemDraft.accuracy_target} onChange={(e) => setItemDraft((c) => ({ ...c, accuracy_target: e.target.value }))}>{ACCURACY_PRESETS.map((preset) => <option key={preset.label} value={preset.value}>{preset.label}</option>)}</select></label>
                  <label className="field"><span>Proveedor principal</span><select value={itemDraft.primary_supplier_id || ''} onChange={(e) => setItemDraft((c) => ({ ...c, primary_supplier_id: e.target.value }))}><option value="">Sin proveedor</option>{data.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
                  <label className="field"><span>Proveedor alternativo</span><select value={itemDraft.alt_supplier_id || ''} onChange={(e) => setItemDraft((c) => ({ ...c, alt_supplier_id: e.target.value }))}><option value="">Sin proveedor</option>{data.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
                  <label className="field"><span>Categoría compra</span><select value={itemDraft.purchase_category_id || ''} onChange={(e) => setItemDraft((c) => ({ ...c, purchase_category_id: e.target.value }))}><option value="">Sin categoría</option>{data.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
                  <label className="field"><span>Presentación</span><input value={itemDraft.purchase_unit_label || ''} onChange={(e) => setItemDraft((c) => ({ ...c, purchase_unit_label: e.target.value }))} placeholder="Ej. paquete 1 kg" /></label>
                  <label className="field"><span>Cantidad por presentación</span><input type="number" step="0.01" value={itemDraft.purchase_unit_quantity || ''} onChange={(e) => setItemDraft((c) => ({ ...c, purchase_unit_quantity: e.target.value }))} /></label>
                  <label className="field"><span>Precio aprox.</span><input type="number" step="0.01" value={itemDraft.purchase_price || ''} onChange={(e) => setItemDraft((c) => ({ ...c, purchase_price: e.target.value }))} /></label>
                  <label className="field"><span>Caducidad próxima</span><input type="date" value={itemDraft.expiry_date || ''} onChange={(e) => setItemDraft((c) => ({ ...c, expiry_date: e.target.value }))} /></label>
                </div>
                <div className="stock-flags-grid inventory-master-flags">
                  <label className="check-row">
                    <input type="checkbox" checked={Boolean(itemDraft.is_active)} onChange={(e) => setItemDraft((c) => ({ ...c, is_active: e.target.checked }))} />
                    <span>Activo</span>
                  </label>
                </div>
                <p className="privacy-note">Las reglas de cliente como visible, extra, removible, empaque o aderezo se configuran en Recetas/Sub, no en el ingrediente maestro.</p>
                <div className="inline-actions">
                  <button type="button" className="primary" onClick={saveItem}>Guardar ingrediente</button>
                  <button type="button" className="ghost" onClick={() => setItemDraft(emptyStockItem)}>Limpiar</button>
                </div>
              </section>
            )}

            <section className="stock-card-block">
              <h2>Ingredientes</h2>
              <div className="stock-table-wrap">
                <table className="stock-table">
                  <thead><tr><th>Ingrediente</th><th>Stock</th><th>Mín/Máx</th><th>Proveedor</th><th>Estado</th><th></th></tr></thead>
                  <tbody>
                    {data.items.map((item) => (
                      <tr key={item.id}>
                        <td><b>{item.name}</b><span>{item.brand || 'Sin marca'} · {item.item_type}</span></td>
                        <td>{formatStockQuantity(item.current_stock, item.unit_code)}</td>
                        <td>{formatStockQuantity(item.min_stock, item.unit_code)} / {formatStockQuantity(item.max_stock, item.unit_code)}</td>
                        <td>{item.supplier_name || 'Sin proveedor'}</td>
                        <td><span className={`stock-pill ${stockLevelClass(item)}`}>{stockLevelLabel(item)}</span></td>
                        <td>{role === 'admin' && <button type="button" className="ghost" onClick={() => editItem(item)}>Editar</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}


        {activeTab === 'inventory' && (
          <section className="stock-card-block">
            <div className="stock-section-head">
              <div>
                <h2>Inventario</h2>
                <p>Captura solo las cantidades que sí contaste. Si dejas un campo vacío, no se hace ningún cambio.</p>
              </div>
              <button type="button" className="primary" onClick={submitInventoryCounts}>{role === 'admin' ? 'Aplicar conteo' : 'Enviar para aprobación'}</button>
            </div>
            {role === 'admin' && pendingInventoryCounts.length > 0 && (
              <div className="stock-alert warning">
                <b>{pendingInventoryCounts.length} conteo(s) pendiente(s) por aprobar</b>
                <span>Revisa la seccion "Conteos pendientes por aprobar" debajo de la tabla de inventario.</span>
              </div>
            )}
            <label className="field full"><span>Motivo / nota</span><input value={inventoryReason} onChange={(e) => setInventoryReason(e.target.value)} placeholder="Ej. conteo de cierre, conteo semanal" /></label>
            <div className="stock-table-wrap quick-stock-wrap">
              <table className="stock-table quick-stock-table inventory-count-table">
                <thead><tr><th>Ingrediente</th><th>Stock actual</th><th>Nuevo conteo</th><th>Mín/Máx</th><th>Proveedor</th></tr></thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.id}>
                      <td><b>{item.name}</b><span>{item.brand || 'Sin marca'} · {item.unit_code}</span></td>
                      <td>{formatStockQuantity(item.current_stock, item.unit_code)}</td>
                      <td><input type="number" step="0.01" min="0" value={inventoryCounts[item.id] ?? ''} onChange={(e) => updateInventoryCount(item.id, e.target.value)} placeholder="Sin cambio" /></td>
                      <td>{formatStockQuantity(item.min_stock, item.unit_code)} / {formatStockQuantity(item.max_stock, item.unit_code)}</td>
                      <td>{item.supplier_name || 'Sin proveedor'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="stock-section-head inventory-pending-head">
              <div>
                <h3>Conteos pendientes por aprobar</h3>
                <p>Cuando cocina captura inventario, admin lo aprueba antes de afectar stock.</p>
              </div>
            </div>
            {pendingInventoryCounts.length === 0 ? <p>No hay conteos pendientes.</p> : null}
            {pendingInventoryCounts.map((request) => (
              <div className="waste-request" key={request.id}>
                <div>
                  <b>{request.item_name}</b>
                  <span>Actual al reportar: {formatStockQuantity(request.current_stock_snapshot, request.unit_code)} · Conteo: {formatStockQuantity(request.requested_stock, request.unit_code)} · Diferencia: {formatStockQuantity(request.difference, request.unit_code)}</span>
                  <small>{request.reason || 'Conteo de inventario'} · Reportó {request.reported_by} · {request.reported_shift}</small>
                </div>
                {role === 'admin' && <div className="inline-actions"><button type="button" className="primary small" onClick={() => approveInventoryCount(request.id, true)}>Aprobar</button><button type="button" className="ghost danger-text" onClick={() => approveInventoryCount(request.id, false)}>Rechazar</button></div>}
              </div>
            ))}
          </section>
        )}

        {activeTab === 'quick' && (
          <section className="stock-card-block">
            <div className="stock-section-head">
              <div>
                <h2>Edición rápida de inventario</h2>
                <p>Úsalo para cargar conteos iniciales o corregir mínimos, máximos, precio y caducidad sin abrir ingrediente por ingrediente.</p>
              </div>
              {role === 'admin' && <button type="button" className="primary" onClick={saveQuickEdits}>Guardar cambios rápidos</button>}
            </div>
            {role !== 'admin' ? <p>Solo admin puede editar inventario rápido.</p> : null}
            <div className="stock-table-wrap quick-stock-wrap">
              <table className="stock-table quick-stock-table">
                <thead>
                  <tr>
                    <th>Ingrediente</th>
                    <th>Stock</th>
                    <th>Mínimo</th>
                    <th>Máximo</th>
                    <th>Precio aprox.</th>
                    <th>Caducidad</th>
                  </tr>
                </thead>
                <tbody>
                  {quickDrafts.map((item) => (
                    <tr key={item.id}>
                      <td><b>{item.name}</b><span>{item.brand || 'Sin marca'} · {item.unit_code}</span></td>
                      <td><input type="number" step="0.01" min="0" value={item.current_stock} onChange={(e) => updateQuickDraft(item.id, 'current_stock', e.target.value)} disabled={role !== 'admin'} /></td>
                      <td><input type="number" step="0.01" min="0" value={item.min_stock} onChange={(e) => updateQuickDraft(item.id, 'min_stock', e.target.value)} disabled={role !== 'admin'} /></td>
                      <td><input type="number" step="0.01" min="0" value={item.max_stock} onChange={(e) => updateQuickDraft(item.id, 'max_stock', e.target.value)} disabled={role !== 'admin'} /></td>
                      <td><input type="number" step="0.01" min="0" value={item.purchase_price || ''} onChange={(e) => updateQuickDraft(item.id, 'purchase_price', e.target.value)} disabled={role !== 'admin'} /></td>
                      <td><input type="date" value={item.expiry_date || ''} onChange={(e) => updateQuickDraft(item.id, 'expiry_date', e.target.value)} disabled={role !== 'admin'} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === 'import' && (
          <section className="stock-card-block">
            <div className="stock-section-head">
              <div>
                <h2>Import</h2>
                <p>Importa ingredientes, recetas o sub-recetas desde un solo lugar.</p>
              </div>
              <div className="inline-actions">
                <button type="button" className="ghost" onClick={downloadEmptyTemplate}>Descargar plantilla vacía</button>
                <button type="button" className="ghost" onClick={downloadCurrentData}>Descargar datos actuales</button>
              </div>
            </div>
            {role !== 'admin' ? <p>Solo admin puede importar CSV.</p> : null}
            <div className="stock-form-grid">
              <label className="field"><span>Qué quieres importar</span><select value={importKind} onChange={(e) => setImportKind(e.target.value)} disabled={role !== 'admin'}><option value="items">Ingredientes</option><option value="recipes">Recetas</option><option value="subrecipes">Sub-recetas</option><option value="families">Familias</option><option value="all">Todo</option></select></label>
              <label className="field"><span>Modo</span><select value={importKind === 'items' ? csvMode : (importKind === 'families' ? familyCsvMode : recipeCsvMode)} onChange={(e) => importKind === 'items' ? setCsvMode(e.target.value) : (importKind === 'families' ? setFamilyCsvMode(e.target.value) : setRecipeCsvMode(e.target.value))} disabled={role !== 'admin'}><option value="upsert">Agregar nuevos y actualizar existentes</option><option value="updateOnly">Solo actualizar existentes</option></select></label>
              <label className="field full"><span>Subir archivo CSV</span><input type="file" accept=".csv,text/csv" onChange={(e) => handleUnifiedCsvFile(e.target.files?.[0])} disabled={role !== 'admin'} /></label>
              <label className="field full"><span>CSV</span><textarea rows="10" value={importKind === 'items' || importKind === 'all' ? csvText : (importKind === 'families' ? familyCsvText : recipeCsvText)} onChange={(e) => importKind === 'items' || importKind === 'all' ? setCsvText(e.target.value) : (importKind === 'families' ? setFamilyCsvText(e.target.value) : setRecipeCsvText(e.target.value))} disabled={role !== 'admin'} placeholder={importKind === 'items' ? csvTemplateText() : (importKind === 'families' ? familyCsvTemplateText() : (importKind === 'all' ? 'Descarga datos actuales para trabajar sobre todo el sistema o pega aquí un CSV con record_type.' : recipeCsvTemplateText()))} /></label>
            </div>
            <div className="stock-section-head import-preview-head">
              <div>
                <h3>Vista previa</h3>
                <p>{importKind === 'items' ? `${visibleCsvRows.length} ingrediente(s) detectados.` : importKind === 'families' ? `${visibleFamilyCsvRows.length} línea(s) de familia detectadas.` : importKind === 'all' ? `${visibleCsvRows.length} ingrediente(s), ${visibleRecipeCsvRows.length} línea(s) de receta y ${visibleFamilyCsvRows.length} línea(s) de familia detectadas.` : `${visibleRecipeCsvRows.length} línea(s) de receta detectadas.`}</p>
              </div>
              {role === 'admin' && <button type="button" className="primary" onClick={importVisibleRows} disabled={visibleCsvRows.length === 0 && visibleRecipeCsvRows.length === 0 && visibleFamilyCsvRows.length === 0}>Importar</button>}
            </div>
            {visibleCsvRows.length > 0 && (
              <div className="stock-table-wrap"><table className="stock-table"><thead><tr><th>Acción</th><th>Ingrediente</th><th>Unidad</th><th>Stock</th><th>Mín/Máx</th><th>Proveedor</th><th>Categoría</th></tr></thead><tbody>{itemImportPreview.slice(0, 20).map((row, index) => (<tr key={`${row.name}-${index}`}><td><span className="stock-pill ok">{row.import_action}</span></td><td><b>{row.name}</b><span>{row.brand || 'Sin marca'} · {row.item_type || 'Ingrediente comprado'}</span></td><td>{row.unit_code}</td><td>{row.current_stock || 0}</td><td>{row.min_stock || 0} / {row.max_stock || 0}</td><td>{row.primary_supplier || 'Sin proveedor'}</td><td>{row.purchase_category || 'Sin categoría'}</td></tr>))}</tbody></table></div>
            )}
            {visibleRecipeCsvRows.length > 0 && (
              <div className="stock-table-wrap"><table className="stock-table"><thead><tr><th>Acción</th><th>Receta</th><th>Tipo</th><th>Líneas</th><th>Ejemplo de ingrediente</th></tr></thead><tbody>{recipeImportPreview.slice(0, 20).map((row, index) => (<tr key={`${row.recipe_key}-${index}`}><td><span className="stock-pill ok">{row.import_action}</span></td><td><b>{row.recipe_name}</b><span>{row.recipe_key}</span></td><td>{row.recipe_type}</td><td>{row.line_count}</td><td>{row.ingredient_name}</td></tr>))}</tbody></table></div>
            )}
            {visibleFamilyCsvRows.length > 0 && (
              <div className="stock-table-wrap"><table className="stock-table"><thead><tr><th>Acción</th><th>Familia</th><th>Opciones</th><th>Productos</th><th>Descripción</th></tr></thead><tbody>{familyImportPreview.slice(0, 20).map((row, index) => (<tr key={`${row.family_key}-${index}`}><td><span className="stock-pill ok">{row.import_action}</span></td><td><b>{row.family_name || row.family_key}</b><span>{row.family_key}</span></td><td>{row.option_count}</td><td>{row.rule_count}</td><td>{row.family_description || row.notes || ''}</td></tr>))}</tbody></table></div>
            )}
          </section>
        )}

        {activeTab === 'recipesSub' && (
          <div className="stock-dashboard-grid recipes-layout">
            <section className="stock-card-block stock-item-form">
              <div className="stock-section-head">
                <div>
                  <h2>Recetas/Sub</h2>
                  <p>{recipeEditorType === 'subrecipe' ? 'Define cómo preparar aderezos u otros preparados internos.' : 'Define cantidades por uso por producto. Esto se usará para descontar stock cuando un pedido pase a Listo.'}</p>
                </div>
                <label className="field recipe-type-switch"><span>Tipo</span><select value={recipeEditorType} onChange={(e) => { setRecipeEditorType(e.target.value); startNewRecipe(e.target.value); }}><option value="product">Receta de producto</option><option value="subrecipe">Sub-receta</option></select></label>
                {role === 'admin' && (
                  <div className="inline-actions">
                    <button type="button" className="ghost" onClick={() => startNewRecipe(recipeEditorType)}>Nueva</button>
                    <button type="button" className="ghost" onClick={seedRecipes}>Crear recetas base</button>
                  </div>
                )}
              </div>

              {role !== 'admin' ? <p>Solo admin puede editar recetas.</p> : (
                <>
                  <div className="stock-form-grid">
                    <label className="field"><span>Tipo</span><select value={recipeDraft.recipe_type} onChange={(e) => setRecipeDraft((c) => ({ ...c, recipe_type: e.target.value }))}><option value="product">Producto</option><option value="subrecipe">Sub-receta / preparado</option></select></label>
                    <label className="field"><span>Clave</span><input value={recipeDraft.recipe_key} onChange={(e) => setRecipeDraft((c) => ({ ...c, recipe_key: e.target.value }))} placeholder="Ej. product:latte o subrecipe:chipotle" /></label>
                    <label className="field full"><span>Nombre</span><input value={recipeDraft.name} onChange={(e) => setRecipeDraft((c) => ({ ...c, name: e.target.value }))} placeholder="Ej. Latte / Aderezo chipotle" /></label>
                    {recipeDraft.recipe_type === 'subrecipe' && (
                      <>
                        <label className="field"><span>Ingrediente producido</span><select value={recipeDraft.output_item_id || ''} onChange={(e) => setRecipeDraft((c) => ({ ...c, output_item_id: e.target.value }))}><option value="">Selecciona</option>{data.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                        <label className="field"><span>Cantidad producida base</span><input type="number" step="0.01" value={recipeDraft.output_quantity || ''} onChange={(e) => setRecipeDraft((c) => ({ ...c, output_quantity: e.target.value }))} placeholder="Ej. 850" /></label>
                      </>
                    )}
                    <label className="field full"><span>Notas</span><textarea rows="2" value={recipeDraft.notes || ''} onChange={(e) => setRecipeDraft((c) => ({ ...c, notes: e.target.value }))} /></label>
                  </div>

                  <div className="recipe-line-builder">
                    <h3>Ingredientes / empaques de la receta</h3>
                    <div className="stock-form-grid compact-grid">
                      <label className="field"><span>Ingrediente</span><select value={recipeLineDraft.item_id} onChange={(e) => setRecipeLineDraft((c) => ({ ...c, item_id: e.target.value }))}><option value="">Selecciona</option>{data.items.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.unit_code}</option>)}</select></label>
                      <label className="field"><span>Cantidad por uso</span><input type="number" step="0.01" value={recipeLineDraft.quantity} onChange={(e) => setRecipeLineDraft((c) => ({ ...c, quantity: e.target.value }))} /></label>
                      <label className="field"><span>Rol</span><select value={cleanRecipeLineRole(recipeLineDraft.line_role)} onChange={(e) => setRecipeLineDraft((c) => ({ ...c, line_role: e.target.value }))}>{LINE_ROLES.map((roleName) => <option key={roleName} value={roleName}>{roleName}</option>)}</select></label>
                    </div>
                    <div className="stock-flags-grid compact-flags">
                      {[
                        ['client_visible', 'Visible al cliente'],
                        ['client_removable', 'Se puede quitar'],
                        ['client_changeable', 'Se puede cambiar'],
                        ['is_default', 'Default / incluido'],
                        ['is_optional', 'Opcional / selección cliente'],
                        ['is_extra_billable', 'Extra cobrable'],
                      ].map(([key, label]) => (
                        <label className="check-row" key={key}>
                          <input
                            type="checkbox"
                            checked={Boolean(recipeLineDraft[key])}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setRecipeLineDraft((current) => {
                                const next = { ...current, [key]: checked };
                                if (key === 'is_extra_billable' && checked) {
                                  next.client_visible = true;
                                  next.is_optional = true;
                                  if (!Number(next.extra_price || 0)) next.extra_price = 10;
                                }
                                if (key === 'is_optional' && checked) next.client_visible = true;
                                if (key === 'client_removable' && checked) next.client_visible = true;
                                if (key === 'client_changeable' && checked) next.client_visible = true;
                                return next;
                              });
                            }}
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                    <label className="field compact-extra-price"><span>Precio si es extra</span><input type="number" step="1" value={recipeLineDraft.extra_price || 0} onChange={(e) => setRecipeLineDraft((c) => ({ ...c, extra_price: e.target.value }))} /></label>
                    <button type="button" className="ghost" onClick={addRecipeLine}>+ Agregar línea</button>
                  </div>

                  {(recipeDraft.lines || []).length > 0 && (
                    <div className="stock-table-wrap">
                      <table className="stock-table">
                        <thead><tr><th>Ingrediente</th><th>Cantidad por uso</th><th>Rol</th><th>Cliente</th><th></th></tr></thead>
                        <tbody>
                          {recipeDraft.lines.map((line, index) => {
                            const item = data.items.find((stockItem) => Number(stockItem.id) === Number(line.item_id));
                            return (
                              <tr key={`${line.item_id}-${index}`}>
                                <td><b>{item?.name || line.item_name || 'Ingrediente'}</b><span>{item?.brand || line.item_brand || ''}</span></td>
                                <td>{formatStockQuantity(line.quantity, item?.unit_code || line.unit_code)}</td>
                                <td>{line.line_role}</td>
                                <td>{line.client_visible ? 'Visible' : 'Interno'} {line.client_removable ? '· Quitable' : ''} {line.client_changeable ? '· Cambiable' : ''} {line.is_optional ? '· Opcional' : ''} {line.is_extra_billable ? `· Extra $${line.extra_price || 10}` : ''}</td>
                                <td><button type="button" className="ghost danger-text" onClick={() => removeRecipeLine(index)}>Quitar</button></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="inline-actions">
                    <button type="button" className="primary" onClick={saveRecipe}>Guardar receta</button>
                    <button type="button" className="ghost" onClick={() => startNewRecipe(recipeEditorType)}>Limpiar</button>
                    {recipeDraft.id && <button type="button" className="ghost danger-text" onClick={() => archiveSelectedRecipe(recipeDraft, Boolean(recipeDraft.is_active))}>{recipeDraft.is_active ? 'Archivar' : 'Restaurar'}</button>}
                  </div>
                </>
              )}
            </section>

            <section className="stock-card-block">
              <h2>{recipeEditorType === 'subrecipe' ? 'Sub-recetas guardadas' : 'Recetas guardadas'}</h2>
              {currentRecipeList.length === 0 ? <p>No hay recetas guardadas todavía.</p> : null}
              <div className="recipe-list">
                {currentRecipeList.map((recipe) => (
                  <div className="recipe-card-mini" key={recipe.id}>
                    <div>
                      <b>{recipeLabel(recipe)}</b>
                      <span>{recipe.recipe_key}</span>
                      <small>{(recipe.lines || []).length} línea(s) · {recipe.is_active ? 'Activa' : 'Archivada'}</small>
                    </div>
                    <div className="inline-actions">
                      <button type="button" className="ghost" onClick={() => editRecipe(recipe)}>Editar</button>
                      <button type="button" className="ghost danger-text" onClick={() => archiveSelectedRecipe(recipe, Boolean(recipe.is_active))}>{recipe.is_active ? 'Archivar' : 'Restaurar'}</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}


        {activeTab === 'families' && (
          <div className="stock-items-view recipes-layout option-families-layout">
            <section className="stock-card-block stock-item-form">
              <div className="stock-section-head">
                <div>
                  <h2>Familias de opciones</h2>
                  <p>Agrupa opciones reutilizables como jarabes, leches, aderezos, toppings, proteínas y quesos. Luego asigna la familia a productos.</p>
                </div>
                {role === 'admin' && <button type="button" className="ghost" onClick={seedOptionFamilies}>Crear familias base</button>}
              </div>
              {role !== 'admin' ? <p>Solo admin puede editar familias.</p> : null}
              {role === 'admin' && (
                <>
                  <div className="stock-form-grid">
                    <label className="field"><span>Clave interna</span><input value={optionFamilyDraft.family_key} onChange={(e) => setOptionFamilyDraft((c) => ({ ...c, family_key: e.target.value.trim().toLowerCase().replace(/\s+/g, '-') }))} placeholder="jarabes" /></label>
                    <label className="field"><span>Nombre visible</span><input value={optionFamilyDraft.name} onChange={(e) => setOptionFamilyDraft((c) => ({ ...c, name: e.target.value }))} placeholder="Jarabes" /></label>
                    <label className="field full"><span>Descripción</span><input value={optionFamilyDraft.description || ''} onChange={(e) => setOptionFamilyDraft((c) => ({ ...c, description: e.target.value }))} placeholder="Opciones que se pueden usar en varios productos" /></label>
                    <label className="check-row full"><input type="checkbox" checked={Boolean(optionFamilyDraft.is_active)} onChange={(e) => setOptionFamilyDraft((c) => ({ ...c, is_active: e.target.checked }))} /><span>Familia activa</span></label>
                  </div>

                  <div className="recipe-line-builder">
                    <h3>Opciones dentro de la familia</h3>
                    <div className="stock-form-grid compact-grid">
                      <label className="field"><span>Ingrediente/sub-receta</span><select value={familyOptionDraft.item_id} onChange={(e) => {
                        const selected = data.items.find((item) => Number(item.id) === Number(e.target.value));
                        setFamilyOptionDraft((c) => ({ ...c, item_id: e.target.value, option_name: c.option_name || selected?.name || '' }));
                      }}><option value="">Selecciona</option>{data.items.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.unit_code}</option>)}</select></label>
                      <label className="field"><span>Nombre para cliente</span><input value={familyOptionDraft.option_name} onChange={(e) => setFamilyOptionDraft((c) => ({ ...c, option_name: e.target.value }))} placeholder="Vainilla francesa" /></label>
                      <label className="field"><span>Cantidad por uso</span><input type="number" step="0.01" value={familyOptionDraft.quantity} onChange={(e) => setFamilyOptionDraft((c) => ({ ...c, quantity: e.target.value }))} /></label>
                      <label className="field"><span>Precio extra default</span><input type="number" step="1" value={familyOptionDraft.extra_price || 0} onChange={(e) => setFamilyOptionDraft((c) => ({ ...c, extra_price: e.target.value }))} /></label>
                      <label className="check-row"><input type="checkbox" checked={Boolean(familyOptionDraft.is_default)} onChange={(e) => setFamilyOptionDraft((c) => ({ ...c, is_default: e.target.checked }))} /><span>Default</span></label>
                      <label className="check-row"><input type="checkbox" checked={Boolean(familyOptionDraft.is_active)} onChange={(e) => setFamilyOptionDraft((c) => ({ ...c, is_active: e.target.checked }))} /><span>Activa</span></label>
                    </div>
                    <div className="family-components-builder">
                      <h4>Componentes adicionales de esta opción</h4>
                      <p className="privacy-note">Úsalos para empaques ligados a la opción: por ejemplo, Chipotle + contenedor de aderezo, o café frío + tapa.</p>
                      <div className="stock-form-grid compact-grid">
                        <label className="field"><span>Componente</span><select value={familyComponentDraft.item_id} onChange={(e) => setFamilyComponentDraft((c) => ({ ...c, item_id: e.target.value }))}><option value="">Selecciona</option>{data.items.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.unit_code}</option>)}</select></label>
                        <label className="field"><span>Cantidad</span><input type="number" step="0.01" value={familyComponentDraft.quantity} onChange={(e) => setFamilyComponentDraft((c) => ({ ...c, quantity: e.target.value }))} /></label>
                        <button type="button" className="ghost" onClick={addFamilyComponent}>+ Añadir componente</button>
                      </div>
                      {(familyOptionDraft.components || []).map((component, index) => { const item = data.items.find((entry) => Number(entry.id) === Number(component.item_id)); return <div className="component-chip" key={`${component.item_id}-${index}`}><span>{item?.name || component.item_name} · {component.quantity} {item?.unit_code || ''}</span><button type="button" onClick={() => removeFamilyComponent(index)}>×</button></div>; })}
                    </div>
                    <button type="button" className="ghost" onClick={addFamilyOption}>+ Agregar opción</button>
                  </div>

                  {(optionFamilyDraft.options || []).length > 0 && (
                    <div className="stock-table-wrap">
                      <table className="stock-table"><thead><tr><th>Opción</th><th>Ingrediente</th><th>Cantidad</th><th>Extra</th><th></th></tr></thead><tbody>
                        {optionFamilyDraft.options.map((option, index) => {
                          const item = data.items.find((stockItem) => Number(stockItem.id) === Number(option.item_id));
                          return <tr key={`${option.option_name}-${index}`}><td><b>{option.option_name}</b><span>{option.is_default ? 'Default' : 'Opción'}</span></td><td>{item?.name || option.item_name || 'Ingrediente'}{(option.components || []).length > 0 && <small className="family-component-summary">+ {(option.components || []).map((component) => component.item_name || data.items.find((entry) => Number(entry.id) === Number(component.item_id))?.name).filter(Boolean).join(', ')}</small>}</td><td>{formatStockQuantity(option.quantity, item?.unit_code || option.unit_code)}</td><td>${option.extra_price || 0}</td><td><button type="button" className="ghost danger-text" onClick={() => removeFamilyOption(index)}>Quitar</button></td></tr>;
                        })}
                      </tbody></table>
                    </div>
                  )}

                  <div className="recipe-line-builder">
                    <h3>Productos que usan esta familia</h3>
                    <div className="stock-form-grid compact-grid">
                      <label className="field"><span>Producto</span><select value={productFamilyRuleDraft.product_id} onChange={(e) => setProductFamilyRuleDraft((c) => ({ ...c, product_id: e.target.value }))}><option value="">Selecciona</option>{stockMenuProducts.map((product) => <option key={product.id} value={product.id}>{productText(product, 'es').name}</option>)}</select></label>
                      <label className="field"><span>Etiqueta</span><input value={productFamilyRuleDraft.label} onChange={(e) => setProductFamilyRuleDraft((c) => ({ ...c, label: e.target.value }))} placeholder={optionFamilyDraft.name || 'Nombre de familia'} /></label>
                      <label className="field"><span>Default en este producto</span><input value={productFamilyRuleDraft.default_option_name || ''} onChange={(e) => setProductFamilyRuleDraft((c) => ({ ...c, default_option_name: e.target.value }))} placeholder="Ej. Leche entera" /></label>
                      <label className="field"><span>Mínimo</span><input type="number" min="0" value={productFamilyRuleDraft.min_select} onChange={(e) => setProductFamilyRuleDraft((c) => ({ ...c, min_select: e.target.value }))} /></label>
                      <label className="field"><span>Incluidos</span><input type="number" min="0" value={productFamilyRuleDraft.max_included} onChange={(e) => setProductFamilyRuleDraft((c) => ({ ...c, max_included: e.target.value }))} /></label>
                      <label className="field"><span>Máximo total</span><input type="number" min="1" value={productFamilyRuleDraft.max_total} onChange={(e) => setProductFamilyRuleDraft((c) => ({ ...c, max_total: e.target.value }))} /></label>
                      <label className="field"><span>Precio extra producto</span><input type="number" step="1" value={productFamilyRuleDraft.extra_price || 0} onChange={(e) => setProductFamilyRuleDraft((c) => ({ ...c, extra_price: e.target.value }))} /></label>
                      <label className="check-row"><input type="checkbox" checked={Boolean(productFamilyRuleDraft.is_required)} onChange={(e) => setProductFamilyRuleDraft((c) => ({ ...c, is_required: e.target.checked }))} /><span>Requerida</span></label>
                    </div>
                    <button type="button" className="ghost" onClick={addProductFamilyRule}>+ Asignar a producto</button>
                  </div>

                  {(optionFamilyDraft.productRules || []).length > 0 && (
                    <div className="stock-table-wrap">
                      <table className="stock-table"><thead><tr><th>Producto</th><th>Regla</th><th>Default</th><th></th></tr></thead><tbody>
                        {optionFamilyDraft.productRules.map((rule, index) => {
                          const product = stockMenuProducts.find((item) => item.id === rule.product_id);
                          return <tr key={`${rule.product_id}-${index}`}><td><b>{product ? productText(product, 'es').name : rule.product_id}</b></td><td>{rule.min_select || 0} mínimo · {rule.max_included || 0} incluido(s) · máximo {rule.max_total || 1} · extra ${rule.extra_price || 0}</td><td>{rule.default_option_name || 'Sin default'}</td><td><button type="button" className="ghost danger-text" onClick={() => removeProductFamilyRule(index)}>Quitar</button></td></tr>;
                        })}
                      </tbody></table>
                    </div>
                  )}

                  <div className="inline-actions">
                    <button type="button" className="primary" onClick={saveOptionFamily}>Guardar familia</button>
                    <button type="button" className="ghost" onClick={() => { setOptionFamilyDraft(emptyOptionFamilyDraft); setFamilyOptionDraft(emptyFamilyOptionDraft); setFamilyComponentDraft(emptyFamilyComponentDraft); setProductFamilyRuleDraft(emptyProductFamilyRuleDraft); }}>Limpiar</button>
                  </div>
                </>
              )}
            </section>

            <section className="stock-card-block">
              <h2>Familias guardadas</h2>
              {(data.optionFamilies || []).length === 0 ? <p>No hay familias todavía.</p> : null}
              <div className="recipe-list">
                {(data.optionFamilies || []).map((family) => (
                  <div className="recipe-card-mini" key={family.id}>
                    <div><b>{family.name}</b><span>{family.family_key}</span><small>{(family.options || []).length} opción(es) · {(family.productRules || []).length} producto(s)</small></div>
                    {role === 'admin' && <button type="button" className="ghost" onClick={() => editOptionFamily(family)}>Editar</button>}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}


        {activeTab === 'recipeImport' && (
          <section className="stock-card-block">
            <div className="stock-section-head">
              <div>
                <h2>Importar recetas desde CSV</h2>
                <p>Sirve para carga inicial o cambios masivos de recetas y sub-recetas. Una fila = una línea de ingrediente de receta.</p>
              </div>
              <button type="button" className="ghost" onClick={downloadRecipeCsvTemplate}>Descargar plantilla recetas</button>
            </div>
            {role !== 'admin' ? <p>Solo admin puede importar recetas.</p> : null}
            <div className="stock-import-grid">
              <label className="field full">
                <span>Modo de importación</span>
                <select value={recipeCsvMode} onChange={(e) => setRecipeCsvMode(e.target.value)} disabled={role !== 'admin'}>
                  <option value="upsert">Agregar nuevas y actualizar existentes por clave</option>
                  <option value="updateOnly">Solo actualizar recetas existentes</option>
                </select>
              </label>
              <label className="field full">
                <span>Subir archivo CSV</span>
                <input type="file" accept=".csv,text/csv" onChange={(e) => handleRecipeCsvFile(e.target.files?.[0])} disabled={role !== 'admin'} />
              </label>
              <label className="field full">
                <span>CSV</span>
                <textarea rows="10" value={recipeCsvText} onChange={(e) => setRecipeCsvText(e.target.value)} disabled={role !== 'admin'} placeholder={recipeCsvTemplateText()} />
                <small>Columnas esperadas: {RECIPE_CSV_COLUMNS.join(', ')}</small>
              </label>
            </div>
            <div className="stock-section-head import-preview-head">
              <div>
                <h3>Vista previa</h3>
                <p>{recipeCsvRows.length} línea(s) detectadas.</p>
              </div>
              {role === 'admin' && <button type="button" className="primary" onClick={importRecipeCsvRows} disabled={recipeCsvRows.length === 0}>Importar recetas</button>}
            </div>
            {recipeCsvRows.length > 0 && (
              <div className="stock-table-wrap">
                <table className="stock-table">
                  <thead><tr><th>Receta</th><th>Tipo</th><th>Ingrediente</th><th>Cantidad</th><th>Rol</th><th>Extra</th></tr></thead>
                  <tbody>
                    {recipeCsvRows.slice(0, 30).map((row, index) => (
                      <tr key={`${row.recipe_key}-${row.ingredient_name}-${index}`}>
                        <td><b>{row.recipe_name}</b><span>{row.recipe_key}</span></td>
                        <td>{row.recipe_type || 'product'}</td>
                        <td>{row.ingredient_name}</td>
                        <td>{row.quantity}</td>
                        <td>{row.line_role || 'ingrediente'}</td>
                        <td>{String(row.is_extra_billable || '').trim() === '1' ? `$${row.extra_price || 10}` : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {recipeCsvRows.length > 30 && <p className="admin-status">Mostrando primeras 30 filas de {recipeCsvRows.length}.</p>}
              </div>
            )}
          </section>
        )}

        {activeTab === 'production' && (
          <div className="stock-dashboard-grid">
            <section className="stock-card-block narrow-stock-form">
              <h2>Producción de preparados</h2>
              <p>Usa esto cuando prepares aderezo chipotle, blue cheese u otro preparado. Se descuentan ingredientes base y se suma el preparado.</p>
              <label className="field full"><span>Sub-receta</span><select value={productionDraft.recipeId} onChange={(e) => setProductionDraft((c) => ({ ...c, recipeId: e.target.value }))}><option value="">Selecciona</option>{subRecipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipeLabel(recipe)}</option>)}</select></label>
              <label className="field full"><span>Cantidad producida</span><select value={productionDraft.batchMultiplier} onChange={(e) => setProductionDraft((c) => ({ ...c, batchMultiplier: e.target.value }))}>{PRODUCTION_BATCH_OPTIONS.map((value) => <option key={value} value={value}>{value} tanda{value === 1 ? '' : 's'}</option>)}</select><small>{(() => { const selectedRecipe = subRecipes.find((recipe) => Number(recipe.id) === Number(productionDraft.recipeId)); const total = Number(selectedRecipe?.output_quantity || 0) * Number(productionDraft.batchMultiplier || 1); return selectedRecipe ? `Se producirán ${formatStockQuantity(total, selectedRecipe.output_unit_code)}.` : 'Selecciona una sub-receta para calcular el total.'; })()}</small></label>
              <label className="field full"><span>Nota</span><textarea rows="2" value={productionDraft.note} onChange={(e) => setProductionDraft((c) => ({ ...c, note: e.target.value }))} placeholder="Ej. preparado del día" /></label>
              <button type="button" className="primary" onClick={produceSubRecipe}>Registrar producción</button>
            </section>

            <section className="stock-card-block">
              <h2>Sub-recetas disponibles</h2>
              {subRecipes.length === 0 ? <p>No hay sub-recetas. Crea una en la pestaña Sub-recetas.</p> : null}
              {subRecipes.map((recipe) => (
                <div className="recipe-card-mini" key={recipe.id}>
                  <div>
                    <b>{recipeLabel(recipe)}</b>
                    <span>{recipe.output_item_name || 'Sin ingrediente producido'}</span>
                    <small>{(recipe.lines || []).map((line) => `${line.item_name} ${formatStockQuantity(line.quantity, line.unit_code)}`).join(' · ')}</small>
                  </div>
                </div>
              ))}
            </section>
          </div>
        )}

        {activeTab === 'receiveWaste' && (
          <div className="stock-dashboard-grid">
            <section className="stock-card-block narrow-stock-form">
              <h2>Entrada de compra</h2>
              <label className="field full"><span>Ingrediente</span><select value={receiveDraft.itemId} onChange={(e) => setReceiveDraft((c) => ({ ...c, itemId: e.target.value }))}><option value="">Selecciona</option>{data.items.map((item) => <option key={item.id} value={item.id}>{item.name} · {formatStockQuantity(item.current_stock, item.unit_code)}</option>)}</select></label>
              <label className="field full"><span>Cantidad a sumar</span><input type="number" step="0.01" value={receiveDraft.quantity} onChange={(e) => setReceiveDraft((c) => ({ ...c, quantity: e.target.value }))} /></label>
              <label className="field full"><span>Nota</span><textarea rows="2" value={receiveDraft.note} onChange={(e) => setReceiveDraft((c) => ({ ...c, note: e.target.value }))} placeholder="Ej. compra Costco" /></label>
              <button type="button" className="primary" onClick={receiveStock}>Registrar entrada</button>
            </section>

            <section className="stock-card-block narrow-stock-form">
              <h2>{role === 'admin' ? 'Merma directa' : 'Reportar merma'}</h2>
              <label className="field full"><span>Ingrediente</span><select value={wasteDraft.itemId} onChange={(e) => setWasteDraft((c) => ({ ...c, itemId: e.target.value }))}><option value="">Selecciona</option>{data.items.map((item) => <option key={item.id} value={item.id}>{item.name} · {formatStockQuantity(item.current_stock, item.unit_code)}</option>)}</select></label>
              <label className="field full"><span>Cantidad a descontar</span><input type="number" step="0.01" value={wasteDraft.quantity} onChange={(e) => setWasteDraft((c) => ({ ...c, quantity: e.target.value }))} /></label>
              <label className="field full"><span>Razón obligatoria</span><textarea rows="3" value={wasteDraft.reason} onChange={(e) => setWasteDraft((c) => ({ ...c, reason: e.target.value }))} placeholder="Ej. se quemó pan, se cayó, caducó..." /></label>
              <button type="button" className="primary" onClick={reportWaste}>{role === 'admin' ? 'Aplicar merma' : 'Enviar para aprobación'}</button>
            </section>

            <section className="stock-card-block">
              <h2>Mermas pendientes</h2>
              {pendingWaste.length === 0 ? <p>No hay mermas pendientes.</p> : null}
              {pendingWaste.map((request) => (
                <div className="waste-request" key={request.id}>
                  <div><b>{request.item_name}</b><span>{formatStockQuantity(request.quantity, request.unit_code)} · {request.reason}</span><small>Reportó {request.reported_by} · {request.reported_shift}</small></div>
                  {role === 'admin' && <div className="inline-actions"><button type="button" className="primary small" onClick={() => approveWaste(request.id, true)}>Aprobar</button><button type="button" className="ghost danger-text" onClick={() => approveWaste(request.id, false)}>Rechazar</button></div>}
                </div>
              ))}
            </section>
          </div>
        )}

        {activeTab === 'receive' && (
          <section className="stock-card-block narrow-stock-form">
            <h2>Entrada de compra</h2>
            <label className="field full"><span>Ingrediente</span><select value={receiveDraft.itemId} onChange={(e) => setReceiveDraft((c) => ({ ...c, itemId: e.target.value }))}><option value="">Selecciona</option>{data.items.map((item) => <option key={item.id} value={item.id}>{item.name} · {formatStockQuantity(item.current_stock, item.unit_code)}</option>)}</select></label>
            <label className="field full"><span>Cantidad a sumar</span><input type="number" step="0.01" value={receiveDraft.quantity} onChange={(e) => setReceiveDraft((c) => ({ ...c, quantity: e.target.value }))} /></label>
            <label className="field full"><span>Nota</span><textarea rows="2" value={receiveDraft.note} onChange={(e) => setReceiveDraft((c) => ({ ...c, note: e.target.value }))} placeholder="Ej. compra Costco" /></label>
            <button type="button" className="primary" onClick={receiveStock}>Registrar entrada</button>
          </section>
        )}

        {activeTab === 'waste' && (
          <div className="stock-dashboard-grid">
            <section className="stock-card-block narrow-stock-form">
              <h2>{role === 'admin' ? 'Merma directa' : 'Reportar merma'}</h2>
              <label className="field full"><span>Ingrediente</span><select value={wasteDraft.itemId} onChange={(e) => setWasteDraft((c) => ({ ...c, itemId: e.target.value }))}><option value="">Selecciona</option>{data.items.map((item) => <option key={item.id} value={item.id}>{item.name} · {formatStockQuantity(item.current_stock, item.unit_code)}</option>)}</select></label>
              <label className="field full"><span>Cantidad a descontar</span><input type="number" step="0.01" value={wasteDraft.quantity} onChange={(e) => setWasteDraft((c) => ({ ...c, quantity: e.target.value }))} /></label>
              <label className="field full"><span>Razón obligatoria</span><textarea rows="3" value={wasteDraft.reason} onChange={(e) => setWasteDraft((c) => ({ ...c, reason: e.target.value }))} placeholder="Ej. se quemó pan, se cayó, caducó..." /></label>
              <button type="button" className="primary" onClick={reportWaste}>{role === 'admin' ? 'Aplicar merma' : 'Enviar para aprobación'}</button>
            </section>

            <section className="stock-card-block">
              <h2>Mermas pendientes</h2>
              {pendingWaste.length === 0 ? <p>No hay mermas pendientes.</p> : null}
              {pendingWaste.map((request) => (
                <div className="waste-request" key={request.id}>
                  <div>
                    <b>{request.item_name}</b>
                    <span>{formatStockQuantity(request.quantity, request.unit_code)} · {request.reason}</span>
                    <small>Reportó {request.reported_by} · {request.reported_shift}</small>
                  </div>
                  {role === 'admin' && (
                    <div className="inline-actions">
                      <button type="button" className="primary small" onClick={() => approveWaste(request.id, true)}>Aprobar</button>
                      <button type="button" className="ghost danger-text" onClick={() => approveWaste(request.id, false)}>Rechazar</button>
                    </div>
                  )}
                </div>
              ))}
            </section>
          </div>
        )}

        {activeTab === 'soldOut' && (
          <div className="stock-dashboard-grid soldout-mobile-grid">
            <section className="stock-card-block">
              <h2>Sugerencias por inventario</h2>
              {suggestedSoldOutProducts.length === 0 ? <p>No hay sugerencias por falta de ingredientes.</p> : null}
              {suggestedSoldOutProducts.map(({ product, blockingLines, lowLines }) => (
                <div className="soldout-row" key={product.id}>
                  <div>
                    <b>{product.name}</b>
                    <span>Sin stock: {blockingLines.map((line) => line.item.name).join(', ')}</span>
                    {lowLines.length > 0 ? <small>Bajo: {lowLines.map((line) => line.item.name).join(', ')}</small> : null}
                  </div>
                  <button type="button" className="primary small" onClick={() => setProductSoldOut(product.id, true)}>Marcar agotado</button>
                </div>
              ))}
            </section>

            <section className="stock-card-block">
              <h2>Productos agotados</h2>
              {soldOutProducts.length === 0 ? <p>No hay productos marcados como agotados.</p> : null}
              {soldOutProducts.map((product) => (
                <div className="soldout-row" key={product.id}>
                  <div>
                    <b>{product.name}</b>
                    <span>{stockCategoryLabel(product.category)}</span>
                  </div>
                  <button type="button" className="ghost" onClick={() => setProductSoldOut(product.id, false)}>Quitar agotado</button>
                </div>
              ))}
            </section>

            <section className="stock-card-block soldout-products-card">
              <h2>Todos los productos</h2>
              <div className="stock-table-wrap">
                <table className="stock-table">
                  <thead><tr><th>Producto</th><th>Categoría</th><th>Estado</th><th></th></tr></thead>
                  <tbody>
                    {stockMenuProducts.map((product) => (
                      <tr key={product.id}>
                        <td><b>{product.name}</b></td>
                        <td>{stockCategoryLabel(product.category)}</td>
                        <td>{product.soldOut ? <span className="stock-pill danger">Agotado</span> : <span className="stock-pill ok">Disponible</span>}</td>
                        <td><button type="button" className={product.soldOut ? 'ghost' : 'ghost danger-text'} onClick={() => setProductSoldOut(product.id, !product.soldOut)}>{product.soldOut ? 'Quitar agotado' : 'Marcar agotado'}</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'movements' && (
          <section className="stock-card-block">
            <h2>Movimientos</h2>
            <div className="stock-table-wrap">
              <table className="stock-table">
                <thead><tr><th>Fecha</th><th>Ingrediente</th><th>Tipo</th><th>Cantidad</th><th>Razón</th><th>Usuario</th></tr></thead>
                <tbody>
                  {data.movements.map((movement) => (
                    <tr key={movement.id}>
                      <td>{formatOrderDate(movement.created_at_monterrey || movement.created_at_utc)}</td>
                      <td>{movement.item_name}</td>
                      <td>{movement.movement_type}</td>
                      <td>{formatStockQuantity(movement.quantity, movement.unit_code)}</td>
                      <td>{movement.reason || ''}</td>
                      <td>{movement.reported_by || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}







