// Carga del SDK de JavaScript de Facebook, compartida entre cualquier
// componente que necesite FB.login() (WhatsAppSettings, MetaPageSettings).
//
// Un solo promise a nivel de módulo, cacheado -- así dos componentes (o dos
// clics seguidos) nunca compiten por sobreescribir window.fbAsyncInit ni
// terminan con dos <script> tags. Y NUNCA resolvemos por "window.FB ya
// existe": esa señal es prematura (el objeto FB puede existir antes de que
// FB.init() termine su propio setup interno, que no es necesariamente
// síncrono) -- eso es justo lo que producía "FB.login() called before
// FB.init()". Solo se resuelve cuando el SDK mismo llama a fbAsyncInit.
let sdkPromise = null;

export function loadFacebookSdk(appId, graphVersion) {
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    window.fbAsyncInit = function fbAsyncInit() {
      window.FB.init({ appId, cookie: true, xfbml: false, version: graphVersion });
      resolve(window.FB);
    };

    const existing = document.getElementById('facebook-jssdk');
    if (existing) return; // ya se está cargando por otro caller; su fbAsyncInit (el que acabamos de asignar) resolverá este mismo promise cacheado

    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = 'https://connect.facebook.net/es_LA/sdk.js';
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      sdkPromise = null; // permite reintentar si la carga falló
      reject(new Error('No se pudo cargar el SDK de Facebook.'));
    };
    document.body.appendChild(script);
  });

  return sdkPromise;
}
