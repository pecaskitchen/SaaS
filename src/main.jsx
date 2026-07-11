import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { installTenantFetchInterceptor } from './lib/apiClient.js';

const App = lazy(() => import('./App.jsx'));

installTenantFetchInterceptor();

createRoot(document.getElementById('root')).render(
  <Suspense fallback={<main className="app-loading" aria-label="Cargando" />}>
    <App />
  </Suspense>
);
