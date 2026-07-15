import React, { useEffect, useState } from 'react';
import { ClipboardList, DollarSign, RefreshCw } from 'lucide-react';
import { apiFetch } from '../lib/apiClient.js';

const money = (value) => `$${Number(value || 0).toLocaleString('es-MX')}`;

export default function InicioPanel() {
  const [today, setToday] = useState(null);
  const [pendingCount, setPendingCount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [executive, orders] = await Promise.all([
        apiFetch('/api/reports/executive?days=1'),
        apiFetch('/api/orders-dashboard?status=pending&limit=100'),
      ]);
      setToday(executive.summary || null);
      setPendingCount((orders.orders || []).length);
    } catch (err) {
      setError(err.message || 'No se pudo cargar el resumen.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <section className="admin-section">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">Resumen</p>
          <h2>Inicio</h2>
          <p>Lo mas importante de hoy, de un vistazo.</p>
        </div>
        <button type="button" className="icon-button" onClick={load} disabled={loading} title="Actualizar">
          <RefreshCw size={18} />
        </button>
      </div>

      {error && <p className="admin-status">{error}</p>}

      <div className="admin-products">
        <div className="admin-product">
          <div className="admin-product-head">
            <strong><ClipboardList size={16} /> Pedidos pendientes</strong>
          </div>
          <p style={{ fontSize: 32, margin: 0, color: 'var(--brown)' }}>
            {pendingCount === null ? '-' : pendingCount}
          </p>
        </div>
        <div className="admin-product">
          <div className="admin-product-head">
            <strong><DollarSign size={16} /> Ventas de hoy</strong>
          </div>
          <p style={{ fontSize: 32, margin: 0, color: 'var(--brown)' }}>
            {today ? money(today.sales) : '-'}
          </p>
          <span>{today ? `${today.orders} pedido(s) - ticket promedio ${money(today.averageTicket)}` : ''}</span>
        </div>
      </div>
    </section>
  );
}
