import React, { useEffect, useMemo, useState } from 'react';
import { Building2, RefreshCw, Save, Shield, WalletCards } from 'lucide-react';
import '../styles.css';

const emptyBusiness = {
  id: '',
  name: '',
  slug: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  plan: 'starter',
  status: 'trial',
  monthlyPriceCents: 99000,
  domain: '',
  subdomain: '',
  whatsappNumber: '',
  notes: '',
};

function platformToken() {
  try {
    return window.sessionStorage.getItem('platform_admin_token') || '';
  } catch {
    return '';
  }
}

function setPlatformToken(token) {
  try {
    if (token) window.sessionStorage.setItem('platform_admin_token', token);
    else window.sessionStorage.removeItem('platform_admin_token');
  } catch {
    // ignore storage errors
  }
}

async function platformFetch(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-platform-admin-token': platformToken(),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    const error = new Error(data.error || 'No autorizado como admin de plataforma.');
    error.status = 401;
    throw error;
  }
  if (!response.ok || data.ok === false) throw new Error(data.detail || data.error || 'Error de plataforma.');
  return data;
}

function moneyFromCents(value) {
  return `$${(Number(value || 0) / 100).toLocaleString('es-MX', { minimumFractionDigits: 0 })}`;
}

function StatusBadge({ status }) {
  return <span className={`platform-badge status-${status}`}>{status}</span>;
}

export default function PlatformAdmin() {
  const [businesses, setBusinesses] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [draft, setDraft] = useState(emptyBusiness);
  const [password, setPassword] = useState('');
  const [authorized, setAuthorized] = useState(() => Boolean(platformToken()));
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const activeCount = useMemo(() => businesses.filter((business) => business.status === 'active').length, [businesses]);
  const trialCount = useMemo(() => businesses.filter((business) => business.status === 'trial').length, [businesses]);
  const pastDueCount = useMemo(() => businesses.filter((business) => business.status === 'past_due').length, [businesses]);
  const monthlyPotential = useMemo(() => businesses.reduce((sum, business) => {
    const price = business.monthlyPriceCents || 0;
    return business.status === 'active' ? sum + Number(price || 0) : sum;
  }, 0), [businesses]);

  const loadAll = async () => {
    if (!platformToken()) {
      setAuthorized(false);
      setStatus('');
      return;
    }
    setLoading(true);
    setStatus('Cargando negocios...');
    try {
      const [businessData, dashboardData] = await Promise.all([
        platformFetch('/api/platform/businesses'),
        platformFetch('/api/platform/dashboard'),
      ]);
      setBusinesses(businessData.businesses || []);
      setDashboard(dashboardData);
      setAuthorized(true);
      setStatus('');
    } catch (error) {
      if (error.status === 401) {
        setPlatformToken('');
        setAuthorized(false);
      }
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const loginPlatform = async () => {
    const cleanPassword = password.trim();
    if (!cleanPassword) {
      setStatus('Ingresa la contraseña de plataforma.');
      return;
    }
    setLoading(true);
    setStatus('Validando acceso...');
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: cleanPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false || data.role !== 'platform_admin' || !data.sessionToken) {
        throw new Error(data.error || 'Contraseña de plataforma inválida.');
      }
      setPlatformToken(data.sessionToken);
      setPassword('');
      setAuthorized(true);
      await loadAll();
    } catch (error) {
      setPlatformToken('');
      setAuthorized(false);
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  };

  const logoutPlatform = () => {
    setPlatformToken('');
    setAuthorized(false);
    setBusinesses([]);
    setDashboard(null);
    setStatus('');
  };

  const updateDraft = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const editBusiness = (business) => {
    setDraft({
      ...emptyBusiness,
      id: business.id,
      name: business.name || '',
      slug: business.slug || '',
      contactName: business.contactName || '',
      contactEmail: business.contactEmail || '',
      contactPhone: business.contactPhone || '',
      plan: business.plan || 'starter',
      status: business.status || 'trial',
      monthlyPriceCents: Number(business.monthlyPriceCents || 0),
      domain: business.domain || '',
      subdomain: business.subdomain || '',
      whatsappNumber: business.settings?.whatsappNumber || '',
      notes: business.notes || '',
    });
    setStatus(`Editando ${business.name}`);
  };

  const clearDraft = () => {
    setDraft(emptyBusiness);
    setStatus('');
  };

  const saveBusiness = async () => {
    if (!draft.name.trim()) {
      setStatus('Escribe el nombre del negocio.');
      return;
    }
    setLoading(true);
    setStatus(draft.id ? 'Guardando negocio...' : 'Creando negocio...');
    try {
      await platformFetch('/api/platform/businesses', {
        method: draft.id ? 'PATCH' : 'POST',
        body: JSON.stringify(draft),
      });
      setDraft(emptyBusiness);
      await loadAll();
      setStatus(draft.id ? 'Negocio actualizado.' : 'Negocio creado.');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  };

  const updateBusinessStatus = async (business, nextStatus) => {
    setLoading(true);
    setStatus('Actualizando negocio...');
    try {
      await platformFetch('/api/platform/businesses', {
        method: 'PATCH',
        body: JSON.stringify({ id: business.id, status: nextStatus }),
      });
      await loadAll();
      setStatus('Negocio actualizado.');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!authorized) {
    return (
      <main className="platform-page">
        <section className="platform-shell">
          <form className="platform-panel" onSubmit={(event) => { event.preventDefault(); loginPlatform(); }}>
            <span className="eyebrow"><Shield size={14} /> Admin global</span>
            <h1>Acceso de plataforma</h1>
            <label className="field">
              <span>Contraseña</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Contraseña de plataforma"
                autoFocus
              />
            </label>
            <button type="submit" className="primary" disabled={loading}>
              <Shield size={16} /> Entrar
            </button>
            {status && <p className="admin-status">{status}</p>}
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="platform-page">
      <section className="platform-shell">
        <header className="platform-header">
          <div>
            <span className="eyebrow"><Shield size={14} /> Admin global</span>
            <h1>Negocios y soporte mensual</h1>
            <p>Controla clientes, planes, estado de cuenta y acceso operativo desde una sola vista.</p>
          </div>
          <button type="button" className="ghost" onClick={loadAll} disabled={loading}>
            <RefreshCw size={16} /> Actualizar
          </button>
          <button type="button" className="ghost" onClick={logoutPlatform} disabled={loading}>
            Salir
          </button>
        </header>

        <section className="platform-metrics">
          <article>
            <Building2 size={18} />
            <span>Negocios</span>
            <strong>{businesses.length}</strong>
          </article>
          <article>
            <Shield size={18} />
            <span>Activos</span>
            <strong>{activeCount}</strong>
          </article>
          <article>
            <WalletCards size={18} />
            <span>Trial</span>
            <strong>{trialCount}</strong>
          </article>
          <article>
            <WalletCards size={18} />
            <span>Pago pendiente</span>
            <strong>{pastDueCount}</strong>
          </article>
          <article>
            <WalletCards size={18} />
            <span>Mensual activo</span>
            <strong>{moneyFromCents(monthlyPotential)}</strong>
          </article>
        </section>

        <section className="platform-grid">
          <form className="platform-panel" onSubmit={(event) => { event.preventDefault(); saveBusiness(); }}>
            <h2>{draft.id ? 'Editar negocio' : 'Nuevo negocio'}</h2>
            <div className="admin-promo-grid">
              <label className="field"><span>Nombre</span><input value={draft.name} onChange={(e) => updateDraft('name', e.target.value)} placeholder="Cafetería Luna" /></label>
              <label className="field"><span>Slug</span><input value={draft.slug} onChange={(e) => updateDraft('slug', e.target.value)} placeholder="cafeteria-luna" /></label>
              <label className="field"><span>Contacto</span><input value={draft.contactName} onChange={(e) => updateDraft('contactName', e.target.value)} placeholder="Nombre del dueño" /></label>
              <label className="field"><span>Email</span><input value={draft.contactEmail} onChange={(e) => updateDraft('contactEmail', e.target.value)} placeholder="correo@negocio.com" /></label>
              <label className="field"><span>Teléfono</span><input value={draft.contactPhone} onChange={(e) => updateDraft('contactPhone', e.target.value)} placeholder="8112345678" /></label>
              <label className="field"><span>WhatsApp pedidos</span><input value={draft.whatsappNumber} onChange={(e) => updateDraft('whatsappNumber', e.target.value)} placeholder="5281..." /></label>
              <label className="field"><span>Plan</span><select value={draft.plan} onChange={(e) => updateDraft('plan', e.target.value)}><option value="starter">Starter</option><option value="growth">Growth</option><option value="pro">Pro</option></select></label>
              <label className="field"><span>Estado</span><select value={draft.status} onChange={(e) => updateDraft('status', e.target.value)}><option value="trial">Trial</option><option value="active">Activo</option><option value="past_due">Pago pendiente</option><option value="paused">Pausado</option></select></label>
              <label className="field"><span>Precio mensual</span><input type="number" value={draft.monthlyPriceCents / 100} onChange={(e) => updateDraft('monthlyPriceCents', Number(e.target.value || 0) * 100)} /></label>
              <label className="field"><span>Dominio</span><input value={draft.domain} onChange={(e) => updateDraft('domain', e.target.value)} placeholder="negocio.mx" /></label>
              <label className="field"><span>Subdominio</span><input value={draft.subdomain} onChange={(e) => updateDraft('subdomain', e.target.value)} placeholder="filians" /></label>
              <label className="field full"><span>Notas internas</span><textarea value={draft.notes} onChange={(e) => updateDraft('notes', e.target.value)} placeholder="Pendientes, acuerdos, soporte..." /></label>
            </div>
            <div className="inline-actions">
              <button type="submit" className="primary" disabled={loading}><Save size={16} /> {draft.id ? 'Guardar cambios' : 'Crear negocio'}</button>
              {draft.id ? <button type="button" className="ghost small" onClick={clearDraft} disabled={loading}>Cancelar</button> : null}
            </div>
            {status && <p className="admin-status">{status}</p>}
          </form>

          <section className="platform-panel">
            <h2>Clientes</h2>
            <div className="platform-business-list">
              {businesses.length === 0 ? (
                <p className="empty-cart">Aún no hay negocios registrados.</p>
              ) : businesses.map((business) => (
                <article className="platform-business" key={business.id}>
                  <div>
                    <strong>{business.name}</strong>
                    <span>{business.slug} · {business.plan} · {business.contactName || 'Sin contacto'}</span>
                  </div>
                  <div className="platform-business-meta">
                    <StatusBadge status={business.status} />
                    <span>{business.domain || `${business.subdomain || business.slug}.tuapp.mx`}</span>
                  </div>
                  <div className="inline-actions">
                    <button type="button" className="ghost small" onClick={() => editBusiness(business)}>Editar</button>
                    <button type="button" className="ghost small" onClick={() => updateBusinessStatus(business, 'active')}>Activar</button>
                    <button type="button" className="ghost small" onClick={() => updateBusinessStatus(business, 'past_due')}>Pago pendiente</button>
                    <button type="button" className="ghost small danger-text" onClick={() => updateBusinessStatus(business, 'paused')}>Pausar</button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </section>

        {dashboard?.recentAudit?.length ? (
          <section className="platform-panel">
            <h2>Actividad reciente</h2>
            <div className="audit-list">
              {dashboard.recentAudit.map((event) => (
                <span key={event.id}>{event.created_at_utc} · {event.action} · {event.entity_id || event.tenant_id || 'plataforma'}</span>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
