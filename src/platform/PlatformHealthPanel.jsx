import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, Search } from 'lucide-react';

const STATUS_LABEL = {
  healthy: 'Saludable',
  attention: 'Revisar',
  setup_needed: 'Falta configurar',
};

function classNameFor(status) {
  if (status === 'healthy') return 'status-pill success';
  if (status === 'setup_needed') return 'status-pill warning';
  return 'status-pill danger';
}

function HealthIcon({ status }) {
  if (status === 'healthy') return <CheckCircle2 size={16} />;
  if (status === 'setup_needed') return <AlertTriangle size={16} />;
  return <Activity size={16} />;
}

function platformToken() {
  try {
    return window.sessionStorage.getItem('platform_admin_token') || '';
  } catch {
    return '';
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
  if (!response.ok || data.ok === false) throw new Error(data.detail || data.error || 'Error de plataforma.');
  return data;
}

export default function PlatformHealthPanel() {
  const [tenants, setTenants] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await platformFetch('/api/platform/health');
      setTenants(data.tenants || []);
    } catch (err) {
      setError(err.message || 'No se pudo cargar salud.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const clean = query.trim().toLowerCase();
    if (!clean) return tenants;
    return tenants.filter((tenant) => [tenant.name, tenant.slug, tenant.domain, tenant.plan, tenant.health]
      .some((value) => String(value || '').toLowerCase().includes(clean)));
  }, [query, tenants]);

  return (
    <section className="admin-section">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">Operacion</p>
          <h2>Salud de clientes</h2>
        </div>
        <button type="button" className="icon-button" onClick={load} disabled={loading} title="Actualizar">
          <RefreshCw size={18} />
        </button>
      </div>

      <label className="search-field">
        <Search size={16} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente" />
      </label>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="health-grid">
        {filtered.map((tenant) => (
          <article className="health-card" key={tenant.id}>
            <header>
              <div>
                <strong>{tenant.brand?.displayName || tenant.name}</strong>
                <span>{tenant.slug} - {tenant.plan}</span>
              </div>
              <span className={classNameFor(tenant.health)}>
                <HealthIcon status={tenant.health} />
                {STATUS_LABEL[tenant.health] || tenant.health}
              </span>
            </header>

            <div className="health-metrics">
              <span><b>{tenant.signals?.menuProducts || 0}</b> productos</span>
              <span><b>{tenant.signals?.ordersToday || 0}</b> pedidos 24h</span>
              <span><b>{tenant.signals?.unconfirmedOrders || 0}</b> pendientes</span>
              <span><b>{tenant.signals?.lowStock || 0}</b> stock bajo</span>
            </div>

            <footer>
              <span>{tenant.signals?.paymentConnected ? 'Pagos conectados' : 'Sin pagos'}</span>
              <span>{tenant.signals?.whatsappConnected ? 'WhatsApp conectado' : 'Sin WhatsApp'}</span>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}
