import React, { useEffect, useState } from 'react';
import { Search, RefreshCw, MapPin, ChevronDown, ChevronUp } from 'lucide-react';
import '../styles.css';
import { apiFetch } from '../lib/apiClient.js';
import { formatOrderDate } from '../lib/dates.js';

const money = (value) => `$${Number(value || 0).toLocaleString('es-MX')}`;

function todayStr() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Monterrey', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function daysAgoStr(n) {
  const d = new Date(`${todayStr()}T12:00:00-06:00`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

const STATUS_LABEL = {
  pending: 'Pendiente', confirmed: 'Confirmado', preparing: 'En prep.',
  ready: 'Listo', delivered: 'Entregado', cancelled: 'Cancelado', canceled: 'Cancelado',
};

function parseJson(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

export default function OrdersHistoryPanel() {
  const [from, setFrom] = useState(daysAgoStr(7));
  const [to, setTo] = useState(todayStr());
  const [q, setQ] = useState('');
  const [orders, setOrders] = useState([]);
  const [totalSales, setTotalSales] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ from, to, limit: '300' });
      if (q.trim()) params.set('q', q.trim());
      const data = await apiFetch(`/api/orders-history?${params.toString()}`);
      setOrders(data.orders || []);
      setTotalSales(data.totalSales || 0);
    } catch (err) {
      setError(err.message || 'No se pudo cargar el historial.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="admin-section">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">Ventas</p>
          <h2>Historial de pedidos</h2>
          <p>Busca cualquier pedido por fecha, número, cliente o colonia y revisa su detalle.</p>
        </div>
        <button type="button" className="icon-button" onClick={load} disabled={loading} title="Actualizar"><RefreshCw size={18} /></button>
      </div>

      <form className="history-filters" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <label className="field"><span>Desde</span><input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="field"><span>Hasta</span><input type="date" value={to} max={todayStr()} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="field grow"><span>Buscar</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="No. de pedido, cliente, teléfono o colonia" /></label>
        <button type="submit" className="primary" disabled={loading}><Search size={16} /> Buscar</button>
      </form>

      {error && <p className="admin-status">{error}</p>}

      <div className="history-summary">
        <span><b>{orders.length}</b> pedido(s)</span>
        <span>Total (sin cancelados): <b>{money(totalSales)}</b></span>
      </div>

      <div className="history-list">
        {orders.length === 0 && !loading ? <p className="empty-cart">No hay pedidos en este rango.</p> : null}
        {orders.map((order) => {
          const open = expandedId === order.id;
          const customFields = parseJson(order.custom_fields_json, []);
          return (
            <article className={`history-row status-${order.status}`} key={order.id}>
              <button type="button" className="history-row-head" onClick={() => setExpandedId(open ? null : order.id)}>
                <div className="history-main">
                  <strong>{order.order_number}</strong>
                  <span>{formatOrderDate(order.created_at_monterrey)}</span>
                </div>
                <div className="history-who">
                  <span>{order.customer_name || 'Cliente'}</span>
                  {order.customer_neighborhood ? <span className="history-colonia"><MapPin size={13} /> {order.customer_neighborhood}</span> : null}
                </div>
                <div className="history-meta">
                  <span className={`history-status s-${order.status}`}>{STATUS_LABEL[order.status] || order.status}</span>
                  <strong>{money(order.total)}</strong>
                  {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </button>
              {open ? (
                <div className="history-detail">
                  <div className="history-detail-cols">
                    <div>
                      <p><b>Cliente:</b> {order.customer_name || '—'}</p>
                      {order.customer_phone ? <p><b>Teléfono:</b> {order.customer_phone}</p> : null}
                      {order.customer_address ? <p><b>Dirección:</b> {order.customer_address}</p> : null}
                      {order.customer_neighborhood ? <p><b>Colonia:</b> {order.customer_neighborhood}</p> : null}
                      {order.customer_notes ? <p><b>Nota:</b> {order.customer_notes}</p> : null}
                      {customFields.map((f) => <p key={f.key || f.label}><b>{f.label}:</b> {f.value}</p>)}
                    </div>
                    <div>
                      <p><b>Origen:</b> {order.order_source === 'cashier' ? `Caja (${order.cashier_name || '—'})` : (order.order_source || 'Online')}</p>
                      {order.branch_name ? <p><b>Sucursal:</b> {order.branch_name}</p> : null}
                      <p><b>Pago:</b> {order.payment_method || '—'}{order.payment_status ? ` · ${order.payment_status === 'pending' ? 'Pendiente' : 'Pagado'}` : ''}</p>
                    </div>
                  </div>
                  <div className="history-items">
                    {(order.items || []).map((item, i) => (
                      <div className="history-item" key={i}>
                        <span>{item.quantity} × {item.product_name}</span>
                        <span>{money(item.line_total)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="history-total"><span>Total</span><strong>{money(order.total)}</strong></div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
