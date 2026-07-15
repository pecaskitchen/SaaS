-- Cuentas por cobrar / ventas en pagos
-- Montos en MXN enteros, igual que orders.total en la app actual.

CREATE TABLE IF NOT EXISTS receivables (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  order_id TEXT,
  order_number TEXT,
  customer_id INTEGER,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  sale_type TEXT NOT NULL DEFAULT 'credit',
  status TEXT NOT NULL DEFAULT 'active',
  principal_amount INTEGER NOT NULL DEFAULT 0,
  down_payment_amount INTEGER NOT NULL DEFAULT 0,
  paid_amount INTEGER NOT NULL DEFAULT 0,
  balance_amount INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'MXN',
  due_date TEXT,
  next_payment_date TEXT,
  reserved_until_date TEXT,
  delivered_at_utc TEXT,
  notes TEXT,
  created_by_user_id TEXT,
  created_by_name TEXT,
  paid_at_utc TEXT,
  cancelled_at_utc TEXT,
  cancelled_reason TEXT,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  CHECK (sale_type IN ('credit', 'layaway')),
  CHECK (status IN ('active', 'paid', 'overdue', 'cancelled', 'written_off'))
);

CREATE TABLE IF NOT EXISTS receivable_payments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  receivable_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  payment_method TEXT NOT NULL,
  branch_id TEXT,
  branch_name TEXT,
  paid_at_utc TEXT NOT NULL,
  received_by_user_id TEXT,
  received_by_name TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'posted',
  voided_at_utc TEXT,
  voided_by_user_id TEXT,
  voided_by_name TEXT,
  void_reason TEXT,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  CHECK (amount > 0),
  CHECK (status IN ('posted', 'void')),
  FOREIGN KEY (receivable_id) REFERENCES receivables(id)
);

CREATE INDEX IF NOT EXISTS idx_receivables_tenant_status
  ON receivables (tenant_id, status, due_date);

CREATE INDEX IF NOT EXISTS idx_receivables_tenant_customer
  ON receivables (tenant_id, customer_id, customer_phone);

CREATE INDEX IF NOT EXISTS idx_receivables_order
  ON receivables (tenant_id, order_id);

CREATE INDEX IF NOT EXISTS idx_receivable_payments_receivable
  ON receivable_payments (tenant_id, receivable_id, status, paid_at_utc);

-- Opcional: ligar la orden original al plan de pagos.
-- Si la tabla orders no existe aun, copiar estas columnas dentro del ensure
-- de orders-dashboard.js o ejecutarlas manualmente despues de crear orders.
-- ALTER TABLE orders ADD COLUMN receivable_id TEXT;
-- ALTER TABLE orders ADD COLUMN payment_plan_status TEXT;
