import React from 'react';

// Aviso de Privacidad de la plataforma Omdexa, redactado para cubrir los
// elementos que exige la LFPDPPP (Ley Federal de Protección de Datos
// Personales en Posesión de los Particulares) y su Reglamento: identidad
// del responsable, datos recabados, finalidades primarias/secundarias,
// transferencias, mecanismo de derechos ARCO, uso de cookies y
// procedimiento de cambios.
//
// ESTO ES UN BORRADOR RAZONABLE, NO ASESORÍA LEGAL. Antes de operar con
// clientes reales y datos personales de forma continua, hazlo revisar por
// alguien con conocimiento en protección de datos en México. Completa los
// campos marcados como [COMPLETAR] con la información real de tu negocio.

export default function PrivacyPolicy() {
  return (
    <main className="privacy-page">
      <div className="privacy-page-inner">
        <h1>Aviso de Privacidad</h1>
        <p className="privacy-updated">Última actualización: [COMPLETAR: fecha de publicación]</p>

        <section>
          <h2>1. Responsable del tratamiento de tus datos personales</h2>
          <p>
            <strong>Omdexa</strong> ("Omdexa", "nosotros"), con domicilio en
            [COMPLETAR: domicilio fiscal/comercial], es responsable del
            tratamiento de tus datos personales conforme a este Aviso de
            Privacidad y a la Ley Federal de Protección de Datos Personales
            en Posesión de los Particulares (LFPDPPP) y su Reglamento.
          </p>
          <p>
            Omdexa opera una plataforma tecnológica (software como
            servicio) que negocios independientes ("negocios clientes",
            por ejemplo restaurantes o tiendas) usan para vender en línea,
            tomar pedidos, administrar inventario y comunicarse con sus
            propios clientes por WhatsApp, Messenger e Instagram.
          </p>
          <p>
            <strong>Distinción importante:</strong> si compraste o hiciste
            un pedido a través de la tienda en línea o el chat de un
            negocio cliente (por ejemplo, a través de un número de
            WhatsApp o página de Facebook/Instagram de ese negocio), el
            <strong> responsable de tus datos como cliente final es ese
            negocio</strong>, no Omdexa. Omdexa actúa únicamente como{' '}
            <strong>encargado</strong>: procesamos esos datos por cuenta
            y siguiendo instrucciones del negocio, mediante la tecnología
            que le proveemos. Si tienes dudas sobre tus datos como cliente
            de un negocio específico, contacta primero a ese negocio.
          </p>
          <p>
            Si eres dueño o administrador de un negocio que usa Omdexa
            como plataforma (cliente de Omdexa), entonces Omdexa{' '}
            <strong>sí es responsable</strong> de los datos de tu cuenta,
            tu negocio y tu uso de la plataforma, conforme se describe en
            este Aviso.
          </p>
        </section>

        <section>
          <h2>2. Datos personales que recabamos</h2>
          <p>Dependiendo de cómo interactúes con la plataforma, podemos recabar:</p>
          <ul>
            <li>
              <strong>Datos de identificación y contacto</strong>: nombre,
              teléfono, dirección de entrega, correo electrónico.
            </li>
            <li>
              <strong>Datos de la cuenta del negocio</strong> (si eres
              cliente de Omdexa): nombre del negocio, credenciales de
              acceso, configuración de catálogo/inventario, información de
              facturación de tu suscripción.
            </li>
            <li>
              <strong>Datos de pedidos</strong>: productos solicitados,
              montos, método de entrega, notas del pedido.
            </li>
            <li>
              <strong>Contenido de conversaciones</strong> por WhatsApp,
              Messenger e Instagram, cuando escribes a un negocio que usa
              Omdexa para tomar pedidos por chat (mensajes de texto,
              selección de productos, respuestas a botones/listas).
            </li>
            <li>
              <strong>Datos técnicos</strong>: dirección IP, tipo de
              dispositivo/navegador, y cookies estrictamente necesarias
              para el funcionamiento del sitio (ver sección 6).
            </li>
          </ul>
          <p>
            No recabamos deliberadamente datos personales sensibles (salud,
            origen étnico, creencias religiosas, preferencias sexuales,
            etc.). Te pedimos no incluir ese tipo de información en notas
            de pedido o mensajes de chat.
          </p>
        </section>

        <section>
          <h2>3. Finalidades del tratamiento</h2>
          <p><strong>Finalidades primarias</strong> (necesarias para el servicio, sin las cuales no podemos operar la plataforma o procesar tu pedido):</p>
          <ul>
            <li>Procesar y dar seguimiento a pedidos realizados a un negocio cliente.</li>
            <li>Permitir la comunicación entre el negocio cliente y sus clientes finales por WhatsApp, Messenger o Instagram.</li>
            <li>Administrar cuentas de negocios clientes, facturación de la suscripción y soporte técnico.</li>
            <li>Prevenir fraude y garantizar la seguridad de la plataforma.</li>
            <li>Cumplir obligaciones legales y fiscales aplicables.</li>
          </ul>
          <p><strong>Finalidades secundarias</strong> (no indispensables, puedes oponerte sin que se cancele el servicio):</p>
          <ul>
            <li>Enviarte comunicaciones sobre nuevas funciones o mejoras de la plataforma (solo a negocios clientes, no a clientes finales de un negocio).</li>
            <li>Elaborar estadísticas internas para mejorar el servicio.</li>
          </ul>
          <p>
            Si no deseas que tus datos se usen para las finalidades
            secundarias, escríbenos a{' '}
            <a href="mailto:hola@omdexa.com">hola@omdexa.com</a> indicando
            tu oposición; dejaremos de usarlos para esos fines dentro de un
            plazo razonable.
          </p>
        </section>

        <section>
          <h2>4. Transferencias de datos</h2>
          <p>
            Para operar la plataforma, compartimos datos con los siguientes
            terceros, únicamente en la medida necesaria para prestar el
            servicio:
          </p>
          <ul>
            <li>
              <strong>Meta Platforms, Inc.</strong> (WhatsApp Business
              Platform, Messenger e Instagram): para enviar y recibir
              mensajes en nombre del negocio cliente correspondiente. Meta
              procesa estos datos conforme a sus propias políticas de
              privacidad.
            </li>
            <li>
              <strong>Mercado Pago</strong>: para procesar pagos en línea,
              cuando el negocio cliente tiene esa opción activada.
            </li>
            <li>
              <strong>Cloudflare, Inc.</strong>: como proveedor de
              infraestructura (hosting, base de datos, red) donde se
              almacenan y procesan los datos de la plataforma.
            </li>
          </ul>
          <p>
            No vendemos ni rentamos datos personales a terceros con fines
            publicitarios. Cualquier otra transferencia distinta a las
            aquí descritas requerirá tu consentimiento, salvo las
            excepciones previstas en el artículo 37 de la LFPDPPP.
          </p>
        </section>

        <section>
          <h2>5. Derechos ARCO (Acceso, Rectificación, Cancelación y Oposición)</h2>
          <p>
            Tienes derecho a acceder a tus datos personales que poseemos,
            rectificarlos si son inexactos, solicitar su cancelación
            cuando consideres que no se requieren para alguna finalidad, u
            oponerte al uso de los mismos para fines específicos.
          </p>
          <p>
            Para ejercer estos derechos (si eres cliente directo de
            Omdexa, o quieres saber qué datos técnicos procesamos como
            encargado), escríbenos a{' '}
            <a href="mailto:hola@omdexa.com">hola@omdexa.com</a> indicando:
            (a) tu nombre completo, (b) el derecho que deseas ejercer, (c)
            una descripción clara de tu solicitud, y (d) cualquier
            documento que facilite localizar tus datos. Responderemos en
            un plazo máximo de 20 días hábiles, conforme lo establece la
            LFPDPPP.
          </p>
          <p>
            Si tu solicitud se refiere a datos como cliente final de un
            negocio específico (por ejemplo, tu pedido a través de su
            WhatsApp), te ayudaremos a canalizarla, pero el negocio en
            cuestión es quien debe atenderla como responsable.
          </p>
        </section>

        <section>
          <h2>6. Uso de cookies y tecnologías similares</h2>
          <p>
            Usamos cookies y almacenamiento local del navegador
            estrictamente necesarios para mantener tu sesión iniciada,
            recordar tu carrito de compra y el idioma preferido. No
            utilizamos cookies de rastreo publicitario de terceros.
          </p>
        </section>

        <section>
          <h2>7. Cambios a este Aviso de Privacidad</h2>
          <p>
            Podemos actualizar este Aviso de Privacidad para reflejar
            cambios en nuestras prácticas o requisitos legales.
            Publicaremos cualquier cambio en esta misma página con su
            fecha de actualización. Te recomendamos revisarla
            periódicamente.
          </p>
        </section>

        <section>
          <h2>8. Contacto</h2>
          <p>
            Correo: <a href="mailto:hola@omdexa.com">hola@omdexa.com</a>
            <br />
            Teléfono/WhatsApp: +52 811 392 7548
          </p>
        </section>
      </div>
    </main>
  );
}
