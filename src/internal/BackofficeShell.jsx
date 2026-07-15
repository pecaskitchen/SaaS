import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import {
  Home, ShoppingBag, Wallet, UtensilsCrossed, Package, Users, BarChart3, Settings, Shield, LogOut,
} from 'lucide-react';
import '../styles.css';
import './backoffice-shell.css';
import { useAuth } from '../auth/AuthContext.jsx';
import { MODULES, defaultModuleForRole, modulesForRole } from './modules.js';

const InicioPanel = lazy(() => import('./InicioPanel.jsx'));
const OrdersPanel = lazy(() => import('./OrdersPanel.jsx'));
const CashierModule = lazy(() => import('./CashierPanel.jsx'));
const AdminRoute = lazy(() => import('./AdminRoute.jsx'));
const StockPanel = lazy(() => import('./StockPanel.jsx'));
const CrmPanel = lazy(() => import('./CrmPanel.jsx'));
const ExecutiveDashboard = lazy(() => import('./ExecutiveDashboard.jsx'));
const UsersPanel = lazy(() => import('./UsersPanel.jsx'));
const PlatformAdmin = lazy(() => import('../platform/PlatformAdmin.jsx'));

const MODULE_ICONS = {
  inicio: Home,
  pedidos: ShoppingBag,
  caja: Wallet,
  menu: UtensilsCrossed,
  inventario: Package,
  clientes: Users,
  reportes: BarChart3,
  configuracion: Settings,
  plataforma: Shield,
};

function activeModuleIdFromHash() {
  const hash = window.location.hash || '';
  const [, moduleId] = hash.split('/');
  return moduleId || '';
}

function ModuleContent({ moduleId }) {
  if (moduleId === 'inicio') return <InicioPanel />;
  if (moduleId === 'pedidos') return <OrdersPanel />;
  if (moduleId === 'caja') return <CashierModule />;
  if (moduleId === 'menu') return <AdminRoute />;
  if (moduleId === 'inventario') return <StockPanel mode="stock" />;
  if (moduleId === 'clientes') return <CrmPanel />;
  if (moduleId === 'reportes') return <ExecutiveDashboard />;
  if (moduleId === 'configuracion') return <UsersPanel />;
  if (moduleId === 'plataforma') return <PlatformAdmin />;
  return <p>Selecciona un modulo.</p>;
}

export default function BackofficeShell() {
  const { user, loading, logout } = useAuth();
  const [activeModule, setActiveModule] = useState(activeModuleIdFromHash);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      window.location.hash = '#login';
      return;
    }
    const allowed = modulesForRole(user.role);
    if (!activeModule || !allowed.some((module) => module.id === activeModule)) {
      const next = defaultModuleForRole(user.role);
      if (next) window.location.hash = `#panel/${next}`;
    }
  }, [loading, user, activeModule]);

  useEffect(() => {
    const syncHash = () => setActiveModule(activeModuleIdFromHash());
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);

  const visibleModules = useMemo(() => (user ? modulesForRole(user.role) : []), [user]);

  if (loading) {
    return <main className="app-loading" aria-label="Cargando" />;
  }
  if (!user) {
    return <main className="app-loading" aria-label="Redirigiendo a inicio de sesion" />;
  }

  const currentModule = MODULES.find((module) => module.id === activeModule && visibleModules.includes(module));

  return (
    <div className="panel-shell">
      <aside className="panel-sidebar">
        <div className="panel-brand">Panel</div>
        <nav className="panel-nav">
          {visibleModules.map((module) => {
            const Icon = MODULE_ICONS[module.id] || Home;
            return (
              <a
                key={module.id}
                href={`#panel/${module.id}`}
                className={module.id === activeModule ? 'panel-nav-item active' : 'panel-nav-item'}
              >
                <Icon size={18} />
                <span>{module.label}</span>
              </a>
            );
          })}
        </nav>
        <div className="panel-user">
          <div>
            <strong>{user.name}</strong>
            <span>{user.role}</span>
          </div>
          <button type="button" className="ghost small" onClick={() => { logout(); window.location.hash = '#login'; }}>
            <LogOut size={16} /> Salir
          </button>
        </div>
      </aside>
      <main className="panel-content">
        <Suspense fallback={<main className="app-loading" aria-label="Cargando modulo" />}>
          {currentModule ? <ModuleContent moduleId={currentModule.id} /> : <p>No tienes acceso a ningun modulo todavia.</p>}
        </Suspense>
      </main>
    </div>
  );
}
