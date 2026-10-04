import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Menu, MessageCircle, Minus, Moon, Plus, Search, ShoppingBag, Sparkles, Sun, Trash2, X } from 'lucide-react';
import './perfume.css';

const currency = (value) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(value || 0);
const clean = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const uniqueNormalized = (items) => {
  const values = new Map();
  items.filter(Boolean).forEach((item) => {
    const label = String(item).trim();
    const key = clean(label);
    if (key && !values.has(key)) values.set(key, label);
  });
  return [...values.values()];
};

function apiPath(path) {
  const tenantId = new URLSearchParams(window.location.search).get('tenant_id');
  return tenantId ? `${path}?tenant_id=${encodeURIComponent(tenantId)}` : path;
}

function metadata(product) {
  return product.metadata && typeof product.metadata === 'object' ? product.metadata : {};
}

function ProductCard({ product, onAdd }) {
  const meta = metadata(product);
  const variants = meta.variants || [{ id: 'default', label: meta.presentation || '', price: product.price }];
  const [variant, setVariant] = useState(variants[0]?.id || 'default');
  const selected = variants.find((item) => item.id === variant) || variants[0];
  return (
    <article className="perfume-card">
      <div className="perfume-card-image">
        {product.badge && <span className="perfume-badge">{product.badge}</span>}
        <img src={product.image} alt={`Frasco de ${product.name}`} loading="lazy" />
      </div>
      <div className="perfume-card-body">
        <span className="perfume-designer">{meta.designer}</span>
        <h3>{product.name}</h3>
        <p className="perfume-inspired">Inspirado en {meta.inspiredBy || product.name}</p>
        <p className="perfume-accords">{(meta.accords || []).slice(0, 3).join(' · ')}</p>
        <div className="perfume-buy-row">
          <label>
            <span className="sr-only">Presentación</span>
            <select value={variant} onChange={(event) => setVariant(event.target.value)}>
              {variants.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <strong>{currency(selected?.price ?? product.price)}</strong>
        </div>
        <button className="gold-button full" type="button" onClick={() => onAdd(product, selected)}><Plus size={17} /> Agregar</button>
      </div>
    </article>
  );
}

function Quiz({ products, onClose, onResult }) {
  const questions = [
    { key: 'gender', title: '¿Para quién es?', options: [['Dama', 'Dama'], ['Caballero', 'Caballero'], ['Unisex', 'Unisex']] },
    { key: 'mood', title: '¿Qué sensación buscas?', options: [['Fresco y limpio', 'fresco'], ['Dulce y envolvente', 'dulce'], ['Elegante y amaderado', 'amaderado']] },
    { key: 'moment', title: '¿Cuándo lo usarías más?', options: [['Todos los días', 'diario'], ['Trabajo y reuniones', 'oficina'], ['Noches y eventos', 'noche']] },
    { key: 'presence', title: '¿Qué tanto quieres destacar?', options: [['Sutil', 'fresco'], ['Equilibrado', 'aromatico'], ['Intenso', 'especiado']] },
    { key: 'note', title: 'Elige una familia favorita', options: [['Cítricos', 'citrico'], ['Flores', 'floral'], ['Vainilla y ámbar', 'avainillado']] },
  ];
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const choose = (value) => {
    const next = { ...answers, [questions[step].key]: value };
    setAnswers(next);
    if (step < questions.length - 1) setStep(step + 1);
    else {
      const scored = products.map((product) => {
        const meta = metadata(product);
        const haystack = clean([meta.gender, ...(meta.accords || []), ...(meta.occasions || [])].join(' '));
        const score = Object.values(next).reduce((sum, answer) => sum + (haystack.includes(clean(answer)) ? 1 : 0), 0);
        return { product, score };
      }).sort((a, b) => b.score - a.score);
      onResult(scored.slice(0, 6).map((item) => item.product));
      onClose();
    }
  };
  const question = questions[step];
  return (
    <div className="perfume-modal" role="dialog" aria-modal="true" aria-label="Encuentra tu perfume">
      <div className="quiz-card">
        <button className="icon-button close" onClick={onClose} aria-label="Cerrar"><X /></button>
        <span className="eyebrow">Pregunta {step + 1} de {questions.length}</span>
        <div className="quiz-progress"><i style={{ width: `${((step + 1) / questions.length) * 100}%` }} /></div>
        <h2>{question.title}</h2>
        <div className="quiz-options">
          {question.options.map(([label, value]) => <button type="button" key={value} onClick={() => choose(value)}>{label}<span>→</span></button>)}
        </div>
      </div>
    </div>
  );
}

function Cart({ items, setItems, settings, brand }) {
  const [open, setOpen] = useState(false);
  const [customer, setCustomer] = useState({ name: '', phone: '', address: '', notes: '' });
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const total = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const update = (uid, quantity) => setItems((current) => quantity < 1 ? current.filter((item) => item.uid !== uid) : current.map((item) => item.uid === uid ? { ...item, quantity } : item));
  const message = () => [
    brand.orderMessageIntro || `Hola ${brand.displayName}, quiero hacer un pedido:`,
    '',
    ...items.map((item) => `• ${item.quantity} × ${item.name} (${item.variantLabel}${item.pheromones ? ', con feromonas' : ''}) — ${currency(item.unitPrice * item.quantity)}`),
    '', `Total: ${currency(total)}`,
    customer.name ? `Nombre: ${customer.name}` : '', customer.address ? `Entrega: ${customer.address}` : '', customer.notes ? `Notas: ${customer.notes}` : '',
  ].filter(Boolean).join('\n');
  const whatsapp = () => {
    const number = String(settings.whatsappNumber || '').replace(/\D/g, '');
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(message())}`, '_blank', 'noopener,noreferrer');
  };
  const pay = async () => {
    if (!customer.name.trim()) { setError('Escribe tu nombre para continuar.'); return; }
    setPaying(true); setError('');
    try {
      const response = await fetch(apiPath('/api/checkout/create'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: { ...customer, fulfillmentType: customer.address ? 'Entrega a domicilio' : 'Recoger' },
          fulfillmentType: customer.address ? 'Entrega a domicilio' : 'Recoger',
          items: items.map((item) => ({ product_id: item.id, quantity: item.quantity, options: { variant: item.variantId, addOns: item.pheromones ? ['feromonas'] : [] } })),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'No se pudo iniciar el pago.');
      if (data.initPoint || data.init_point) window.location.assign(data.initPoint || data.init_point);
      else throw new Error('Mercado Pago no devolvió un enlace de pago.');
    } catch (exception) { setError(exception.message); } finally { setPaying(false); }
  };
  return <>
    <button className="cart-button" onClick={() => setOpen(true)}><ShoppingBag size={19} /><span>Carrito</span><b>{count}</b></button>
    {open && <div className="cart-backdrop" onClick={() => setOpen(false)} />}
    <aside className={`perfume-cart ${open ? 'open' : ''}`} aria-hidden={!open}>
      <header><div><span className="eyebrow">Tu selección</span><h2>Carrito</h2></div><button className="icon-button" onClick={() => setOpen(false)} aria-label="Cerrar"><X /></button></header>
      <div className="cart-scroll">
        {!items.length ? <div className="cart-empty"><ShoppingBag /><p>Tu carrito está vacío.</p><button onClick={() => setOpen(false)}>Explorar perfumes</button></div> : items.map((item) => <div className="cart-line" key={item.uid}>
          <img src={item.image} alt="" /><div><strong>{item.name}</strong><span>{item.variantLabel}</span><label className="addon-check"><input type="checkbox" checked={item.pheromones} onChange={(e) => setItems((current) => current.map((row) => row.uid === item.uid ? { ...row, pheromones: e.target.checked, unitPrice: item.basePrice + (e.target.checked ? 10 : 0) } : row))} /> + Feromonas</label><div className="quantity"><button onClick={() => update(item.uid, item.quantity - 1)}><Minus /></button><b>{item.quantity}</b><button onClick={() => update(item.uid, item.quantity + 1)}><Plus /></button><button className="trash" onClick={() => update(item.uid, 0)}><Trash2 /></button></div></div><b>{currency(item.unitPrice * item.quantity)}</b>
        </div>)}
        {!!items.length && <div className="checkout-fields"><h3>Datos de pedido</h3><input placeholder="Nombre *" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} /><input placeholder="WhatsApp" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} /><input placeholder="Dirección (opcional)" value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} /><textarea placeholder="Notas" value={customer.notes} onChange={(e) => setCustomer({ ...customer, notes: e.target.value })} /></div>}
      </div>
      {!!items.length && <footer><div className="cart-total"><span>Total</span><strong>{currency(total)}</strong></div>{error && <p className="checkout-error">{error}</p>}<button className="gold-button full" onClick={pay} disabled={paying}>{paying ? 'Conectando…' : 'Pagar con Mercado Pago'}</button><button className="whatsapp-button full" onClick={whatsapp}><MessageCircle /> Pedir por WhatsApp</button></footer>}
    </aside>
  </>;
}

export default function PerfumeStore({ initialPayload }) {
  const payload = initialPayload || {};
  const tenant = payload.tenant || {};
  const brand = tenant.brand || {};
  const settings = tenant.settings || {};
  const products = useMemo(() => (payload.extraProducts || []).filter((product) => !product.unavailable), [payload]);
  const [items, setItems] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizResults, setQuizResults] = useState([]);
  const [showAll, setShowAll] = useState(false);
  const [filters, setFilters] = useState({ query: '', gender: '', accord: '', occasion: '' });
  const [colorMode, setColorMode] = useState(() => {
    try { return window.localStorage.getItem('elixir-color-mode') === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
  });
  useEffect(() => { document.title = brand.pageTitle || `${brand.displayName || tenant.name} · Perfumes`; }, [brand, tenant]);
  useEffect(() => {
    try { window.localStorage.setItem('elixir-color-mode', colorMode); } catch { /* Preferencia opcional. */ }
  }, [colorMode]);
  const accords = useMemo(() => uniqueNormalized(products.flatMap((p) => metadata(p).accords || [])).sort((a, b) => a.localeCompare(b, 'es')), [products]);
  const occasions = useMemo(() => uniqueNormalized(products.flatMap((p) => metadata(p).occasions || [])).sort((a, b) => a.localeCompare(b, 'es')), [products]);
  const filtered = useMemo(() => products.filter((product) => {
    const meta = metadata(product); const q = clean(filters.query);
    const matchesQuery = !q || clean([product.name, meta.designer, meta.inspiredBy].join(' ')).includes(q);
    const matchesGender = !filters.gender || clean(meta.gender) === clean(filters.gender) || (filters.gender === 'Unisex' && clean(meta.gender).includes('unisex'));
    const matchesAccord = !filters.accord || (meta.accords || []).some((item) => clean(item) === clean(filters.accord));
    const matchesOccasion = !filters.occasion || (meta.occasions || []).some((item) => clean(item) === clean(filters.occasion));
    return matchesQuery && matchesGender && matchesAccord && matchesOccasion;
  }), [products, filters]);
  const visible = showAll || Object.values(filters).some(Boolean) ? filtered : filtered.slice(0, 12);
  const favorites = products.filter((product) => metadata(product).featured).slice(0, 6);
  const add = (product, variant) => setItems((current) => {
    const uid = `${product.id}:${variant.id}`; const existing = current.find((item) => item.uid === uid);
    if (existing) return current.map((item) => item.uid === uid ? { ...item, quantity: item.quantity + 1 } : item);
    return [...current, { uid, id: product.id, name: product.name, image: product.image, variantId: variant.id, variantLabel: variant.label, basePrice: Number(variant.price), unitPrice: Number(variant.price), pheromones: false, quantity: 1 }];
  });
  const scrollCatalog = () => document.querySelector('#catalogo')?.scrollIntoView({ behavior: 'smooth' });
  return <main className={`perfume-store ${colorMode === 'dark' ? 'dark-mode' : 'light-mode'}`}>
    <header className="perfume-nav"><a className="perfume-logo" href="#inicio"><img src={brand.logoUrl} alt={brand.displayName || tenant.name} /></a><nav className={menuOpen ? 'open' : ''}><a href="#catalogo" onClick={() => setMenuOpen(false)}>Catálogo</a><button onClick={() => { setQuizOpen(true); setMenuOpen(false); }}>Encuentra tu perfume</button><a href="#como-comprar" onClick={() => setMenuOpen(false)}>Cómo comprar</a><a className="nav-whatsapp" href={`https://wa.me/${String(settings.whatsappNumber || '').replace(/\D/g, '')}`} target="_blank" rel="noreferrer"><MessageCircle /> WhatsApp</a></nav><div className="nav-actions"><button className="theme-toggle" type="button" onClick={() => setColorMode((current) => current === 'dark' ? 'light' : 'dark')} aria-label={colorMode === 'dark' ? 'Mostrar en blanco' : 'Mostrar en negro'}>{colorMode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}<span>{colorMode === 'dark' ? 'Blanco' : 'Negro'}</span></button><Cart items={items} setItems={setItems} settings={settings} brand={brand} /><button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menú"><Menu /></button></div></header>
    <section className="perfume-hero" id="inicio"><div className="hero-copy"><span className="eyebrow">{brand.heroEyebrow || 'Perfumería en Monterrey'}</span><h1>{brand.heroTitle}</h1><p>{brand.heroText}</p><div className="hero-actions"><button className="gold-button" onClick={scrollCatalog}>{brand.primaryActionLabel || 'Ver catálogo'}</button><button className="outline-button" onClick={() => setQuizOpen(true)}>{brand.secondaryActionLabel || 'Encuentra mi perfume'}</button></div></div><div className="hero-visual"><div className="gold-orbit" /><img src={brand.heroImageUrl} alt="Frasco Elixir Parfúm" /><span className="hero-note note-one">Esencias<br/><b>de alta calidad</b></span><span className="hero-note note-two">Aroma<br/><b>que te representa</b></span></div></section>
    <section className="category-section section"><div className="section-heading"><span className="eyebrow">Compra por categoría</span><h2>Un aroma para cada esencia.</h2></div><div className="category-grid">{['Dama', 'Caballero', 'Unisex'].map((gender, index) => <button key={gender} onClick={() => { setFilters({ ...filters, gender }); setShowAll(true); scrollCatalog(); }}><span>0{index + 1}</span><h3>{gender}</h3><p>{gender === 'Dama' ? 'Florales, frutales y envolventes.' : gender === 'Caballero' ? 'Frescos, intensos y sofisticados.' : 'Aromas sin etiquetas, para todos.'}</p><i>Explorar →</i></button>)}</div></section>
    <section className="favorites-section section"><div className="section-heading row"><div><span className="eyebrow">Los favoritos</span><h2>Los que siempre dejan huella.</h2></div><button className="text-link" onClick={scrollCatalog}>Ver catálogo completo →</button></div><div className="product-grid">{favorites.map((product) => <ProductCard key={product.id} product={product} onAdd={add} />)}</div></section>
    <section className="quiz-banner section"><div><Sparkles /><span className="eyebrow">Tu aroma ideal</span><h2>¿No sabes cuál elegir?</h2><p>Responde 5 preguntas y descubre los aromas que van contigo.</p></div><button className="gold-button" onClick={() => setQuizOpen(true)}>Encontrar mi perfume</button></section>
    {quizResults.length > 0 && <section className="section quiz-results"><div className="section-heading"><span className="eyebrow">Elegidos para ti</span><h2>Tus mejores coincidencias.</h2></div><div className="product-grid">{quizResults.map((product) => <ProductCard key={product.id} product={product} onAdd={add} />)}</div></section>}
    <section className="catalog-section section" id="catalogo"><div className="section-heading row"><div><span className="eyebrow">Explora el catálogo</span><h2>Encuentra tu próxima firma.</h2></div><p>{filtered.length} perfumes</p></div><div className="catalog-tools"><label className="search-box"><Search /><input value={filters.query} onChange={(e) => setFilters({ ...filters, query: e.target.value })} placeholder="Buscar por nombre o diseñador" /></label><select value={filters.gender} onChange={(e) => setFilters({ ...filters, gender: e.target.value })}><option value="">Todos los géneros</option><option>Dama</option><option>Caballero</option><option>Unisex</option></select><select value={filters.accord} onChange={(e) => setFilters({ ...filters, accord: e.target.value })}><option value="">Todos los aromas</option>{accords.map((item) => <option key={clean(item)} value={item}>{item}</option>)}</select><select value={filters.occasion} onChange={(e) => setFilters({ ...filters, occasion: e.target.value })}><option value="">Toda ocasión</option>{occasions.map((item) => <option key={clean(item)} value={item}>{item}</option>)}</select></div><div className="product-grid catalog-grid">{visible.map((product) => <ProductCard key={product.id} product={product} onAdd={add} />)}</div>{!showAll && filtered.length > visible.length && <button className="outline-button show-all" onClick={() => setShowAll(true)}>Ver todos los perfumes <span>({products.length})</span></button>}</section>
    <section className="how-section section" id="como-comprar"><div className="section-heading"><span className="eyebrow">Así de fácil</span><h2>Tu perfume, en tres pasos.</h2></div><div className="steps">{[['01', 'Elige tu perfume', 'Busca por nombre, diseñador o déjate guiar por el cuestionario.'], ['02', 'Selecciona presentación', 'Elige 30 o 60 ml y agrega feromonas si lo deseas.'], ['03', 'Haz tu pedido', 'Paga con Mercado Pago o termina tu compra por WhatsApp.']].map(([n,t,d]) => <div key={n}><b>{n}</b><h3>{t}</h3><p>{d}</p></div>)}</div></section>
    <section className="faq-section section"><div className="section-heading"><span className="eyebrow">Preguntas frecuentes</span><h2>Todo lo que necesitas saber.</h2></div><div className="faq-list">{(settings.faq || []).map((item) => <details key={item.question}><summary>{item.question}<ChevronDown /></summary><p>{item.answer}</p></details>)}</div></section>
    <footer className="perfume-footer"><div><img src={brand.logoUrl} alt="" /><h2>¿Buscas un aroma en particular?</h2><p>Te ayudamos a encontrarlo.</p></div><div className="footer-links"><a href={`https://wa.me/${String(settings.whatsappNumber || '').replace(/\D/g, '')}`} target="_blank" rel="noreferrer">WhatsApp</a>{settings.instagramUrl && <a href={settings.instagramUrl} target="_blank" rel="noreferrer">Instagram</a>}{settings.supportEmail && <a href={`mailto:${settings.supportEmail}`}>Contacto</a>}</div><small>© {new Date().getFullYear()} {brand.displayName || tenant.name}. Todos los derechos reservados.</small></footer>
    {quizOpen && <Quiz products={products} onClose={() => setQuizOpen(false)} onResult={(result) => { setQuizResults(result); setTimeout(() => document.querySelector('.quiz-results')?.scrollIntoView({ behavior: 'smooth' }), 50); }} />}
  </main>;
}
