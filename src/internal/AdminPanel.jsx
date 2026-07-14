import React, { useEffect, useMemo, useState } from 'react';
import { Lock, Save } from 'lucide-react';
import '../styles.css';
import { categoryMeta, normalizePromotion, slugifyCatalogId, sortByOrder } from '../lib/catalog.js';
import {
  DEFAULT_BRANCH_SETTINGS,
  DEFAULT_BUSINESS_HOURS,
  normalizeBranchId,
  normalizeBranchSettings,
  normalizeBusinessHours,
} from '../lib/business.js';
import { categories } from '../data/menu.js';
import { apiFetch, getSessionToken, setSessionToken } from '../lib/apiClient.js';

const StockPanel = React.lazy(() => import('./StockPanel.jsx'));
const PaymentsSettings = React.lazy(() => import('./PaymentsSettings.jsx'));
const WhatsAppSettings = React.lazy(() => import('./WhatsAppSettings.jsx'));
const MetaPageSettings = React.lazy(() => import('./MetaPageSettings.jsx'));
const InstagramLoginSettings = React.lazy(() => import('./InstagramLoginSettings.jsx'));
const ItemsRecipesPanel = React.lazy(() => import('./ItemsRecipesPanel.jsx'));

function BackofficeNav({ current = 'admin', compact = false, showAdmin = true }) {
  const items = [
    ...(showAdmin ? [{ id: 'admin', label: 'Admin', href: '#admin' }] : []),
    { id: 'orders', label: 'Pedidos', href: '#orders' },
    { id: 'stock', label: 'Stock', href: '#stock' },
    { id: 'cashier', label: 'Caja', href: '#cashier' },
  ];
  return (
    <nav className={`backoffice-nav ${compact ? 'compact' : ''}`}>
      {items.map((item) => (
        <a key={item.id} href={item.href} className={current === item.id ? 'active' : ''}>{item.label}</a>
      ))}
    </nav>
  );
}

function AdminSectionIntro({ title, description, children }) {
  return (
    <div className="admin-section-intro">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}

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

function parseMenuCsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return { categories: [], products: [] };
  const headers = lines[0].split(',').map((header) => header.trim().toLowerCase());
  const readRow = (line) => {
    const values = line.split(',').map((value) => value.trim());
    return headers.reduce((row, header, index) => ({ ...row, [header]: values[index] || '' }), {});
  };
  const categoriesById = new Map();
  const products = [];
  lines.slice(1).map(readRow).forEach((row, index) => {
    const categoryId = slugifyCatalogId(row.category_id || row.category || row.categoria || 'sin-categoria', 'sin-categoria');
    const categoryLabel = row.category_label || row.categoria_nombre || row.category || row.categoria || categoryId;
    if (!categoriesById.has(categoryId)) {
      categoriesById.set(categoryId, { id: categoryId, label: categoryLabel, emoji: row.emoji || '', customCategory: true });
    }
    const productName = row.name || row.nombre || row.product || row.producto;
    if (!productName) return;
    products.push({
      id: slugifyCatalogId(row.id || productName, `producto-${index + 1}`),
      name: productName,
      category: categoryId,
      type: row.type || row.tipo || 'custom',
      price: Number(row.price || row.precio || 0),
      badge: row.badge || row.etiqueta || '',
      description: row.description || row.descripcion || '',
      ingredients: row.ingredients || row.ingredientes || '',
      image: row.image || row.imagen || '',
      unavailable: false,
      customProduct: true,
    });
  });
  return { categories: [...categoriesById.values()], products };
}

export default function AdminPanel({ products, categoriesList = categories, categoryOrder, productOrder, categoryHidden, promotion, businessHours, branchSettings, reloadMenu, loadError = '' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [drafts, setDrafts] = useState(() => products.map((product) => ({ ...product })));
  const [categoryItems, setCategoryItems] = useState(() => categoriesList.map((category) => ({ ...category })));
  const [categoryDraft, setCategoryDraft] = useState(() => categoryOrder.length ? categoryOrder : categoriesList.map((category) => category.id));
  const [productOrderDraft, setProductOrderDraft] = useState(() => productOrder.length ? productOrder : products.map((product) => product.id));
  const [promotionDraft, setPromotionDraft] = useState(() => normalizePromotion(promotion, products));
  const [categoryHiddenDraft, setCategoryHiddenDraft] = useState(() => ({ ...(categoryHidden || {}) }));
  const [businessHoursDraft, setBusinessHoursDraft] = useState(() => normalizeBusinessHours(businessHours));
  const [branchSettingsDraft, setBranchSettingsDraft] = useState(() => normalizeBranchSettings(branchSettings));
  const [newCategoryDraft, setNewCategoryDraft] = useState({ label: '', emoji: '' });
  const [newProductDraft, setNewProductDraft] = useState({ name: '', category: categoriesList[0]?.id || '', price: 0 });
  const [importText, setImportText] = useState('');
  const [openAdminSections, setOpenAdminSections] = useState({ branches: true, payments: false, whatsapp: false, metaPage: false, instagramLogin: false, catalog: false, itemsCosts: false, promo: true, hours: true, sections: true });
  const [openAdminCategories, setOpenAdminCategories] = useState({});
  const [status, setStatus] = useState('');

  useEffect(() => {
    setDrafts(products.map((product) => ({ ...product })));
  }, [products]);

  useEffect(() => {
    setCategoryItems(categoriesList.map((category) => ({ ...category })));
  }, [categoriesList]);

  useEffect(() => {
    setCategoryDraft(categoryOrder.length ? categoryOrder : categoriesList.map((category) => category.id));
  }, [categoryOrder, categoriesList]);

  useEffect(() => {
    setProductOrderDraft(productOrder.length ? productOrder : products.map((product) => product.id));
  }, [productOrder, products]);

  useEffect(() => {
    setPromotionDraft(normalizePromotion(promotion, products));
  }, [promotion, products]);

  useEffect(() => {
    setCategoryHiddenDraft({ ...(categoryHidden || {}) });
  }, [categoryHidden]);

  useEffect(() => {
    setBusinessHoursDraft(normalizeBusinessHours(businessHours));
  }, [businessHours]);

  useEffect(() => {
    setBranchSettingsDraft(normalizeBranchSettings(branchSettings));
  }, [branchSettings]);

  const updateDraft = (id, key, value) => {
    setDrafts((current) => current.map((product) => (
      product.id === id ? { ...product, [key]: value } : product
    )));
  };

  const categoryLabel = (categoryId) => {
    const category = categoryItems.find((item) => item.id === categoryId);
    if (category) return `${category.emoji ? `${category.emoji} ` : ''}${category.label}`;
    const meta = categoryMeta(categoryId);
    return `${meta.emoji ? `${meta.emoji} ` : ''}${meta.label}`;
  };

  const updateCategory = (id, key, value) => {
    setCategoryItems((current) => current.map((category) => (
      category.id === id ? { ...category, [key]: value, customCategory: true } : category
    )));
  };

  const addCategory = () => {
    const label = newCategoryDraft.label.trim();
    if (!label) {
      setStatus('Escribe el nombre de la categoría.');
      return;
    }
    const id = slugifyCatalogId(label, `categoria-${categoryItems.length + 1}`);
    if (categoryItems.some((category) => category.id === id)) {
      setStatus('Ya existe una categoría con ese nombre.');
      return;
    }
    const category = { id, label, emoji: newCategoryDraft.emoji.trim(), customCategory: true };
    setCategoryItems((current) => [...current, category]);
    setCategoryDraft((current) => [...current, id]);
    setNewCategoryDraft({ label: '', emoji: '' });
    setStatus('Categoría agregada. Guarda cambios para publicarla.');
  };

  const addProduct = () => {
    const name = newProductDraft.name.trim();
    const categoryId = newProductDraft.category || categoryItems[0]?.id || '';
    if (!categoryItems.length) {
      setStatus('Primero crea una categoría. Después podrás agregar productos dentro de ella.');
      return;
    }
    if (!categoryItems.some((category) => category.id === categoryId)) {
      setStatus('Selecciona una categoría existente para este producto.');
      return;
    }
    if (!name) {
      setStatus('Escribe el nombre del producto.');
      return;
    }
    const id = slugifyCatalogId(name, `producto-${drafts.length + 1}`);
    if (drafts.some((product) => product.id === id)) {
      setStatus('Ya existe un producto con ese nombre.');
      return;
    }
    const product = {
      id,
      name,
      category: categoryId,
      type: 'custom',
      price: Number(newProductDraft.price || 0),
      recipeKey: `product:${id}`,
      description: '',
      ingredients: '',
      image: '',
      unavailable: false,
      customProduct: true,
    };
    setDrafts((current) => [...current, product]);
    setProductOrderDraft((current) => [...current, id]);
    setNewProductDraft({ name: '', category: categoryId, price: 0 });
    setStatus('Producto agregado. Completa sus datos y guarda cambios.');
  };

  const importMenuCsv = () => {
    const parsed = parseMenuCsv(importText);
    if (!parsed.categories.length && !parsed.products.length) {
      setStatus('No encontré productos en el CSV.');
      return;
    }
    setCategoryItems((current) => {
      const byId = new Map(current.map((category) => [category.id, category]));
      parsed.categories.forEach((category) => byId.set(category.id, { ...(byId.get(category.id) || {}), ...category, customCategory: true }));
      return [...byId.values()];
    });
    setCategoryDraft((current) => [...new Set([...current, ...parsed.categories.map((category) => category.id)])]);
    setDrafts((current) => {
      const byId = new Map(current.map((product) => [product.id, product]));
      parsed.products.forEach((product) => byId.set(product.id, { ...(byId.get(product.id) || {}), ...product, customProduct: true }));
      return [...byId.values()];
    });
    setProductOrderDraft((current) => [...new Set([...current, ...parsed.products.map((product) => product.id)])]);
    setImportText('');
    setStatus(`Importados ${parsed.products.length} productos. Guarda cambios para publicarlos.`);
  };

  const makeCurrentCatalogEditable = () => {
    setCategoryItems((current) => current.map((category) => ({ ...category, customCategory: true })));
    setDrafts((current) => current.map((product) => ({ ...product, customProduct: true })));
    setStatus('Catálogo actual copiado a DB. Guarda cambios para que deje de depender del catálogo base.');
  };

  const updatePromotion = (key, value) => {
    setPromotionDraft((current) => ({ ...current, [key]: value }));
  };

  const updatePromotionItem = (index, key, value) => {
    setPromotionDraft((current) => {
      const items = [...(current.items || [])];
      items[index] = { ...items[index], [key]: value };
      return { ...current, items };
    });
  };

  const addPromotionItem = () => {
    const firstProduct = products[0];
    if (!firstProduct) return;
    setPromotionDraft((current) => ({
      ...current,
      items: [...(current.items || []), { productId: firstProduct.id, quantity: 1 }],
    }));
  };

  const removePromotionItem = (index) => {
    setPromotionDraft((current) => {
      const items = (current.items || []).filter((_, itemIndex) => itemIndex !== index);
      return { ...current, items: items.length ? items : current.items };
    });
  };

  const toggleCategoryHidden = (categoryId, isVisible) => {
    setCategoryHiddenDraft((current) => ({ ...current, [categoryId]: !isVisible }));
  };

  const moveInList = (list, id, direction) => {
    const index = list.indexOf(id);
    if (index < 0) return list;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= list.length) return list;
    const next = [...list];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    return next;
  };

  const moveCategory = (id, direction) => {
    setCategoryDraft((current) => moveInList(current, id, direction));
  };

  const moveProduct = (id, direction) => {
    setProductOrderDraft((current) => moveInList(current, id, direction));
  };


  const toggleAdminSection = (key) => {
    setOpenAdminSections((current) => ({ ...current, [key]: !current[key] }));
  };

  const toggleAdminCategory = (categoryId) => {
    setOpenAdminCategories((current) => ({ ...current, [categoryId]: !current[categoryId] }));
  };

  const updateBusinessDay = (day, key, value) => {
    setBusinessHoursDraft((current) => ({
      ...current,
      days: current.days.map((row) => row.day === day ? { ...row, [key]: value } : row),
    }));
  };


  const updateBranchBusinessHours = (index, updater) => {
    setBranchSettingsDraft((current) => {
      const branches = [...(current.branches || [])];
      const branch = branches[index] || {};
      const currentHours = normalizeBusinessHours(branch.businessHours || businessHoursDraft || DEFAULT_BUSINESS_HOURS);
      branches[index] = { ...branch, businessHours: updater(currentHours) };
      return normalizeBranchSettings({ ...current, branches });
    });
  };

  const updateBranchBusinessDay = (index, day, key, value) => {
    updateBranchBusinessHours(index, (hours) => ({
      ...hours,
      days: hours.days.map((row) => row.day === day ? { ...row, [key]: value } : row),
    }));
  };

  const updateBranchSettings = (key, value) => {
    setBranchSettingsDraft((current) => normalizeBranchSettings({ ...current, [key]: value }));
  };

  const updateBranch = (index, key, value) => {
    setBranchSettingsDraft((current) => {
      const branches = [...(current.branches || [])];
      const next = { ...branches[index], [key]: value };
      if (key === 'name' && (!next.id || next.id.startsWith('sucursal-'))) next.id = normalizeBranchId(value, `sucursal-${index + 1}`);
      if (key === 'id') next.id = normalizeBranchId(value, `sucursal-${index + 1}`);
      branches[index] = next;
      return normalizeBranchSettings({ ...current, branches });
    });
  };

  const addBranch = () => {
    setBranchSettingsDraft((current) => {
      const branches = [...(current.branches || [])];
      branches.push({ id: `sucursal-${branches.length + 1}`, name: `Sucursal ${branches.length + 1}`, active: true, ordersPassword: '', stockPassword: '', cashierPassword: '', whatsappNumber: '', businessHours: normalizeBusinessHours(businessHoursDraft), soldOut: {} });
      return normalizeBranchSettings({ ...current, branches });
    });
  };

  const removeBranch = (index) => {
    setBranchSettingsDraft((current) => {
      const branches = (current.branches || []).filter((_, branchIndex) => branchIndex !== index);
      return normalizeBranchSettings({ ...current, branches: branches.length ? branches : DEFAULT_BRANCH_SETTINGS.branches });
    });
  };

  const orderedDrafts = useMemo(() => sortByOrder(drafts, productOrderDraft), [drafts, productOrderDraft]);
  const orderedCategories = useMemo(() => sortByOrder(categoryItems, categoryDraft), [categoryItems, categoryDraft]);

  // MIGRADO a JWT: antes mandaba la contraseña compartida como header en
  // cada request. Ahora hace login con email/password contra
  // /api/auth/login, guarda el token (apiClient.setSessionToken) y todas las
  // llamadas subsecuentes lo adjuntan solas via apiFetch.
  const unlock = async () => {
    setStatus('Validando...');
    try {
      if (email.trim() && password) {
        const login = await apiFetch('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: email.trim(), password }),
        });
        setSessionToken(login.token);
      } else if (!getSessionToken()) {
        setStatus('Ingresa tu email y contraseña.');
        return;
      }

      const result = await apiFetch('/api/admin/menu');
      setUnlocked(true);
      if (result.businessHours) setBusinessHoursDraft(normalizeBusinessHours(result.businessHours));
      if (result.branchSettings) setBranchSettingsDraft(normalizeBranchSettings(result.branchSettings));
      setStatus('');
      setPassword('');
    } catch (error) {
      setSessionToken('');
      setStatus(error.message || 'No se pudo validar.');
    }
  };

  useEffect(() => {
    if (getSessionToken() && !unlocked) unlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveMenu = async () => {
    // CORREGIDO: si la carga del catalogo fallo (ver AdminRoute.jsx) o
    // si por alguna otra razon los productos llegaron vacios, no dejar
    // que "Guardar cambios" sobreescriba el catalogo real con una lista
    // vacia -- eso fue justo lo que provoco que todas las recetas
    // aparecieran como "sin producto publicado" en el panel de Stock.
    if (loadError) {
      setStatus('No se puede guardar: el catálogo no cargó bien. Recarga la página e intenta de nuevo.');
      return;
    }
    if (drafts.length === 0 && categoryItems.length > 0) {
      setStatus('No se guardó: no se detectó ningún producto cargado (esto borraría tu catálogo). Recarga la página e intenta de nuevo.');
      return;
    }
    setStatus('Guardando...');
    const overrides = {};
    for (const product of drafts) {
      overrides[product.id] = {
        name: product.name,
        price: Number(product.price),
        description: product.description || '',
        ingredients: product.ingredients || '',
        image: product.image || '',
        unavailable: Boolean(product.unavailable),
      };
    }
    const extraCategories = categoryItems
      .map((category) => ({
        id: slugifyCatalogId(category.id || category.label, 'categoria'),
        label: category.label || category.id,
        emoji: category.emoji || '',
        customCategory: true,
      }));
    const extraProducts = drafts
      .map((product) => ({
        id: slugifyCatalogId(product.id || product.name, 'producto'),
        name: product.name,
        category: product.category,
        type: product.type || 'custom',
        price: Number(product.price || 0),
        recipeId: product.recipeId || null,
        recipeKey: product.recipeKey || `product:${slugifyCatalogId(product.id || product.name, 'producto')}`,
        badge: product.badge || '',
        description: product.description || '',
        ingredients: product.ingredients || '',
        image: product.image || '',
        unavailable: Boolean(product.unavailable),
        customProduct: true,
      }));

    try {
      const result = await apiFetch('/api/admin/menu', {
        method: 'POST',
        body: JSON.stringify({
          overrides,
          extraCategories,
          extraProducts,
          categoryOrder: categoryDraft,
          productOrder: productOrderDraft,
          categoryHidden: categoryHiddenDraft,
          promotion: promotionDraft,
          businessHours: businessHoursDraft,
          branchSettings: branchSettingsDraft,
        }),
      });
      const warning = Array.isArray(result.mojibakeWarnings) && result.mojibakeWarnings.length
        ? ` Revisa posible mojibake: ${result.mojibakeWarnings.slice(0, 3).join(', ')}`
        : '';
      setStatus(`Cambios guardados.${warning}`);
      await reloadMenu();
    } catch (error) {
      setStatus(`No se pudo guardar: ${error.message}`);
    }
  };

  return (
    <main className="admin-page">
      <section className="admin-card">
        <Logo />
        <div className="admin-hero">
          <div>
            <h1>Administrador</h1>
            <p>Configura sucursales, menú, ingredientes, recetas, familias e importaciones. Para operación diaria usa Pedidos, Stock o Caja.</p>
          </div>
          <a className="ghost admin-home-link" href="#">Ver página cliente</a>
        </div>

        {!unlocked ? (
          <div className="admin-login">
            <label className="field full">
              <span>Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@negocio.com" autoFocus />
            </label>
            <label className="field full">
              <span>Contraseña</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Tu contraseña" onKeyDown={(e) => { if (e.key === 'Enter') unlock(); }} />
            </label>
            <button type="button" className="primary" onClick={unlock}><Lock size={16} /> Entrar</button>
            {status && <p className="admin-status">{status}</p>}
          </div>
        ) : (
          <>
            <BackofficeNav current="admin" />
            {loadError && (
              <p className="admin-status" style={{ color: '#b91c1c' }}>
                No se pudo cargar el catálogo ({loadError}). No guardes cambios hasta recargar la página o podrías borrar tu catálogo.
              </p>
            )}
            <div className="admin-toolbar sticky-actions">
              <button type="button" className="primary" onClick={saveMenu} disabled={Boolean(loadError)}><Save size={16} /> Guardar cambios</button>
              {status && <p className="admin-status">{status}</p>}
            </div>
            <section className="admin-collapse">
              <button type="button" className="admin-collapse-summary" onClick={() => toggleAdminSection('payments')}>Pagos en línea <span>{openAdminSections.payments ? '-' : '+'}</span></button>
              {openAdminSections.payments && (
                <div className="admin-order-box">
                  <PaymentsSettings />
                </div>
              )}
            </section>

            <section className="admin-collapse">
              <button type="button" className="admin-collapse-summary" onClick={() => toggleAdminSection('whatsapp')}>WhatsApp Business <span>{openAdminSections.whatsapp ? '-' : '+'}</span></button>
              {openAdminSections.whatsapp && (
                <div className="admin-order-box">
                  <WhatsAppSettings />
                </div>
              )}
            </section>

            <section className="admin-collapse">
              <button type="button" className="admin-collapse-summary" onClick={() => toggleAdminSection('metaPage')}>Facebook e Instagram <span>{openAdminSections.metaPage ? '-' : '+'}</span></button>
              {openAdminSections.metaPage && (
                <div className="admin-order-box">
                  <MetaPageSettings />
                </div>
              )}
            </section>

            <section className="admin-collapse">
              <button type="button" className="admin-collapse-summary" onClick={() => toggleAdminSection('instagramLogin')}>Instagram (conexión directa) <span>{openAdminSections.instagramLogin ? '-' : '+'}</span></button>
              {openAdminSections.instagramLogin && (
                <div className="admin-order-box">
                  <InstagramLoginSettings />
                </div>
              )}
            </section>

            <section className="admin-collapse">
              <button type="button" className="admin-collapse-summary" onClick={() => toggleAdminSection('itemsCosts')}>Costos y recetas (nuevo) <span>{openAdminSections.itemsCosts ? '-' : '+'}</span></button>
              {openAdminSections.itemsCosts && (
                <div className="admin-order-box">
                  <AdminSectionIntro title="Costos y recetas (nuevo)" description="Vista de solo lectura del motor de costeo -- items, tipos, y costo/margen calculado por receta." />
                  <ItemsRecipesPanel />
                </div>
              )}
            </section>

            <section className="admin-collapse">
              <button type="button" className="admin-collapse-summary" onClick={() => toggleAdminSection('catalog')}>Catálogo operativo <span>{openAdminSections.catalog ? '-' : '+'}</span></button>
              {openAdminSections.catalog && (
                <div className="admin-embedded-stock-config">
                  <AdminSectionIntro title="Catálogo operativo" description="Aquí vive lo técnico: ingredientes, recetas/sub-recetas, familias e importación." />
                  <StockPanel mode="adminConfig" />
                </div>
              )}
            </section>

            <section className="admin-collapse">
              <button type="button" className="admin-collapse-summary" onClick={() => toggleAdminSection('branches')}>Sucursales <span>{openAdminSections.branches ? '-' : '+'}</span></button>
              {openAdminSections.branches && (
              <div className="admin-order-box">
                <AdminSectionIntro title="Sucursales" description="Activa multi-sucursal solo cuando quieras que el cliente elija sucursal. Si está apagado, todo entra a la sucursal principal." />
                <label className="check-row full">
                  <input type="checkbox" checked={Boolean(branchSettingsDraft.multiBranchEnabled)} onChange={(e) => updateBranchSettings('multiBranchEnabled', e.target.checked)} />
                  <span>Activar modo multi-sucursal</span>
                </label>
                <label className="field full">
                  <span>Sucursal principal/default</span>
                  <select value={branchSettingsDraft.defaultBranchId} onChange={(e) => updateBranchSettings('defaultBranchId', e.target.value)}>
                    {(branchSettingsDraft.branches || []).map((branch) => (
                      <option key={branch.id} value={branch.id}>{branch.name}</option>
                    ))}
                  </select>
                </label>
                <div className="admin-products">
                  {(branchSettingsDraft.branches || []).map((branch, index) => (
                    <article className="admin-product" key={`${branch.id}-${index}`}>
                      <label className="field">
                        <span>Nombre de sucursal</span>
                        <input value={branch.name || ''} onChange={(e) => updateBranch(index, 'name', e.target.value)} />
                      </label>
                      <label className="field">
                        <span>ID interno</span>
                        <input value={branch.id || ''} onChange={(e) => updateBranch(index, 'id', e.target.value)} />
                        <small>No lo cambies si ya hay pedidos de esta sucursal.</small>
                      </label>
                      <label className="field">
                        <span>Contraseña Orders</span>
                        <input type="text" value={branch.ordersPassword || ''} onChange={(e) => updateBranch(index, 'ordersPassword', e.target.value)} placeholder="Ej. pedidos-dominio" />
                        <small>Quien use esta contraseña solo verá pedidos de esta sucursal.</small>
                      </label>
                      <label className="field">
                        <span>Contraseña Stock</span>
                        <input type="text" value={branch.stockPassword || ''} onChange={(e) => updateBranch(index, 'stockPassword', e.target.value)} placeholder="Ej. stock-dominio" />
                        <small>Quien use esta contraseña solo operará stock de esta sucursal.</small>
                      </label>
                      <label className="field">
                        <span>Contraseña Caja</span>
                        <input type="text" value={branch.cashierPassword || ''} onChange={(e) => updateBranch(index, 'cashierPassword', e.target.value)} placeholder="Ej. caja-dominio" />
                        <small>Quien use esta contraseña capturará pedidos de caja para esta sucursal.</small>
                      </label>
                      <label className="field">
                        <span>WhatsApp pedidos</span>
                        <input type="text" value={branch.whatsappNumber || ''} onChange={(e) => updateBranch(index, 'whatsappNumber', e.target.value)} placeholder="Ej. 528441234567" />
                        <small>Los pedidos de esta sucursal se enviarán a este número. Si lo dejas vacío, usa el WhatsApp global.</small>
                      </label>
                      <label className="check-row full">
                        <input type="checkbox" checked={branch.active !== false} onChange={(e) => updateBranch(index, 'active', e.target.checked)} />
                        <span>Sucursal activa</span>
                      </label>
                      <button type="button" className="ghost danger-text" onClick={() => removeBranch(index)} disabled={(branchSettingsDraft.branches || []).length <= 1}>Quitar sucursal</button>
                    </article>
                  ))}
                </div>
                <button type="button" className="ghost" onClick={addBranch}>+ Agregar sucursal</button>
              </div>
              )}
            </section>

            <div className="admin-order-box admin-super-moved-note">
              <h2>Horario y promoción</h2>
              <p>Estos controles se movieron al apartado de Super usuario: abre <b>#super</b>.</p>
            </div>

            <section className="admin-collapse">
            <button type="button" className="admin-collapse-summary" onClick={() => toggleAdminSection('sections')}>Secciones del menú <span>{openAdminSections.sections ? '-' : '+'}</span></button>
            {openAdminSections.sections && (
            <>
            <div className="admin-order-box">
              <h2>Crear e importar menú</h2>
              <div className="admin-promo-grid">
                <label className="field"><span>Nueva categoría</span><input value={newCategoryDraft.label} onChange={(e) => setNewCategoryDraft((current) => ({ ...current, label: e.target.value }))} placeholder="Ej. Tacos" /></label>
                <label className="field"><span>Emoji/icono</span><input value={newCategoryDraft.emoji} onChange={(e) => setNewCategoryDraft((current) => ({ ...current, emoji: e.target.value }))} placeholder="🌮" /></label>
                <button type="button" className="ghost" onClick={addCategory}>Agregar categoría</button>
                <label className="field"><span>Nuevo producto</span><input value={newProductDraft.name} onChange={(e) => setNewProductDraft((current) => ({ ...current, name: e.target.value }))} placeholder="Ej. Taco de sirloin" /></label>
                <label className="field"><span>Categoría existente</span><select value={newProductDraft.category || categoryItems[0]?.id || ''} onChange={(e) => setNewProductDraft((current) => ({ ...current, category: e.target.value }))} disabled={!categoryItems.length}>{categoryItems.map((category) => <option key={category.id} value={category.id}>{categoryLabel(category.id)}</option>)}</select></label>
                <label className="field"><span>Precio</span><input type="number" value={newProductDraft.price} onChange={(e) => setNewProductDraft((current) => ({ ...current, price: e.target.value }))} /></label>
                <button type="button" className="ghost" onClick={addProduct} disabled={!categoryItems.length}>Agregar producto</button>
                <label className="field full"><span>Importar CSV</span><textarea rows="5" value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="category_id,category_label,emoji,id,name,price,description,ingredients,image&#10;tacos,Tacos,🌮,taco-sirloin,Taco de sirloin,85,Con tortilla de maíz,Sirloin y salsa,/products/taco.jpg" /></label>
                <button type="button" className="ghost" onClick={importMenuCsv}>Importar productos</button>
                <button type="button" className="ghost" onClick={makeCurrentCatalogEditable}>Convertir catálogo actual a editable</button>
              </div>
            </div>

            <div className="admin-order-box">
              <h2>Orden de secciones</h2>
              <p>Mueve las secciones para elegir cuál aparece primero en el menú.</p>
              <div className="admin-sort-list">
                {orderedCategories.map((category) => (
                  <div className="admin-sort-row" key={category.id}>
                    <strong>{category.emoji} {category.label}</strong>
                    <label className="field">
                      <span>Icono</span>
                      <input value={category.emoji || ''} onChange={(e) => updateCategory(category.id, 'emoji', e.target.value)} placeholder="Ej. ☕" />
                    </label>
                    <label className="field">
                      <span>Nombre</span>
                      <input value={category.label || ''} onChange={(e) => updateCategory(category.id, 'label', e.target.value)} />
                    </label>
                    <label className="admin-inline-check">
                      <input type="checkbox" checked={!categoryHiddenDraft[category.id]} onChange={(e) => toggleCategoryHidden(category.id, e.target.checked)} />
                      <span>Mostrar sección</span>
                    </label>
                    <div>
                      <button type="button" className="ghost mini" onClick={() => moveCategory(category.id, -1)}>↑</button>
                      <button type="button" className="ghost mini" onClick={() => moveCategory(category.id, 1)}>↓</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {orderedCategories.map((category) => {
              const productsInCategory = orderedDrafts.filter((product) => product.category === category.id);
              if (productsInCategory.length === 0) return null;
              const isCategoryOpen = openAdminCategories[category.id] !== false;
              return (
                <div className="admin-category-section" key={category.id}>
                  <button type="button" className="admin-category-summary" onClick={() => toggleAdminCategory(category.id)}>
                    <span>{category.emoji} {category.label}</span>
                    <b>{productsInCategory.length} productos · {isCategoryOpen ? '-' : '+'}</b>
                  </button>
                  {isCategoryOpen && (
                  <>
                  <p>Usa ↑ / ↓ para mover productos dentro de esta sección.</p>
                  <div className="admin-products">
                    {productsInCategory.map((product) => (
                      <article className="admin-product" key={product.id}>
                        <div className="admin-product-head">
                          <strong>{product.name}</strong>
                          <span>{categoryLabel(product.category)}</span>
                        </div>
                        <div className="admin-product-move">
                          <button type="button" className="ghost mini" onClick={() => moveProduct(product.id, -1)}>Mover arriba ↑</button>
                          <button type="button" className="ghost mini" onClick={() => moveProduct(product.id, 1)}>Mover abajo ↓</button>
                        </div>
                        <label className="check-row full admin-availability">
                          <input type="checkbox" checked={!product.unavailable} onChange={(e) => updateDraft(product.id, 'unavailable', !e.target.checked)} />
                          <span>Disponible para ordenar</span>
                        </label>
                        <label className="field">
                          <span>Categoría</span>
                          <select value={product.category} onChange={(e) => updateDraft(product.id, 'category', e.target.value)}>
                            {categoryItems.map((categoryOption) => <option key={categoryOption.id} value={categoryOption.id}>{categoryLabel(categoryOption.id)}</option>)}
                          </select>
                        </label>
                        <label className="field">
                          <span>Nombre</span>
                          <input value={product.name} onChange={(e) => updateDraft(product.id, 'name', e.target.value)} />
                        </label>
                        <label className="field">
                          <span>Receta stock</span>
                          <input value={product.recipeKey || `product:${product.id}`} onChange={(e) => updateDraft(product.id, 'recipeKey', e.target.value)} placeholder={`product:${product.id}`} />
                          <small>Debe coincidir con una receta activa para descontar inventario.</small>
                        </label>
                        <label className="field">
                          <span>Precio</span>
                          <input type="number" value={product.price} onChange={(e) => updateDraft(product.id, 'price', e.target.value)} />
                        </label>
                        <label className="field full">
                          <span>Descripción</span>
                          <textarea rows="2" value={product.description || ''} onChange={(e) => updateDraft(product.id, 'description', e.target.value)} />
                        </label>
                        <label className="field full">
                          <span>Ingredientes</span>
                          <textarea rows="2" value={product.ingredients || ''} onChange={(e) => updateDraft(product.id, 'ingredients', e.target.value)} />
                        </label>
                        <label className="field full">
                          <span>Imagen</span>
                          <input value={product.image || ''} onChange={(e) => updateDraft(product.id, 'image', e.target.value)} placeholder="/products/panini-chipotle.jpg o URL" />
                          <small>Para imagen local, sube el archivo a public/products y usa /products/nombre.jpg</small>
                        </label>
                      </article>
                    ))}
                  </div>
                  </>
                  )}
                </div>
              );
            })}
            </>
            )}
            </section>
          </>
        )}
      </section>
    </main>
  );
}






