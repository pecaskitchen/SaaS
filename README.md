# Omdexa multi-tenant

Omdexa es la plataforma compartida. Pecas y Elixir son negocios independientes
que utilizan el mismo motor, con sus datos aislados mediante `tenant_id`.

## Estructura

```text
apps/omdexa/          Frontend de la plataforma y las tiendas
functions/            API compartida de Cloudflare Pages
migrations/           Evolución del esquema D1 compartido
public/omdexa/         Recursos públicos de la marca Omdexa
public/tenants/pecas/  Recursos públicos exclusivos de Pecas
public/tenants/elixir/ Recursos públicos exclusivos de Elixir
shared/                Definiciones compartidas entre frontend, API y pruebas
tenants/pecas/         Catálogo, plantillas y configuración de Pecas
tenants/elixir/        Catálogo, semillas y herramientas de Elixir
test/                  Pruebas de plataforma y aislamiento entre tenants
```

Las APIs, tablas y migraciones no se duplican por negocio. Toda consulta de
información operativa debe conservar el filtro por `tenant_id`.

## Desarrollo

```bash
npm install
npm run dev
```

## Validación

```bash
npm run validate
```

## Rutas principales

- `/`: tienda pública resuelta por dominio.
- `#admin`: administración del negocio actual.
- `#super`: configuración avanzada del negocio.
- `#orders`: pedidos.
- `#stock`: inventario.
- `#cashier`: caja.
- `#platform`: administración global de Omdexa.
- `/omdexa/presentacion.html`: presentación comercial de Omdexa.

## Datos por negocio

- Pecas utiliza `tenants/pecas` y `public/tenants/pecas`.
- Elixir utiliza `tenants/elixir` y `public/tenants/elixir`.
- Los datos reales permanecen en D1 y se separan por `tenant_id`; las carpetas
  contienen recursos de marca, archivos de carga y configuración versionada.

Los secretos y credenciales se configuran en Cloudflare y nunca se guardan en
el repositorio.
