/**
 * Importación municipal controlada. Por defecto solo compara el esquema y
 * contabiliza registros; no escribe en SQLite ni en PostgreSQL.
 *
 * node tools/migracion/importar-sqlite-a-postgres.js --dry-run
 * node tools/migracion/importar-sqlite-a-postgres.js --apply --source C:\ruta\municipal.sqlite
 *
 * Ejecutar --apply solo cuando la captura esté detenida y la copia SQLite
 * indicada sea la última. El destino debe tener todas las tablas vacías.
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { Client } = require('pg');

const tables = [
  'oficinas',
  'municipios',
  'partidos',
  'personas',
  'tipos_personal_territorio',
  'grupos_politicos',
  'directorio_diputaciones',
  'fichas_municipales',
  'oficina_municipio',
  'usuarios',
  'municipio_grupo_dominante',
  'grupos_presencia_municipio',
  'actores_municipio',
  'presidencia_referentes',
  'personal_territorio',
  'personal_coordinacion',
  'archivos_municipio',
  'audit_log',
  'historial_presidencias',
  'system_migrations',
];

function argumentsFromCommandLine() {
  const args = process.argv.slice(2);
  const mode = args[0] || '--dry-run';
  if (!['--dry-run', '--apply'].includes(mode)) {
    throw new Error('Usa --dry-run o --apply.');
  }
  const sourceIndex = args.indexOf('--source');
  if (sourceIndex >= 0 && !args[sourceIndex + 1]) {
    throw new Error('Falta la ruta después de --source.');
  }
  const source = sourceIndex >= 0
    ? path.resolve(args[sourceIndex + 1])
    : path.resolve(process.env.DATABASE_PATH || './data/municipal.sqlite');
  if (mode === '--apply' && sourceIndex < 0) {
    throw new Error('--apply requiere --source con la ruta explícita de la copia final.');
  }
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
    throw new Error('No existe la copia SQLite indicada.');
  }
  return { mode, source };
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function sqliteTableColumns(db, table) {
  return db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`)
    .all()
    .map(column => column.name);
}

async function postgresTableColumns(client, table) {
  const result = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `, [table]);
  return result.rows.map(column => column.column_name);
}

async function postgresRowCount(client, table) {
  const result = await client.query(
    `SELECT COUNT(*)::integer AS total FROM ${quoteIdentifier(table)}`,
  );
  return result.rows[0].total;
}

async function insertRows(client, table, columns, rows) {
  const width = columns.length;
  const batchSize = Math.max(1, Math.floor(2000 / width));
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const values = batch.flatMap(row => columns.map(column => row[column]));
    const placeholders = batch.map((_, rowIndex) => {
      const slots = columns.map((_, columnIndex) => `$${rowIndex * width + columnIndex + 1}`);
      return `(${slots.join(', ')})`;
    });
    await client.query(
      `INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(', ')}) ` +
      `VALUES ${placeholders.join(', ')}`,
      values,
    );
  }
}

async function main() {
  const { mode, source } = argumentsFromCommandLine();
  const rawUrl = process.env.MUNICIPAL_DATABASE_URL;
  if (!rawUrl) {
    throw new Error('Falta MUNICIPAL_DATABASE_URL.');
  }
  const url = new URL(rawUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('MUNICIPAL_DATABASE_URL no es PostgreSQL.');
  }
  if (url.searchParams.get('sslmode') === 'disable') {
    throw new Error('No se permite desactivar TLS.');
  }

  const sqlite = new DatabaseSync(source, { readOnly: true });
  const postgres = new Client({
    connectionString: url.toString(),
    ssl: url.searchParams.has('sslmode') ? undefined : { rejectUnauthorized: true },
    connectionTimeoutMillis: 10000,
    query_timeout: 60000,
  });

  try {
    const foreignKeyErrors = sqlite.prepare('PRAGMA foreign_key_check').all();
    if (foreignKeyErrors.length) {
      throw new Error(`SQLite tiene ${foreignKeyErrors.length} relaciones inválidas.`);
    }
    await postgres.connect();

    const sourceCounts = new Map();
    for (const table of tables) {
      const sourceColumns = sqliteTableColumns(sqlite, table);
      const targetColumns = await postgresTableColumns(postgres, table);
      if (!sourceColumns.length || !targetColumns.length) {
        throw new Error(`Falta la tabla ${table} en SQLite o PostgreSQL.`);
      }
      const missing = sourceColumns.filter(column => !targetColumns.includes(column));
      const added = targetColumns.filter(column => !sourceColumns.includes(column));
      if (missing.length || added.length) {
        throw new Error(
          `Columnas distintas en ${table}. Faltan: ${missing.join(', ') || '-'}; ` +
          `sobran: ${added.join(', ') || '-'}.`,
        );
      }
      sourceCounts.set(
        table,
        sqlite.prepare(`SELECT COUNT(*) AS total FROM ${quoteIdentifier(table)}`).get().total,
      );
    }

    const targetCounts = await Promise.all(
      tables.map(table => postgresRowCount(postgres, table)),
    );
    if (targetCounts.some(count => count !== 0)) {
      throw new Error('PostgreSQL ya contiene registros; se detuvo para evitar duplicados.');
    }

    const sourceTotal = [...sourceCounts.values()].reduce((sum, count) => sum + count, 0);
    console.log(`Origen SQLite: ${source}.`);
    console.log(`Tablas compatibles: ${tables.length}. Registros por importar: ${sourceTotal}.`);
    console.log(`Relaciones SQLite inválidas: ${foreignKeyErrors.length}. Destino vacío: sí.`);

    if (mode === '--dry-run') {
      console.log('Simulación terminada; no se copió ningún registro.');
      return;
    }

    await postgres.query('BEGIN');
    try {
      for (const table of tables) {
        const columns = sqliteTableColumns(sqlite, table);
        const rows = sqlite.prepare(`SELECT * FROM ${quoteIdentifier(table)}`).all();
        if (rows.length) {
          await insertRows(postgres, table, columns, rows);
        }
        const importedCount = await postgresRowCount(postgres, table);
        if (importedCount !== sourceCounts.get(table)) {
          throw new Error(`Conteo diferente en ${table}: ${importedCount} / ${sourceCounts.get(table)}.`);
        }
        console.log(`${table}: ${importedCount}`);
      }
      await postgres.query('COMMIT');
      console.log(`Importación confirmada: ${sourceTotal} registros.`);
    } catch (error) {
      await postgres.query('ROLLBACK');
      throw error;
    }
  } finally {
    sqlite.close();
    await postgres.end().catch(() => {});
  }
}

main().catch(error => {
  console.error(`Importación detenida: ${error.code || error.message}`);
  process.exitCode = 1;
});
