import React, { Suspense, lazy, useEffect, useState } from 'react';

const PublicApp = lazy(() => import('./PublicApp.jsx'));
const LegacyApp = lazy(() => import('./LegacyApp.jsx'));
const PlatformAdmin = lazy(() => import('./platform/PlatformAdmin.jsx'));

function currentRoute() {
  try {
    return window.location.hash || '#';
  } catch {
    return '#';
  }
}

function isInternalRoute(route) {
  return ['#admin', '#super', '#orders', '#stock', '#cashier', '#platform'].includes(route);
}

export default function App() {
  const [route, setRoute] = useState(currentRoute);

  useEffect(() => {
    const syncRoute = () => setRoute(currentRoute());
    window.addEventListener('hashchange', syncRoute);
    return () => window.removeEventListener('hashchange', syncRoute);
  }, []);

  return (
    <Suspense fallback={<main className="app-loading" aria-label="Cargando" />}>
      {route === '#platform' ? <PlatformAdmin /> : isInternalRoute(route) ? <LegacyApp /> : <PublicApp />}
    </Suspense>
  );
}
