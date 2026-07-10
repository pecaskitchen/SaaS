import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const TenantContext = createContext(null);

export function TenantProvider({ children }) {
  const [tenant, setTenant] = useState(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let cancelled = false;
    async function loadTenant() {
      setStatus('loading');
      try {
        const response = await fetch('/api/menu', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || 'No se encontro negocio.');
        if (!cancelled) {
          setTenant(data.tenant || null);
          setStatus('ready');
        }
      } catch (error) {
        if (!cancelled) {
          setTenant(null);
          setStatus(error.message);
        }
      }
    }
    loadTenant();
    return () => { cancelled = true; };
  }, []);

  const value = useMemo(() => ({ tenant, status, ready: status === 'ready' }), [tenant, status]);
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const value = useContext(TenantContext);
  if (!value) throw new Error('useTenant debe usarse dentro de TenantProvider');
  return value;
}
