import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch, getSessionToken, setSessionToken } from '../lib/apiClient.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Al recargar la página el token sigue en sessionStorage, pero el
    // estado de React se pierde -- se recupera el usuario con /api/auth/me
    // antes de decidir si el shell nuevo redirige a #login o no.
    let cancelled = false;
    async function restore() {
      if (!getSessionToken()) {
        setLoading(false);
        return;
      }
      try {
        const data = await apiFetch('/api/auth/me');
        if (!cancelled) setUser(data.user);
      } catch {
        if (!cancelled) setSessionToken('');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    restore();
    return () => { cancelled = true; };
  }, []);

  async function login(email, password) {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setSessionToken(data.token);
    setUser(data.user);
    return data.user;
  }

  async function logout() {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // aunque falle la llamada, igual se limpia la sesión local
    }
    setSessionToken('');
    setUser(null);
  }

  const value = useMemo(() => ({ user, login, logout, loading, authenticated: Boolean(user) }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return value;
}

export function RequireRole({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return <main className="app-loading" aria-label="Cargando" />;
  if (!user) return <main className="app-loading" aria-label="Inicia sesion" />;
  if (!roles.includes(user.role)) return <main className="app-loading" aria-label="Sin permiso" />;
  return children;
}
