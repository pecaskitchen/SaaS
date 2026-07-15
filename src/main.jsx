import React from 'react';
import { createRoot } from 'react-dom/client';
import { installTenantFetchInterceptor } from './lib/apiClient.js';
import App from './App.jsx';

if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    const key = 'saas_chunk_reload_once';
    try {
      if (window.sessionStorage.getItem(key) === '1') return;
      window.sessionStorage.setItem(key, '1');
    } catch {
      // If storage is blocked, reloading once is still the safest recovery.
    }
    window.location.reload();
  });
  window.addEventListener('load', () => {
    try { window.sessionStorage.removeItem('saas_chunk_reload_once'); } catch { /* ignore */ }
  });
}

installTenantFetchInterceptor();

createRoot(document.getElementById('root')).render(
  <App />
);
