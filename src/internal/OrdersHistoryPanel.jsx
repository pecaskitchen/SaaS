import React, { useEffect, useState } from 'react';
import { Search, RefreshCw, MapPin, ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react';
import '../styles.css';
import { apiFetch } from '../lib/apiClient.js';
import { formatOrderDate } from '../lib/dates.js';
import { useAuth } from '../auth/AuthContext.jsx';

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
  const { user } = useAuth();
  const canManage = ['admin', 'manager', 'platform_admin'].includes(user?.role);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [busy, setBusy] = useState(false);

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

  const startEdit = (order) => {
    setExpandedId(order.id);
    setEditingId(order.id);
    setEditForm({
      customerName: order.customer_name || '',
      customerPhone: order.customer_phone || '',
      customerAddress: order.customer_address || '',
      customerNeighborhood: order.customer_neighborhood || '',
      customerNotes: order.customer_notes || '',
      paymentMethod: order.payment_method || '',
      paymentStatus: order.payment_status || '',
    });
  };
  const cancelEdit = () => { setEditingId(null); setEditForm(null); };
  const setF = (key, value) => setEditForm((f) => ({ ...f, [key]: value }));

  const saveEdit = async (order) => {
    if (!String(editForm?.customerName || '').trim()) { setError('El pedido necesita nombre de cliente.'); return; }
    setBusy(true);
    setError('');
    try {
      await apiFetch('/api/orders-dashboard', {
        method: 'PATCH',
        body: JSON.stringify({
          orderId: order.id,
          action: 'edit',
          note: `Pedido ${order.order_number || order.id} editado desde Ventas.`,
          order: {
            customerName: editForm.customerName,
            customerPhone: editForm.customerPhone,
            customerAddress: editForm.customerAddress,
            customerNeighborhood: editForm.customerNeighborhood,
            customerNotes: editForm.customerNotes,
            paymentMethod: editForm.paymentMethod,
            paymentStatus: editForm.paymentStatus,
          },
        }),
      });
      cancelEdit();
      await load();
    } catch (err) {
      setError(err.message || 'No se pudo guardar el pedido.');
    } finally {
      setBusy(false);
    }
  };

  const deleteOrder = async (order) => {
    if (!window.confirm(`¿Eliminar el pedido ${order.order_number || order.id}? Dejará de contar en ventas y reportes.`)) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch('/api/orders-dashboard', {
        method: 'PATCH',
        body: JSON.stringify({ orderId: order.id, action: 'delete', note: `Pedido ${order.order_number || order.id} eliminado desde Ventas.` }),
      });
      await load();
    } catch (err) {
      setError(err.message || 'No se pudo eliminar el pedido.');
    } finally {
      setBusy(false);
    }
  };

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
              {open && editingId === order.id ? (
                <div className="history-detail">
                  <div className="history-edit-grid">
                    <label className="field"><span>Nombre</span><input value={editForm.customerName} onChange={(e) => setF('customerName', e.target.value)} /></label>
                    <label className="field"><span>Teléfono</span><input value={editForm.customerPhone} onChange={(e) => setF('customerPhone', e.target.value)} /></label>
                    <label className="field full"><span>Dirección</span><input value={editForm.customerAddress} onChange={(e) => setF('customerAddress', e.target.value)} /></label>
                    <label className="field"><span>Colonia</span><input value={editForm.customerNeighborhood} onChange={(e) => setF('customerNeighborhood', e.target.value)} /></label>
                    <label className="field"><span>Forma de pago</span><input value={editForm.paymentMethod} onChange={(e) => setF('paymentMethod', e.target.value)} /></label>
                    <label className="field"><span>Estado de pago</span>
                      <select value={editForm.paymentStatus} onChange={(e) => setF('paymentStatus', e.target.value)}>
                        <option value="paid">Pagado</option>
                        <option value="pending">Pendiente</option>
                      </select>
                    </label>
                    <label className="field full"><span>Nota</span><textarea rows="2" value={editForm.customerNotes} onChange={(e) => setF('customerNotes', e.target.value)} /></label>
                  </div>
                  <p className="admin-hint">Los productos y el total se editan desde la pestaña Pedidos (mientras el pedido está en la cola del día).</p>
                  <div className="history-actions">
                    <button type="button" className="primary" onClick={() => saveEdit(order)} disabled={busy}>Guardar</button>
                    <button type="button" className="ghost small" onClick={cancelEdit} disabled={busy}>Cancelar</button>
                  </div>
                </div>
              ) : open ? (
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
                  {canManage ? (
                    <div className="history-actions">
                      <button type="button" className="ghost small" onClick={() => startEdit(order)} disabled={busy}><Pencil size={14} /> Editar</button>
                      <button type="button" className="ghost small danger-text" onClick={() => deleteOrder(order)} disabled={busy}><Trash2 size={14} /> Eliminar</button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
