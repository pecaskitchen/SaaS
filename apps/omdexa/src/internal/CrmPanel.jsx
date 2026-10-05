import React, { useEffect, useMemo, useState } from 'react';
import { MessageCircle, RefreshCw, Save, Search, Trash2, Users } from 'lucide-react';
import '../styles.css';
import { getSessionToken } from '../lib/apiClient.js';
import { useAuth } from '../auth/AuthContext.jsx';

// El DELETE de /api/crm/customers solo lo permiten admin/manager/platform_admin;
// el rol "orders" puede ver y editar clientes pero no eliminarlos, asi que el
// boton se oculta para no ofrecer una accion que el backend va a rechazar.
const CAN_DELETE_ROLES = ['admin', 'manager', 'platform_admin'];

const currency = (amount) => `$${Number(amount || 0).toLocaleString('es-MX')}`;

const MESSAGE_TEMPLATES = [
  {
    key: 'followup',
    label: 'Seguimiento',
    text: 'Hola {{nombre}}, gracias por tu compra. Todo llego bien?',
  },
  {
    key: 'promo',
    label: 'Promo',
    text: 'Hola {{nombre}}, tenemos una promocion nueva por tiempo limitado. Te paso el catalogo?',
  },
  {
    key: 'payment',
    label: 'Pago pendiente',
    text: 'Hola {{nombre}}, te comparto recordatorio de pago de tu pedido {{ultimoPedido}}.',
  },
];

function authHeaders() {
  const token = getSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function fillTemplate(template, customer) {
  return String(template || '')
    .replace(/\{\{nombre\}\}/g, customer.name || 'cliente')
    .replace(/\{\{ultimoPedido\}\}/g, customer.lastOrderNumber || '');
}

function whatsappHref(customer, text) {
  const phone = String(customer.phone || '').replace(/\D/g, '');
  const url = phone ? `https://wa.me/${phone}` : 'https://wa.me/';
  return `${url}?text=${encodeURIComponent(fillTemplate(text, customer))}`;
}

export default function CrmPanel() {
  const { user } = useAuth();
  const canDelete = Boolean(user && CAN_DELETE_ROLES.includes(user.role));
  const [customers, setCustomers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [orders, setOrders] = useState([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const totalCustomers = customers.length;
  const totalRevenue = useMemo(() => customers.reduce((sum, customer) => sum + Number(customer.totalSpent || 0), 0), [customers]);

  const fetchCustomers = async () => {
    if (!getSessionToken()) {
      setStatus('Inicia sesion como admin u orders para usar CRM.');
      return;
    }
    setLoading(true);
    setStatus('Cargando clientes...');
    try {
      const url = `/api/crm/customers?limit=120${query.trim() ? `&q=${encodeURIComponent(query.trim())}` : ''}`;
      const response = await fetch(url, { headers: authHeaders() });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || 'No se pudieron cargar clientes.');
      setCustomers(result.customers || []);
      setStatus('');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  };

  const openCustomer = async (customer) => {
    setSelected(customer);
    setOrders([]);
    try {
      const response = await fetch(`/api/crm/customers?customer_id=${customer.id}`, { headers: authHeaders() });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || 'No se pudo cargar historial.');
      setSelected(result.customer);
      setOrders(result.orders || []);
    } catch (error) {
      setStatus(error.message);
    }
  };

  const updateSelected = (key, value) => setSelected((current) => ({ ...current, [key]: value }));

  const saveSelected = async () => {
    if (!selected?.id) return;
    setLoading(true);
    setStatus('Guardando cliente...');
    try {
      const response = await fetch('/api/crm/customers', {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(selected),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || 'No se pudo guardar cliente.');
      setSelected(result.customer);
      setCustomers((current) => current.map((item) => (item.id === result.customer.id ? result.customer : item)));
      setStatus('Cliente actualizado.');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteSelected = async () => {
    if (!selected?.id) return;
    setLoading(true);
    setStatus('Eliminando cliente...');
    try {
      const response = await fetch(`/api/crm/customers?id=${encodeURIComponent(selected.id)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || 'No se pudo eliminar cliente.');
      setCustomers((current) => current.filter((item) => item.id !== selected.id));
      setSelected(null);
      setOrders([]);
      setStatus('Cliente eliminado del CRM.');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="crm-page">
      <section className="crm-shell">
        <header className="crm-header">
          <div>
            <span className="eyebrow"><Users size={14} /> Clientes / CRM</span>
            <h1>Clientes y WhatsApp</h1>
            <p>Historial, etiquetas, notas internas y mensajes rapidos para seguimiento.</p>
          </div>
          <button type="button" className="ghost" onClick={fetchCustomers} disabled={loading}>
            <RefreshCw size={16} /> Actualizar
          </button>
        </header>

        <section className="crm-metrics">
          <article><span>Clientes</span><strong>{totalCustomers}</strong></article>
          <article><span>Venta historica</span><strong>{currency(totalRevenue)}</strong></article>
          <article><span>Con WhatsApp</span><strong>{customers.filter((customer) => customer.phone).length}</strong></article>
        </section>

        <section className="crm-grid">
          <div className="crm-list-panel">
            <form className="crm-search" onSubmit={(event) => { event.preventDefault(); fetchCustomers(); }}>
              <Search size={17} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nombre, telefono, direccion o nota" />
              <button type="submit" className="primary small">Buscar</button>
            </form>
            {status ? <p className="admin-status">{status}</p> : null}
            <div className="crm-customer-list">
              {customers.length === 0 ? (
                <p className="empty-cart">Todavia no hay clientes. Se agregan cuando entra un pedido.</p>
              ) : customers.map((customer) => (
                <button type="button" className={selected?.id === customer.id ? 'active' : ''} key={customer.id} onClick={() => openCustomer(customer)}>
                  <strong>{customer.name}</strong>
                  <span>{customer.phone || 'Sin telefono'} - {customer.orderCount} pedido(s) - {currency(customer.totalSpent)}</span>
                  {customer.tags?.length ? <small>{customer.tags.join(', ')}</small> : null}
                </button>
              ))}
            </div>
          </div>

          <aside className="crm-detail-panel">
            {!selected ? (
              <div className="empty-cart">
                <Users size={32} />
                <p>Selecciona un cliente para ver historial y mandar WhatsApp.</p>
              </div>
            ) : (
              <>
                <div className="crm-detail-head">
                  <div>
                    <h2>{selected.name}</h2>
                    <span>{selected.lastOrderNumber ? `Ultimo pedido ${selected.lastOrderNumber}` : 'Sin pedido reciente'}</span>
                  </div>
                  <button type="button" className="primary small" onClick={saveSelected} disabled={loading}>
                    <Save size={15} /> Guardar
                  </button>
                  {canDelete && (
                    <button type="button" className="ghost small danger-text" onClick={deleteSelected} disabled={loading}>
                      <Trash2 size={15} /> Eliminar
                    </button>
                  )}
                </div>

                <div className="admin-promo-grid">
                  <label className="field"><span>Nombre</span><input value={selected.name || ''} onChange={(e) => updateSelected('name', e.target.value)} /></label>
                  <label className="field"><span>WhatsApp</span><input value={selected.phone || ''} onChange={(e) => updateSelected('phone', e.target.value)} /></label>
                  <label className="field full"><span>Direccion</span><input value={selected.address || ''} onChange={(e) => updateSelected('address', e.target.value)} /></label>
                  <label className="field"><span>Colonia</span><input value={selected.neighborhood || ''} onChange={(e) => updateSelected('neighborhood', e.target.value)} /></label>
                  <label className="field"><span>Sector</span><input value={selected.sector || ''} onChange={(e) => updateSelected('sector', e.target.value)} /></label>
                  <label className="field full"><span>Etiquetas</span><input value={(selected.tags || []).join(', ')} onChange={(e) => updateSelected('tags', e.target.value.split(',').map((item) => item.trim()).filter(Boolean))} placeholder="VIP, frecuente, cumpleanos" /></label>
                  <label className="field full"><span>Notas internas</span><textarea rows="4" value={selected.notes || ''} onChange={(e) => updateSelected('notes', e.target.value)} /></label>
                </div>

                <div className="crm-whatsapp-actions">
                  {MESSAGE_TEMPLATES.map((template) => (
                    <a key={template.key} className="ghost" href={whatsappHref(selected, template.text)} target="_blank" rel="noreferrer">
                      <MessageCircle size={16} /> {template.label}
                    </a>
                  ))}
                </div>

                <section className="crm-history">
                  <h3>Historial</h3>
                  {orders.length === 0 ? <p className="empty-cart">Sin historial encontrado.</p> : orders.map((order) => (
                    <article key={order.id}>
                      <strong>{order.order_number}</strong>
                      <span>{order.status} - {order.branch_name || 'Sucursal'} - {currency(order.total)}</span>
                    </article>
                  ))}
                </section>
              </>
            )}
          </aside>
        </section>
      </section>
    </main>
  );
}
