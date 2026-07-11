import React, { useEffect, useMemo, useState } from 'react';
import { ShoppingBag, Plus, Minus, Trash2, MessageCircle, Sparkles, Utensils } from 'lucide-react';
import './styles.css';
import { CATALOG_PRODUCTS, categoryMeta, makeDefaultPromotion, mergeCategoriesWithExtras, mergeProductsWithExtras, normalizePromotion, promotionItems, sortByOrder } from './lib/catalog.js';
import {
  BRANCH_STORAGE_KEY,
  DEFAULT_BRANCH_SETTINGS,
  DEFAULT_BUSINESS_HOURS,
  WEEKDAY_LABELS,
  activeBranches,
  businessStatus,
  normalizeBranchSettings,
  normalizeBusinessHours,
  normalizeWhatsAppNumber,
  selectedBranchFrom,
} from './lib/business.js';
const OrdersPanel = React.lazy(() => import('./internal/OrdersPanel.jsx'));
const StockPanel = React.lazy(() => import('./internal/StockPanel.jsx'));
const AdminPanel = React.lazy(() => import('./internal/AdminPanel.jsx'));

import {
  WHATSAPP_NUMBER,
  categories,
  dressingSides,
  saladDressings,
  syrups,
  milkTypes,
  crepeFlavors,
  savoryCrepeFlavors,
} from './data/menu.js';

const currency = (amount) => `$${amount}`;

const CUSTOMER_STORAGE_KEY = 'pecas_customer_profile';

function modificationDetails(details = []) {
  return details.filter((detail) => {
    const value = String(detail || '').trim().toLowerCase();
    return value.startsWith('sin:') || value.startsWith('sin ') || value.startsWith('extras:') || value.startsWith('extra ');
  });
}

const LANGUAGE_STORAGE_KEY = 'pecas_language';
const ORDERS_PASSWORD_STORAGE_KEY = 'pecas_orders_password';
const ADMIN_PASSWORD_STORAGE_KEY = 'pecas_admin_password';
const SUPER_PASSWORD_STORAGE_KEY = 'pecas_super_password';
const CASHIER_SESSION_STORAGE_KEY = 'pecas_cashier_session';
const STOCK_SESSION_STORAGE_KEY = 'pecas_stock_session';
const STOCK_BRANCH_STORAGE_KEY = 'pecas_stock_branch';
const EMPLOYEE_LOGIN_NAME_STORAGE_KEY = 'pecas_employee_login_name';
const EMPLOYEE_LOGIN_SHIFT_STORAGE_KEY = 'pecas_employee_login_shift';

const TEXT = {
  es: {
    brandTagline: 'Cocina & Café',
    languageLabel: 'Idioma',
    selectOption: 'Selecciona una opción',
    notesLabel: 'Personalizar / nota',
    notesPlaceholder: 'Ej. sin jitomate, poco aderezo, bien dorado...',
    sideDressing: 'Aderezo de acompañamiento',
    sideDressingHint: 'Sin costo. Va aparte, no dentro del producto.',
    extraDressing: 'Aderezo extra +$10',
    removeIngredients: 'Quitar ingredientes',
    changeInternalDressing: 'Cambiar aderezo interno',
    noInternalDressingChange: 'Sin cambio',
    recipeExtrasLabel: 'Extras',
    dressing: 'Aderezo',
    addCutlery: 'Agregar cubiertos',
    crepeFlavorLabel: 'Elige de 1 a 2 sabores incluidos *',
    crepeFlavorSmall: (count) => `${count}/2 seleccionados. Mínimo 1.`,
    extraToppings: 'Toppings extra +$10 c/u',
    extraToppingsSmall: (count) => `${count}/5 toppings extra seleccionados.`,
    whippedCream: 'Crema batida +$10',
    temperature: 'Temperatura',
    milkType: 'Tipo de leche',
    syrup: 'Jarabe +$10',
    whippedCreamDetail: 'Crema batida: Sí (+$10)',
    noWhippedCreamDetail: 'Crema batida: No',
    chooseMilkAlert: 'Elige el tipo de leche.',
    includedDressingDetail: (value) => `Aderezo de acompañamiento: ${value}`,
    extraDressingDetail: (value) => `Aderezo extra: ${value} (+$10)`,
    dressingDetail: (value) => `Aderezo: ${value}`,
    cutleryDetail: (value) => `Cubiertos: ${value ? 'Sí' : 'No'}`,
    flavorsDetail: (values) => `Sabores: ${values.join(', ')}`,
    extraToppingsDetail: (values, price) => `Toppings extra: ${values.join(', ')} (+$${price})`,
    temperatureDetail: (value) => `Temperatura: ${value}`,
    milkDetail: (value) => `Leche: ${value}`,
    syrupDetail: (value) => `Jarabe: ${value} (+$10)`,
    noSyrupDetail: 'Jarabe: Sin jarabe',
    noteDetail: (value) => `Nota: ${value}`,
    chooseSideDressingAlert: 'Elige un aderezo de acompañamiento. También puedes seleccionar “Sin aderezo”.',
    chooseCrepeFlavorAlert: 'Elige al menos 1 sabor para la crepa.',
    showOptions: 'Personalizar',
    hideOptions: 'Ocultar opciones',
    add: 'Agregar',
    yourOrder: 'Tu pedido',
    cart: 'Carrito',
    emptyCart: 'Tu carrito está vacío. Elige algo rico del menú.',
    customerDataTitle: 'Datos para enviar por WhatsApp',
    welcomeBack: (name) => `Qué gusto tenerte de vuelta, ${name}.`,
    privacyNote: 'Puedes guardar tus datos para futuros pedidos. Se guardan solo en este celular/navegador.',
    namePlaceholder: 'Nombre',
    addressPlaceholder: 'Dirección',
    neighborhoodPlaceholder: 'Colonia / Privada',
    sectorPlaceholder: 'Sector',
    paymentPlaceholder: 'Forma de pago',
    paymentTransfer: 'Transferencia',
    paymentCash: 'Efectivo',
    paymentCard: 'Tarjeta',
    orderNotePlaceholder: 'Nota general del pedido',
    saveMyData: 'Guardar mis datos',
    clearData: 'Borrar datos',
    savedDataAlert: 'Tus datos quedaron guardados solo en este dispositivo.',
    completeDataAlert: 'Completa nombre y dirección antes de enviar el pedido.',
    saveOrderError: 'No se pudo guardar el pedido. Intenta de nuevo.',
    connectionOrderError: (message) => `No se pudo guardar el pedido: ${message}`,
    total: 'Total',
    each: 'c/u',
    sendWhatsApp: 'Enviar pedido por WhatsApp',
    orderMessageIntro: 'Hola Pecas, quiero hacer un pedido:',
    orderData: 'Datos del pedido:',
    orderNumber: 'Número de pedido',
    nameLabel: 'Nombre',
    addressLabel: 'Dirección',
    neighborhoodLabel: 'Colonia/Privada',
    sectorLabel: 'Sector',
    paymentLabel: 'Pago',
    generalNoteLabel: 'Nota general',
    heroEyebrow: 'Arma tu pedido en línea',
    heroTitle: 'Comida, café y antojos en un solo pedido.',
    heroText: 'Paninis, wraps, ensaladas, crepas y café. Personaliza tu pedido y envíalo directo a Pecas por WhatsApp.',
    orderNow: 'Ordenar ahora',
    viewCart: 'Ver carrito',
    heroFloatingTop: '',
    heroFloatingBottom: '',
    menu: 'Menú',
    chooseCategory: 'Elige una categoría',
    productsCount: (count) => `${count} producto${count === 1 ? '' : 's'}`,
    promoEyebrow: '',
    promoFixed: 'Esta promoción no permite cambiar ingredientes incluidos.',
    promoExtras: 'Extras',
    addPromo: 'Agregar promo',
    unavailable: 'No disponible',
    soldOut: 'Agotado',
    openNow: 'Abierto ahora',
    closedNow: 'Cerrado',
  },
  en: {
    brandTagline: 'Kitchen & Coffee',
    languageLabel: 'Language',
    selectOption: 'Choose an option',
    notesLabel: 'Customize / note',
    notesPlaceholder: 'Example: no tomato, light dressing, extra toasted...',
    sideDressing: 'Side dressing',
    sideDressingHint: 'Free. Served on the side, not inside the item.',
    extraDressing: 'Extra dressing +$10',
    removeIngredients: 'Remove ingredients',
    changeInternalDressing: 'Change internal dressing',
    noInternalDressingChange: 'No change',
    recipeExtrasLabel: 'Extras',
    dressing: 'Dressing',
    addCutlery: 'Add cutlery',
    crepeFlavorLabel: 'Choose 1 to 2 included flavors *',
    crepeFlavorSmall: (count) => `${count}/2 selected. Minimum 1.`,
    extraToppings: 'Extra toppings +$10 each',
    extraToppingsSmall: (count) => `${count}/5 extra toppings selected.`,
    whippedCream: 'Whipped cream +$10',
    temperature: 'Temperature',
    milkType: 'Milk type',
    syrup: 'Syrup +$10',
    whippedCreamDetail: 'Whipped cream: Yes (+$10)',
    noWhippedCreamDetail: 'Whipped cream: No',
    chooseMilkAlert: 'Choose the milk type.',
    includedDressingDetail: (value) => `Side dressing: ${optionLabel('en', value)}`,
    extraDressingDetail: (value) => `Extra dressing: ${optionLabel('en', value)} (+$10)`,
    dressingDetail: (value) => `Dressing: ${optionLabel('en', value)}`,
    cutleryDetail: (value) => `Cutlery: ${value ? 'Yes' : 'No'}`,
    flavorsDetail: (values) => `Flavors: ${values.map((v) => optionLabel('en', v)).join(', ')}`,
    extraToppingsDetail: (values, price) => `Extra toppings: ${values.map((v) => optionLabel('en', v)).join(', ')} (+$${price})`,
    temperatureDetail: (value) => `Temperature: ${optionLabel('en', value)}`,
    milkDetail: (value) => `Milk: ${optionLabel('en', value)}`,
    syrupDetail: (value) => `Syrup: ${optionLabel('en', value)} (+$10)`,
    noSyrupDetail: 'Syrup: No syrup',
    noteDetail: (value) => `Note: ${value}`,
    chooseSideDressingAlert: 'Choose a side dressing. You can also select “No dressing”.',
    chooseCrepeFlavorAlert: 'Choose at least 1 flavor for the crepe.',
    showOptions: 'Customize',
    hideOptions: 'Hide options',
    add: 'Add',
    yourOrder: 'Your order',
    cart: 'Cart',
    emptyCart: 'Your cart is empty. Pick something tasty from the menu.',
    customerDataTitle: 'Order details for WhatsApp',
    welcomeBack: (name) => `Great to have you back, ${name}.`,
    privacyNote: 'You can save your details for future orders. They are stored only on this phone/browser.',
    namePlaceholder: 'Name',
    addressPlaceholder: 'Address',
    neighborhoodPlaceholder: 'Neighborhood / Private community',
    sectorPlaceholder: 'Sector',
    paymentPlaceholder: 'Payment method',
    paymentTransfer: 'Bank transfer',
    paymentCash: 'Cash',
    paymentCard: 'Card',
    orderNotePlaceholder: 'General order note',
    saveMyData: 'Save my details',
    clearData: 'Clear details',
    savedDataAlert: 'Your details were saved only on this device.',
    completeDataAlert: 'Complete your name and address before sending the order.',
    saveOrderError: 'Could not save the order. Please try again.',
    connectionOrderError: (message) => `Could not save the order: ${message}`,
    total: 'Total',
    each: 'each',
    sendWhatsApp: 'Send order via WhatsApp',
    orderMessageIntro: 'Hi Pecas, I would like to place an order:',
    orderData: 'Order details:',
    orderNumber: 'Order number',
    nameLabel: 'Name',
    addressLabel: 'Address',
    neighborhoodLabel: 'Neighborhood/Private community',
    sectorLabel: 'Sector',
    paymentLabel: 'Payment',
    generalNoteLabel: 'General note',
    heroEyebrow: 'Build your order online',
    heroTitle: 'Food, coffee, and cravings in one order.',
    heroText: 'Paninis, wraps, salads, crepes, and coffee. Customize your order and send it straight to Pecas on WhatsApp.',
    orderNow: 'Order now',
    viewCart: 'View cart',
    heroFloatingTop: '',
    heroFloatingBottom: '',
    menu: 'Menu',
    chooseCategory: 'Choose a category',
    productsCount: (count) => `${count} item${count === 1 ? '' : 's'}`,
    promoEyebrow: '',
    promoFixed: 'This promo does not allow changes to included ingredients.',
    promoExtras: 'Extras',
    addPromo: 'Add promo',
    unavailable: 'Unavailable',
    soldOut: 'Sold out',
    openNow: 'Open now',
    closedNow: 'Closed',
  },
};

const OPTION_TRANSLATIONS = {
  'Sin aderezo': 'No dressing',
  Chipotle: 'Chipotle',
  'Salsa italiana': 'Italian dressing',
  Barbecue: 'Barbecue',
  Ninguno: 'None',
  'Blue Cheese': 'Blue Cheese',
  'Vinagreta miel-limón': 'Honey-lime vinaigrette',
  Helado: 'Iced',
  Caliente: 'Hot',
  Entera: 'Whole milk',
  Deslactosada: 'Lactose-free',
  'Sin jarabe': 'No syrup',
  'Vainilla francesa': 'French vanilla',
  'Caramelo salado': 'Salted caramel',
  'Vainilla francesa sin azúcar': 'Sugar-free French vanilla',
  'Caramelo salado sin azúcar': 'Sugar-free salted caramel',
  Nutella: 'Nutella',
  Cajeta: 'Cajeta',
  'Queso crema dulce': 'Sweet cream cheese',
  Lechera: 'Sweetened condensed milk',
  Fresa: 'Strawberry',
  Plátano: 'Banana',
  Nuez: 'Walnut',
  'Jamón de pavo': 'Turkey ham',
  Pepperoni: 'Pepperoni',
  'Queso manchego': 'Manchego cheese',
  'Queso mozzarella': 'Mozzarella cheese',
  'Mix quesos': 'Cheese mix',
};

const PRODUCT_TRANSLATIONS = {
  'panini-pollo-chipotle': { name: 'Chicken Chipotle Panini', badge: 'New', description: 'Chicken breast, manchego cheese, and chipotle dressing on chapata bread.' },
  'panini-pollo-bbq': { name: 'Chicken BBQ Panini', description: 'Chicken breast, manchego cheese, and barbecue sauce on chapata bread.' },
  'panini-pizza': { name: 'Pizza Panini', description: 'Pepperoni, manchego cheese, and tomato sauce on chapata bread.' },
  'panini-jamon-queso': { name: 'Ham & Cheese Panini', description: 'Turkey ham, manchego cheese, and mayo on chapata bread.' },
  'wrap-pollo-chipotle': { name: 'Chicken Chipotle Wrap', badge: 'Fresh', description: 'Chicken, lettuce, tomato, manchego cheese, and chipotle.' },
  'wrap-pollo-bbq': { name: 'Chicken BBQ Wrap', description: 'BBQ chicken, lettuce, manchego cheese, and red onion.' },
  'wrap-jamon-queso': { name: 'Ham & Cheese Wrap', description: 'Ham, lettuce, tomato, manchego cheese, and mayo.' },
  'wrap-pecas': { name: 'Pecas Wrap', badge: 'New', description: 'Lettuce, chicken fajitas, house blue cheese, and mozzarella/manchego cheese blend.' },
  'ensalada-blue': { name: 'Blue Cheese Salad', description: 'Lettuce, grilled chicken, manchego cheese, and croutons.' },
  'ensalada-chipotle': { name: 'Chipotle Salad', description: 'Lettuce, grilled chicken, manchego cheese, and crispy tortilla strips.' },
  'ensalada-bbq': { name: 'BBQ Salad', description: 'Lettuce, BBQ chicken, manchego cheese, and red onion.' },
  'ensalada-fresa-nuez': { name: 'Strawberry & Walnut Salad', badge: 'Specialty', description: 'Lettuce, grilled chicken, strawberry, walnut, and manchego cheese.' },
  'crepa-dulce': { name: 'Sweet Crepe', badge: '2 included flavors', description: 'Choose 1 to 2 included flavors. Add extra toppings for $10 each.' },
  'crepa-salada': { name: 'Savory Crepe', badge: '2 included fillings', description: 'Choose 1 to 2 included fillings. Add extras for $10 each.' },
  americano: { name: 'Americano', description: 'Hot or iced. Optional syrup for $10.' },
  latte: { name: 'Latte', description: 'Hot or iced. Choose whole or lactose-free milk. Optional syrup for $10.' },
  frappe: { name: 'Frappé', description: 'Blended iced coffee. Choose whole or lactose-free milk. Add whipped cream for $10.' },
  coca: { name: 'Coca-Cola', description: 'Cold soft drink.' },
  'coca-light': { name: 'Coca-Cola Light', description: 'Cold soft drink.' },
  agua: { name: 'Water', description: 'Bottled water.' },
};

const CATEGORY_TRANSLATIONS = {
  paninis: 'Paninis',
  wraps: 'Wraps',
  ensaladas: 'Salads',
  crepas: 'Crepes',
  cafe: 'Coffee',
  bebidas: 'Drinks',
};

function t(lang, key, ...args) {
  const value = TEXT[lang]?.[key] ?? TEXT.es[key] ?? key;
  return typeof value === 'function' ? value(...args) : value;
}

function optionLabel(lang, value) {
  if (lang !== 'en') return value;
  return OPTION_TRANSLATIONS[value] || value;
}

function productText(product, lang) {
  if (lang !== 'en') return product;
  return { ...product, ...(PRODUCT_TRANSLATIONS[product.id] || {}) };
}

function categoryLabel(categoryId, lang) {
  const meta = categoryMeta(categoryId);
  if (lang === 'en') return CATEGORY_TRANSLATIONS[categoryId] || meta.label;
  return meta.label;
}

function mergeProductsWithOverrides(products, overrides) {
  if (!overrides || Object.keys(overrides).length === 0) return products;
  return products.map((product) => {
    const override = overrides[product.id] || {};
    return {
      ...product,
      ...override,
      unavailable: Boolean(override.unavailable),
      soldOut: Boolean(override.soldOut),
    };
  });
}

function getCrepeOptions(product) {
  return product.id === 'crepa-salada' ? savoryCrepeFlavors : crepeFlavors;
}


function includedDetailsToLines(details) {
  return String(details || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function getPromoExtrasInitial(product) {
  if (!product) return { removedIngredients: [], changedInternalDressing: '', recipeExtras: [], note: '' };
  if (product.type === 'crepe') return { extraToppings: [], cutlery: false, note: '' };
  if (product.type === 'panini' || product.type === 'wrap') return { extraDressing: 'Ninguno', note: '' };
  if (product.type === 'salad') return { extraDressing: 'Ninguno', cutlery: false, note: '' };
  if (product.type === 'coffee') return { syrup: 'Sin jarabe', whippedCream: false, note: '' };
  return { note: '' };
}

function normalizeName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function uniqueByName(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = normalizeName(item.name || item.itemName);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function optionMatchesProductOption(product, ingredientName) {
  const name = normalizeName(ingredientName);
  if (product?.type === 'crepe') return getCrepeOptions(product).some((option) => normalizeName(option) === name);
  if (dressingSides.some((option) => normalizeName(option) === name)) return true;
  if (saladDressings.some((option) => normalizeName(option) === name)) return true;
  if (syrups.some((option) => normalizeName(option) === name)) return true;
  return false;
}

function normalizeCustomization(customization) {
  return {
    removable: uniqueByName(customization?.removable || []),
    changeableDressings: uniqueByName(customization?.changeableDressings || []),
    defaultInternalDressings: uniqueByName(customization?.defaultInternalDressings || []),
    extraBillables: uniqueByName(customization?.extraBillables || []),
    optionGroups: Array.isArray(customization?.optionGroups) ? customization.optionGroups : [],
  };
}

function defaultOptionGroupSelections(customization = {}) {
  const groups = normalizeCustomization(customization).optionGroups || [];
  const result = {};
  for (const group of groups) {
    const defaultName = group.defaultOptionName || (group.options || []).find((option) => option.isDefault)?.name || '';
    result[group.familyKey] = defaultName ? [defaultName] : [];
  }
  return result;
}

function selectedOptionGroupPrice(customization = {}, selections = {}) {
  const groups = normalizeCustomization(customization).optionGroups || [];
  let total = 0;
  for (const group of groups) {
    const selected = Array.isArray(selections?.[group.familyKey]) ? selections[group.familyKey] : [];
    const maxIncluded = Number(group.maxIncluded || 0);
    let paidCount = 0;
    for (let index = 0; index < selected.length; index += 1) {
      const option = (group.options || []).find((item) => normalizeName(item.name) === normalizeName(selected[index]));
      const isIncludedSlot = index < maxIncluded;
      if (!isIncludedSlot) paidCount += Number(option?.extraPrice || group.extraPrice || 0);
    }
    total += paidCount;
  }
  return total;
}

function optionGroupDetails(customization = {}, selections = {}, lang = 'es') {
  const groups = normalizeCustomization(customization).optionGroups || [];
  const details = [];
  for (const group of groups) {
    const selected = Array.isArray(selections?.[group.familyKey]) ? selections[group.familyKey].filter(Boolean) : [];
    if (selected.length === 0) continue;
    const extra = selectedOptionGroupPrice({ optionGroups: [group] }, { [group.familyKey]: selected });
    const label = group.label || group.familyKey;
    const maxIncluded = Number(group.maxIncluded || 0);
    const included = selected.slice(0, maxIncluded);
    const extras = selected.slice(maxIncluded);
    if (included.length) details.push(`${label}: ${included.join(', ')}`);
    if (extras.length) details.push(`EXTRA ${label}: ${extras.join(', ')}${extra ? ` (+$${extra})` : ''}`);
    if (!included.length && selected.length && maxIncluded === 0) details.push(`EXTRA ${label}: ${selected.join(', ')}${extra ? ` (+$${extra})` : ''}`);
  }
  return details;
}

function selectedRecipeExtraPrice(product, customization, selectedExtras = []) {
  if (!Array.isArray(selectedExtras) || selectedExtras.length === 0) return 0;
  const selected = new Set(selectedExtras.map(normalizeName));
  return (customization.extraBillables || []).reduce((sum, extra) => {
    if (!selected.has(normalizeName(extra.name))) return sum;
    if (optionMatchesProductOption(product, extra.name)) return sum;
    return sum + Number(extra.extraPrice || 10);
  }, 0);
}

function Logo({ lang = 'es', setLang, onLoginClick }) {
  return (
    <div className="brand-area">
      <div className="brand-lockup">
        <img src="/pecas-logo.svg" alt="Pecas" className="brand-logo" />
        <div>
          <div className="brand-name">Pecas</div>
          <div className="brand-tagline">{t(lang, 'brandTagline')}</div>
        </div>
      </div>
      {(setLang || onLoginClick) && (
        <div className="brand-actions">
          {setLang && (
            <div className="language-toggle" aria-label={t(lang, 'languageLabel')}>
              <button type="button" className={lang === 'es' ? 'active' : ''} onClick={() => setLang('es')}>ES</button>
              <button type="button" className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>EN</button>
            </div>
          )}
          {onLoginClick && (
            <button type="button" className="employee-login-button" onClick={onLoginClick}>Ingresa</button>
          )}
        </div>
      )}
    </div>
  );
}

function legacyRoute() {
  try {
    if (window.location.hash) return window.location.hash;
    const path = window.location.pathname.replace(/\/+$/, '');
    if (path === '/admin') return '#admin';
    if (path === '/super') return '#super';
    if (path === '/orders') return '#orders';
    if (path === '/stock') return '#stock';
    if (path === '/cashier') return '#cashier';
    return '#';
  } catch {
    return '#';
  }
}


function EmployeeLoginModal({ open, onClose }) {
  const [password, setPassword] = useState('');
  const [employeeName, setEmployeeName] = useState(() => {
    try { return window.localStorage.getItem(EMPLOYEE_LOGIN_NAME_STORAGE_KEY) || ''; } catch { return ''; }
  });
  const [shift, setShift] = useState(() => {
    try { return window.localStorage.getItem(EMPLOYEE_LOGIN_SHIFT_STORAGE_KEY) || 'Turno'; } catch { return 'Turno'; }
  });
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const saveSessionForRole = (role) => {
    const cleanPassword = password.trim();
    const cleanName = employeeName.trim();
    const cleanShift = shift.trim() || 'Turno';
    try {
      if (cleanName) window.localStorage.setItem(EMPLOYEE_LOGIN_NAME_STORAGE_KEY, cleanName);
      if (cleanShift) window.localStorage.setItem(EMPLOYEE_LOGIN_SHIFT_STORAGE_KEY, cleanShift);
      if (role === 'admin') window.sessionStorage.setItem(ADMIN_PASSWORD_STORAGE_KEY, cleanPassword);
      if (role === 'super') window.sessionStorage.setItem(SUPER_PASSWORD_STORAGE_KEY, cleanPassword);
      if (role === 'orders') window.sessionStorage.setItem(ORDERS_PASSWORD_STORAGE_KEY, cleanPassword);
      if (role === 'stock') window.sessionStorage.setItem(STOCK_SESSION_STORAGE_KEY, JSON.stringify({ password: cleanPassword, operatorName: cleanName || 'Equipo', shift: cleanShift }));
      if (role === 'cashier') window.sessionStorage.setItem(CASHIER_SESSION_STORAGE_KEY, JSON.stringify({ password: cleanPassword, cashierName: cleanName || 'Caja', shift: cleanShift }));
    } catch { /* ignore */ }
  };

  const submit = async () => {
    if (!password.trim()) {
      setStatus('Ingresa tu contraseña.');
      return;
    }
    setLoading(true);
    setStatus('Validando acceso...');
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.trim() }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        setStatus(result.error || 'Contraseña incorrecta.');
        return;
      }
      if ((result.role === 'stock' || result.role === 'cashier') && !employeeName.trim()) {
        setStatus('Ingresa tu nombre para continuar.');
        return;
      }
      if (result.role === 'platform_admin' && result.sessionToken) {
        window.sessionStorage.setItem('platform_admin_token', result.sessionToken);
      }
      saveSessionForRole(result.role);
      setStatus('Entrando...');
      window.location.hash = result.redirect || '#';
      onClose();
      setPassword('');
    } catch (error) {
      setStatus(`No se pudo entrar: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="employee-login-overlay" role="dialog" aria-modal="true">
      <div className="employee-login-modal">
        <div className="employee-login-head">
          <div>
            <h2>Ingresa a Pecas</h2>
            <p>Acceso para equipo Pecas. Más adelante aquí podrán registrarse clientes.</p>
          </div>
          <button type="button" className="ghost mini" onClick={onClose}>Cerrar</button>
        </div>
        <div className="employee-login-grid">
          <label className="field full">
            <span>Contraseña</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña de tu rol" onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} autoFocus />
          </label>
          <label className="field">
            <span>Nombre empleado</span>
            <input value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} placeholder="Ej. César" />
          </label>
          <label className="field">
            <span>Turno</span>
            <input value={shift} onChange={(e) => setShift(e.target.value)} placeholder="Ej. Noche" />
          </label>
        </div>
        <button type="button" className="primary checkout" onClick={submit} disabled={loading}>{loading ? 'Validando...' : 'Entrar'}</button>
        {status && <p className="admin-status">{status}</p>}
      </div>
    </div>
  );
}

function BackofficeNav({ current = 'admin', compact = false, showAdmin = true }) {
  const links = [
    { key: 'admin', href: '#admin', label: 'Admin', description: 'Menú, catálogo y sucursales' },
    { key: 'super', href: '#super', label: 'Super', description: 'Horarios y promociones' },
    { key: 'orders', href: '#orders', label: 'Pedidos', description: 'Cola de producción' },
    { key: 'stock', href: '#stock', label: 'Stock', description: 'Inventario y agotados' },
    { key: 'cashier', href: '#cashier', label: 'Caja', description: 'Capturar pedidos' },
  ];

  const visibleLinks = showAdmin ? links : links.filter((link) => link.key !== 'admin');

  return (
    <nav className={compact ? 'backoffice-nav compact' : 'backoffice-nav'} aria-label="Navegación interna Pecas">
      {visibleLinks.map((link) => (
        <a key={link.key} href={link.href} className={current === link.key ? 'active' : ''}>
          <strong>{link.label}</strong>
          {!compact && <span>{link.description}</span>}
        </a>
      ))}
    </nav>
  );
}

function OptionSelect({ label, value, onChange, options, hint, required = false, placeholder, lang = 'es' }) {
  const finalPlaceholder = placeholder || t(lang, 'selectOption');
  return (
    <label className="field">
      <span>{label}{required ? ' *' : ''}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} required={required}>
        {required && <option value="" disabled>{finalPlaceholder}</option>}
        {options.map((option) => (
          <option key={option} value={option}>{optionLabel(lang, option)}</option>
        ))}
      </select>
      {hint && <small>{hint}</small>}
    </label>
  );
}

function Notes({ value, onChange, lang = 'es' }) {
  return (
    <label className="field full">
      <span>{t(lang, 'notesLabel')}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t(lang, 'notesPlaceholder')}
        rows="2"
      />
    </label>
  );
}

function CrepeFlavorPicker({ selected, setSelected, options = crepeFlavors, lang = 'es' }) {
  const toggleFlavor = (flavor) => {
    if (selected.includes(flavor)) {
      setSelected(selected.filter((item) => item !== flavor));
      return;
    }
    if (selected.length >= 2) return;
    setSelected([...selected, flavor]);
  };

  return (
    <div className="field full">
      <span>{t(lang, 'crepeFlavorLabel')}</span>
      <div className="pill-grid">
        {options.map((flavor) => {
          const active = selected.includes(flavor);
          const disabled = !active && selected.length >= 2;
          return (
            <button
              type="button"
              key={flavor}
              className={`pill ${active ? 'active' : ''}`}
              disabled={disabled}
              onClick={() => toggleFlavor(flavor)}
            >
              {optionLabel(lang, flavor)}
            </button>
          );
        })}
      </div>
      <small>{t(lang, 'crepeFlavorSmall', selected.length)}</small>
    </div>
  );
}

function ExtraToppingsPicker({ selected, setSelected, options = crepeFlavors, lang = 'es' }) {
  const toggleTopping = (topping) => {
    if (selected.includes(topping)) {
      setSelected(selected.filter((item) => item !== topping));
      return;
    }
    if (selected.length >= 5) return;
    setSelected([...selected, topping]);
  };

  return (
    <div className="field full">
      <span>{t(lang, 'extraToppings')}</span>
      <div className="pill-grid">
        {options.map((topping) => {
          const active = selected.includes(topping);
          const disabled = !active && selected.length >= 5;
          return (
            <button
              type="button"
              key={topping}
              className={`pill ${active ? 'active' : ''}`}
              disabled={disabled}
              onClick={() => toggleTopping(topping)}
            >
              {optionLabel(lang, topping)}
            </button>
          );
        })}
      </div>
      <small>{t(lang, 'extraToppingsSmall', selected.length)}</small>
    </div>
  );
}



function OptionFamilyControls({ state, update, customization, onlyKeys = null, excludeKeys = [] }) {
  const allGroups = normalizeCustomization(customization).optionGroups || [];
  const only = Array.isArray(onlyKeys) ? new Set(onlyKeys) : null;
  const excluded = new Set(excludeKeys || []);
  const groups = allGroups.filter((group) => (!only || only.has(group.familyKey)) && !excluded.has(group.familyKey));
  if (!groups.length) return null;
  const selections = state.optionGroups || {};
  const setGroupSelection = (familyKey, value, maxTotal = 1) => {
    const current = Array.isArray(selections[familyKey]) ? selections[familyKey] : [];
    let next = current;
    if (maxTotal <= 1) {
      next = value ? [value] : [];
    } else if (current.includes(value)) {
      next = current.filter((item) => item !== value);
    } else if (current.length < maxTotal) {
      next = [...current, value];
    } else {
      next = [...current.slice(1), value];
    }
    update('optionGroups', { ...selections, [familyKey]: next });
  };
  return (
    <>
      {groups.map((group) => {
        const selected = Array.isArray(selections[group.familyKey]) ? selections[group.familyKey] : [];
        const maxTotal = Number(group.maxTotal || 1);
        const isRequired = Boolean(group.required) || Number(group.minSelect || 0) > 0;
        const label = `${group.label || group.familyKey}${isRequired ? ' *' : ''}`;
        if (maxTotal <= 1) {
          return (
            <label className="field" key={group.familyKey}>
              <span>{label}</span>
              <select value={selected[0] || ''} onChange={(e) => setGroupSelection(group.familyKey, e.target.value, maxTotal)} required={isRequired}>
                {!isRequired && <option value="">Ninguno</option>}
                {isRequired && <option value="" disabled>Selecciona</option>}
                {(group.options || []).map((option) => <option key={option.name} value={option.name}>{option.name}</option>)}
              </select>
              {Number(group.maxIncluded || 0) === 0 && Number(group.extraPrice || 0) > 0 ? <small>Extra +${Number(group.extraPrice || 0)}</small> : null}
            </label>
          );
        }
        return (
          <div className="field full recipe-customer-block" key={group.familyKey}>
            <span>{label}</span>
            <div className="pill-grid compact-pill-grid">
              {(group.options || []).map((option) => {
                const active = selected.includes(option.name);
                const isExtra = selected.indexOf(option.name) >= Number(group.maxIncluded || 0) || Number(group.maxIncluded || 0) === 0;
                const price = Number(option.extraPrice || group.extraPrice || 0);
                return (
                  <button type="button" key={option.name} className={`pill ${active ? 'active' : ''}`} onClick={() => setGroupSelection(group.familyKey, option.name, maxTotal)}>
                    {option.name}{active && isExtra && price ? ` +$${price}` : ''}
                  </button>
                );
              })}
            </div>
            <small>{Number(group.maxIncluded || 0)} incluido(s). Máximo {maxTotal} selección(es).</small>
          </div>
        );
      })}
    </>
  );
}

function RecipeCustomizationControls({ product, state, customization, toggleRemovedIngredient, updateChangedDressing, toggleRecipeExtra, genericExtras, lang = 'es' }) {
  const removed = state.removedIngredients || [];
  const selectedExtras = state.recipeExtras || [];
  return (
    <>
      {customization.removable.length > 0 && (
        <div className="field full recipe-customer-block">
          <span>{t(lang, 'removeIngredients')}</span>
          <div className="pill-grid compact-pill-grid">
            {customization.removable.map((item) => {
              const isIncluded = !removed.includes(item.name);
              return (
                <button
                  type="button"
                  key={item.name}
                  className={`pill ${isIncluded ? 'active' : ''}`}
                  onClick={() => toggleRemovedIngredient(item.name)}
                >
                  {isIncluded ? '✓ ' : '✕ '}{item.name}
                </button>
              );
            })}
          </div>
          <small>Desactiva lo que no quieras en tu producto.</small>
        </div>
      )}

      {customization.changeableDressings.length > 0 && (
        <label className="field">
          <span>{t(lang, 'changeInternalDressing')}</span>
          <select value={state.changedInternalDressing || ''} onChange={(e) => updateChangedDressing(e.target.value)}>
            <option value="">{t(lang, 'noInternalDressingChange')}</option>
            {customization.changeableDressings.map((item) => (
              <option key={item.name} value={item.name}>{item.name}</option>
            ))}
          </select>
        </label>
      )}

      {genericExtras.length > 0 && (
        <div className="field full recipe-customer-block">
          <span>{t(lang, 'recipeExtrasLabel')}</span>
          <div className="pill-grid compact-pill-grid">
            {genericExtras.map((item) => {
              const active = selectedExtras.includes(item.name);
              return (
                <button
                  type="button"
                  key={item.name}
                  className={`pill ${active ? 'active' : ''}`}
                  onClick={() => toggleRecipeExtra(item.name)}
                >
                  {item.name} +${Number(item.extraPrice || 10)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function ProductOptions({ product, state, setState, lang = 'es', customization: rawCustomization }) {
  const customization = normalizeCustomization(rawCustomization);
  const update = (key, value) => setState((current) => ({ ...current, [key]: value }));
  const toggleRemovedIngredient = (name) => {
    const current = state.removedIngredients || [];
    update('removedIngredients', current.includes(name) ? current.filter((item) => item !== name) : [...current, name]);
  };
  const toggleRecipeExtra = (name) => {
    const current = state.recipeExtras || [];
    update('recipeExtras', current.includes(name) ? current.filter((item) => item !== name) : [...current, name]);
  };
  const genericExtras = customization.extraBillables.filter((extra) => !optionMatchesProductOption(product, extra.name));
  const hasFamily = (familyKey) => (customization.optionGroups || []).some((group) => group.familyKey === familyKey);


  if (product.type === 'panini' || product.type === 'wrap') {
    return (
      <div className="options-grid">
        <OptionFamilyControls state={state} update={update} customization={customization} excludeKeys={['aderezos-acompanamiento']} />
        {product.type === 'wrap' && (
          <OptionSelect
            label={t(lang, 'temperature')}
            value={state.temperature}
            onChange={(value) => update('temperature', value)}
            options={['Frío', 'Caliente']}
            lang={lang}
          />
        )}
        {!hasFamily('aderezos-acompanamiento') && <OptionSelect
          label={t(lang, 'sideDressing')}
          value={state.sideDressing}
          onChange={(value) => update('sideDressing', value)}
          options={dressingSides}
          required
          hint={t(lang, 'sideDressingHint')}
          lang={lang}
        />}
        {!hasFamily('aderezos-acompanamiento') && <OptionSelect
          label={t(lang, 'extraDressing')}
          value={state.extraDressing}
          onChange={(value) => update('extraDressing', value)}
          options={['Ninguno', ...dressingSides.filter((item) => item !== 'Sin aderezo')]}
          lang={lang}
        />}
        <RecipeCustomizationControls
          product={product}
          state={state}
          customization={customization}
          toggleRemovedIngredient={toggleRemovedIngredient}
          updateChangedDressing={(value) => update('changedInternalDressing', value)}
          toggleRecipeExtra={toggleRecipeExtra}
          genericExtras={genericExtras}
          lang={lang}
        />
        <Notes value={state.note} onChange={(value) => update('note', value)} lang={lang} />
      </div>
    );
  }

  if (product.type === 'salad') {
    return (
      <div className="options-grid">
        <OptionFamilyControls state={state} update={update} customization={customization} />
        {!hasFamily('aderezos-acompanamiento') && <OptionSelect
          label={t(lang, 'dressing')}
          value={state.saladDressing}
          onChange={(value) => update('saladDressing', value)}
          options={saladDressings}
          lang={lang}
        />}
        {!hasFamily('aderezos-acompanamiento') && <OptionSelect
          label={t(lang, 'extraDressing')}
          value={state.extraDressing}
          onChange={(value) => update('extraDressing', value)}
          options={['Ninguno', ...saladDressings]}
          lang={lang}
        />}
        <label className="check-row full">
          <input type="checkbox" checked={state.cutlery} onChange={(e) => update('cutlery', e.target.checked)} />
          <span>{t(lang, 'addCutlery')}</span>
        </label>
        <RecipeCustomizationControls
          product={product}
          state={state}
          customization={customization}
          toggleRemovedIngredient={toggleRemovedIngredient}
          updateChangedDressing={(value) => update('changedInternalDressing', value)}
          toggleRecipeExtra={toggleRecipeExtra}
          genericExtras={genericExtras}
          lang={lang}
        />
        <Notes value={state.note} onChange={(value) => update('note', value)} lang={lang} />
      </div>
    );
  }

  if (product.type === 'crepe') {
    return (
      <div className="options-grid">
        <OptionFamilyControls state={state} update={update} customization={customization} />
        {!hasFamily('toppings-dulces') && <CrepeFlavorPicker selected={state.flavors} setSelected={(value) => update('flavors', value)} options={getCrepeOptions(product)} lang={lang} />}
        {!hasFamily('toppings-dulces') && <ExtraToppingsPicker selected={state.extraToppings} setSelected={(value) => update('extraToppings', value)} options={getCrepeOptions(product)} lang={lang} />}
        <label className="check-row full">
          <input type="checkbox" checked={state.cutlery} onChange={(e) => update('cutlery', e.target.checked)} />
          <span>{t(lang, 'addCutlery')}</span>
        </label>
        <RecipeCustomizationControls
          product={product}
          state={state}
          customization={customization}
          toggleRemovedIngredient={toggleRemovedIngredient}
          updateChangedDressing={(value) => update('changedInternalDressing', value)}
          toggleRecipeExtra={toggleRecipeExtra}
          genericExtras={genericExtras}
          lang={lang}
        />
        <Notes value={state.note} onChange={(value) => update('note', value)} lang={lang} />
      </div>
    );
  }

  if (product.type === 'coffee') {
    return (
      <div className="options-grid">
        <OptionFamilyControls state={state} update={update} customization={customization} />
        <OptionSelect
          label={t(lang, 'temperature')}
          value={state.temperature}
          onChange={(value) => update('temperature', value)}
          options={['Helado', 'Caliente']}
          lang={lang}
        />
{(product.id === 'latte' || product.id === 'frappe') && !hasFamily('leches') && (
          <OptionSelect
            label={t(lang, 'milkType')}
            value={state.milk}
            onChange={(value) => update('milk', value)}
            options={milkTypes}
            required
            placeholder={t(lang, 'selectOption')}
            lang={lang}
          />
        )}
        {!hasFamily('jarabes') && <OptionSelect
          label={t(lang, 'syrup')}
          value={state.syrup}
          onChange={(value) => update('syrup', value)}
          options={['Sin jarabe', ...syrups]}
          lang={lang}
        />}
        {product.id === 'frappe' && (
          <label className="check-row full">
            <input type="checkbox" checked={state.whippedCream} onChange={(e) => update('whippedCream', e.target.checked)} />
            <span>{t(lang, 'whippedCream')}</span>
          </label>
        )}
        <RecipeCustomizationControls
          product={product}
          state={state}
          customization={customization}
          toggleRemovedIngredient={toggleRemovedIngredient}
          updateChangedDressing={(value) => update('changedInternalDressing', value)}
          toggleRecipeExtra={toggleRecipeExtra}
          genericExtras={genericExtras}
          lang={lang}
        />
        <Notes value={state.note} onChange={(value) => update('note', value)} lang={lang} />
      </div>
    );
  }

  return (
    <div className="options-grid">
      <Notes value={state.note} onChange={(value) => update('note', value)} lang={lang} />
    </div>
  );
}

function initialOptions(product, customization = {}) {
  const optionGroups = defaultOptionGroupSelections(customization);
  if (product.type === 'panini') {
    return { sideDressing: '', extraDressing: 'Ninguno', optionGroups, removedIngredients: [], changedInternalDressing: '', recipeExtras: [], note: '' };
  }
  if (product.type === 'wrap') {
    return { temperature: 'Caliente', sideDressing: product.defaultSideDressing || 'Chipotle', extraDressing: 'Ninguno', optionGroups, removedIngredients: [], changedInternalDressing: '', recipeExtras: [], note: '' };
  }
  if (product.type === 'salad') {
    return { saladDressing: product.defaultDressing || 'Blue Cheese', extraDressing: 'Ninguno', cutlery: false, optionGroups, removedIngredients: [], changedInternalDressing: '', recipeExtras: [], note: '' };
  }
  if (product.type === 'crepe') {
    return { flavors: [], extraToppings: [], cutlery: false, optionGroups, removedIngredients: [], changedInternalDressing: '', recipeExtras: [], note: '' };
  }
if (product.type === 'coffee') {
  return { temperature: 'Helado', milk: (product.id === 'latte' || product.id === 'frappe') ? '' : 'N/A', syrup: 'Sin jarabe', whippedCream: false, optionGroups, removedIngredients: [], changedInternalDressing: '', recipeExtras: [], note: '' };
}
  return { optionGroups, note: '' };
}

function buildCartItem(product, options, lang = 'es', customization = {}) {
  let price = product.price;
  const details = [];
  const removedIngredients = options.removedIngredients || [];
  const changedInternalDressing = options.changedInternalDressing || '';
  const recipeExtras = options.recipeExtras || [];

  if (removedIngredients.length > 0) details.push(`SIN ${removedIngredients.join(', ')}`);
  if (changedInternalDressing) details.push(`${t(lang, 'changeInternalDressing')}: ${changedInternalDressing}`);
  if (recipeExtras.length > 0) {
    const extrasPrice = selectedRecipeExtraPrice(product, normalizeCustomization(customization), recipeExtras);
    price += extrasPrice;
    details.push(`EXTRA ${recipeExtras.join(', ')}${extrasPrice ? ` (+$${extrasPrice})` : ''}`);
  }
  const familyPrice = selectedOptionGroupPrice(customization, options.optionGroups || {});
  if (familyPrice) price += familyPrice;
  details.push(...optionGroupDetails(customization, options.optionGroups || {}, lang));

  const familyKeys = new Set((normalizeCustomization(customization).optionGroups || []).map((group) => group.familyKey));

  if (product.type === 'panini' || product.type === 'wrap') {
    if (product.type === 'wrap') details.push(t(lang, 'temperatureDetail', options.temperature || 'Caliente'));
    if (!familyKeys.has('aderezos-acompanamiento')) details.push(t(lang, 'includedDressingDetail', options.sideDressing));
    if (!familyKeys.has('aderezos-acompanamiento') && options.extraDressing !== 'Ninguno') {
      price += 10;
      details.push(t(lang, 'extraDressingDetail', options.extraDressing));
    }
  }

  if (product.type === 'salad') {
    if (!familyKeys.has('aderezos-acompanamiento')) details.push(t(lang, 'dressingDetail', options.saladDressing));
    if (!familyKeys.has('aderezos-acompanamiento') && options.extraDressing !== 'Ninguno') {
      price += 10;
      details.push(t(lang, 'extraDressingDetail', options.extraDressing));
    }
    details.push(t(lang, 'cutleryDetail', options.cutlery));
  }

  if (product.type === 'crepe') {
    if (!familyKeys.has('toppings-dulces')) details.push(t(lang, 'flavorsDetail', options.flavors));
    if (!familyKeys.has('toppings-dulces') && options.extraToppings.length > 0) {
      price += options.extraToppings.length * 10;
      details.push(t(lang, 'extraToppingsDetail', options.extraToppings, options.extraToppings.length * 10));
    }
    details.push(t(lang, 'cutleryDetail', options.cutlery));
  }

  if (product.type === 'coffee') {
    details.push(t(lang, 'temperatureDetail', options.temperature));
    if ((product.id === 'latte' || product.id === 'frappe') && !familyKeys.has('leches')) details.push(t(lang, 'milkDetail', options.milk));
    if (!familyKeys.has('jarabes') && options.syrup !== 'Sin jarabe') {
      price += 10;
      details.push(t(lang, 'syrupDetail', options.syrup));
    } else if (!familyKeys.has('jarabes')) {
      details.push(t(lang, 'noSyrupDetail'));
    }
    if (product.id === 'frappe') {
      if (options.whippedCream) {
        price += 10;
        details.push(t(lang, 'whippedCreamDetail'));
      } else {
        details.push(t(lang, 'noWhippedCreamDetail'));
      }
    }
  }

  if (options.note?.trim()) details.push(t(lang, 'noteDetail', options.note.trim()));

  const normalizedCustomization = normalizeCustomization(customization);
  const removedForStock = [...removedIngredients];
  if (changedInternalDressing) {
    for (const item of normalizedCustomization.defaultInternalDressings) {
      if (!removedForStock.includes(item.name)) removedForStock.push(item.name);
    }
  }
  const finalOptions = {
    ...options,
    removedIngredients: removedForStock,
    changedInternalDressing,
    recipeExtras,
    optionGroups: options.optionGroups || {},
  };

  return {
    uid: `${product.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    productId: product.id,
    id: product.id,
    name: productText(product, lang).name,
    category: categoryLabel(product.category, lang),
    price,
    quantity: 1,
    details,
    options: finalOptions,
    notes: options.note || '',
  };
}

function ProductMedia({ product }) {
  const meta = categoryMeta(product.category);
  if (product.image) {
    return (
      <div className="product-media has-image">
        <img src={product.image} alt={productText(product, 'es').name} className="product-image" loading="lazy" decoding="async" />
      </div>
    );
  }
  return (
    <div className="product-media">
      <span>{meta.emoji}</span>
    </div>
  );
}

function ProductCard({ product, onAdd, lang = 'es', customization }) {
  const displayProduct = productText(product, lang);
  const [expanded, setExpanded] = useState(false);
  const [options, setOptions] = useState(() => initialOptions(product, customization));
  const customizationKey = useMemo(() => JSON.stringify(customization || {}), [customization]);

  useEffect(() => {
    setOptions((current) => ({ ...initialOptions(product, customization), note: current.note || '' }));
  }, [product.id, customizationKey]);

  const livePrice = useMemo(() => {
    let price = product.price;
    if ((product.type === 'panini' || product.type === 'wrap') && options.extraDressing !== 'Ninguno') price += 10;
    if (product.type === 'salad' && options.extraDressing !== 'Ninguno') price += 10;
    if (product.type === 'crepe') price += options.extraToppings.length * 10;
    if (product.type === 'coffee' && options.syrup !== 'Sin jarabe') price += 10;
    price += selectedOptionGroupPrice(customization, options.optionGroups || {});
    if (product.id === 'frappe' && options.whippedCream) price += 10;
    price += selectedRecipeExtraPrice(product, normalizeCustomization(customization), options.recipeExtras || []);
    return price;
  }, [product, options, customization]);

  const handleAdd = () => {
    const familyKeys = new Set((normalizeCustomization(customization).optionGroups || []).map((group) => group.familyKey));
    if ((product.type === 'panini' || product.type === 'wrap') && !familyKeys.has('aderezos-acompanamiento') && !options.sideDressing) {
      alert(t(lang, 'chooseSideDressingAlert'));
      setExpanded(true);
      return;
    }
    if (product.type === 'crepe' && !familyKeys.has('toppings-dulces') && options.flavors.length < 1) {
      alert(t(lang, 'chooseCrepeFlavorAlert'));
      setExpanded(true);
      return;
    }
    if ((product.id === 'latte' || product.id === 'frappe') && !familyKeys.has('leches') && !options.milk) {
      alert(t(lang, 'chooseMilkAlert'));
      setExpanded(true);
      return;
    }
    onAdd(buildCartItem(product, options, lang, customization));
    setOptions(initialOptions(product, customization));
    setExpanded(false);
  };

  return (
    <article className={`product-card ${product.soldOut ? 'sold-out' : ''}`}>
      <ProductMedia product={product} />
      <div className="product-content">
        <div className="product-top">
          <div>
            <h3>{displayProduct.name}</h3>
            {product.soldOut ? <span className="badge soldout-badge">{t(lang, 'soldOut')}</span> : (displayProduct.badge && <span className="badge">{displayProduct.badge}</span>)}
          </div>
          <strong>{currency(product.price)}</strong>
        </div>
        <p>{displayProduct.description}</p>
        {(product.type === 'panini' || product.type === 'wrap') && (normalizeCustomization(customization).optionGroups || []).some((group) => group.familyKey === 'aderezos-acompanamiento') && (
          <div className="product-always-options">
            <OptionFamilyControls state={options} update={(key, value) => setOptions((current) => ({ ...current, [key]: value }))} customization={customization} onlyKeys={['aderezos-acompanamiento']} />
          </div>
        )}
        {expanded && <ProductOptions product={product} state={options} setState={setOptions} lang={lang} customization={customization} />}
        <div className="product-actions">
          <button className="ghost" type="button" onClick={() => setExpanded(!expanded)}>
            {expanded ? t(lang, 'hideOptions') : t(lang, 'showOptions')}
          </button>
          <button className="primary small" type="button" onClick={handleAdd} disabled={product.unavailable || product.soldOut}>
            <Plus size={16} /> {product.soldOut ? t(lang, 'soldOut') : product.unavailable ? t(lang, 'unavailable') : `${t(lang, 'add')} ${livePrice !== product.price ? currency(livePrice) : ''}`}
          </button>
        </div>
      </div>
    </article>
  );
}


function PromoExtrasOptions({ product, state, setState, lang = 'es' }) {
  const update = (key, value) => setState((current) => ({ ...current, [key]: value }));
  if (!product) return null;

  if (product.type === 'crepe') {
    return (
      <div className="options-grid promo-options">
        <ExtraToppingsPicker selected={state.extraToppings || []} setSelected={(value) => update('extraToppings', value)} options={getCrepeOptions(product)} lang={lang} />
        <label className="check-row full">
          <input type="checkbox" checked={Boolean(state.cutlery)} onChange={(e) => update('cutlery', e.target.checked)} />
          <span>{t(lang, 'addCutlery')}</span>
        </label>
        <Notes value={state.note || ''} onChange={(value) => update('note', value)} lang={lang} />
      </div>
    );
  }

  if (product.type === 'panini' || product.type === 'wrap') {
    return (
      <div className="options-grid promo-options">
        <OptionSelect
          label={t(lang, 'extraDressing')}
          value={state.extraDressing || 'Ninguno'}
          onChange={(value) => update('extraDressing', value)}
          options={['Ninguno', ...dressingSides.filter((item) => item !== 'Sin aderezo')]}
          lang={lang}
        />
        <Notes value={state.note || ''} onChange={(value) => update('note', value)} lang={lang} />
      </div>
    );
  }

  if (product.type === 'salad') {
    return (
      <div className="options-grid promo-options">
        <OptionSelect
          label={t(lang, 'extraDressing')}
          value={state.extraDressing || 'Ninguno'}
          onChange={(value) => update('extraDressing', value)}
          options={['Ninguno', ...saladDressings]}
          lang={lang}
        />
        <label className="check-row full">
          <input type="checkbox" checked={Boolean(state.cutlery)} onChange={(e) => update('cutlery', e.target.checked)} />
          <span>{t(lang, 'addCutlery')}</span>
        </label>
        <Notes value={state.note || ''} onChange={(value) => update('note', value)} lang={lang} />
      </div>
    );
  }

  if (product.type === 'coffee') {
    return (
      <div className="options-grid promo-options">
        {!hasFamily('jarabes') && <OptionSelect
          label={t(lang, 'syrup')}
          value={state.syrup || 'Sin jarabe'}
          onChange={(value) => update('syrup', value)}
          options={['Sin jarabe', ...syrups]}
          lang={lang}
        />}
        {product.id === 'frappe' && (
          <label className="check-row full">
            <input type="checkbox" checked={Boolean(state.whippedCream)} onChange={(e) => update('whippedCream', e.target.checked)} />
            <span>{t(lang, 'whippedCream')}</span>
          </label>
        )}
        <Notes value={state.note || ''} onChange={(value) => update('note', value)} lang={lang} />
      </div>
    );
  }

  return (
    <div className="options-grid promo-options">
      <Notes value={state.note || ''} onChange={(value) => update('note', value)} lang={lang} />
    </div>
  );
}

function buildPromoCartItem(promotion, promoItems, extrasByProductId, lang = 'es') {
  let price = Number(promotion.price || 0);
  const includedLines = includedDetailsToLines(promotion.includedDetails);
  const details = [
    `${t(lang, 'promoFixed')}`,
    ...promoItems.map(({ product, quantity }) => `${quantity} x ${productText(product, lang).name}`),
    ...includedLines,
  ];

  for (const { product } of promoItems) {
    const extras = extrasByProductId[product.id] || getPromoExtrasInitial(product);
    const prefix = productText(product, lang).name;

    if (product?.type === 'crepe') {
      const extraToppings = extras.extraToppings || [];
      if (extraToppings.length > 0) {
        price += extraToppings.length * 10;
        details.push(`${prefix} · ${t(lang, 'extraToppingsDetail', extraToppings, extraToppings.length * 10)}`);
      }
      details.push(`${prefix} · ${t(lang, 'cutleryDetail', Boolean(extras.cutlery))}`);
    }

    if (product?.type === 'panini' || product?.type === 'wrap' || product?.type === 'salad') {
      if (extras.extraDressing && extras.extraDressing !== 'Ninguno') {
        price += 10;
        details.push(`${prefix} · ${t(lang, 'extraDressingDetail', extras.extraDressing)}`);
      }
      if (product?.type === 'salad') details.push(`${prefix} · ${t(lang, 'cutleryDetail', Boolean(extras.cutlery))}`);
    }

    if (product?.type === 'coffee') {
      if (extras.syrup && extras.syrup !== 'Sin jarabe') {
        price += 10;
        details.push(`${prefix} · ${t(lang, 'syrupDetail', extras.syrup)}`);
      }
      if (product.id === 'frappe') {
        if (extras.whippedCream) {
          price += 10;
          details.push(`${prefix} · ${t(lang, 'whippedCreamDetail')}`);
        } else {
          details.push(`${prefix} · ${t(lang, 'noWhippedCreamDetail')}`);
        }
      }
    }

    if (extras.note?.trim()) details.push(`${prefix} · ${t(lang, 'noteDetail', extras.note.trim())}`);
  }

  return {
    uid: `promo-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    productId: 'promo',
    id: 'promo',
    name: promotion.title || 'Promo especial',
    category: 'Promociones',
    price,
    quantity: 1,
    details,
    options: {
      promo: true,
      promoItems: promoItems.map(({ product, quantity }) => ({ productId: product.id, productName: product.name, quantity })),
      fixedDetails: includedLines,
      extrasByProductId,
    },
    notes: '',
  };
}

function PromoCard({ promotion, products, onAdd, lang = 'es', categoryHidden = {} }) {
  const promoItems = useMemo(() => promotionItems(promotion, products), [promotion, products]);
  const [expanded, setExpanded] = useState(false);
  const [extrasByProductId, setExtrasByProductId] = useState({});

  useEffect(() => {
    const next = {};
    for (const item of promoItems) {
      next[item.product.id] = getPromoExtrasInitial(item.product);
    }
    setExtrasByProductId(next);
  }, [promotion?.items?.map((item) => `${item.productId}:${item.quantity}`).join('|')]);

  const livePrice = useMemo(() => {
    let price = Number(promotion?.price || 0);
    for (const { product } of promoItems) {
      const extras = extrasByProductId[product.id] || {};
      if (product.type === 'crepe') price += (extras.extraToppings || []).length * 10;
      if ((product.type === 'panini' || product.type === 'wrap' || product.type === 'salad') && extras.extraDressing && extras.extraDressing !== 'Ninguno') price += 10;
      if (product.type === 'coffee' && extras.syrup && extras.syrup !== 'Sin jarabe') price += 10;
      if (product.id === 'frappe' && extras.whippedCream) price += 10;
    }
    return price;
  }, [promotion, promoItems, extrasByProductId]);

  if (!promotion?.active || promoItems.length === 0) return null;
  if (promoItems.some(({ product }) => product.unavailable || product.soldOut || categoryHidden[product.category])) return null;

  const handleAddPromo = () => {
    onAdd(buildPromoCartItem(promotion, promoItems, extrasByProductId, lang));
    const next = {};
    for (const item of promoItems) next[item.product.id] = getPromoExtrasInitial(item.product);
    setExtrasByProductId(next);
    setExpanded(false);
  };

  const image = promotion.image || promoItems.find(({ product }) => product.image)?.product.image;
  const includedLines = includedDetailsToLines(promotion.includedDetails);

  const updateExtrasForProduct = (productId, updater) => {
    setExtrasByProductId((current) => {
      const currentExtras = current[productId] || {};
      const nextExtras = typeof updater === 'function' ? updater(currentExtras) : updater;
      return { ...current, [productId]: nextExtras };
    });
  };

  return (
    <section className="promo-section" id="promo">
      <div className="promo-card">
        <div className={`promo-media ${image ? 'has-image' : ''}`}>
          {image ? <img src={image} alt={promotion.title} /> : <span>⭐</span>}
        </div>
        <div className="promo-content">
          <h2>{promotion.title}</h2>
          <p>{t(lang, 'promoFixed')}</p>
          <ul className="promo-included">
            {promoItems.map(({ product, quantity }) => (
              <li key={product.id}>{quantity} x {productText(product, lang).name}</li>
            ))}
            {includedLines.map((line) => <li key={line}>{line}</li>)}
          </ul>
          <strong className="promo-price">{currency(livePrice)}</strong>
          {expanded && (
            <div className="promo-combo-extras">
              {promoItems.map(({ product }) => (
                <div className="promo-item-extras" key={product.id}>
                  <h4>{productText(product, lang).name}</h4>
                  <PromoExtrasOptions
                    product={product}
                    state={extrasByProductId[product.id] || getPromoExtrasInitial(product)}
                    setState={(updater) => updateExtrasForProduct(product.id, updater)}
                    lang={lang}
                  />
                </div>
              ))}
            </div>
          )}
          <div className="promo-actions">
            <button type="button" className="ghost" onClick={() => setExpanded(!expanded)}>
              {expanded ? t(lang, 'hideOptions') : t(lang, 'promoExtras')}
            </button>
            <button type="button" className="primary" onClick={handleAddPromo}>
              <Plus size={16} /> {t(lang, 'addPromo')}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Cart({ cart, updateQty, removeItem, customer, setCustomer, lang = 'es', businessHours = DEFAULT_BUSINESS_HOURS, branch = DEFAULT_BRANCH_SETTINGS.branches[0] }) {
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const hasSavedProfile = Boolean(customer.profileLoaded && customer.name);
  const openState = businessStatus(businessHours);

  const updateCustomer = (key, value) => setCustomer((current) => ({ ...current, [key]: value }));

  const saveCustomerProfile = () => {
    const profile = {
      name: customer.name,
      address: customer.address,
      neighborhood: customer.neighborhood,
      sector: customer.sector,
      payment: customer.payment,
      profileLoaded: true,
    };
    window.localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(profile));
    setCustomer((current) => ({ ...current, profileLoaded: true }));
    alert(t(lang, 'savedDataAlert'));
  };

  const clearCustomerProfile = () => {
    window.localStorage.removeItem(CUSTOMER_STORAGE_KEY);
    setCustomer((current) => ({ ...current, name: '', address: '', neighborhood: '', sector: '', payment: '', profileLoaded: false }));
  };

  const buildMessage = () => {
    const lines = [
      t(lang, 'orderMessageIntro'),
      branch?.name ? `Sucursal: ${branch.name}` : '',
      !openState.open ? `Aviso: ${openState.messageWhenClosed || 'Estamos cerrados.'}` : '',
      '',
      ...cart.map((item, index) => {
        const details = item.details.map((detail) => `   - ${detail}`).join('\n');
        return `${index + 1}. ${item.quantity} x ${item.name} — ${currency(item.price * item.quantity)}\n${details}`;
      }),
      '',
      `Total: ${currency(subtotal)}`,
      '',
      t(lang, 'orderData'),
      `${t(lang, 'nameLabel')}: ${customer.name || ''}`,
      `${t(lang, 'addressLabel')}: ${customer.address || ''}`,
      `${t(lang, 'neighborhoodLabel')}: ${customer.neighborhood || ''}`,
      `${t(lang, 'sectorLabel')}: ${customer.sector || ''}`,
      `${t(lang, 'paymentLabel')}: ${optionLabel(lang, customer.payment) || ''}`,
      customer.orderNote ? `${t(lang, 'generalNoteLabel')}: ${customer.orderNote}` : '',
    ];
    return lines.filter(Boolean).join('\n');
  };

  const canSend = cart.length > 0;

  const sendOrder = async () => {
    if (!canSend) return;

    if (!customer.name || !customer.address) {
      alert(t(lang, 'completeDataAlert'));
      return;
    }

    const message = buildMessage();
    const total = subtotal;
    const whatsappWindow = window.open('', '_blank');

    const payload = {
      customer: {
        name: customer.name,
        phone: '',
        address: customer.address,
        notes: customer.orderNote || '',
      },
      items: cart.map((item) => ({
        id: item.productId || item.id,
        name: item.name,
        category: item.category || 'Sin categoría',
        quantity: item.quantity || 1,
        price: item.price,
        lineTotal: (item.price || 0) * (item.quantity || 1),
        options: item.options || { details: item.details || [] },
        notes: item.notes || '',
      })),
      subtotal,
      deliveryFee: 0,
      total,
      whatsappMessage: message,
      branch: branch ? { id: branch.id, name: branch.name } : null,
      branchId: branch?.id || 'dominio',
      branchName: branch?.name || 'Dominio',
    };

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        if (whatsappWindow) whatsappWindow.close();
        alert(result.error || result.detail || t(lang, 'saveOrderError'));
        return;
      }

      const finalMessage = `${message}\n\n${t(lang, 'orderNumber')}: ${result.orderNumber}`;
      const whatsappNumber = normalizeWhatsAppNumber(branch?.whatsappNumber || branch?.whatsapp);
      const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(finalMessage)}`;

      if (whatsappWindow) {
        whatsappWindow.location.href = whatsappUrl;
      } else {
        window.location.href = whatsappUrl;
      }
    } catch (error) {
      if (whatsappWindow) whatsappWindow.close();
      alert(t(lang, 'connectionOrderError', error.message));
    }
  };

  return (
    <aside className="cart-panel" id="cart">
      <div className="cart-header">
        <div>
          <span className="eyebrow">{t(lang, 'yourOrder')}</span>
          <h2>{t(lang, 'cart')}</h2>
        </div>
        <div className="cart-count"><ShoppingBag size={18} /> {itemCount}</div>
      </div>

      {cart.length === 0 ? (
        <div className="empty-cart">
          <ShoppingBag size={32} />
          <p>{t(lang, 'emptyCart')}</p>
        </div>
      ) : (
        <div className="cart-items">
          {cart.map((item) => (
            <div className="cart-item" key={item.uid}>
              <div>
                <strong>{item.name}</strong>
                <span>{currency(item.price)} {t(lang, 'each')}</span>
                <ul>{item.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
              </div>
              <div className="cart-controls">
                <button type="button" onClick={() => updateQty(item.uid, item.quantity - 1)}><Minus size={14} /></button>
                <b>{item.quantity}</b>
                <button type="button" onClick={() => updateQty(item.uid, item.quantity + 1)}><Plus size={14} /></button>
                <button type="button" className="danger" onClick={() => removeItem(item.uid)}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="customer-card">
        <h3>{t(lang, 'customerDataTitle')}</h3>
        {hasSavedProfile && <p className="welcome-back">{t(lang, 'welcomeBack', customer.name)}</p>}
        <p className="privacy-note">{t(lang, 'privacyNote')}</p>
        <input value={customer.name} onChange={(e) => updateCustomer('name', e.target.value)} placeholder={t(lang, 'namePlaceholder')} />
        <input value={customer.address} onChange={(e) => updateCustomer('address', e.target.value)} placeholder={t(lang, 'addressPlaceholder')} />
        <input value={customer.neighborhood} onChange={(e) => updateCustomer('neighborhood', e.target.value)} placeholder={t(lang, 'neighborhoodPlaceholder')} />
        <input value={customer.sector} onChange={(e) => updateCustomer('sector', e.target.value)} placeholder={t(lang, 'sectorPlaceholder')} />
        <select value={customer.payment} onChange={(e) => updateCustomer('payment', e.target.value)}>
          <option value="">{t(lang, 'paymentPlaceholder')}</option>
          <option value="Transferencia">{t(lang, 'paymentTransfer')}</option>
          <option value="Efectivo">{t(lang, 'paymentCash')}</option>
          <option value="Tarjeta">{t(lang, 'paymentCard')}</option>
        </select>
        <textarea value={customer.orderNote} onChange={(e) => updateCustomer('orderNote', e.target.value)} placeholder={t(lang, 'orderNotePlaceholder')} rows="2" />
        <div className="profile-actions">
          <button type="button" className="ghost" onClick={saveCustomerProfile}>{t(lang, 'saveMyData')}</button>
          <button type="button" className="ghost danger-text" onClick={clearCustomerProfile}>{t(lang, 'clearData')}</button>
        </div>
      </div>

      {!openState.open && (<div className="closed-order-note"><b>Cerrado ahora</b><span>{openState.messageWhenClosed}</span></div>)}
      <div className="checkout-bar">
        <div>
          <span>{t(lang, 'total')}</span>
          <strong>{currency(subtotal)}</strong>
        </div>
        <button type="button" className={`primary checkout ${canSend ? '' : 'disabled'}`} onClick={sendOrder} disabled={!canSend}>
          {t(lang, 'sendWhatsApp')}
        </button>
      </div>
    </aside>
  );
}


function CashierPanel({ products, categoriesList, categoryOrder, productOrder, categoryHidden, branchSettings, productCustomizations, reloadMenu }) {
  const savedSession = (() => {
    try { return JSON.parse(window.sessionStorage.getItem(CASHIER_SESSION_STORAGE_KEY) || '{}'); } catch { return {}; }
  })();
  const [password, setPassword] = useState(savedSession.password || '');
  const [cashierName, setCashierName] = useState(savedSession.cashierName || '');
  const [shift, setShift] = useState(savedSession.shift || 'Turno');
  const [unlocked, setUnlocked] = useState(Boolean(savedSession.password && savedSession.cashierName));
  const [activeCategory, setActiveCategory] = useState(categoriesList[0]?.id || '');
  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState({ name: '', phone: '', notes: '' });
  const [paymentMethod, setPaymentMethod] = useState('efectivo');
  const [paymentStatus, setPaymentStatus] = useState('paid');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  const currentCategories = useMemo(() => sortByOrder(categoriesList, categoryOrder).filter((category) => !categoryHidden[category.id]), [categoriesList, categoryOrder, categoryHidden]);
  const currentProducts = useMemo(() => sortByOrder(products, productOrder), [products, productOrder]);
  const visibleProducts = currentProducts.filter((product) => product.category === activeCategory && !product.unavailable);
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    if (currentCategories.length > 0 && !currentCategories.some((category) => category.id === activeCategory)) setActiveCategory(currentCategories[0].id);
  }, [currentCategories, activeCategory]);

  const login = () => {
    if (!password.trim() || !cashierName.trim()) {
      setStatus('Ingresa nombre de cajero y contraseña de caja.');
      return;
    }
    try { window.sessionStorage.setItem(CASHIER_SESSION_STORAGE_KEY, JSON.stringify({ password, cashierName, shift })); } catch { /* ignore */ }
    setUnlocked(true);
    setStatus('');
    if (reloadMenu) reloadMenu();
  };

  const logout = () => {
    try { window.sessionStorage.removeItem(CASHIER_SESSION_STORAGE_KEY); } catch { /* ignore */ }
    setUnlocked(false);
    setPassword('');
    setCart([]);
    setStatus('');
  };

  const addItem = (item) => setCart((current) => [item, ...current]);
  const updateQty = (uid, quantity) => {
    if (quantity <= 0) return setCart((current) => current.filter((item) => item.uid !== uid));
    setCart((current) => current.map((item) => item.uid === uid ? { ...item, quantity } : item));
  };
  const removeItem = (uid) => setCart((current) => current.filter((item) => item.uid !== uid));

  const createCashierOrder = async () => {
    if (!cart.length) {
      setStatus('Agrega productos al pedido.');
      return;
    }
    setSaving(true);
    setStatus('Creando pedido de caja...');
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'cashier',
          cashierAuth: { password, name: cashierName, shift },
          customer: {
            name: customer.name || 'Cliente caja',
            phone: customer.phone || '',
            address: 'Caja',
            notes: customer.notes || '',
          },
          items: cart.map((item) => ({
            id: item.productId || item.id,
            name: item.name,
            category: item.category,
            quantity: item.quantity,
            price: item.price,
            lineTotal: item.price * item.quantity,
            options: { ...(item.options || {}), details: item.details || [] },
            notes: item.notes || '',
          })),
          subtotal,
          deliveryFee: 0,
          total: subtotal,
          paymentMethod,
          paymentStatus,
          whatsappMessage: '',
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        setStatus(result.error || result.detail || 'No se pudo crear el pedido.');
        return;
      }
      setCart([]);
      setCustomer({ name: '', phone: '', notes: '' });
      setPaymentMethod('efectivo');
      setPaymentStatus('paid');
      setStatus(`Pedido de caja creado: ${result.orderNumber}. Ya aparece en Orders.`);
    } catch (error) {
      setStatus(`No se pudo crear el pedido: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (!unlocked) {
    return (
      <main className="orders-page cashier-page">
        <section className="orders-shell">
          <Logo />
          <h1>Caja</h1>
          <p>Captura pedidos internos de sucursal sin enviarlos a WhatsApp.</p>
          <div className="orders-login">
            <label className="field full"><span>Nombre del cajero</span><input value={cashierName} onChange={(e) => setCashierName(e.target.value)} placeholder="Ej. César" /></label>
            <label className="field full"><span>Turno</span><input value={shift} onChange={(e) => setShift(e.target.value)} placeholder="Ej. Noche" /></label>
            <label className="field full"><span>Contraseña de caja</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña de caja de la sucursal" /></label>
            <button type="button" className="primary" onClick={login}>Entrar a caja</button>
            {status && <p className="admin-status">{status}</p>}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="cashier-page">
      <section className="cashier-shell">
        <div className="orders-header">
          <div><Logo /><h1>Caja</h1><p>Pedido capturado por {cashierName}. Se guarda directo en la cola.</p></div>
          <div className="orders-header-actions"><a className="ghost" href="#orders">Ver Orders</a><button type="button" className="ghost danger-text" onClick={logout}>Salir</button></div>
        </div>
        {status && <p className="admin-status">{status}</p>}
        <div className="cashier-layout">
          <div className="cashier-menu">
            <div className="tabs cashier-tabs">
              {currentCategories.map((category) => (
                <button type="button" key={category.id} className={activeCategory === category.id ? 'active' : ''} onClick={() => setActiveCategory(category.id)}>
                  <span>{category.emoji}</span> {categoryLabel(category.id, 'es')}
                </button>
              ))}
            </div>
            <div className="product-grid">
              {visibleProducts.map((product) => <ProductCard key={product.id} product={product} onAdd={addItem} lang="es" customization={productCustomizations[product.id]} />)}
            </div>
          </div>
          <aside className="cart-panel cashier-cart">
            <div className="cart-header"><div><span className="eyebrow">Caja</span><h2>Pedido</h2></div><span className="cart-count"><ShoppingBag size={18} /> {itemCount}</span></div>
            <div className="customer-card">
              <label className="field full"><span>Cliente opcional</span><input value={customer.name} onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))} placeholder="Cliente caja" /></label>
              <label className="field full"><span>Teléfono opcional</span><input value={customer.phone} onChange={(e) => setCustomer((c) => ({ ...c, phone: e.target.value }))} placeholder="Opcional" /></label>
              <label className="field"><span>Método de pago</span><select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="tarjeta">Tarjeta</option><option value="otro">Otro</option></select></label>
              <label className="field"><span>Estado de pago</span><select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}><option value="paid">Pagado</option><option value="pending">Pendiente</option></select></label>
              <label className="field full"><span>Notas</span><textarea value={customer.notes} onChange={(e) => setCustomer((c) => ({ ...c, notes: e.target.value }))} placeholder="Notas para cocina" /></label>
            </div>
            <div className="cart-items">
              {cart.length === 0 ? <div className="empty-cart"><ShoppingBag size={28} /><p>Agrega productos.</p></div> : cart.map((item) => (
                <div className="cart-item" key={item.uid}>
                  <div><strong>{item.name}</strong><span>{currency(item.price)} · {item.details?.join(' · ')}</span></div>
                  <div className="cart-controls"><button type="button" onClick={() => updateQty(item.uid, item.quantity - 1)}><Minus size={14} /></button><b>{item.quantity}</b><button type="button" onClick={() => updateQty(item.uid, item.quantity + 1)}><Plus size={14} /></button><button type="button" className="danger" onClick={() => removeItem(item.uid)}><Trash2 size={14} /></button></div>
                </div>
              ))}
            </div>
            <div className="checkout-bar"><div><span>Total</span><strong>{currency(subtotal)}</strong></div><button type="button" className="primary checkout" onClick={createCashierOrder} disabled={saving || !cart.length}>{saving ? 'Guardando...' : 'Crear pedido en cola'}</button></div>
          </aside>
        </div>
      </section>
    </main>
  );
}


function SuperPanel({ products, promotion, branchPromotions, businessHours, branchSettings, reloadMenu }) {
  const [password, setPassword] = useState(() => { try { return window.sessionStorage.getItem(SUPER_PASSWORD_STORAGE_KEY) || ''; } catch { return ''; } });
  const [authed, setAuthed] = useState(false);
  const [status, setStatus] = useState('');
  const [branchSettingsDraft, setBranchSettingsDraft] = useState(() => normalizeBranchSettings(branchSettings));
  const [branchPromotionsDraft, setBranchPromotionsDraft] = useState(() => branchPromotions || {});
  const [selectedBranchId, setSelectedBranchId] = useState(() => normalizeBranchSettings(branchSettings).defaultBranchId);
  const activeBranches = useMemo(() => normalizeBranchSettings(branchSettingsDraft).branches.filter((branch) => branch.active !== false), [branchSettingsDraft]);
  const selectedBranch = activeBranches.find((branch) => branch.id === selectedBranchId) || activeBranches[0];
  const selectedPromotion = normalizePromotion((selectedBranch && branchPromotionsDraft[selectedBranch.id]) || promotion, products);
  const [reportType, setReportType] = useState('sales_orders');
  const [reportStart, setReportStart] = useState(() => new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10));
  const [reportEnd, setReportEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [reportBranchId, setReportBranchId] = useState('all');
  const [reportStatus, setReportStatus] = useState('');

  useEffect(() => setBranchSettingsDraft(normalizeBranchSettings(branchSettings)), [branchSettings]);
  useEffect(() => setBranchPromotionsDraft(branchPromotions || {}), [branchPromotions]);
  useEffect(() => {
    if (activeBranches.length && !activeBranches.some((branch) => branch.id === selectedBranchId)) setSelectedBranchId(activeBranches[0].id);
  }, [activeBranches, selectedBranchId]);

  const login = async () => {
    setStatus('Validando...');
    try {
      const response = await fetch('/api/super/menu', { headers: { 'x-super-password': password } });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        setStatus(result.error || 'No autorizado.');
        return;
      }
      try { window.sessionStorage.setItem(SUPER_PASSWORD_STORAGE_KEY, password); } catch { /* ignore */ }
      setAuthed(true);
      setStatus('');
      setBranchSettingsDraft(normalizeBranchSettings(result.branchSettings));
      setBranchPromotionsDraft(result.branchPromotions || {});
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    }
  };

  useEffect(() => {
    if (password && !authed) login();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateBranchHours = (branchId, updater) => {
    setBranchSettingsDraft((current) => {
      const normalized = normalizeBranchSettings(current);
      return {
        ...normalized,
        branches: normalized.branches.map((branch) => {
          if (branch.id !== branchId) return branch;
          const currentHours = normalizeBusinessHours(branch.businessHours || businessHours || DEFAULT_BUSINESS_HOURS);
          return { ...branch, businessHours: updater(currentHours) };
        }),
      };
    });
  };

  const updatePromotionForBranch = (branchId, key, value) => {
    setBranchPromotionsDraft((current) => ({
      ...current,
      [branchId]: { ...normalizePromotion(current[branchId] || promotion, products), [key]: value },
    }));
  };
  const updatePromotionItemForBranch = (branchId, index, key, value) => {
    setBranchPromotionsDraft((current) => {
      const promo = normalizePromotion(current[branchId] || promotion, products);
      const items = [...(promo.items || [])];
      items[index] = { ...items[index], [key]: key === 'quantity' ? Number(value || 1) : value };
      return { ...current, [branchId]: { ...promo, items } };
    });
  };
  const addPromotionItemForBranch = (branchId) => {
    setBranchPromotionsDraft((current) => {
      const promo = normalizePromotion(current[branchId] || promotion, products);
      return { ...current, [branchId]: { ...promo, items: [...(promo.items || []), { productId: products[0]?.id || '', quantity: 1 }] } };
    });
  };
  const removePromotionItemForBranch = (branchId, index) => {
    setBranchPromotionsDraft((current) => {
      const promo = normalizePromotion(current[branchId] || promotion, products);
      const items = (promo.items || []).filter((_, i) => i !== index);
      return { ...current, [branchId]: { ...promo, items: items.length ? items : [{ productId: products[0]?.id || '', quantity: 1 }] } };
    });
  };

  const downloadReport = async () => {
    setReportStatus('Generando reporte...');
    try {
      const params = new URLSearchParams({ type: reportType, start: reportStart || '', end: reportEnd || '', branchId: reportBranchId || 'all' });
      const response = await fetch(`/api/reports?${params.toString()}`, { headers: { 'x-super-password': password } });
      const text = await response.text();
      if (!response.ok) {
        try { setReportStatus(JSON.parse(text).error || 'No se pudo generar reporte.'); }
        catch { setReportStatus('No se pudo generar reporte.'); }
        return;
      }
      const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pecas-${reportType}-${reportStart || 'inicio'}-${reportEnd || 'hoy'}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setReportStatus('Reporte descargado.');
    } catch (error) {
      setReportStatus(`No se pudo descargar: ${error.message}`);
    }
  };

  const saveSuper = async () => {
    setStatus('Guardando...');
    try {
      const response = await fetch('/api/super/menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-super-password': password },
        body: JSON.stringify({ branchSettings: branchSettingsDraft, branchPromotions: branchPromotionsDraft }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        setStatus(result.error || result.detail || 'No se pudo guardar.');
        return;
      }
      setStatus('Guardado.');
      await reloadMenu();
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    }
  };

  if (!authed) {
    return (
      <main className="admin-page">
        <section className="admin-card">
          <Logo />
          <h1>Super usuario</h1>
          <p>Controla horarios y promociones por sucursal activa.</p>
          <div className="admin-login">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña super usuario / admin" />
            <button type="button" className="primary" onClick={login}>Entrar</button>
            {status && <p className="admin-status">{status}</p>}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <section className="admin-card">
        <Logo />
        <div className="admin-hero">
          <div>
            <h1>Super usuario</h1>
            <p>Solo se muestran sucursales activas. Aquí se administran horarios y promociones por sucursal.</p>
          </div>
          <a className="ghost admin-home-link" href="#">Ver página cliente</a>
        </div>
        <BackofficeNav current="super" showAdmin={false} />
        <div className="admin-toolbar sticky-actions">
          <label className="field">
            <span>Sucursal activa</span>
            <select value={selectedBranch?.id || ''} onChange={(e) => setSelectedBranchId(e.target.value)}>
              {activeBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
          <button type="button" className="primary" onClick={saveSuper}>Guardar cambios</button>
          {status && <p className="admin-status">{status}</p>}
        </div>

        {selectedBranch && (
          <>
            <section className="admin-order-box">
              <h2>Horario de {selectedBranch.name}</h2>
              <p>Este horario controla el estado abierto/cerrado de esta sucursal.</p>
              <label className="check-row full">
                <input type="checkbox" checked={Boolean(normalizeBusinessHours(selectedBranch.businessHours || businessHours).allowClosedOrders)} onChange={(e) => updateBranchHours(selectedBranch.id, (hours) => ({ ...hours, allowClosedOrders: e.target.checked }))} />
                <span>Permitir pedidos aunque esté cerrado</span>
              </label>
              <label className="field full">
                <span>Mensaje cuando está cerrado</span>
                <input value={normalizeBusinessHours(selectedBranch.businessHours || businessHours).messageWhenClosed || ''} onChange={(e) => updateBranchHours(selectedBranch.id, (hours) => ({ ...hours, messageWhenClosed: e.target.value }))} />
              </label>
              <div className="admin-hours-grid">
                {normalizeBusinessHours(selectedBranch.businessHours || businessHours).days.map((day) => (
                  <div className="admin-hour-row" key={day.day}>
                    <label className="admin-inline-check">
                      <input type="checkbox" checked={Boolean(day.active)} onChange={(e) => updateBranchHours(selectedBranch.id, (hours) => ({ ...hours, days: hours.days.map((d) => d.day === day.day ? { ...d, active: e.target.checked } : d) }))} />
                      <span>{WEEKDAY_LABELS[day.day]}</span>
                    </label>
                    <input type="time" value={day.open || ''} onChange={(e) => updateBranchHours(selectedBranch.id, (hours) => ({ ...hours, days: hours.days.map((d) => d.day === day.day ? { ...d, open: e.target.value } : d) }))} />
                    <input type="time" value={day.close || ''} onChange={(e) => updateBranchHours(selectedBranch.id, (hours) => ({ ...hours, days: hours.days.map((d) => d.day === day.day ? { ...d, close: e.target.value } : d) }))} />
                  </div>
                ))}
              </div>
            </section>

            <section className="admin-order-box">
              <h2>Promoción de {selectedBranch.name}</h2>
              <p>La promoción ahora depende de la sucursal seleccionada por el cliente.</p>
              <label className="check-row full">
                <input type="checkbox" checked={Boolean(selectedPromotion.active)} onChange={(e) => updatePromotionForBranch(selectedBranch.id, 'active', e.target.checked)} />
                <span>Mostrar promoción en esta sucursal</span>
              </label>
              <div className="admin-promo-grid">
                <label className="field"><span>Título</span><input value={selectedPromotion.title || ''} onChange={(e) => updatePromotionForBranch(selectedBranch.id, 'title', e.target.value)} /></label>
                <label className="field"><span>Precio promo</span><input type="number" value={selectedPromotion.price || 0} onChange={(e) => updatePromotionForBranch(selectedBranch.id, 'price', Number(e.target.value || 0))} /></label>
                <div className="field full">
                  <span>Productos incluidos</span>
                  <div className="admin-promo-items">
                    {(selectedPromotion.items || []).map((item, index) => (
                      <div className="admin-promo-item-row" key={`${item.productId}-${index}`}>
                        <select value={item.productId || ''} onChange={(e) => updatePromotionItemForBranch(selectedBranch.id, index, 'productId', e.target.value)}>
                          {products.map((product) => <option key={product.id} value={product.id}>{categoryMeta(product.category).label} · {product.name}</option>)}
                        </select>
                        <input type="number" min="1" value={item.quantity || 1} onChange={(e) => updatePromotionItemForBranch(selectedBranch.id, index, 'quantity', e.target.value)} />
                        <button type="button" className="ghost mini danger-text" onClick={() => removePromotionItemForBranch(selectedBranch.id, index)}>Quitar</button>
                      </div>
                    ))}
                    <button type="button" className="ghost mini" onClick={() => addPromotionItemForBranch(selectedBranch.id)}>+ Agregar producto</button>
                  </div>
                </div>
                <label className="field full"><span>Lo que incluye / opciones fijas</span><textarea rows="3" value={selectedPromotion.includedDetails || ''} onChange={(e) => updatePromotionForBranch(selectedBranch.id, 'includedDetails', e.target.value)} /></label>
                <label className="field full"><span>Imagen de promo</span><input value={selectedPromotion.image || ''} onChange={(e) => updatePromotionForBranch(selectedBranch.id, 'image', e.target.value)} /></label>
              </div>
            </section>
          </>
        )}

        <section className="admin-order-box report-panel">
          <h2>Reportes CSV</h2>
          <p>Descarga reportes simples por sucursal y rango de fechas.</p>
          <div className="admin-promo-grid report-grid">
            <label className="field"><span>Tipo de reporte</span><select value={reportType} onChange={(e) => setReportType(e.target.value)}>
              <option value="sales_orders">Ventas por pedido</option>
              <option value="sales_products">Ventas por producto</option>
              <option value="source_summary">Online vs Caja</option>
              <option value="stock_movements">Movimientos de inventario</option>
              <option value="waste">Mermas</option>
              <option value="sold_out">Agotados</option>
              <option value="purchase_suggestions">Compra sugerida</option>
              <option value="payment_summary">Resumen de pagos</option>
              <option value="category_sales">Ventas por categoría</option>
              <option value="branch_summary">Resumen por sucursal</option>
              <option value="inventory_value">Inventario valorizado</option>
            </select></label>
            <label className="field"><span>Sucursal</span><select value={reportBranchId} onChange={(e) => setReportBranchId(e.target.value)}><option value="all">Todas</option>{activeBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
            <label className="field"><span>Inicio</span><input type="date" value={reportStart} onChange={(e) => setReportStart(e.target.value)} /></label>
            <label className="field"><span>Fin</span><input type="date" value={reportEnd} onChange={(e) => setReportEnd(e.target.value)} /></label>
          </div>
          <div className="inline-actions"><button type="button" className="primary" onClick={downloadReport}>Descargar CSV</button>{reportStatus && <p className="admin-status">{reportStatus}</p>}</div>
        </section>
      </section>
    </main>
  );
}

export default function App() {
  const [activeCategory, setActiveCategory] = useState(categories[0].id);
  const [cart, setCart] = useState([]);
  const [menuOverrides, setMenuOverrides] = useState({});
  const [extraCategories, setExtraCategories] = useState([]);
  const [extraProducts, setExtraProducts] = useState([]);
  const [categoryOrder, setCategoryOrder] = useState(() => categories.map((category) => category.id));
  const [productOrder, setProductOrder] = useState(() => CATALOG_PRODUCTS.map((product) => product.id));
  const [categoryHidden, setCategoryHidden] = useState({});
  const [promotion, setPromotion] = useState(() => makeDefaultPromotion(CATALOG_PRODUCTS));
  const [branchPromotions, setBranchPromotions] = useState({});
  const [businessHours, setBusinessHours] = useState(() => normalizeBusinessHours(DEFAULT_BUSINESS_HOURS));
  const [branchSettings, setBranchSettings] = useState(() => normalizeBranchSettings(DEFAULT_BRANCH_SETTINGS));
  const [selectedBranchId, setSelectedBranchId] = useState(() => {
    try { return window.localStorage.getItem(BRANCH_STORAGE_KEY) || DEFAULT_BRANCH_SETTINGS.defaultBranchId; } catch { return DEFAULT_BRANCH_SETTINGS.defaultBranchId; }
  });
  const [productCustomizations, setProductCustomizations] = useState({});
  const [lang, setLangState] = useState(() => {
    try {
      return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) || 'es';
    } catch {
      return 'es';
    }
  });
  const [employeeLoginOpen, setEmployeeLoginOpen] = useState(false);
  const [route, setRoute] = useState(() => {
    return legacyRoute();
  });
  const isAdmin = route === '#admin';
  const isSuper = route === '#super';
  const isOrders = route === '#orders';
  const isStock = route === '#stock';
  const isCashier = route === '#cashier';
  const isStorefront = !isAdmin && !isSuper && !isOrders && !isStock && !isCashier;

  useEffect(() => {
    const syncRoute = () => setRoute(legacyRoute());
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('hashchange', syncRoute);
    };
  }, []);

  const setLang = (nextLang) => {
    setLangState(nextLang);
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLang);
    } catch {
      // ignore storage errors
    }
  };

  const [customer, setCustomer] = useState(() => {
    const fallback = { name: '', address: '', neighborhood: '', sector: '', payment: '', orderNote: '', profileLoaded: false };
    try {
      const saved = window.localStorage.getItem(CUSTOMER_STORAGE_KEY);
      return saved ? { ...fallback, ...JSON.parse(saved), profileLoaded: true } : fallback;
    } catch {
      return fallback;
    }
  });

  const loadProductCustomizations = async () => {
    try {
      const response = await fetch(`/api/product-customizations?t=${Date.now()}`, { cache: 'no-store' });
      const result = await response.json();
      if (response.ok && result.ok) setProductCustomizations(result.products || {});
    } catch {
      setProductCustomizations({});
    }
  };

  const loadMenuOverrides = async () => {
    try {
      const response = await fetch('/api/menu');
      const result = await response.json();
      if (response.ok && result.ok) {
        setMenuOverrides(result.overrides || {});
        const nextCategories = mergeCategoriesWithExtras(categories, result.extraCategories || []);
        const nextProducts = mergeProductsWithExtras(CATALOG_PRODUCTS, result.extraProducts || []);
        setExtraCategories(result.extraCategories || []);
        setExtraProducts(result.extraProducts || []);
        setCategoryOrder(result.categoryOrder || nextCategories.map((category) => category.id));
        setProductOrder(result.productOrder || nextProducts.map((product) => product.id));
        setCategoryHidden(result.categoryHidden || {});
        setPromotion(normalizePromotion(result.promotion, nextProducts));
        setBranchPromotions(result.branchPromotions || {});
        setBusinessHours(normalizeBusinessHours(result.businessHours));
        setBranchSettings(normalizeBranchSettings(result.branchSettings));
      }
    } catch {
      setMenuOverrides({});
      setExtraCategories([]);
      setExtraProducts([]);
      setCategoryHidden({});
      setPromotion(makeDefaultPromotion(CATALOG_PRODUCTS));
      setBranchPromotions({});
      setBusinessHours(normalizeBusinessHours(DEFAULT_BUSINESS_HOURS));
      setBranchSettings(normalizeBranchSettings(DEFAULT_BRANCH_SETTINGS));
    }
  };

  useEffect(() => {
    loadMenuOverrides();
  }, []);

  useEffect(() => {
    if (!isStorefront && !isCashier) return;
    loadProductCustomizations();
  }, [isStorefront, isCashier]);

  const catalogCategories = useMemo(() => mergeCategoriesWithExtras(categories, extraCategories), [extraCategories]);
  const catalogProducts = useMemo(() => mergeProductsWithExtras(CATALOG_PRODUCTS, extraProducts), [extraProducts]);
  const currentCategories = useMemo(() => sortByOrder(catalogCategories, categoryOrder).filter((category) => !categoryHidden[category.id]), [catalogCategories, categoryOrder, categoryHidden]);
  const currentProducts = useMemo(() => sortByOrder(mergeProductsWithOverrides(catalogProducts, menuOverrides), productOrder), [catalogProducts, menuOverrides, productOrder]);
  const selectedBranch = useMemo(() => selectedBranchFrom(branchSettings, selectedBranchId), [branchSettings, selectedBranchId]);
  const effectiveBusinessHours = useMemo(() => normalizeBusinessHours((branchSettings.multiBranchEnabled && selectedBranch?.businessHours) ? selectedBranch.businessHours : businessHours), [branchSettings.multiBranchEnabled, selectedBranch, businessHours]);
  const branchSoldOutOverrides = branchSettings.multiBranchEnabled ? (selectedBranch?.soldOut || {}) : {};
  const currentProductsForBranch = useMemo(() => currentProducts.map((product) => ({
    ...product,
    soldOut: branchSettings.multiBranchEnabled ? Boolean(branchSoldOutOverrides[product.id]) : Boolean(product.soldOut),
  })), [currentProducts, branchSoldOutOverrides, branchSettings.multiBranchEnabled]);
  const availableBranches = useMemo(() => activeBranches(branchSettings), [branchSettings]);
  const currentBusinessStatus = useMemo(() => businessStatus(effectiveBusinessHours), [effectiveBusinessHours]);

  useEffect(() => {
    if (!selectedBranch?.id) return;
    if (selectedBranch.id !== selectedBranchId) setSelectedBranchId(selectedBranch.id);
    try { window.localStorage.setItem(BRANCH_STORAGE_KEY, selectedBranch.id); } catch { /* ignore */ }
  }, [selectedBranch, selectedBranchId]);
  useEffect(() => {
    if (currentCategories.length > 0 && !currentCategories.some((category) => category.id === activeCategory)) {
      setActiveCategory(currentCategories[0].id);
    }
  }, [currentCategories, activeCategory]);

  const visibleProducts = useMemo(() => currentProductsForBranch.filter((product) => product.category === activeCategory && !product.unavailable), [currentProductsForBranch, activeCategory]);
  const selectedBranchPromotion = branchSettings.multiBranchEnabled && selectedBranch?.id ? branchPromotions[selectedBranch.id] : null;
  const activePromotion = useMemo(() => normalizePromotion(selectedBranchPromotion || promotion, currentProductsForBranch), [selectedBranchPromotion, promotion, currentProductsForBranch]);
  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);
  const itemCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);

  const addItem = (item) => setCart((current) => [item, ...current]);
  const updateQty = (uid, quantity) => {
    if (quantity <= 0) {
      setCart((current) => current.filter((item) => item.uid !== uid));
      return;
    }
    setCart((current) => current.map((item) => item.uid === uid ? { ...item, quantity } : item));
  };
  const removeItem = (uid) => setCart((current) => current.filter((item) => item.uid !== uid));

  if (isAdmin) {
    return <AdminPanel products={currentProducts} categoriesList={catalogCategories} categoryOrder={categoryOrder} productOrder={productOrder} categoryHidden={categoryHidden} promotion={activePromotion} businessHours={businessHours} branchSettings={branchSettings} reloadMenu={loadMenuOverrides} />;
  }

  if (isSuper) {
    return <SuperPanel products={currentProducts} promotion={promotion} branchPromotions={branchPromotions} businessHours={businessHours} branchSettings={branchSettings} reloadMenu={loadMenuOverrides} />;
  }

  if (isOrders) {
    return <OrdersPanel />;
  }

  if (isStock) {
    return <StockPanel />;
  }

  if (isCashier) {
    return <CashierPanel products={currentProductsForBranch} categoriesList={catalogCategories} categoryOrder={categoryOrder} productOrder={productOrder} categoryHidden={categoryHidden} branchSettings={branchSettings} productCustomizations={productCustomizations} reloadMenu={loadMenuOverrides} />;
  }

  return (
    <main>
      <EmployeeLoginModal open={employeeLoginOpen} onClose={() => setEmployeeLoginOpen(false)} />
      <section className="hero">
        <nav className="nav">
          <Logo lang={lang} setLang={setLang} onLoginClick={() => setEmployeeLoginOpen(true)} />
          <a href="#cart" className="cart-pill">
            <ShoppingBag size={18} /> {itemCount} · {currency(subtotal)}
          </a>
        </nav>

        <div className="hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">
              <Sparkles size={14} /> {t(lang, 'heroEyebrow')}
            </span>

            {customer.profileLoaded && customer.name && (
              <p className="hero-welcome">{t(lang, 'welcomeBack', customer.name)}</p>
            )}

            <div className={`open-status-pill ${currentBusinessStatus.open ? 'open' : 'closed'}`}>{currentBusinessStatus.label}</div>

            {branchSettings.multiBranchEnabled && (
              <label className="branch-selector-card">
                <span>Elige sucursal</span>
                <select value={selectedBranch?.id || ''} onChange={(e) => setSelectedBranchId(e.target.value)}>
                  {availableBranches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </label>
            )}

            <h1>{t(lang, 'heroTitle')}</h1>

            <p>
              {t(lang, 'heroText')}
            </p>

            <div className="hero-actions">
              <a className="primary" href="#menu">
                <Utensils size={18} /> {t(lang, 'orderNow')}
              </a>

              <a className="secondary" href="#cart">
                <MessageCircle size={18} /> {t(lang, 'viewCart')}
              </a>
            </div>
          </div>

          <div className="hero-card">
            <img src="/pecas-logo.svg" alt="Pecas Cocina & Café" />
          </div>
        </div>
      </section>

      <PromoCard promotion={activePromotion} products={currentProductsForBranch} onAdd={addItem} lang={lang} categoryHidden={categoryHidden} />

      <section className="menu-layout" id="menu">
        <div className="menu-main">
          <div className="section-heading">
            <span className="eyebrow">{t(lang, 'menu')}</span>
            <h2>{t(lang, 'chooseCategory')}</h2>
          </div>
          <div className="tabs">
            {currentCategories.map((category) => (
              <button
                type="button"
                key={category.id}
                className={activeCategory === category.id ? 'active' : ''}
                onClick={() => setActiveCategory(category.id)}
              >
                <span>{category.emoji}</span> {categoryLabel(category.id, lang)}
              </button>
            ))}
          </div>

          <div className="product-grid">
            {visibleProducts.map((product) => (
              <ProductCard key={product.id} product={product} onAdd={addItem} lang={lang} customization={productCustomizations[product.id]} />
            ))}
          </div>
        </div>

        <Cart cart={cart} updateQty={updateQty} removeItem={removeItem} customer={customer} setCustomer={setCustomer} lang={lang} businessHours={effectiveBusinessHours} branch={selectedBranch} />
      </section>

      <a href="#cart" className="mobile-cart-bar">
        <span>{t(lang, 'productsCount', itemCount)}</span>
        <strong>{currency(subtotal)}</strong>
        <b>{t(lang, 'viewCart')}</b>
      </a>
    </main>
  );
}
