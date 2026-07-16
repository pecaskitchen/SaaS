import React, { useEffect, useRef, useState } from 'react';
import { Archive, Bell, BellOff, Columns3, List, ShoppingBag, Trash2 } from 'lucide-react';
import '../styles.css';
import { formatOrderDate } from '../lib/dates.js';
import {
  DEFAULT_BRANCH_SETTINGS,
  activeBranches,
  normalizeBranchSettings,
  selectedBranchFrom,
} from '../lib/business.js';
import { getSessionToken } from '../lib/apiClient.js';

const currency = (amount) => `$${amount}`;
// Si hay sesión de personal (login por email/password), se manda como
// Bearer y el backend la prioriza sobre el PIN de sucursal (ver
// auditoria-saas-multitenant.md). El PIN sigue funcionando igual para
// quien no tiene cuenta propia.
function authHeaders() {
  const token = getSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

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

// Columnas fijas del flujo activo. "ready" es necesaria para poder avanzar
// un pedido a Entregado desde el tablero; delivered/cancelled se agregan
// dinamicamente solo si hay pedidos cargados en esos estados, para que
// ningun pedido devuelto por el filtro quede invisible en la vista Kanban.
const KANBAN_BASE_COLUMNS = ['pending', 'confirmed', 'preparing', 'ready'];
const KANBAN_EXTRA_COLUMNS = ['delivered', 'cancelled'];

function kanbanColumnsFor(orders) {
  const extras = KANBAN_EXTRA_COLUMNS.filter((columnStatus) => orders.some((order) => order.status === columnStatus));
  return [...KANBAN_BASE_COLUMNS, ...extras];
}

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
  // Se retiro el login por PIN: solo cuenta la sesion de cuenta (JWT).
  const [unlocked, setUnlocked] = useState(Boolean(getSessionToken()));
  const [orders, setOrders] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [branchSettings, setBranchSettings] = useState(() => normalizeBranchSettings(DEFAULT_BRANCH_SETTINGS));
  const [branchFilter, setBranchFilter] = useState('all');
  const [ordersAccessScope, setOrdersAccessScope] = useState('legacy');
  const [ordersLockedBranchId, setOrdersLockedBranchId] = useState(null);
  const [canArchive, setCanArchive] = useState(false);
  const [viewMode, setViewMode] = useState('list');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  // Avisos de pedido nuevo: sonido + notificacion del navegador + resaltado.
  const [alertsOn, setAlertsOn] = useState(false);
  const [newOrderPulse, setNewOrderPulse] = useState(0);
  const knownOrderIds = useRef(null); // null = todavia no cargo la primera vez
  const audioCtxRef = useRef(null);
  const alertsOnRef = useRef(false);
  alertsOnRef.current = alertsOn;

  const playBeep = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtxRef.current) audioCtxRef.current = new AudioCtx();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      // Dos tonos cortos, tipo "ding-dong", para que se escuche en cocina.
      [880, 1175].forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const start = ctx.currentTime + index * 0.18;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.4, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.18);
      });
    } catch {
      // Si el audio esta bloqueado, el resaltado visual sigue avisando.
    }
  };

  const notifyNewOrders = (newOrders) => {
    playBeep();
    setNewOrderPulse(Date.now());
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        const count = newOrders.length;
        const first = newOrders[0];
        new Notification(count > 1 ? `${count} pedidos nuevos` : 'Nuevo pedido', {
          body: first ? `${first.order_number || ''} · ${first.customer_name || 'Cliente'} · ${currency(first.total)}` : 'Tienes un pedido nuevo.',
          tag: 'nuevo-pedido',
          renotify: true,
        });
      }
    } catch {
      // La notificacion es best-effort; el sonido y el resaltado ya avisaron.
    }
  };

  const enableAlerts = async () => {
    // Requiere gesto del usuario: desbloquea el audio y pide permiso de aviso.
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx && !audioCtxRef.current) audioCtxRef.current = new AudioCtx();
      if (audioCtxRef.current?.state === 'suspended') await audioCtxRef.current.resume();
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
      }
    } catch {
      // aun sin permiso de notificacion, el sonido + resaltado funcionan
    }
    setAlertsOn(true);
    playBeep();
  };

  const fetchOrders = async (nextFilter = statusFilter, { silent = false } = {}) => {
    if (!getSessionToken()) {
      setUnlocked(false);
      setStatus('Inicia sesión con tu cuenta.');
      return;
    }

    if (!silent) {
      setLoading(true);
      setStatus('Cargando pedidos...');
    }

    try {
      const response = await fetch(`/api/orders-dashboard?status=${nextFilter}&limit=100&branch=${encodeURIComponent(branchFilter)}`, {
        headers: { ...authHeaders() },
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        if (!silent) {
          setUnlocked(false);
          setStatus(result.error || 'No se pudieron cargar los pedidos.');
        }
        return;
      }

      setUnlocked(true);
      if (result.branchSettings) setBranchSettings(normalizeBranchSettings(result.branchSettings));
      setOrdersAccessScope(result.accessScope || 'legacy');
      setOrdersLockedBranchId(result.lockedBranchId || null);
      setCanArchive(Boolean(result.canArchive));
      if (result.lockedBranchId && branchFilter !== result.lockedBranchId) setBranchFilter(result.lockedBranchId);
      const nextOrders = result.orders || [];

      // Detecta pedidos NUEVOS (ids no vistos antes). En la primera carga solo
      // se registra el estado base, sin avisar, para no sonar al abrir.
      const nextIds = new Set(nextOrders.map((order) => order.id));
      if (knownOrderIds.current === null) {
        knownOrderIds.current = nextIds;
      } else {
        const fresh = nextOrders.filter((order) => !knownOrderIds.current.has(order.id));
        knownOrderIds.current = nextIds;
        if (fresh.length > 0 && alertsOnRef.current) notifyNewOrders(fresh);
      }

      setOrders(nextOrders);
      if (!silent) setStatus('');
    } catch (error) {
      if (!silent) setStatus(`No se pudieron cargar los pedidos: ${error.message}`);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (getSessionToken()) fetchOrders(statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (unlocked) fetchOrders(statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchFilter]);

  // Auto-refresco cada 15s para que entren los pedidos nuevos sin picar
  // "Actualizar". Es silencioso (no muestra "Cargando...") y respeta el
  // filtro/sucursal actual.
  useEffect(() => {
    if (!unlocked) return undefined;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible' || alertsOnRef.current) fetchOrders(statusFilter, { silent: true });
    }, 15000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, statusFilter, branchFilter]);

  const changeStatus = async (orderId, nextStatus) => {
    setStatus('Actualizando pedido...');

    try {
      const response = await fetch('/api/orders-dashboard', {
        method: 'PATCH',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
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

  const archiveOrder = async (orderId, action = 'archive') => {
    const label = action === 'delete' ? 'eliminando' : 'archivando';
    setStatus(`${label.charAt(0).toUpperCase()}${label.slice(1)} pedido...`);

    try {
      const response = await fetch('/api/orders-dashboard', {
        method: 'PATCH',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId,
          action,
          note: action === 'delete'
            ? 'Pedido eliminado desde panel. No cuenta en ventas ni CRM.'
            : 'Pedido archivado desde panel. No cuenta en ventas ni CRM.',
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
    setUnlocked(false);
    setOrders([]);
    setOrdersAccessScope('legacy');
    setOrdersLockedBranchId(null);
  };

  const statusCounts = orders.reduce((acc, order) => {
    acc[order.status] = (acc[order.status] || 0) + 1;
    return acc;
  }, {});

  const renderOrderCard = (order) => {
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
          <span>Origen: <b>{order.order_source === 'online' ? 'Online' : order.order_source || 'Caja'}</b></span>
        </div>

        <div className="order-customer">
          {order.branch_name ? <p><b>Sucursal:</b> {order.branch_name}</p> : null}
          {order.order_source === 'cashier' ? <p><b>Caja:</b> {order.cashier_name || 'Cajero'}{order.cashier_shift ? ` - ${order.cashier_shift}` : ''}</p> : null}
          {order.order_source === 'cashier' ? <p><b>Pago:</b> {order.payment_method || 'No capturado'} - {order.payment_status === 'pending' ? 'Pendiente' : 'Pagado'}</p> : null}
          <p><b>Cliente:</b> {order.customer_name}</p>
          <p><b>Direccion:</b> {order.customer_address}</p>
          {order.customer_notes ? <p><b>Nota:</b> {order.customer_notes}</p> : null}
        </div>

        <div className="order-items">
          {(order.items || []).map((item) => {
            const options = parseOptions(item.options_json);
            return (
              <div className="order-item" key={item.id}>
                <div>
                  <b>{item.quantity} x {item.product_name}</b>
                  <span>{item.category} - {currency(item.line_total)}</span>
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
              {ORDER_STATUS_META[event.event_type]?.label || event.event_type} - {formatOrderDate(event.created_at_monterrey)}
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
          {canArchive && (
            <>
              <button type="button" className="ghost small" onClick={() => archiveOrder(order.id, 'archive')} title="Archivar y excluir de ventas/CRM">
                <Archive size={15} /> Archivar
              </button>
              <button type="button" className="ghost small danger-text" onClick={() => archiveOrder(order.id, 'delete')} title="Eliminar de la vista y excluir de ventas/CRM">
                <Trash2 size={15} /> Eliminar
              </button>
            </>
          )}
        </div>
      </article>
    );
  };

  if (!unlocked) {
    return (
      <main className="orders-page">
        <section className="orders-shell">
          <Logo />
          <h1>Pedidos</h1>
          <p>Inicia sesión con tu cuenta para ver la cola de pedidos.</p>
          <div className="orders-login">
            <a className="primary" href="#login">Iniciar sesión</a>
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
            {alertsOn ? (
              <button type="button" className="ghost" onClick={() => setAlertsOn(false)} title="Silenciar avisos de pedido nuevo">
                <Bell size={16} /> Avisos activos
              </button>
            ) : (
              <button type="button" className="primary" onClick={enableAlerts} title="Sonar y notificar cuando entre un pedido">
                <BellOff size={16} /> Activar avisos
              </button>
            )}
            <button type="button" className="ghost" onClick={() => fetchOrders(statusFilter)} disabled={loading}>
              {loading ? 'Cargando...' : 'Actualizar'}
            </button>
            <button type="button" className="ghost danger-text" onClick={logout}>
              Salir
            </button>
          </div>
        </div>

        {newOrderPulse > 0 && (
          <div className="orders-new-flash" key={newOrderPulse} onAnimationEnd={() => setNewOrderPulse(0)}>
            <Bell size={16} /> ¡Pedido nuevo!
          </div>
        )}

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

        <div className="orders-view-toggle">
          <button type="button" className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')}>
            <List size={16} /> Lista
          </button>
          <button type="button" className={viewMode === 'kanban' ? 'active' : ''} onClick={() => setViewMode('kanban')}>
            <Columns3 size={16} /> Kanban
          </button>
        </div>

        {status && <p className="admin-status">{status}</p>}

        {viewMode === 'kanban' ? (
          <div className="orders-kanban">
            {kanbanColumnsFor(orders).map((columnStatus) => {
              const columnOrders = orders.filter((order) => order.status === columnStatus);
              return (
                <section className="orders-kanban-column" key={columnStatus}>
                  <header>
                    <strong>{ORDER_STATUS_LABELS[columnStatus]}</strong>
                    <span>{columnOrders.length}</span>
                  </header>
                  <div className="orders-kanban-list">
                    {columnOrders.length ? columnOrders.map(renderOrderCard) : <p className="empty-cart">Sin pedidos.</p>}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="orders-grid">
          {orders.length === 0 ? (
            <div className="empty-cart">
              <ShoppingBag size={32} />
              <p>No hay pedidos en esta vista.</p>
            </div>
          ) : (
            orders.map(renderOrderCard)
          )}
          </div>
        )}
      </section>
    </main>
  );
}
