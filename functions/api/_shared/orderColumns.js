// Columnas de archivo/pago de `orders` que los endpoints de LECTURA
// (reportes, CRM) necesitan poder filtrar aunque la base venga de antes de
// la migracion. Un solo PRAGMA + cache por isolate, en vez de un PRAGMA por
// columna en cada request (antes reports/executive.js pagaba 6 PRAGMAs por
// carga de dashboard).
//
// Nota: orders.js y orders-dashboard.js (los que ESCRIBEN pedidos) agregan
// estas mismas columnas dentro de sus ensureSchema/ensureOrderStockColumns
// propios (tambien cacheados y de un solo PRAGMA); las definiciones deben
// mantenerse identicas a las de aqui.
const ORDER_ARCHIVE_COLUMNS = [
  ['exclude_from_reports', 'INTEGER NOT NULL DEFAULT 0'],
  ['archived_at_utc', 'TEXT'],
  ['archived_reason', 'TEXT'],
  ['deleted_at_utc', 'TEXT'],
  ['payment_method', 'TEXT'],
  ['payment_status', 'TEXT'],
  ["order_source", "TEXT NOT NULL DEFAULT 'online'"],
];

let ensured = false;

export async function ensureOrderArchiveColumns(db) {
  if (ensured) return;
  try {
    const info = await db.prepare(`PRAGMA table_info(orders)`).all();
    const columns = new Set((info.results || []).map((row) => row.name));
    for (const [name, type] of ORDER_ARCHIVE_COLUMNS) {
      if (!columns.has(name)) {
        await db.prepare(`ALTER TABLE orders ADD COLUMN ${name} ${type}`).run();
      }
    }
    ensured = true;
  } catch {
    // La tabla orders puede no existir aun (tenant nuevo sin pedidos);
    // el endpoint que llama ya maneja ese caso y no hay que bloquear.
  }
}
