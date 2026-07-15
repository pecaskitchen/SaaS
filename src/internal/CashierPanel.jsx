import React, { useEffect, useMemo, useState } from 'react';
import { CashierPanel as CashierPanelBase } from '../LegacyApp.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { CATALOG_PRODUCTS, mergeCategoriesWithExtras, mergeProductsWithExtras, sortByOrder } from '../lib/catalog.js';
import { DEFAULT_BRANCH_SETTINGS, normalizeBranchSettings } from '../lib/business.js';
import { categories } from '../data/menu.js';

// Wrapper del modulo "Caja" del shell nuevo: carga el catalogo publicado
// (mismo endpoint que usa la storefront/LegacyApp) y monta el componente
// CashierPanel real, exportado desde LegacyApp.jsx (ver comentario ahi --
// no se duplico por el arbol de dependencias de ProductCard).
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

export default function CashierModule() {
  const { user } = useAuth();
  const [menuOverrides, setMenuOverrides] = useState({});
  const [extraCategories, setExtraCategories] = useState([]);
  const [extraProducts, setExtraProducts] = useState([]);
  const [categoryOrder, setCategoryOrder] = useState([]);
  const [productOrder, setProductOrder] = useState([]);
  const [categoryHidden, setCategoryHidden] = useState({});
  const [baseCatalogEnabled, setBaseCatalogEnabled] = useState(false);
  const [branchSettings, setBranchSettings] = useState(() => normalizeBranchSettings(DEFAULT_BRANCH_SETTINGS));
  const [productCustomizations, setProductCustomizations] = useState({});
  const [status, setStatus] = useState('Cargando catálogo...');

  const loadMenuOverrides = async () => {
    try {
      const response = await fetch('/api/menu');
      const result = await response.json();
      if (response.ok && result.ok) {
        setMenuOverrides(result.overrides || {});
        setBaseCatalogEnabled(Boolean(result.baseCatalogEnabled));
        const useBaseCatalog = Boolean(result.baseCatalogEnabled);
        const nextCategories = mergeCategoriesWithExtras(useBaseCatalog ? categories : [], result.extraCategories || []);
        const nextProducts = mergeProductsWithExtras(useBaseCatalog ? CATALOG_PRODUCTS : [], result.extraProducts || []);
        setExtraCategories(result.extraCategories || []);
        setExtraProducts(result.extraProducts || []);
        setCategoryOrder(result.categoryOrder || nextCategories.map((category) => category.id));
        setProductOrder(result.productOrder || nextProducts.map((product) => product.id));
        setCategoryHidden(result.categoryHidden || {});
        setBranchSettings(normalizeBranchSettings(result.branchSettings));
        setStatus('');
      }
    } catch {
      setStatus('No se pudo cargar el catálogo. Recarga la página.');
    }
  };

  const loadProductCustomizations = async () => {
    try {
      const response = await fetch(`/api/product-customizations?t=${Date.now()}`, { cache: 'no-store' });
      const result = await response.json();
      if (response.ok && result.ok) setProductCustomizations(result.products || {});
    } catch {
      setProductCustomizations({});
    }
  };

  useEffect(() => {
    loadMenuOverrides();
    loadProductCustomizations();
  }, []);

  const catalogCategories = useMemo(() => mergeCategoriesWithExtras(baseCatalogEnabled ? categories : [], extraCategories), [baseCatalogEnabled, extraCategories]);
  const catalogProducts = useMemo(() => mergeProductsWithExtras(baseCatalogEnabled ? CATALOG_PRODUCTS : [], extraProducts), [baseCatalogEnabled, extraProducts]);
  const currentProducts = useMemo(() => sortByOrder(mergeProductsWithOverrides(catalogProducts, menuOverrides), productOrder), [catalogProducts, menuOverrides, productOrder]);

  if (status) {
    return <main className="admin-page"><p className="admin-status">{status}</p></main>;
  }

  return (
    <CashierPanelBase
      products={currentProducts}
      categoriesList={catalogCategories}
      categoryOrder={categoryOrder}
      productOrder={productOrder}
      categoryHidden={categoryHidden}
      branchSettings={branchSettings}
      productCustomizations={productCustomizations}
      reloadMenu={loadMenuOverrides}
      employeeName={user?.name || ''}
    />
  );
}
