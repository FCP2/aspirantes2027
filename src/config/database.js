const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(process.env.DATABASE_PATH || './data/municipal.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

// Esta tabla se crea también aquí para actualizar instalaciones existentes al
// iniciar la aplicación, sin requerir db:reset ni perder fichas capturadas.
db.exec(`
  CREATE TABLE IF NOT EXISTS grupos_presencia_municipio (
    id TEXT PRIMARY KEY,
    municipio_id TEXT NOT NULL,
    actor_politico TEXT NOT NULL,
    grupo_nombre TEXT NOT NULL,
    imagen_path TEXT,
    orden_visual INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (municipio_id) REFERENCES municipios(id)
  );
  CREATE INDEX IF NOT EXISTS idx_grupos_presencia_municipio
    ON grupos_presencia_municipio(municipio_id, orden_visual);
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS directorio_diputaciones (
    id TEXT PRIMARY KEY,
    tipo TEXT NOT NULL CHECK (tipo IN ('FEDERAL','LOCAL')),
    nombre_completo TEXT NOT NULL,
    distrito TEXT NOT NULL,
    activo INTEGER NOT NULL DEFAULT 1,
    origen_archivo TEXT,
    origen_hoja TEXT,
    origen_fila INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(tipo,nombre_completo,distrito)
  );
  CREATE INDEX IF NOT EXISTS idx_directorio_diputaciones_tipo
    ON directorio_diputaciones(tipo, activo, nombre_completo);
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS presidencia_referentes (
    id TEXT PRIMARY KEY,
    municipio_id TEXT NOT NULL,
    referente_persona_id TEXT,
    referente_texto TEXT,
    orden_visual INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (municipio_id) REFERENCES municipios(id),
    FOREIGN KEY (referente_persona_id) REFERENCES personas(id)
  );
  CREATE INDEX IF NOT EXISTS idx_presidencia_referentes_municipio
    ON presidencia_referentes(municipio_id, orden_visual);
`);
db.exec(`
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
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    UNIQUE(periodo, municipio_nombre)
  );
  CREATE INDEX IF NOT EXISTS idx_historial_presidencias_periodo
    ON historial_presidencias(periodo, referente_normalizado);
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS personal_coordinacion (
    id TEXT PRIMARY KEY,
    municipio_id TEXT NOT NULL,
    nombre TEXT NOT NULL,
    cargo TEXT,
    coordinacion_general TEXT,
    region TEXT,
    telefono TEXT,
    foto_path TEXT,
    orden_visual INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (municipio_id) REFERENCES municipios(id)
  );
  CREATE INDEX IF NOT EXISTS idx_personal_coordinacion_municipio
    ON personal_coordinacion(municipio_id, orden_visual);
`);

// Migraciones aditivas y seguras para instalaciones locales existentes.
function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map(item => item.name);
  if (!columns.length) return;
  if (!columns.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
ensureColumn('fichas_municipales','grupo_politico_imagen_path','TEXT');
ensureColumn('personas','es_referente','INTEGER NOT NULL DEFAULT 0');
ensureColumn('actores_municipio','referente_texto','TEXT');
ensureColumn('actores_municipio','distrito_texto','TEXT');
ensureColumn('actores_municipio','subreferente_texto','TEXT');
ensureColumn('personal_territorio','referente_texto','TEXT');
ensureColumn('personal_territorio','cargo_funcion_texto','TEXT');
ensureColumn('archivos_municipio','orden_visual','INTEGER NOT NULL DEFAULT 0');

// Conserva las siglas usadas como referentes. Solo corrige valores de una
// palabra que coinciden exactamente con el catálogo; no modifica nombres
// cortos normales como Ana, Luz o Paz.
const referenceAcronyms = ['HDO','IMM','PRI','PRD','PAN','PVEM','PT','MC','MORENA','COTS','INE','IEEM','DIF','IMSS','ISSSTE','UAEM','SNTE','CNTE','SUTEYM','PES','RSP','FXM'];
const acronymPlaceholders = referenceAcronyms.map(() => '?').join(',');
const tableExists = table => Boolean(db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(table));
if (tableExists('personas')) {
  db.prepare(`
    UPDATE personas SET nombre=UPPER(TRIM(nombre)),updated_at=datetime('now','localtime')
    WHERE UPPER(TRIM(nombre)) IN (${acronymPlaceholders})
      AND nombre<>UPPER(TRIM(nombre))
      AND COALESCE(TRIM(apellido_paterno),'')=''
      AND COALESCE(TRIM(apellido_materno),'')=''
  `).run(...referenceAcronyms);
}
if (tableExists('actores_municipio')) {
  db.prepare(`UPDATE actores_municipio SET referente_texto=UPPER(TRIM(referente_texto)) WHERE UPPER(TRIM(referente_texto)) IN (${acronymPlaceholders}) AND referente_texto<>UPPER(TRIM(referente_texto))`).run(...referenceAcronyms);
  db.prepare(`UPDATE actores_municipio SET subreferente_texto=UPPER(TRIM(subreferente_texto)) WHERE UPPER(TRIM(subreferente_texto)) IN (${acronymPlaceholders}) AND subreferente_texto<>UPPER(TRIM(subreferente_texto))`).run(...referenceAcronyms);
}
if (tableExists('personal_territorio')) {
  db.prepare(`UPDATE personal_territorio SET referente_texto=UPPER(TRIM(referente_texto)) WHERE UPPER(TRIM(referente_texto)) IN (${acronymPlaceholders}) AND referente_texto<>UPPER(TRIM(referente_texto))`).run(...referenceAcronyms);
}

/**
 * Ejecuta una función dentro de una transacción SQLite.
 * Si ocurre un error, hace ROLLBACK automáticamente.
 */
db.transaction = (fn) => {
  return (...args) => {
    db.exec('BEGIN IMMEDIATE;');
    try {
      const result = fn(...args);
      db.exec('COMMIT;');
      return result;
    } catch (error) {
      try { db.exec('ROLLBACK;'); } catch (_) {}
      throw error;
    }
  };
};

module.exports = db;
