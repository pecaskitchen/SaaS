import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import {
  Home, ShoppingBag, Wallet, UtensilsCrossed, Package, Users, BarChart3, Shield, LogOut, Store, Building2, PlugZap, UserCog, BookOpen, CreditCard, Receipt,
} from 'lucide-react';
import '../styles.css';
import './backoffice-shell.css';
import { useAuth } from '../auth/AuthContext.jsx';
import { defaultModuleForRole, modulesForRole } from './modules.js';

const InicioPanel = lazy(() => import('./InicioPanel.jsx'));
const OrdersPanel = lazy(() => import('./OrdersPanel.jsx'));
const CashierModule = lazy(() => import('./CashierPanel.jsx'));
const ReceivablesPanel = lazy(() => import('./ReceivablesPanel.jsx'));
const AdminRoute = lazy(() => import('./AdminRoute.jsx'));
const StockPanel = lazy(() => import('./StockPanel.jsx'));
const RecipesPanel = lazy(() => import('./RecipesPanel.jsx'));
const CrmPanel = lazy(() => import('./CrmPanel.jsx'));
const ExecutiveDashboard = lazy(() => import('./ExecutiveDashboard.jsx'));
const ReportDownloadsPanel = lazy(() => import('./ReportDownloadsPanel.jsx'));
const OrdersHistoryPanel = lazy(() => import('./OrdersHistoryPanel.jsx'));
const PublicPagePanel = lazy(() => import('./PublicPagePanel.jsx'));
const BusinessSettingsPanel = lazy(() => import('./BusinessSettingsPanel.jsx'));
const IntegrationsPanel = lazy(() => import('./IntegrationsPanel.jsx'));
const UsersPanel = lazy(() => import('./UsersPanel.jsx'));
const PlatformAdmin = lazy(() => import('../platform/PlatformAdmin.jsx'));

const MODULE_ICONS = {
  inicio: Home,
  pedidos: ShoppingBag,
  caja: Wallet,
  cobranza: CreditCard,
  menu: UtensilsCrossed,
  inventario: Package,
  recetas: BookOpen,
  clientes: Users,
  reportes: BarChart3,
  historial: Receipt,
  'pagina-publica': Store,
  negocio: Building2,
  integraciones: PlugZap,
  usuarios: UserCog,
  plataforma: Shield,
};

function activeModuleIdFromHash() {
  const hash = window.location.hash || '';
  const [, moduleId] = hash.split('/');
  const aliases = { configuracion: 'usuarios' };
  return aliases[moduleId] || moduleId || '';
}

function ModuleContent({ moduleId }) {
  if (moduleId === 'inicio') return <InicioPanel />;
  if (moduleId === 'pedidos') return <OrdersPanel />;
  if (moduleId === 'caja') return <CashierModule />;
  if (moduleId === 'cobranza') return <ReceivablesPanel />;
  if (moduleId === 'menu') return <AdminRoute view="menu" />;
  if (moduleId === 'inventario') return <StockPanel mode="stock" />;
  if (moduleId === 'recetas') return <RecipesPanel />;
  if (moduleId === 'clientes') return <CrmPanel />;
  if (moduleId === 'reportes') {
    return (
      <>
        <ExecutiveDashboard />
        <ReportDownloadsPanel />
      </>
    );
  }
  if (moduleId === 'historial') return <OrdersHistoryPanel />;
  if (moduleId === 'pagina-publica') return <PublicPagePanel />;
  if (moduleId === 'negocio') return <BusinessSettingsPanel />;
  if (moduleId === 'integraciones') return <IntegrationsPanel />;
  if (moduleId === 'usuarios') return <UsersPanel />;
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
    const settings = user.tenant?.settings || {};
    const allowed = modulesForRole(user.role, settings);
    if (!activeModule || !allowed.some((module) => module.id === activeModule)) {
      const next = defaultModuleForRole(user.role, settings);
      if (next) window.location.hash = `#panel/${next}`;
    }
  }, [loading, user, activeModule]);

  useEffect(() => {
    const syncHash = () => setActiveModule(activeModuleIdFromHash());
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);

  const visibleModules = useMemo(() => (user ? modulesForRole(user.role, user.tenant?.settings || {}) : []), [user]);

  if (loading) {
    return <main className="app-loading" aria-label="Cargando" />;
  }
  if (!user) {
    return <main className="app-loading" aria-label="Redirigiendo a inicio de sesion" />;
  }

  const currentModule = visibleModules.find((module) => module.id === activeModule);

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
