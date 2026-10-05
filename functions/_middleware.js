const PECAS_DESCRIPTION = 'Compra tus favoritos en Pecas, acumula una Peca por cada $20 y canjea recompensas exclusivas en Pecas Club.';
const PECAS_SOCIAL_IMAGE = 'https://pecas.mx/tenants/pecas/promotions/unete-pecas-club.png';

function isPecasRequest(request) {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  return host === 'pecas.mx'
    || host === 'www.pecas.mx'
    || ((host === 'localhost' || host === '127.0.0.1') && url.searchParams.get('tenant_id') === 'pecas');
}

function socialTags(url, title) {
  const canonical = `${url.origin}${url.pathname}`;
  return [
    `<meta property="og:site_name" content="Pecas">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${PECAS_DESCRIPTION}">`,
    `<meta property="og:url" content="${canonical}">`,
    `<meta property="og:image" content="${PECAS_SOCIAL_IMAGE}">`,
    `<meta property="og:image:width" content="1891">`,
    `<meta property="og:image:height" content="831">`,
    `<meta property="og:image:alt" content="Únete a Pecas Club">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${PECAS_DESCRIPTION}">`,
    `<meta name="twitter:image" content="${PECAS_SOCIAL_IMAGE}">`,
    `<link rel="icon" href="/tenants/pecas/pecas-icon-hd.png">`,
    `<link rel="apple-touch-icon" href="/tenants/pecas/pecas-icon-hd.png">`,
  ].join('');
}

export async function onRequest(context) {
  const response = await context.next();
  if (!isPecasRequest(context.request)) return response;
  if (!String(response.headers.get('content-type') || '').toLowerCase().includes('text/html')) return response;

  const url = new URL(context.request.url);
  const inClub = url.pathname === '/club' || url.pathname.startsWith('/club/');
  const title = inClub ? 'Pecas Club | Recompensas que se disfrutan' : 'Pecas | Ordena en línea';
  const transformed = new HTMLRewriter()
    .on('title', { element(element) { element.setInnerContent(title); } })
    .on('meta[name="description"]', { element(element) { element.setAttribute('content', PECAS_DESCRIPTION); } })
    .on('meta[name="theme-color"]', { element(element) { element.setAttribute('content', '#a61e35'); } })
    .on('head', { element(element) { element.append(socialTags(url, title), { html: true }); } })
    .transform(response);
  return transformed;
}
