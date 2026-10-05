import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import { apiFetch } from '../lib/apiClient.js';

const money = (value) => `$${Number(value || 0).toLocaleString('es-MX')}`;

export default function ExecutiveDashboard() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load(nextDays = days) {
    setLoading(true);
    setError('');
    try {
      const result = await apiFetch(`/api/reports/executive?days=${nextDays}`);
      setData(result);
    } catch (err) {
      setError(err.message || 'No se pudo cargar dashboard.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(days); }, []);

  const maxSales = useMemo(() => Math.max(...(data?.salesByDay || []).map((row) => Number(row.sales || 0)), 1), [data]);

  return (
    <section className="admin-section">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">Metricas</p>
          <h2>Dashboard ejecutivo</h2>
        </div>
        <div className="button-row">
          {[7, 30, 90].map((option) => (
            <button
              type="button"
              className={days === option ? 'primary small' : 'ghost small'}
              key={option}
              onClick={() => { setDays(option); load(option); }}
            >
              {option} dias
            </button>
          ))}
          <button type="button" className="icon-button" onClick={() => load(days)} disabled={loading} title="Actualizar">
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="metric-grid">
        <article><span>Ventas</span><strong>{money(data?.summary?.sales)}</strong></article>
        <article><span>Pedidos</span><strong>{data?.summary?.orders || 0}</strong></article>
        <article><span>Ticket promedio</span><strong>{money(data?.summary?.averageTicket)}</strong></article>
        <article><span>Cancelados</span><strong>{data?.summary?.cancelled || 0}</strong></article>
      </div>

      <div className="dashboard-layout">
        <section className="panel-block">
          <h3><BarChart3 size={18} /> Ventas por dia</h3>
          <div className="mini-bars">
            {(data?.salesByDay || []).map((row) => (
              <div className="mini-bar-row" key={row.day}>
                <span>{row.day}</span>
                <div><i style={{ width: `${(Number(row.sales || 0) / maxSales) * 100}%` }} /></div>
                <b>{money(row.sales)}</b>
              </div>
            ))}
          </div>
        </section>

        <section className="panel-block">
          <h3>Productos top</h3>
          <table className="simple-table">
            <tbody>
              {(data?.topProducts || []).map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>{row.quantity}</td>
                  <td>{money(row.sales)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel-block">
          <h3>Metodos de pago</h3>
          {(data?.paymentMethods || []).map((row) => (
            <p className="split-line" key={row.name}><span>{row.name}</span><b>{money(row.sales)}</b></p>
          ))}
        </section>

        <section className="panel-block">
          <h3>Origen del pedido</h3>
          {(data?.orderSources || []).map((row) => (
            <p className="split-line" key={row.name}><span>{row.name}</span><b>{row.orders}</b></p>
          ))}
        </section>
      </div>
    </section>
  );
}

