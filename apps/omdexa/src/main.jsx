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

if (typeof window !== 'undefined') {
  const report = (event, data) => {
    const body = JSON.stringify({ event, path: window.location.pathname, data });
    try { navigator.sendBeacon('/api/telemetry', new Blob([body], { type: 'application/json' })); } catch { /* telemetry never blocks the app */ }
  };
  window.addEventListener('error', (event) => report('client_error', { message: String(event.message || 'Error').slice(0, 300) }));
  window.addEventListener('unhandledrejection', (event) => report('client_error', { message: String(event.reason?.message || event.reason || 'Promise error').slice(0, 300) }));
  if (Math.random() < 0.05 && 'PerformanceObserver' in window) {
    let lcp = 0;
    let cls = 0;
    try { new PerformanceObserver((list) => { const last = list.getEntries().at(-1); if (last) lcp = Math.round(last.startTime); }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch { /* unsupported */ }
    try { new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) cls += entry.value; }).observe({ type: 'layout-shift', buffered: true }); } catch { /* unsupported */ }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'hidden') return;
      const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0;
      report('web_vitals', { lcp, cls: Number(cls.toFixed(4)), fcp: Math.round(fcp) });
    }, { once: true });
  }
}

createRoot(document.getElementById('root')).render(
  <App />
);
