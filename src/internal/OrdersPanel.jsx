import React, { useEffect, useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import '../styles.css';
import { formatOrderDate } from '../lib/dates.js';
import {
  DEFAULT_BRANCH_SETTINGS,
  activeBranches,
  normalizeBranchSettings,
  selectedBranchFrom,
} from '../lib/business.js';

const currency = (amount) => `$${amount}`;
const ORDERS_PASSWORD_STORAGE_KEY = 'pecas_orders_password';

function Logo() {
  return (
    <div className="brand-area">
      <div className="brand-lockup">
        <div className="brand-logo brand-logo-placeholder">S</div>
        <div>
          <div className="brand-name">Sistema</div>
          <div className="brand-tagline">Operacion</div>
        </div>
      </div>
    </div>
  );
}

const ORDER_STATUS_META = {
  pending: { label: 'Pendiente', next: ['confirmed', 'preparing', 'cancelled'] },
  confirmed: { label: 'Confirmado', next: ['preparing', 'ready', 'cancelled'] },
  preparing: { label: 'En preparación', next: ['ready', 'cancelled'] },
  ready: { label: 'Listo', next: ['delivered', 'cancelled'] },
  delivered: { label: 'Entregado', next: [] },
  cancelled: { label: 'Cancelado', next: [] },
};

const ORDER_STATUS_LABELS = {
  all: 'Todos',
  pending: 'Pendientes',
  confirmed: 'Confirmados',
  preparing: 'En preparación',
  ready: 'Listos',
  delivered: 'Entregados',
  cancelled: 'Cancelados',
};

function minutesSince(value) {
  if (!value) return 0;
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const start = new Date(normalized);
  if (Number.isNaN(start.getTime())) return 0;
  return Math.max(0, Math.round((Date.now() - start.getTime()) / 60000));
}

function formatElapsed(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} h ${rest} min`;
}

function parseOptions(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export default function OrdersPanel() {
  const [password, setPassword] = useState(() => {
    try {
      return window.sessionStorage.getItem(ORDERS_PASSWORD_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [unlocked, setUnlocked] = useState(Boolean(password));
  const [orders, setOrders] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [branchSettings, setBranchSettings] = useState(() => normalizeBranchSettings(DEFAULT_BRANCH_SETTINGS));
  const [branchFilter, setBranchFilter] = useState('all');
  const [ordersAccessScope, setOrdersAccessScope] = useState('legacy');
  const [ordersLockedBranchId, setOrdersLockedBranchId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const fetchOrders = async (nextFilter = statusFilter) => {
    if (!password) {
      setUnlocked(false);
      setStatus('Ingresa la contraseña de pedidos.');
      return;
    }

    setLoading(true);
    setStatus('Cargando pedidos...');

    try {
      const response = await fetch(`/api/orders-dashboard?status=${nextFilter}&limit=100&branch=${encodeURIComponent(branchFilter)}`, {
        headers: { 'x-orders-password': password },
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        setUnlocked(false);
        setStatus(result.error || 'No se pudieron cargar los pedidos.');
        return;
      }

      try {
        window.sessionStorage.setItem(ORDERS_PASSWORD_STORAGE_KEY, password);
      } catch {
        // ignore storage errors
      }

      setUnlocked(true);
      if (result.branchSettings) setBranchSettings(normalizeBranchSettings(result.branchSettings));
      setOrdersAccessScope(result.accessScope || 'legacy');
      setOrdersLockedBranchId(result.lockedBranchId || null);
      if (result.lockedBranchId && branchFilter !== result.lockedBranchId) setBranchFilter(result.lockedBranchId);
      setOrders(result.orders || []);
      setStatus('');
    } catch (error) {
      setStatus(`No se pudieron cargar los pedidos: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (password) fetchOrders(statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (unlocked) fetchOrders(statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchFilter]);

  const changeStatus = async (orderId, nextStatus) => {
    setStatus('Actualizando pedido...');

    try {
      const response = await fetch('/api/orders-dashboard', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-orders-password': password,
        },
        body: JSON.stringify({
          orderId,
          status: nextStatus,
          note: `Cambio manual a ${ORDER_STATUS_META[nextStatus]?.label || nextStatus}`,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        setStatus([result.error || 'No se pudo actualizar el pedido.', result.detail].filter(Boolean).join(' '));
        return;
      }

      await fetchOrders(statusFilter);
    } catch (error) {
      setStatus(`No se pudo actualizar el pedido: ${error.message}`);
    }
  };

  const logout = () => {
    try {
      window.sessionStorage.removeItem(ORDERS_PASSWORD_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
    setPassword('');
    setUnlocked(false);
    setOrders([]);
    setOrdersAccessScope('legacy');
    setOrdersLockedBranchId(null);
  };

  const statusCounts = orders.reduce((acc, order) => {
    acc[order.status] = (acc[order.status] || 0) + 1;
    return acc;
  }, {});

  if (!unlocked) {
    return (
      <main className="orders-page">
        <section className="orders-shell">
          <Logo />
          <h1>Pedidos</h1>
          <p>Consulta la cola de pedidos y cambia el estatus de operación.</p>

          <div className="orders-login">
            <label className="field full">
              <span>Contraseña de pedidos</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña"
              />
            </label>
            <button type="button" className="primary" onClick={() => fetchOrders(statusFilter)}>
              Entrar
            </button>
            {status && <p className="admin-status">{status}</p>}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="orders-page">
      <section className="orders-shell">
        <div className="orders-header">
          <div>
            <Logo />
            <h1>Pedidos</h1>
            <p>Cola de operación, tiempos y estatus.</p>
          </div>
          <div className="orders-header-actions">
            <button type="button" className="ghost" onClick={() => fetchOrders(statusFilter)} disabled={loading}>
              {loading ? 'Cargando...' : 'Actualizar'}
            </button>
            <button type="button" className="ghost danger-text" onClick={logout}>
              Salir
            </button>
          </div>
        </div>

        {branchSettings.multiBranchEnabled && ordersAccessScope !== 'branch' && (
          <label className="field orders-branch-filter">
            <span>Sucursal</span>
            <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
              <option value="all">Todas las sucursales</option>
              {activeBranches(branchSettings).map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </label>
        )}

        {ordersAccessScope === 'branch' && (
          <div className="branch-locked-note">Acceso de sucursal: <b>{selectedBranchFrom(branchSettings, ordersLockedBranchId)?.name}</b></div>
        )}

        <div className="orders-tabs">
          {Object.entries(ORDER_STATUS_LABELS).map(([key, label]) => (
            <button
              type="button"
              key={key}
              className={statusFilter === key ? 'active' : ''}
              onClick={() => {
                setStatusFilter(key);
                fetchOrders(key);
              }}
            >
              {label}
              {key !== 'all' && statusCounts[key] ? <b>{statusCounts[key]}</b> : null}
            </button>
          ))}
        </div>

        {status && <p className="admin-status">{status}</p>}

        <div className="orders-grid">
          {orders.length === 0 ? (
            <div className="empty-cart">
              <ShoppingBag size={32} />
              <p>No hay pedidos en esta vista.</p>
            </div>
          ) : (
            orders.map((order) => {
              const createdMinutes = minutesSince(order.created_at_utc);
              const statusMeta = ORDER_STATUS_META[order.status] || { label: order.status, next: [] };
              return (
                <article className={`order-card status-${order.status}`} key={order.id}>
                  <div className="order-card-top">
                    <div>
                      <strong>{order.order_number}</strong>
                      <span>{formatOrderDate(order.created_at_monterrey)}</span>
                    </div>
                    <div className="order-status">
                      {statusMeta.label}
                    </div>
                  </div>

                  <div className="order-metrics">
                    <span>Tiempo total: <b>{formatElapsed(createdMinutes)}</b></span>
                    <span>Total: <b>{currency(order.total)}</b></span>
                    {order.stock_deducted ? <span>Stock: <b>descontado</b></span> : null}
                    <span>Origen: <b>{order.order_source === 'cashier' ? 'Caja' : 'Online'}</b></span>
                  </div>

                  <div className="order-customer">
                    {order.branch_name ? <p><b>Sucursal:</b> {order.branch_name}</p> : null}
                    {order.order_source === 'cashier' ? <p><b>Caja:</b> {order.cashier_name || 'Cajero'}{order.cashier_shift ? ` · ${order.cashier_shift}` : ''}</p> : null}
                    {order.order_source === 'cashier' ? <p><b>Pago:</b> {order.payment_method || 'No capturado'} · {order.payment_status === 'pending' ? 'Pendiente' : 'Pagado'}</p> : null}
                    <p><b>Cliente:</b> {order.customer_name}</p>
                    <p><b>Dirección:</b> {order.customer_address}</p>
                    {order.customer_notes ? <p><b>Nota:</b> {order.customer_notes}</p> : null}
                  </div>

                  <div className="order-items">
                    {(order.items || []).map((item) => {
                      const options = parseOptions(item.options_json);
                      return (
                        <div className="order-item" key={item.id}>
                          <div>
                            <b>{item.quantity} x {item.product_name}</b>
                            <span>{item.category} · {currency(item.line_total)}</span>
                          </div>
                          {item.item_notes ? <small>{item.item_notes}</small> : null}
                          {options?.details?.length ? (
                            <ul>
                              {options.details.map((detail) => <li key={detail}>{detail}</li>)}
                            </ul>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  <div className="order-events">
                    {(order.events || []).slice(-4).map((event) => (
                      <span key={event.id}>
                        {ORDER_STATUS_META[event.event_type]?.label || event.event_type} · {formatOrderDate(event.created_at_monterrey)}
                      </span>
                    ))}
                  </div>

                  <div className="order-actions">
                    {statusMeta.next.length === 0 ? (
                      <span className="order-final">Sin acciones pendientes</span>
                    ) : (
                      statusMeta.next.map((nextStatus) => (
                        <button
                          type="button"
                          key={nextStatus}
                          className={nextStatus === 'cancelled' ? 'ghost danger-text' : 'primary small'}
                          onClick={() => changeStatus(order.id, nextStatus)}
                        >
                          {ORDER_STATUS_META[nextStatus]?.label || nextStatus}
                        </button>
                      ))
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    </main>
  );
}


