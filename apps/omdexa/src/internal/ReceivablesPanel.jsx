import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Banknote, CheckCircle2, CreditCard, RefreshCw, Save, Search, Undo2 } from 'lucide-react';
import '../receivables.css';
import { getSessionToken } from '../lib/apiClient.js';

const money = (amount) => `$${Number(amount || 0).toLocaleString('es-MX')}`;

const STATUS_LABELS = {
  active: 'Activo',
  overdue: 'Vencido',
  paid: 'Liquidado',
  cancelled: 'Cancelado',
  written_off: 'Condonado',
};

const TYPE_LABELS = {
  credit: 'Venta en pagos',
  layaway: 'Apartado',
};

const emptyDraft = {
  customerName: '',
  customerPhone: '',
  saleType: 'credit',
  totalAmount: '',
  downPaymentAmount: '',
  downPaymentMethod: 'Efectivo',
  dueDate: '',
  nextPaymentDate: '',
  reservedUntilDate: '',
  notes: '',
};

const emptyPayment = {
  amount: '',
  paymentMethod: 'Efectivo',
  notes: '',
};

function authHeaders(extra = {}) {
  const token = getSessionToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

function statusClass(status) {
  if (status === 'paid') return 'good';
  if (status === 'overdue') return 'danger';
  if (status === 'cancelled' || status === 'written_off') return 'muted';
  return 'warn';
}

export default function ReceivablesPanel() {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({ openBalance: 0, overdueBalance: 0, paidPrincipal: 0, totalCount: 0 });
  const [selected, setSelected] = useState(null);
  const [payments, setPayments] = useState([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [paymentDraft, setPaymentDraft] = useState(emptyPayment);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('active');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const visibleCount = items.length;
  const selectedBalance = Number(selected?.balanceAmount || 0);

  const nextDue = useMemo(() => {
    return items
      .filter((item) => ['active', 'overdue'].includes(item.status) && item.dueDate)
      .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))[0];
  }, [items]);

  async function loadReceivables(nextFilter = filter) {
    if (!getSessionToken()) {
      setStatus('Inicia sesion para ver cuentas por cobrar.');
      return;
    }
    setLoading(true);
    setStatus('Cargando cuentas por cobrar...');
    try {
      const params = new URLSearchParams({ status: nextFilter, limit: '150' });
      if (query.trim()) params.set('q', query.trim());
      const response = await fetch(`/api/receivables?${params.toString()}`, {
        headers: authHeaders(),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || 'No se pudieron cargar cuentas por cobrar.');
      setItems(result.receivables || []);
      setSummary(result.summary || {});
      setStatus('');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function openReceivable(item) {
    setSelected(item);
    setPayments([]);
    try {
      const response = await fetch(`/api/receivables?id=${encodeURIComponent(item.id)}`, {
        headers: authHeaders(),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || 'No se pudo cargar el detalle.');
      setSelected(result.receivable);
      setPayments(result.payments || []);
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function createReceivable(event) {
    event.preventDefault();
    setLoading(true);
    setStatus('Creando cuenta por cobrar...');
    try {
      const response = await fetch('/api/receivables', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(draft),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || 'No se pudo crear la cuenta por cobrar.');
      setDraft(emptyDraft);
      setStatus('Cuenta por cobrar creada.');
      await loadReceivables(filter);
      await openReceivable(result.receivable);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveSelected() {
    if (!selected?.id) return;
    setLoading(true);
    setStatus('Guardando cuenta...');
    try {
      const response = await fetch('/api/receivables', {
        method: 'PATCH',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          id: selected.id,
          dueDate: selected.dueDate,
          nextPaymentDate: selected.nextPaymentDate,
          reservedUntilDate: selected.reservedUntilDate,
          notes: selected.notes,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || 'No se pudo guardar.');
      setSelected(result.receivable);
      setItems((current) => current.map((item) => (item.id === result.receivable.id ? result.receivable : item)));
      setStatus('Cuenta actualizada.');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function addPayment(event) {
    event.preventDefault();
    if (!selected?.id) return;
    setLoading(true);
    setStatus('Registrando abono...');
    try {
      const response = await fetch('/api/receivable-payments', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          receivableId: selected.id,
          amount: paymentDraft.amount,
          paymentMethod: paymentDraft.paymentMethod,
          notes: paymentDraft.notes,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || 'No se pudo registrar el abono.');
      setPaymentDraft(emptyPayment);
      setSelected(result.receivable);
      setPayments(result.payments || []);
      setItems((current) => current.map((item) => (item.id === result.receivable.id ? result.receivable : item)));
      setStatus('Abono registrado.');
      await loadReceivables(filter);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function voidPayment(payment) {
    const reason = window.prompt('Motivo para anular el abono:');
    if (!reason) return;
    setLoading(true);
    setStatus('Anulando abono...');
    try {
      const response = await fetch('/api/receivable-payments', {
        method: 'PATCH',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ id: payment.id, reason }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || 'No se pudo anular el abono.');
      setSelected(result.receivable);
      setPayments(result.payments || []);
      setStatus('Abono anulado.');
      await loadReceivables(filter);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function cancelSelected() {
    if (!selected?.id) return;
    const reason = window.prompt('Motivo para cancelar esta cuenta:');
    if (!reason) return;
    setLoading(true);
    setStatus('Cancelando cuenta...');
    try {
      const response = await fetch(`/api/receivables?id=${encodeURIComponent(selected.id)}&reason=${encodeURIComponent(reason)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || 'No se pudo cancelar.');
      setSelected(null);
      setPayments([]);
      setStatus('Cuenta cancelada.');
      await loadReceivables(filter);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReceivables(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="receivables-page">
      <section className="receivables-shell">
        <header className="receivables-header">
          <div>
            <span className="eyebrow"><CreditCard size={14} /> Cuentas por cobrar</span>
            <h1>Ventas en pagos y apartados</h1>
            <p>Registra anticipos, abonos, saldos pendientes y fechas de pago por cliente.</p>
          </div>
          <button type="button" className="ghost" onClick={() => loadReceivables(filter)} disabled={loading}>
            <RefreshCw size={16} /> Actualizar
          </button>
        </header>

        <section className="receivables-metrics">
          <article><span>Saldo pendiente</span><strong>{money(summary.openBalance)}</strong></article>
          <article className={summary.overdueBalance ? 'danger' : ''}><span>Vencido</span><strong>{money(summary.overdueBalance)}</strong></article>
          <article><span>Cuentas</span><strong>{summary.totalCount || visibleCount}</strong></article>
          <article><span>Proximo pago</span><strong>{nextDue ? nextDue.dueDate : '-'}</strong></article>
        </section>

        <section className="receivables-layout">
          <div className="receivables-left">
            <form className="receivables-search" onSubmit={(event) => { event.preventDefault(); loadReceivables(filter); }}>
              <Search size={17} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente, telefono, orden o nota" />
              <select value={filter} onChange={(event) => { setFilter(event.target.value); loadReceivables(event.target.value); }}>
                <option value="active">Activas</option>
                <option value="overdue">Vencidas</option>
                <option value="paid">Liquidadas</option>
                <option value="all">Todas</option>
              </select>
              <button type="submit" className="primary small">Buscar</button>
            </form>

            {status ? <p className="admin-status">{status}</p> : null}

            <div className="receivables-list">
              {items.length === 0 ? (
                <p className="empty-cart">Todavia no hay cuentas por cobrar en este filtro.</p>
              ) : items.map((item) => (
                <button type="button" key={item.id} className={selected?.id === item.id ? 'active' : ''} onClick={() => openReceivable(item)}>
                  <strong>{item.customerName}</strong>
                  <span>{TYPE_LABELS[item.saleType]} - {money(item.balanceAmount)} pendiente</span>
                  <small>
                    <b className={`receivable-pill ${statusClass(item.status)}`}>{STATUS_LABELS[item.status] || item.status}</b>
                    {item.dueDate ? ` Vence ${item.dueDate}` : ' Sin vencimiento'}
                  </small>
                </button>
              ))}
            </div>

            <form className="receivable-create" onSubmit={createReceivable}>
              <h2>Nueva venta en pagos</h2>
              <label><span>Cliente</span><input required value={draft.customerName} onChange={(e) => setDraft({ ...draft, customerName: e.target.value })} /></label>
              <label><span>WhatsApp</span><input value={draft.customerPhone} onChange={(e) => setDraft({ ...draft, customerPhone: e.target.value })} /></label>
              <label><span>Tipo</span>
                <select value={draft.saleType} onChange={(e) => setDraft({ ...draft, saleType: e.target.value })}>
                  <option value="credit">Venta en pagos</option>
                  <option value="layaway">Apartado</option>
                </select>
              </label>
              <label><span>Total</span><input required type="number" min="1" value={draft.totalAmount} onChange={(e) => setDraft({ ...draft, totalAmount: e.target.value })} /></label>
              <label><span>Anticipo</span><input type="number" min="0" value={draft.downPaymentAmount} onChange={(e) => setDraft({ ...draft, downPaymentAmount: e.target.value })} /></label>
              <label><span>Pago anticipo</span>
                <select value={draft.downPaymentMethod} onChange={(e) => setDraft({ ...draft, downPaymentMethod: e.target.value })}>
                  <option>Efectivo</option>
                  <option>Transferencia</option>
                  <option>Tarjeta</option>
                  <option>Mercado Pago</option>
                </select>
              </label>
              <label><span>Fecha limite</span><input type="date" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} /></label>
              <label><span>Proximo pago</span><input type="date" value={draft.nextPaymentDate} onChange={(e) => setDraft({ ...draft, nextPaymentDate: e.target.value })} /></label>
              {draft.saleType === 'layaway' ? (
                <label><span>Reservar hasta</span><input type="date" value={draft.reservedUntilDate} onChange={(e) => setDraft({ ...draft, reservedUntilDate: e.target.value })} /></label>
              ) : null}
              <label className="wide"><span>Notas</span><textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
              <button type="submit" className="primary" disabled={loading}><Save size={16} /> Crear cuenta</button>
            </form>
          </div>

          <aside className="receivables-detail">
            {!selected ? (
              <div className="receivable-empty">
                <Banknote size={34} />
                <p>Selecciona una cuenta para registrar abonos y revisar historial.</p>
              </div>
            ) : (
              <>
                <div className="receivable-detail-head">
                  <div>
                    <span className={`receivable-pill ${statusClass(selected.status)}`}>{STATUS_LABELS[selected.status] || selected.status}</span>
                    <h2>{selected.customerName}</h2>
                    <p>{TYPE_LABELS[selected.saleType]} {selected.orderNumber ? `- Orden ${selected.orderNumber}` : ''}</p>
                  </div>
                  <strong>{money(selectedBalance)}</strong>
                </div>

                <section className="receivable-balance-card">
                  <article><span>Total</span><b>{money(selected.principalAmount)}</b></article>
                  <article><span>Pagado</span><b>{money(selected.paidAmount)}</b></article>
                  <article><span>Debe</span><b>{money(selected.balanceAmount)}</b></article>
                </section>

                <div className="receivable-edit-grid">
                  <label><span>Fecha limite</span><input type="date" value={selected.dueDate || ''} onChange={(e) => setSelected({ ...selected, dueDate: e.target.value })} /></label>
                  <label><span>Proximo pago</span><input type="date" value={selected.nextPaymentDate || ''} onChange={(e) => setSelected({ ...selected, nextPaymentDate: e.target.value })} /></label>
                  {selected.saleType === 'layaway' ? (
                    <label><span>Reservado hasta</span><input type="date" value={selected.reservedUntilDate || ''} onChange={(e) => setSelected({ ...selected, reservedUntilDate: e.target.value })} /></label>
                  ) : null}
                  <label className="wide"><span>Notas</span><textarea value={selected.notes || ''} onChange={(e) => setSelected({ ...selected, notes: e.target.value })} /></label>
                </div>
                <div className="receivable-actions">
                  <button type="button" className="primary small" onClick={saveSelected} disabled={loading}><Save size={15} /> Guardar</button>
                  <button type="button" className="ghost small danger-text" onClick={cancelSelected} disabled={loading}><AlertCircle size={15} /> Cancelar</button>
                </div>

                {selected.status !== 'paid' && selected.status !== 'cancelled' ? (
                  <form className="receivable-payment-form" onSubmit={addPayment}>
                    <h3>Registrar abono</h3>
                    <label><span>Monto</span><input required type="number" min="1" max={selected.balanceAmount || undefined} value={paymentDraft.amount} onChange={(e) => setPaymentDraft({ ...paymentDraft, amount: e.target.value })} /></label>
                    <label><span>Forma de pago</span>
                      <select value={paymentDraft.paymentMethod} onChange={(e) => setPaymentDraft({ ...paymentDraft, paymentMethod: e.target.value })}>
                        <option>Efectivo</option>
                        <option>Transferencia</option>
                        <option>Tarjeta</option>
                        <option>Mercado Pago</option>
                      </select>
                    </label>
                    <label className="wide"><span>Nota</span><input value={paymentDraft.notes} onChange={(e) => setPaymentDraft({ ...paymentDraft, notes: e.target.value })} /></label>
                    <button type="submit" className="primary" disabled={loading}><CheckCircle2 size={16} /> Registrar abono</button>
                  </form>
                ) : null}

                <section className="receivable-payments">
                  <h3>Historial de abonos</h3>
                  {payments.length === 0 ? (
                    <p className="empty-cart">Sin abonos registrados.</p>
                  ) : payments.map((payment) => (
                    <article key={payment.id} className={payment.status === 'void' ? 'void' : ''}>
                      <div>
                        <strong>{money(payment.amount)}</strong>
                        <span>{payment.paymentMethod} - {new Date(payment.paidAtUtc).toLocaleString('es-MX')}</span>
                        {payment.notes ? <small>{payment.notes}</small> : null}
                        {payment.status === 'void' ? <small>Anulado: {payment.voidReason}</small> : null}
                      </div>
                      {payment.status !== 'void' ? (
                        <button type="button" className="ghost small" onClick={() => voidPayment(payment)} disabled={loading}>
                          <Undo2 size={14} /> Anular
                        </button>
                      ) : null}
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
