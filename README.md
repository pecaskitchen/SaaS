# Negocio SaaS Starter

Base para vender el sistema como servicio mensual a pequeños negocios.

## Qué incluye

- Tienda pública con pedido por WhatsApp.
- Paneles internos separados por chunks: admin, pedidos, stock y caja.
- Panel global `#platform` para el administrador del servicio.
- Endpoints Cloudflare Functions para crear/listar/pausar negocios.
- Esquema D1 para negocios, usuarios, suscripciones y auditoría.

## Variables recomendadas

Configura estas variables en Cloudflare Pages:

```txt
PLATFORM_ADMIN_PASSWORD=tu-password-global
PLATFORM_ADMIN_TOKEN=token-largo-para-api
ADMIN_PASSWORD=password-admin-negocio-demo
SUPER_PASSWORD=password-super-negocio-demo
ORDERS_PASSWORD=password-orders-demo
KITCHEN_PASSWORD=password-stock-demo
```

Si defines `PLATFORM_ADMIN_TOKEN`, el login con `PLATFORM_ADMIN_PASSWORD` guardará ese token para consumir `/api/platform/*`.

## Base de datos

Aplica primero el esquema operativo existente y luego el esquema SaaS:

```txt
stock-phase1-schema.sql
saas-schema.sql
```

El código también crea las tablas SaaS automáticamente si no existen, pero aplicar el SQL deja el entorno más claro.

## Rutas importantes

- `/` tienda pública.
- `#admin` administración del negocio.
- `#super` configuración avanzada del negocio.
- `#orders` pedidos.
- `#stock` inventario.
- `#cashier` caja.
- `#platform` panel global para ti.

## Próximos pasos técnicos

1. Convertir passwords compartidos en usuarios reales por negocio.
2. Agregar `tenant_id` a pedidos, inventario, menú y reportes.
3. Resolver negocio por dominio/subdominio.
4. Agregar impersonación controlada para soporte.
5. Integrar pagos o al menos registro formal de mensualidades.
