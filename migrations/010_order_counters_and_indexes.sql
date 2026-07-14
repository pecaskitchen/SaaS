-- 010_order_counters_and_indexes.sql
-- Contador atomico por sucursal para numeros de pedido (evita la
-- condicion de carrera de "SELECT COUNT(*) + 1" bajo pedidos
-- simultaneos) + indice faltante para la consulta por defecto (sin
-- filtro de status) del dashboard de pedidos y los reportes.

CREATE TABLE IF NOT EXISTS branch_order_counters (
  tenant_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  next_number INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (tenant_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_created ON orders(tenant_id, created_at_monterrey);
