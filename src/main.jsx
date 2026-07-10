import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';

const App = lazy(() => import('./App.jsx'));

createRoot(document.getElementById('root')).render(
  <Suspense fallback={<main className="app-loading" aria-label="Cargando" />}>
    <App />
  </Suspense>
);
