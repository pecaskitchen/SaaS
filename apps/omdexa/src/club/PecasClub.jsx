import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Clock3, Copy, Gift, LogOut, Sparkles, UserPlus } from 'lucide-react';
import { withTenantQuery } from '../lib/apiClient.js';
import './pecas-club.css';

const TOKEN_KEY = 'pecas_club_token';

function getToken() {
  try { return window.localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

function setToken(token) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage no disponible */ }
}

function syncStorefrontProfile(customer) {
  if (!customer) return;
  try {
    const current = JSON.parse(window.localStorage.getItem('saas_customer_profile') || '{}');
    window.localStorage.setItem('saas_customer_profile', JSON.stringify({ ...current, name: customer.name || current.name || '', phone: customer.phone || current.phone || '' }));
  } catch { /* perfil local opcional */ }
}

async function clubFetch(path, options = {}) {
  const response = await fetch(withTenantQuery(path), {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}), ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const error = new Error(data.error || 'No se pudo completar la operación.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function routeName() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/club';
  if (path.endsWith('/registro')) return 'register';
  if (path.endsWith('/iniciar-sesion')) return 'login';
  if (path.endsWith('/recompensas')) return 'rewards';
  if (path.endsWith('/historial')) return 'history';
  if (path.endsWith('/terminos')) return 'terms';
  return 'home';
}

function clubUrl(path) {
  try { return `${path}${window.location.search || ''}`; } catch { return path; }
}

function formatDate(value) {
  if (!value) return '';
  try { return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)); } catch { return value; }
}

function ClubHeader({ customer, onLogout }) {
  return (
    <header className="club-header">
      <a className="club-brand" href={clubUrl('/')}>
        <img src="/tenants/pecas/pecas-icon-hd.png" alt="" />
        <span><strong>Pecas Club</strong><small>Recompensas que se disfrutan</small></span>
      </a>
      <nav>
        {customer ? <>
          <a href={clubUrl('/club')}>Mi Club</a>
          <a href={clubUrl('/club/recompensas')}>Recompensas</a>
          <a href={clubUrl('/club/historial')}>Historial</a>
          <button type="button" onClick={onLogout}><LogOut size={17} /> Salir</button>
        </> : <a href={clubUrl('/')}><ArrowLeft size={17} /> Volver a Pecas</a>}
      </nav>
    </header>
  );
}

function AuthView({ mode, onAuthenticated }) {
  const register = mode === 'register';
  const [form, setForm] = useState({ name: '', phone: '', email: '', pin: '', confirmPin: '', birthdayDay: '', birthdayMonth: '', referralCode: '', acceptPrivacy: false, marketingConsent: false });
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event) {
    event.preventDefault();
    setStatus('');
    if (register && form.pin !== form.confirmPin) return setStatus('Los PIN no coinciden.');
    setLoading(true);
    try {
      const data = await clubFetch('/api/club/session', { method: 'POST', body: JSON.stringify({ ...form, action: register ? 'register' : 'login' }) });
      setToken(data.token);
      syncStorefrontProfile(data.customer);
      onAuthenticated(data.customer);
      window.location.href = clubUrl('/club');
    } catch (error) {
      setStatus(error.message);
    } finally { setLoading(false); }
  }

  return (
    <div className="club-auth-wrap">
      <section className="club-auth-intro">
        <span className="club-kicker">Pecas Club</span>
        <h1>{register ? 'Cada compra te acerca a algo rico.' : 'Qué gusto verte de nuevo.'}</h1>
        <p>Acumula una Peca por cada $20, descubre beneficios exclusivos y canjea tus favoritas cuando quieras.</p>
        <div className="club-points-rule"><strong>$20</strong><span>=</span><strong>1 Peca ●</strong></div>
      </section>
      <form className="club-auth-card" onSubmit={submit}>
        <div><span className="club-kicker">{register ? 'Crea tu cuenta' : 'Ingresa a tu cuenta'}</span><h2>{register ? 'Únete al Club' : 'Tus Pecas te esperan'}</h2></div>
        {register && <label>Nombre<input required autoComplete="name" value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Tu nombre" /></label>}
        <label>Número celular<input required inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="10 dígitos" /></label>
        {register && <label>Correo <small>(opcional)</small><input type="email" autoComplete="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="tu@correo.com" /></label>}
        <label>PIN de seis dígitos<input required inputMode="numeric" autoComplete={register ? 'new-password' : 'current-password'} minLength="6" maxLength="6" pattern="[0-9]{6}" type="password" value={form.pin} onChange={(e) => update('pin', e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="••••••" /></label>
        {register && <>
          <label>Confirma tu PIN<input required inputMode="numeric" autoComplete="new-password" minLength="6" maxLength="6" pattern="[0-9]{6}" type="password" value={form.confirmPin} onChange={(e) => update('confirmPin', e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="••••••" /></label>
          <div className="club-form-row">
            <label>Cumpleaños <small>(opcional)</small><span className="club-birthday"><input inputMode="numeric" value={form.birthdayDay} onChange={(e) => update('birthdayDay', e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="Día" /><input inputMode="numeric" value={form.birthdayMonth} onChange={(e) => update('birthdayMonth', e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="Mes" /></span></label>
            <label>Código de referido <small>(opcional)</small><input value={form.referralCode} onChange={(e) => update('referralCode', e.target.value.toUpperCase())} placeholder="OTO8K2" /></label>
          </div>
          <label className="club-check"><input type="checkbox" checked={form.acceptPrivacy} onChange={(e) => update('acceptPrivacy', e.target.checked)} /><span>Acepto el <a href="/privacidad">Aviso de Privacidad</a> y los <a href={clubUrl('/club/terminos')}>términos de Pecas Club</a>.</span></label>
          <label className="club-check"><input type="checkbox" checked={form.marketingConsent} onChange={(e) => update('marketingConsent', e.target.checked)} /><span>Quiero recibir promociones y novedades de Pecas.</span></label>
        </>}
        {status && <p className="club-error" role="alert">{status}</p>}
        <button className="club-primary" disabled={loading}>{loading ? 'Un momento…' : register ? 'Crear mi cuenta' : 'Ingresar'}</button>
        <p className="club-auth-switch">{register ? '¿Ya tienes cuenta?' : '¿Aún no tienes cuenta?'} <a href={clubUrl(register ? '/club/iniciar-sesion' : '/club/registro')}>{register ? 'Inicia sesión' : 'Crea una'}</a></p>
      </form>
    </div>
  );
}

function RewardCard({ reward, balance, onRedeem, busy }) {
  const available = balance >= reward.pointsRequired && (reward.stock === null || reward.stock > 0);
  return (
    <article className={`club-reward ${available ? 'available' : ''}`}>
      <div className="club-reward-icon"><Gift size={23} /></div>
      <div><h3>{reward.name}</h3><p>{reward.description}</p></div>
      <strong>{reward.pointsRequired} Pecas</strong>
      <button type="button" disabled={!available || busy} onClick={() => onRedeem(reward)}>{available ? 'Canjear' : reward.stock === 0 ? 'Agotada' : `Te faltan ${reward.pointsRequired - balance}`}</button>
    </article>
  );
}

function Dashboard({ data, view, reload }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const next = data.nextReward;
  const missing = next ? Math.max(0, next.pointsRequired - data.balance) : 0;

  async function redeem(reward) {
    if (!window.confirm(`Canjear ${reward.pointsRequired} Pecas por ${reward.name}?`)) return;
    setBusy(true); setMessage('');
    try {
      const result = await clubFetch('/api/club/redeem', { method: 'POST', body: JSON.stringify({ rewardId: reward.id }) });
      setMessage(`Canje listo. Muestra este código en caja: ${result.redemption.code}.`);
      await reload();
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }

  if (view === 'rewards') return <section className="club-page"><div className="club-page-title"><span className="club-kicker">Tu catálogo</span><h1>Recompensas</h1><p>Tienes <strong>{data.balance} Pecas ●</strong></p></div>{message && <p className="club-notice">{message}</p>}<div className="club-rewards-grid">{data.rewards.map((item) => <RewardCard key={item.id} reward={item} balance={data.balance} onRedeem={redeem} busy={busy} />)}</div></section>;

  if (view === 'history') return <section className="club-page"><div className="club-page-title"><span className="club-kicker">Todo en orden</span><h1>Historial de Pecas</h1><p>Tu saldo se obtiene de estos movimientos.</p></div><div className="club-history">{data.transactions.length ? data.transactions.map((item) => <article key={item.id}><span className={item.points > 0 ? 'positive' : 'negative'}>{item.points > 0 ? '+' : ''}{item.points} Pecas</span><div><strong>{item.description}</strong><small>{formatDate(item.createdAtUtc)}</small></div></article>) : <p className="club-empty">Aún no tienes movimientos.</p>}</div></section>;

  return (
    <section className="club-page club-dashboard">
      <div className="club-welcome-card">
        <span className="club-kicker">Hola, {data.customer.name.split(' ')[0]}</span>
        <h1>Tienes <strong>{data.balance} Pecas ●</strong></h1>
        {next ? <><p>Te faltan <strong>{missing} Pecas</strong> para tu siguiente recompensa.</p><div className="club-progress"><span style={{ width: `${Math.min(100, (data.balance / next.pointsRequired) * 100)}%` }} /></div><div className="club-next"><Gift size={22} /><span>Próxima recompensa<strong>{next.name} — {next.pointsRequired} Pecas</strong></span></div></> : <p>Ya puedes elegir cualquier recompensa disponible.</p>}
        <div className="club-card-actions"><a href={clubUrl('/club/recompensas')}>Ver recompensas</a><a href={clubUrl('/club/historial')}>Historial</a></div>
      </div>

      <div className="club-dashboard-grid">
        <section className="club-section"><div className="club-section-heading"><span><Sparkles size={19} /> Solo para el Club</span><h2>Promociones exclusivas</h2></div>{data.promotions.length ? <div className="club-promos">{data.promotions.map((promo) => <article key={promo.id}>{promo.imageUrl && <img src={promo.imageUrl} alt="" />}<div><h3>{promo.title}</h3><p>{promo.description}</p>{promo.terms && <small>{promo.terms}</small>}{promo.storePromotionId && <a className="club-primary" href={clubUrl(`/?club_promo=${encodeURIComponent(promo.storePromotionId)}#promociones`)}>Agregar al carrito</a>}</div></article>)}</div> : <div className="club-empty">Muy pronto encontrarás beneficios exclusivos aquí.</div>}</section>
        <section className="club-referral"><UserPlus size={25} /><span className="club-kicker">Invita a un amigo</span><h2>Ambos reciben 5 Pecas</h2><p>Tu amigo recibe 5 Pecas en su primera compra y tú también.</p><button type="button" onClick={() => { navigator.clipboard?.writeText(data.customer.referralCode); setMessage('Código copiado.'); }}><span>Tu código: <strong>{data.customer.referralCode}</strong></span><Copy size={18} /></button><small>{data.referrals.rewarded} referidos recompensados</small></section>
      </div>
      {message && <p className="club-notice">{message}</p>}
      <section className="club-section club-recent"><div className="club-section-heading"><span><Clock3 size={19} /> Actividad</span><h2>Movimientos recientes</h2></div><div className="club-history">{data.transactions.slice(0, 4).map((item) => <article key={item.id}><span className={item.points > 0 ? 'positive' : 'negative'}>{item.points > 0 ? '+' : ''}{item.points}</span><div><strong>{item.description}</strong><small>{formatDate(item.createdAtUtc)}</small></div></article>)}</div></section>
    </section>
  );
}

export default function PecasClub() {
  const view = useMemo(routeName, []);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));
  const [error, setError] = useState('');

  useEffect(() => {
    const titles = {
      register: 'Únete a Pecas Club',
      login: 'Ingresa a Pecas Club',
      rewards: 'Recompensas | Pecas Club',
      history: 'Historial | Pecas Club',
      terms: 'Términos | Pecas Club',
      home: 'Pecas Club | Recompensas que se disfrutan',
    };
    document.title = titles[view] || titles.home;
    document.querySelector('meta[name="description"]')?.setAttribute('content', 'Acumula una Peca por cada $20, consulta promociones y canjea tus recompensas en Pecas Club.');
    let favicon = document.querySelector('link[rel="icon"]');
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.setAttribute('rel', 'icon');
      document.head.appendChild(favicon);
    }
    favicon.setAttribute('href', '/tenants/pecas/pecas-icon-hd.png');
  }, [view]);

  async function load() {
    if (!getToken()) { setLoading(false); return; }
    setLoading(true);
    try { setData(await clubFetch('/api/club/dashboard')); setError(''); }
    catch (err) { if (err.status === 401) setToken(''); setError(err.message); setData(null); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function logout() {
    try { await clubFetch('/api/club/session', { method: 'DELETE' }); } catch { /* cerrar local de todos modos */ }
    setToken(''); setData(null); window.location.href = clubUrl('/club/iniciar-sesion');
  }

  const authView = view === 'login' || view === 'register';
  const termsView = view === 'terms';
  return (
    <main className="club-shell">
      <ClubHeader customer={data?.customer} onLogout={logout} />
      {termsView ? <section className="club-page club-terms"><span className="club-kicker">Reglas claras</span><h1>Términos de Pecas Club</h1><p>Obtienes una Peca por cada $20 de compra elegible. Las Pecas se acreditan cuando el pedido queda pagado o completado y no tienen valor en efectivo.</p><p>Los canjes descuentan las Pecas indicadas y generan un código de confirmación. Una recompensa puede estar sujeta a disponibilidad y no combinarse con otras promociones cuando así se indique.</p><p>Los bonos de referido se entregan una sola vez después de la primera compra elegible del nuevo miembro. Las coincidencias de teléfono, correo, domicilio de entrega u otras señales pueden enviarse a revisión para prevenir autorreferidos.</p><p>Las devoluciones o cancelaciones pueden generar la reversión de las Pecas correspondientes. Pecas podrá corregir movimientos duplicados o erróneos dejando registro en el historial.</p><p>Para aclaraciones escribe a <a href="mailto:admin@pecas.mx">admin@pecas.mx</a>.</p></section>
        : loading ? <div className="club-loading"><span /><p>Cargando tus Pecas…</p></div>
        : authView && !data ? <AuthView mode={view} onAuthenticated={() => {}} />
          : data ? <Dashboard data={data} view={view} reload={load} />
            : <AuthView mode="login" onAuthenticated={() => {}} />}
      {error && !authView && <p className="club-error club-global-error">{error}</p>}
      <footer className="club-footer"><span>Pecas Club ●</span><a href="mailto:admin@pecas.mx">admin@pecas.mx</a><a href="/privacidad">Aviso de Privacidad</a><a href={clubUrl('/club/terminos')}>Términos</a></footer>
    </main>
  );
}
