-- Tablas creadas hoy por migraciones aditivas de SQLite y ausentes en schema.sql.
-- Mantener los nombres y tipos compatibles con la copia inicial de datos.

CREATE TABLE IF NOT EXISTS historial_presidencias (
  id TEXT PRIMARY KEY,
  periodo TEXT NOT NULL,
  municipio_id TEXT,
  municipio_nombre TEXT NOT NULL,
  presidente_nombre TEXT,
  partido TEXT,
  referente_original TEXT,
  referente_normalizado TEXT,
  estado_normalizacion TEXT NOT NULL DEFAULT 'NORMALIZADO',
  origen_hoja TEXT,
  origen_fila INTEGER,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text),
  UNIQUE (periodo, municipio_nombre)
);

CREATE INDEX IF NOT EXISTS idx_historial_presidencias_periodo
  ON historial_presidencias(periodo, referente_normalizado);

CREATE TABLE IF NOT EXISTS system_migrations (
  migration_key TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text)
);
