// RETIRADO: el login por PIN de sucursal (caja/pedidos/inventario) y por
// contrasena global (admin/super/plataforma) se elimino. Todo el acceso al
// backoffice es ahora por cuenta individual (email + contrasena) via
// /api/auth/login y la pantalla #login. Este endpoint queda como 410 para
// que cualquier cliente viejo que aun lo llame reciba un error claro en vez
// de un 404 silencioso.
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestPost() {
  return jsonResponse({
    ok: false,
    error: 'El acceso por PIN ya no esta disponible. Entra con tu cuenta (email y contrasena) desde "Acceso" en la pagina.',
    retired: true,
    loginHref: '#login',
  }, 410);
}
