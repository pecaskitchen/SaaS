import React, { useEffect, useMemo, useState } from 'react';
import { Gift, Minus, Plus, Search, Star, TicketCheck, UserRound, Users } from 'lucide-react';
import { apiFetch } from '../lib/apiClient.js';
import './pecas-club-panel.css';

const money = (value) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(Number(value || 0));
const shortDate = (value) => value ? new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(new Date(value)) : '—';

function RewardEditor({ reward, products, onSave }) {
  const [draft, setDraft] = useState(reward);
  useEffect(() => setDraft(reward), [reward]);
  const field = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const selected = draft.eligibleProductIds || [];
  const toggleProduct = (id) => field('eligibleProductIds', selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  return <article className="club-admin-editor"><div><Gift size={19} /><input value={draft.name} onChange={(e) => field('name', e.target.value)} /></div><textarea value={draft.description} onChange={(e) => field('description', e.target.value)} placeholder="Descripción" /><fieldset className="club-reward-products"><legend>Productos elegibles</legend>{products.length ? products.map((product) => <label key={product.id}><input type="checkbox" checked={selected.includes(product.id)} onChange={() => toggleProduct(product.id)} /><span>{product.name}<small>{product.category}</small></span></label>) : <p>No hay productos publicados en el menú.</p>}</fieldset><div className="club-admin-editor-row"><label>Tipo<select value={draft.rewardType || 'product'} onChange={(e) => field('rewardType', e.target.value)}><option value="product">Producto gratis</option><option value="fixed_discount">Descuento fijo</option></select></label><label>Descuento máximo<input type="number" min="0" value={draft.discountAmount || 0} onChange={(e) => field('discountAmount', e.target.value)} /></label><label>Pecas<input type="number" min="1" value={draft.pointsRequired} onChange={(e) => field('pointsRequired', e.target.value)} /></label><label>Costo estimado<input type="number" min="0" value={draft.estimatedCost} onChange={(e) => field('estimatedCost', e.target.value)} /></label><label className="club-admin-toggle"><input type="checkbox" checked={draft.active} onChange={(e) => field('active', e.target.checked)} /> Activa</label><button type="button" onClick={() => onSave(draft)}>Guardar</button></div></article>;
}

function PromotionEditor({ promotion, onSave }) {
  const [draft, setDraft] = useState(promotion);
  useEffect(() => setDraft(promotion), [promotion]);
  const field = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  return <article className="club-admin-editor"><div><Star size={19} /><input value={draft.title} onChange={(e) => field('title', e.target.value)} placeholder="Título" /></div><textarea value={draft.description} onChange={(e) => field('description', e.target.value)} placeholder="Descripción" /><input value={draft.terms || ''} onChange={(e) => field('terms', e.target.value)} placeholder="Términos breves" /><div className="club-admin-editor-row"><label>Inicio<input type="date" value={(draft.startsAtUtc || '').slice(0, 10)} onChange={(e) => field('startsAtUtc', e.target.value ? `${e.target.value}T00:00:00.000Z` : '')} /></label><label>Fin<input type="date" value={(draft.endsAtUtc || '').slice(0, 10)} onChange={(e) => field('endsAtUtc', e.target.value ? `${e.target.value}T23:59:59.999Z` : '')} /></label><label className="club-admin-toggle"><input type="checkbox" checked={draft.active} onChange={(e) => field('active', e.target.checked)} /> Activa</label><button type="button" onClick={() => onSave(draft)}>Guardar</button></div></article>;
}

export default function PecasClubPanel() {
  const [tab, setTab] = useState('customers');
  const [data, setData] = useState({ customers: [], rewards: [], promotions: [], referralsUnderReview: [], transactions: [], redemptions: [], products: [] });
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [adjustment, setAdjustment] = useState({ points: 1, description: '' });
  const [rewardId, setRewardId] = useState('');

  async function load(nextQuery = query, customerId = selected?.id || '') {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (nextQuery) params.set('q', nextQuery);
      if (customerId) params.set('customer_id', customerId);
      const result = await apiFetch(`/api/club/admin?${params}`);
      setData(result);
      if (customerId) setSelected(result.customers.find((item) => item.id === customerId) || null);
      setStatus('');
    } catch (error) { setStatus(error.message); } finally { setLoading(false); }
  }
  useEffect(() => { load('', ''); }, []);
  const activeRewards = useMemo(() => data.rewards.filter((item) => item.active), [data.rewards]);
  const pendingRedemptions = useMemo(() => (data.redemptions || []).filter((item) => item.status === 'issued'), [data.redemptions]);
  useEffect(() => {
    if (tab !== 'redemptions') return undefined;
    const timer = window.setInterval(() => { load(query, selected?.id || ''); }, 30000);
    return () => window.clearInterval(timer);
  }, [tab, query, selected?.id]);

  async function adjust(multiplier) {
    if (!selected) return;
    try {
      await apiFetch('/api/club/admin', { method: 'POST', body: JSON.stringify({ action: 'adjust', customerId: selected.id, points: Math.abs(Number(adjustment.points || 0)) * multiplier, description: adjustment.description }) });
      setAdjustment({ points: 1, description: '' }); setStatus('Saldo actualizado.'); await load(query, selected.id);
    } catch (error) { setStatus(error.message); }
  }
  async function redeem() {
    if (!selected || !rewardId) return;
    try { const result = await apiFetch('/api/club/admin', { method: 'POST', body: JSON.stringify({ action: 'redeem', customerId: selected.id, rewardId }) }); setStatus(`Canje creado: ${result.redemption.code}`); await load(query, selected.id); } catch (error) { setStatus(error.message); }
  }
  async function saveEntity(entity, item) {
    try { await apiFetch('/api/club/admin', { method: 'PATCH', body: JSON.stringify({ entity, ...item }) }); setStatus('Cambios guardados.'); await load(query, selected?.id || ''); } catch (error) { setStatus(error.message); }
  }
  async function reviewReferral(referralId, decision) {
    try { await apiFetch('/api/club/admin', { method: 'POST', body: JSON.stringify({ action: 'referral-review', referralId, decision }) }); setStatus(decision === 'approve' ? 'Referido aprobado.' : 'Referido rechazado.'); await load(); } catch (error) { setStatus(error.message); }
  }
  async function updateRedemption(redemptionId, nextStatus) {
    if (nextStatus === 'cancelled' && !window.confirm('¿Cancelar este canje y devolver las Pecas al cliente?')) return;
    try {
      await apiFetch('/api/club/admin', { method: 'POST', body: JSON.stringify({ action: 'redemption-status', redemptionId, status: nextStatus }) });
      setStatus(nextStatus === 'used' ? 'Canje marcado como entregado.' : 'Canje cancelado; las Pecas fueron devueltas.');
      await load(query, selected?.id || '');
    } catch (error) { setStatus(error.message); }
  }

  return <section className="club-admin">
    <header><div><span className="eyebrow">Lealtad y recompensas</span><h1>Pecas Club</h1><p>Administra saldos, canjes, promociones y referidos desde un solo lugar.</p></div><div className="club-admin-stat"><Star size={21} /><strong>{data.customers.length}</strong><span>miembros visibles</span></div></header>
    <nav className="club-admin-tabs"><button className={tab === 'customers' ? 'active' : ''} onClick={() => setTab('customers')}><Users size={17} /> Clientes</button><button className={tab === 'redemptions' ? 'active' : ''} onClick={() => setTab('redemptions')}><TicketCheck size={17} /> Canjes {pendingRedemptions.length ? <b>{pendingRedemptions.length}</b> : null}</button><button className={tab === 'rewards' ? 'active' : ''} onClick={() => setTab('rewards')}><Gift size={17} /> Recompensas</button><button className={tab === 'promotions' ? 'active' : ''} onClick={() => setTab('promotions')}><Star size={17} /> Promociones</button><button className={tab === 'referrals' ? 'active' : ''} onClick={() => setTab('referrals')}><UserRound size={17} /> Referidos {data.referralsUnderReview.length ? <b>{data.referralsUnderReview.length}</b> : null}</button></nav>
    {status && <p className="club-admin-status">{status}</p>}
    {tab === 'customers' && <div className="club-admin-customers"><aside><form onSubmit={(e) => { e.preventDefault(); load(query, ''); }}><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre o teléfono" /></form><div className="club-admin-list">{loading ? <p>Cargando…</p> : data.customers.map((customer) => <button key={customer.id} className={selected?.id === customer.id ? 'active' : ''} onClick={() => { setSelected(customer); load(query, customer.id); }}><span><strong>{customer.name}</strong><small>{customer.phone}</small></span><b>{customer.balance} ●</b></button>)}</div></aside><main>{selected ? <><div className="club-customer-head"><div><span>Miembro</span><h2>{selected.name}</h2><p>{selected.phone}{selected.email ? ` · ${selected.email}` : ''}</p></div><strong>{selected.balance} Pecas ●</strong></div><div className="club-customer-metrics"><span>Compras<strong>{selected.orderCount}</strong></span><span>Gastado<strong>{money(selected.totalSpent)}</strong></span><span>Última compra<strong>{shortDate(selected.lastOrderAtUtc)}</strong></span></div><section className="club-admin-actions"><h3>Ajustar saldo</h3><div><input type="number" min="1" value={adjustment.points} onChange={(e) => setAdjustment((current) => ({ ...current, points: e.target.value }))} /><input value={adjustment.description} onChange={(e) => setAdjustment((current) => ({ ...current, description: e.target.value }))} placeholder="Motivo obligatorio" /><button onClick={() => adjust(1)}><Plus size={17} /> Agregar</button><button className="danger" onClick={() => adjust(-1)}><Minus size={17} /> Quitar</button></div><h3>Canjear recompensa</h3><div><select value={rewardId} onChange={(e) => setRewardId(e.target.value)}><option value="">Selecciona…</option>{activeRewards.map((reward) => <option value={reward.id} key={reward.id}>{reward.name} · {reward.pointsRequired} Pecas</option>)}</select><button onClick={redeem}><TicketCheck size={17} /> Canjear</button></div></section><section className="club-admin-history"><h3>Historial</h3>{data.transactions.map((item) => <article key={item.id}><b className={Number(item.points) >= 0 ? 'positive' : 'negative'}>{Number(item.points) > 0 ? '+' : ''}{item.points}</b><span>{item.description}<small>{shortDate(item.created_at_utc)}</small></span></article>)}</section></> : <div className="club-admin-placeholder"><Users size={36} /><h2>Selecciona un cliente</h2><p>Podrás consultar su saldo, compras y movimientos.</p></div>}</main></div>}
    {tab === 'rewards' && <div className="club-admin-editors">{data.rewards.map((item) => <RewardEditor key={item.id} reward={item} products={data.products || []} onSave={(draft) => saveEntity('reward', draft)} />)}<button className="club-admin-add" onClick={() => setData((current) => ({ ...current, rewards: [...current.rewards, { id: '', name: 'Nueva recompensa', description: '', pointsRequired: 5, estimatedCost: 0, active: true, stock: null, rewardType: 'product', eligibleProductIds: [], discountAmount: 0, sortOrder: current.rewards.length + 1 }] }))}><Plus size={18} /> Nueva recompensa</button></div>}
    {tab === 'promotions' && <div className="club-admin-editors">{data.promotions.map((item) => <PromotionEditor key={item.id || item.title} promotion={item} onSave={(draft) => saveEntity('promotion', draft)} />)}<button className="club-admin-add" onClick={() => setData((current) => ({ ...current, promotions: [...current.promotions, { id: '', title: 'Nueva promoción', description: '', terms: '', startsAtUtc: '', endsAtUtc: '', active: true, sortOrder: current.promotions.length + 1 }] }))}><Plus size={18} /> Nueva promoción</button></div>}
    {tab === 'redemptions' && <div className="club-redemptions">{(data.redemptions || []).length ? data.redemptions.map((item) => <article className={`club-redemption-card ${item.status}`} key={item.id}><div className="club-redemption-main"><span className="club-redemption-state">{item.status === 'issued' ? 'Pendiente' : item.status === 'used' ? 'Entregado' : 'Cancelado'}</span><h2>{item.rewardName}</h2><p><strong>{item.customerName}</strong> · {item.customerPhone}</p><small>{new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.redeemedAtUtc))} · {item.pointsSpent} Pecas</small></div><div className="club-redemption-code"><span>Código</span><strong>{item.code}</strong></div>{item.status === 'issued' && <div className="club-redemption-actions"><button onClick={() => updateRedemption(item.id, 'used')}><TicketCheck size={17} /> Marcar entregado</button><button className="danger" onClick={() => updateRedemption(item.id, 'cancelled')}>Cancelar y devolver Pecas</button></div>}</article>) : <div className="club-admin-placeholder"><TicketCheck size={36} /><h2>No hay canjes</h2><p>Los canjes hechos por clientes aparecerán aquí automáticamente.</p></div>}</div>}
    {tab === 'referrals' && <div className="club-admin-editors">{data.referralsUnderReview.length ? data.referralsUnderReview.map((item) => <article className="club-referral-review" key={item.id}><div><strong>{item.referrer_name}</strong> invitó a <strong>{item.referred_name}</strong><p>{item.review_reason || 'Requiere revisión'}</p></div><span><button onClick={() => reviewReferral(item.id, 'approve')}>Aprobar</button><button className="danger" onClick={() => reviewReferral(item.id, 'reject')}>Rechazar</button></span></article>) : <div className="club-admin-placeholder"><UserRound size={36} /><h2>No hay referidos pendientes</h2><p>Las coincidencias de domicilio aparecerán aquí.</p></div>}</div>}
  </section>;
}
