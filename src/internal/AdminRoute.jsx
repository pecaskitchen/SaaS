import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AdminPanel from './AdminPanel.jsx';
import {
  mergeCategoriesWithExtras,
  mergeProductsWithExtras,
  normalizePromotion,
  sortByOrder,
} from '../lib/catalog.js';
import {
  DEFAULT_BRANCH_SETTINGS,
  DEFAULT_BUSINESS_HOURS,
  normalizeBranchSettings,
  normalizeBusinessHours,
} from '../lib/business.js';
import { categories } from '../data/menu.js';
import { apiFetch, getSessionToken } from '../lib/apiClient.js';

const EMPTY_PRODUCTS = [];

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

export default function AdminRoute() {
  const [menuOverrides, setMenuOverrides] = useState({});
  const [extraCategories, setExtraCategories] = useState([]);
  const [extraProducts, setExtraProducts] = useState([]);
  const [categoryOrder, setCategoryOrder] = useState([]);
  const [productOrder, setProductOrder] = useState([]);
  const [categoryHidden, setCategoryHidden] = useState({});
  const [promotion, setPromotion] = useState(null);
  const [businessHours, setBusinessHours] = useState(() => normalizeBusinessHours(DEFAULT_BUSINESS_HOURS));
  const [branchSettings, setBranchSettings] = useState(() => normalizeBranchSettings(DEFAULT_BRANCH_SETTINGS));
  // CORREGIDO: si /api/admin/menu fallaba (blip de red, token vencido,
  // etc.) esto vaciaba TODO el estado local -- incluido extraProducts.
  // Si el admin le daba a "Guardar cambios" sin darse cuenta de que el
  // catalogo se veia vacio, se sobreescribia el catalogo real (guardado
  // en tablas) con un extraProducts=[] en el blob legacy que lee el panel
  // de Stock, mostrando todas las recetas como "sin producto publicado".
  // Ahora un fallo NO borra el ultimo estado bueno conocido -- solo
  // avisa con loadError y bloquea el guardado hasta recargar bien.
  const [loadError, setLoadError] = useState('');
  const hasLoadedOnce = React.useRef(false);

  const loadMenu = useCallback(async () => {
    try {
      const hasSession = Boolean(getSessionToken());
      const result = hasSession
        ? await apiFetch('/api/admin/menu', { cache: 'no-store' })
        : await apiFetch('/api/menu', { cache: 'no-store' });

      const nextCategories = mergeCategoriesWithExtras([], result.extraCategories || []);
      const nextProducts = mergeProductsWithExtras(EMPTY_PRODUCTS, result.extraProducts || []);
      setMenuOverrides(result.overrides || {});
      setExtraCategories(result.extraCategories || []);
      setExtraProducts(result.extraProducts || []);
      setCategoryOrder(result.categoryOrder?.length ? result.categoryOrder : nextCategories.map((category) => category.id));
      setProductOrder(result.productOrder?.length ? result.productOrder : nextProducts.map((product) => product.id));
      setCategoryHidden(result.categoryHidden || {});
      setPromotion(result.promotion ? normalizePromotion(result.promotion, nextProducts) : null);
      setBusinessHours(normalizeBusinessHours(result.businessHours));
      setBranchSettings(normalizeBranchSettings(result.branchSettings));
      setLoadError('');
      hasLoadedOnce.current = true;
    } catch (error) {
      if (!hasLoadedOnce.current) {
        setMenuOverrides({});
        setExtraCategories([]);
        setExtraProducts([]);
        setCategoryOrder([]);
        setProductOrder([]);
        setCategoryHidden({});
        setPromotion(null);
        setBusinessHours(normalizeBusinessHours(DEFAULT_BUSINESS_HOURS));
        setBranchSettings(normalizeBranchSettings(DEFAULT_BRANCH_SETTINGS));
      }
      setLoadError(error?.message || 'No se pudo cargar el catalogo.');
    }
  }, []);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  const catalogCategories = useMemo(() => mergeCategoriesWithExtras([], extraCategories), [extraCategories]);
  const catalogProducts = useMemo(() => mergeProductsWithExtras(EMPTY_PRODUCTS, extraProducts), [extraProducts]);
  const currentProducts = useMemo(() => sortByOrder(mergeProductsWithOverrides(catalogProducts, menuOverrides), productOrder), [catalogProducts, menuOverrides, productOrder]);
  const currentCategories = useMemo(() => {
    const productCategories = new Set(currentProducts.map((product) => product.category));
    const withProducts = catalogCategories.filter((category) => productCategories.has(category.id));
    return sortByOrder(withProducts.length ? withProducts : catalogCategories, categoryOrder);
  }, [catalogCategories, categoryOrder, currentProducts]);

  return (
    <AdminPanel
      products={currentProducts}
      categoriesList={currentCategories.length ? currentCategories : categories.filter(() => false)}
      categoryOrder={categoryOrder}
      productOrder={productOrder}
      categoryHidden={categoryHidden}
      promotion={promotion}
      businessHours={businessHours}
      branchSettings={branchSettings}
      reloadMenu={loadMenu}
      loadError={loadError}
    />
  );
}

