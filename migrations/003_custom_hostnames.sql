ALTER TABLE saas_tenant_domains ADD COLUMN cf_hostname_id TEXT;
ALTER TABLE saas_tenant_domains ADD COLUMN verification_errors_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE saas_tenant_domains ADD COLUMN ssl_status TEXT;

CREATE INDEX IF NOT EXISTS idx_domains_cf_hostname ON saas_tenant_domains(cf_hostname_id);
