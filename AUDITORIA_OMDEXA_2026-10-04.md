# Auditoría integral de Omdexa

Fecha: 4 de octubre de 2026  
Alcance: frontend público, backoffice, panel de plataforma, configuración multi-tenant, D1, pedidos, CRM, WhatsApp/Meta, módulos, pruebas y build.

## Resumen ejecutivo

Omdexa ya tiene una base funcional valiosa y Pecas demuestra que el producto puede operar de punta a punta. El mayor freno actual no es la falta de módulos, sino la fragmentación: existen flujos nuevos y heredados en paralelo, configuraciones duplicadas entre frontend/backend/D1 y pantallas que muestran demasiadas decisiones a la vez.

La prioridad correcta es estabilizar y simplificar antes de agregar más funciones.

Hallazgos centrales:

1. Los mensajes de comercio conversacional están implementados dos veces (WhatsApp y Messenger/Instagram), con 63 líneas no triviales idénticas y textos incrustados. Corregir un canal no corrige necesariamente los demás.
2. `PublicApp.jsx` y `LegacyApp.jsx` comparten 1,001 líneas no triviales. Esa duplicación permite que textos, cálculos y mensajes diverjan.
3. Los perfiles de módulos existen, pero solo contemplan `food`, `retail`, `services` y `custom`; no modelan realmente los procesos de floristería, perfumería, restaurantes, servicios con agenda, distribución, etc.
4. La matriz de módulos está duplicada en frontend y backend. Además, `historial` no aparece en los defaults, por lo que queda visible sin poderse desactivar desde la configuración.
5. Producción tiene cuatro tenants. Pecas y Elixir tienen giro configurado; Lilians y `test` no, así que caen al perfil gastronómico por defecto.
6. Lilians tiene contenido de prueba publicado (`Cesar`, `Te amo`, `bichi`), dos sucursales y cero productos. No es un problema visual: es configuración productiva incorrecta.
7. Elixir carga un catálogo de aproximadamente 179 KB antes de renderizar y después descarga otra vista lazy. En la revisión quedó varios segundos en `Cargando`; finalmente abrió. Es latencia/arquitectura, no una caída total.
8. Hay 58 sentencias `CREATE TABLE IF NOT EXISTS` ejecutables desde 17 archivos de API. El esquema se auto-repara durante peticiones en vez de depender exclusivamente de migraciones.
9. La migración inicial define `tenant_settings`, pero esa tabla no existe en producción. El sistema real usa `app_settings.value_json`. Hay deriva entre migraciones, código y base productiva.
10. Las 27 pruebas pasan y el build compila, pero no hay cobertura suficiente para WhatsApp, webhooks, aislamiento tenant, permisos, pedidos ni guardado de configuración.

## Prioridad P0: corregir antes de ampliar el producto

### 1. Unificar mensajes y estado conversacional

Crear un núcleo único de conversación independiente del canal:

- estado: catálogo, selección, carrito, datos, confirmación y cierre;
- contenido: catálogo, resumen, preguntas y errores;
- adaptadores: WhatsApp interactive list/buttons, Messenger/Instagram carousel/quick replies;
- plantillas configurables por tenant y giro;
- prueba de idempotencia: un evento de webhook produce como máximo una respuesta y un efecto;
- `correlation_id` por mensaje entrante, respuesta y pedido.

Esto elimina la causa estructural de respuestas duplicadas. No basta con editar una frase puntual en `whatsappBot.js`.

### 2. Instrumentar y comprobar el duplicado real

Agregar al log de mensajería:

- `provider_event_id`;
- `tenant_id`, canal y cliente;
- estado anterior y siguiente;
- mensaje saliente y tipo;
- `reply_to_event_id`;
- resultado `claimed`, `processed`, `duplicate` o `failed`.

Crear una vista de diagnóstico que agrupe eventos duplicados y permita ver si el duplicado viene de Meta, del webhook, del bot o de un reintento.

### 3. Limpiar producción de Lilians y aislar datos de demostración

- Corregir marca y textos públicos.
- Definir `businessType = floral` o un perfil equivalente.
- Eliminar o desactivar sucursales de prueba.
- Publicar catálogo real o mostrar una página de “próximamente” controlada.
- Separar el tenant `test` del listado y dominios productivos.
- Añadir estados `draft`, `onboarding`, `active`, `paused` y no publicar tiendas `draft/onboarding`.

### 4. Corregir la matriz de módulos

- Añadir `historial` explícitamente a todos los perfiles.
- Quitar `pagina-publica` de la matriz de negocio o permitirla realmente al rol tenant adecuado.
- Mantener una sola definición compartida de módulos, labels, dependencias y defaults.
- Validar dependencias: recetas requiere inventario; caja requiere catálogo; cobranza requiere clientes; integraciones solo aparece cuando el módulo consumidor existe.

### 5. Seguridad inmediata

- Reemplazar el PIN de registro de WhatsApp generado con `Math.random()` por `crypto.getRandomValues()`.
- Reemplazar números de pedido basados en `Math.random()` por UUID/contador transaccional cuando se usen como identificador externo.
- Retirar gradualmente el token estático heredado de plataforma y dejar solo sesiones revocables.
- Añadir pruebas de aislamiento por hostname/tenant en cada endpoint sensible.

## Prioridad P1: simplificar operación y configuración

### Centro de configuración

La configuración actual muestra demasiados campos técnicos y distribuye ajustes relacionados entre varias pantallas. Debe convertirse en un asistente:

1. Giro y objetivo del negocio.
2. Canales de venta.
3. Catálogo o servicios.
4. Entrega, agenda y cobro.
5. Equipo y permisos.
6. Marca y publicación.
7. Revisión final con checklist.

Cambios concretos:

- reemplazar listas CSV por chips con botón “Agregar”;
- selector de zona horaria, no texto libre;
- teléfono con país y validación;
- carga de logo/portada, no URL manual;
- selector de color visual;
- vista previa móvil/escritorio;
- plantillas de mensajes editables con variables visibles;
- “Guardar borrador” y “Publicar” separados;
- historial de cambios y restauración;
- validación previa: sin WhatsApp, sin catálogo, sin método de pago, dominio incompleto, etc.

### Navegación del backoffice

Agrupar por trabajos, no por tablas técnicas:

- **Vender:** Pedidos, Caja, Ventas.
- **Clientes:** CRM, Cobranza.
- **Productos:** Catálogo, Inventario, Recetas/Costos.
- **Analizar:** Inicio y Reportes.
- **Configurar:** Negocio, Integraciones y Equipo.

En móvil, usar navegación inferior con 4 accesos y un menú “Más”. Mostrar accesos rápidos según rol y tareas pendientes.

### Pantalla Inicio

Debe responder “¿qué tengo que atender ahora?”:

- pedidos nuevos o atrasados;
- pagos pendientes;
- productos agotados/bajo stock;
- conversaciones sin respuesta;
- ventas de hoy contra periodo anterior;
- accesos rápidos contextuales.

## Modelo de módulos por giro

No conviene crear una aplicación diferente por giro. Conviene usar capacidades compartidas, presets y vocabulario.

| Giro | Núcleo sugerido | Capacidades específicas | Vocabulario |
|---|---|---|---|
| Restaurante/cafetería | pedidos, caja, catálogo, clientes | recetas, modificadores, cocina, sucursales, horarios | menú, platillo, pedido |
| Florería | pedidos, catálogo, clientes, caja | fecha/hora de entrega, dedicatoria, ocasión, zonas, producto personalizado | arreglo, entrega, destinatario |
| Perfumería/retail | ventas, catálogo, clientes, cobranza | variantes, promociones por volumen, apartados, envíos | producto, variante, venta |
| Servicios | clientes, agenda, cobranza | citas, duración, profesional, anticipo, recordatorios | servicio, cita, cliente |
| Distribución/mayoreo | ventas, clientes, inventario, cobranza | listas de precio, crédito, rutas, mínimo, cotización | pedido, cuenta, ruta |

Cada preset debe declarar:

- módulos visibles;
- dependencias;
- labels;
- campos obligatorios;
- formulario público;
- estados de pedido/servicio;
- plantillas de mensajes;
- dashboard inicial;
- integraciones compatibles.

## Problemas específicos de WhatsApp y textos

### Duplicación de código

- WhatsApp y Meta repiten casi todo el flujo de carrito y creación de pedido.
- La tienda pública nueva y la heredada repiten traducciones, carrito y construcción de mensajes.
- Las plantillas rápidas del CRM están incrustadas en React y no son configurables por tenant.
- El texto de introducción vive en marca, defaults de frontend y defaults del API.

### Mensajes que deben normalizarse

Crear una función única que produzca un modelo estructurado:

```text
Pedido
  sucursal
  estado del horario
  líneas[]
    producto
    cantidad
    opciones únicas
    nota
    importe
  total
  cliente
  entrega
  pago
  número de pedido
```

Después cada canal renderiza ese modelo. Las opciones se deduplican por clave normalizada, no por texto final. Así se evita mostrar a la vez `details`, `removed`, `extras` y `optionGroups` con la misma selección.

### UX conversacional

- Mostrar confirmación compacta antes de crear el pedido.
- Permitir volver, editar cantidad y quitar producto.
- No pedir dirección si es recolección.
- No ofrecer métodos de pago no activos.
- Manejar catálogo vacío, negocio cerrado y humano solicitado.
- Escalar a persona con contexto y resumen.
- Permitir textos y tono por giro/tenant.

## Arquitectura y datos

### Fuente de verdad

Separar configuración en entidades versionadas:

- `tenant_profile`: giro, idioma, zona horaria y estado de onboarding;
- `tenant_capabilities`: módulos y flags;
- `tenant_brand`: marca y SEO;
- `tenant_commerce`: pagos, entrega, canales y horarios;
- `tenant_messages`: plantillas y variables;
- `tenant_branches`: sucursales reales;
- catálogo en tablas, no duplicado dentro de un JSON grande.

Mantener JSON solo para extensiones pequeñas, no como almacenamiento principal de catálogo/configuración operativa.

### Migraciones

- Quitar DDL de las rutas normales.
- Consolidar esquema real en migraciones idempotentes.
- Añadir una tabla/registro de versión de esquema.
- Comparar automáticamente esquema esperado contra producción en CI.
- Crear respaldo antes de migraciones productivas.

### Rendimiento

- Paginar `/api/menu` o servir un índice ligero y cargar productos por categoría.
- Cachear catálogos públicos por tenant con ETag/versionado.
- Evitar `?t=Date.now()` en lecturas normales: anula caché en cada visita.
- Elixir no debe descargar ~179 KB de JSON antes del primer render útil.
- Dividir `StockPanel` (95 KB minificado), `LegacyApp` (70 KB) y `AdminPanel` (42 KB) por subvista.
- Reducir `styles.css` (aprox. 74 KB minificado) y mover estilos por módulo.
- Sustituir el loader vacío por skeleton, mensaje de error y reintento.

No se midieron Core Web Vitals en esta auditoría porque el servidor de Chrome DevTools no está disponible en la sesión. Estos puntos están basados en build, tamaño de respuestas y comportamiento observado en producción.

## Calidad y pruebas faltantes

La suite actual valida utilidades, pero faltan:

- idempotencia de webhooks WhatsApp/Meta;
- una respuesta saliente por evento;
- transición completa del estado conversacional;
- aislamiento entre tenants y hostnames;
- permisos por rol y módulo;
- activación/desactivación de módulos por giro;
- guardado parcial de configuración sin borrar campos;
- pedido público, caja y Mercado Pago;
- contratos del API;
- pruebas visuales/responsive de las vistas principales;
- smoke tests productivos de cada tenant.

## Roadmap recomendado

### Fase 1 — Estabilizar (1–2 semanas)

- observabilidad e idempotencia de WhatsApp;
- limpiar Lilians/test;
- corregir matriz de módulos;
- eliminar PIN inseguro;
- smoke tests de tenants;
- loader con error/reintento.

### Fase 2 — Unificar (2–4 semanas)

- motor conversacional único;
- constructor único de mensajes/pedidos;
- retirar `LegacyApp` de rutas activas;
- definición compartida de capacidades;
- migraciones como única fuente de esquema.

### Fase 3 — Producto por giro (3–5 semanas)

- presets food/floral/retail/services/distribution;
- onboarding guiado;
- dashboard y vocabulario por giro;
- campos/estados/plantillas configurables.

### Fase 4 — Experiencia y rendimiento (2–4 semanas)

- rediseño de navegación y vistas principales;
- catálogo paginado/cacheado;
- división de módulos grandes;
- pruebas visuales, accesibilidad y Core Web Vitals.

## Criterio de éxito

Omdexa estará listo para crecer cuando un tenant nuevo pueda configurarse sin editar JSON ni código, cuando activar un giro produzca módulos, vocabulario y formularios coherentes, y cuando un evento de mensajería se pueda rastrear inequívocamente desde Meta hasta el pedido y su respuesta.
