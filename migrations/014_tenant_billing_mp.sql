-- 014_tenant_billing_mp.sql
-- Cobro recurrente de la MENSUALIDAD del negocio (tenant) a Omdexa, via
-- suscripcion (preapproval) de Mercado Pago cobrada con la cuenta de
-- PLATAFORMA (no la cuenta de cada negocio — esa se usa para cobrar a los
-- clientes finales del storefront, es otra cosa).
--
-- La tabla saas_subscriptions ya existia (plan, precio, fechas). Aqui solo
-- le agregamos las columnas que ligan cada suscripcion con su preapproval
-- de Mercado Pago y guardan el link de autorizacion que el dueno del
-- negocio abre para poner su tarjeta.
--
-- NOTA: el backend tambien crea estas columnas solo en caliente
-- (ensureBillingColumns en _shared/tenantBilling.js, mismo patron
-- auto-reparable del resto del proyecto), asi que esta migracion es la
-- version "de la verdad" para un entorno limpio. Cada ALTER es idempotente
-- a mano: si ya existe, se ignora el error al correrla.

ALTER TABLE saas_subscriptions ADD COLUMN provider TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE saas_subscriptions ADD COLUMN mp_preapproval_id TEXT;
ALTER TABLE saas_subscriptions ADD COLUMN mp_payer_email TEXT;
ALTER TABLE saas_subscriptions ADD COLUMN checkout_url TEXT;
ALTER TABLE saas_subscriptions ADD COLUMN provider_status TEXT;
ALTER TABLE saas_subscriptions ADD COLUMN provider_synced_at TEXT;

CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_preapproval
  ON saas_subscriptions (mp_preapproval_id);
CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_tenant
  ON saas_subscriptions (tenant_id);
