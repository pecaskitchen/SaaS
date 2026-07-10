import React, { createContext, useContext, useMemo, useState } from 'react';
import { apiFetch, setSessionToken } from '../lib/apiClient.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  async function login(email, password) {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setSessionToken(data.token);
    setUser(data.user);
    return data.user;
  }

  function logout() {
    setSessionToken('');
    setUser(null);
  }

  const value = useMemo(() => ({ user, login, logout, authenticated: Boolean(user) }), [user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return value;
}

export function RequireRole({ roles, children }) {
  const { user } = useAuth();
  if (!user) return <main className="app-loading" aria-label="Inicia sesion" />;
  if (!roles.includes(user.role)) return <main className="app-loading" aria-label="Sin permiso" />;
  return children;
}
