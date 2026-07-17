import React, { useEffect, useState } from 'react';
import { ClipboardList, DollarSign, RefreshCw } from 'lucide-react';
import { apiFetch } from '../lib/apiClient.js';

const money = (value) => `$${Number(value || 0).toLocaleString('es-MX')}`;

export default function InicioPanel() {
  const [today, setToday] = useState(null);
  const [week, setWeek] = useState(null);
  const [month, setMonth] = useState(null);
  const [pendingCount, setPendingCount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      // Primero pedidos: de ahi sale el corte de semana/mes que el negocio
      // configuro (en branchSettings), para pedirle a executive los totales
      // con ese corte.
      const orders = await apiFetch('/api/orders-dashboard?status=pending&limit=100');
      const bs = orders.branchSettings || {};
      const weekStartDay = Number.isInteger(bs.salesWeekStartDay) ? bs.salesWeekStartDay : 1;
      const monthStartDay = Number.isInteger(bs.salesMonthStartDay) ? bs.salesMonthStartDay : 1;
      const executive = await apiFetch(`/api/reports/executive?days=1&weekStartDay=${weekStartDay}&monthStartDay=${monthStartDay}`);
      // "Ventas de hoy" usa el metrico today (dia natural de Monterrey, sin
      // cancelados), no summary (ventana de 24h UTC que arrastraba ayer).
      setToday(executive.today || executive.summary || null);
      setWeek(executive.week || null);
      setMonth(executive.month || null);
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
          <span>{today ? `${today.orders} pedido(s)` : ''}</span>
        </div>
        <div className="admin-product">
          <div className="admin-product-head">
            <strong><DollarSign size={16} /> Ventas de la semana</strong>
          </div>
          <p style={{ fontSize: 32, margin: 0, color: 'var(--brown)' }}>
            {week ? money(week.sales) : '-'}
          </p>
          <span>{week ? `${week.orders} pedido(s) - desde ${week.start}` : ''}</span>
        </div>
        <div className="admin-product">
          <div className="admin-product-head">
            <strong><DollarSign size={16} /> Ventas del mes</strong>
          </div>
          <p style={{ fontSize: 32, margin: 0, color: 'var(--brown)' }}>
            {month ? money(month.sales) : '-'}
          </p>
          <span>{month ? `${month.orders} pedido(s) - desde ${month.start}` : ''}</span>
        </div>
      </div>
    </section>
  );
}
