import React, { Suspense, lazy, useEffect, useState } from 'react';
import { installTenantFetchInterceptor } from './lib/apiClient.js';

const PublicApp = lazy(() => import('./PublicApp.jsx'));
const LegacyApp = lazy(() => import('./LegacyApp.jsx'));
const PlatformAdmin = lazy(() => import('./platform/PlatformAdmin.jsx'));

function currentRoute() {
  try {
    if (window.location.hash) return window.location.hash;
    const path = window.location.pathname.replace(/\/+$/, '');
    if (path === '/admin') return '#admin';
    if (path === '/super') return '#super';
    if (path === '/orders') return '#orders';
    if (path === '/stock') return '#stock';
    if (path === '/cashier') return '#cashier';
    if (path === '/platform') return '#platform';
    return '#';
  } catch {
    return '#';
  }
}

function isInternalRoute(route) {
  return ['#admin', '#super', '#orders', '#stock', '#cashier', '#platform'].includes(route);
}

export default function App() {
  installTenantFetchInterceptor();
  const [route, setRoute] = useState(currentRoute);

  useEffect(() => {
    installTenantFetchInterceptor();
    const syncRoute = () => setRoute(currentRoute());
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('hashchange', syncRoute);
    };
  }, []);

  return (
    <Suspense fallback={<main className="app-loading" aria-label="Cargando" />}>
      {route === '#platform' ? <PlatformAdmin /> : isInternalRoute(route) ? <LegacyApp /> : <PublicApp />}
    </Suspense>
  );
}
