-- Reversa de 014_tenant_billing_mp.sql
-- SQLite no soporta DROP COLUMN en versiones viejas; en D1 moderno si.
-- Si tu D1 no lo soporta, deja las columnas: son aditivas y no rompen nada.

DROP INDEX IF EXISTS idx_saas_subscriptions_preapproval;
DROP INDEX IF EXISTS idx_saas_subscriptions_tenant;

ALTER TABLE saas_subscriptions DROP COLUMN provider;
ALTER TABLE saas_subscriptions DROP COLUMN mp_preapproval_id;
ALTER TABLE saas_subscriptions DROP COLUMN mp_payer_email;
ALTER TABLE saas_subscriptions DROP COLUMN checkout_url;
ALTER TABLE saas_subscriptions DROP COLUMN provider_status;
ALTER TABLE saas_subscriptions DROP COLUMN provider_synced_at;
