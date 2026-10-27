/**
 * Prepara el esquema PostgreSQL municipal sin tocar la base SQLite.
 *
 * Uso:
 *   node tools/migracion/municipal-postgres.js --check
 *   node tools/migracion/municipal-postgres.js --apply
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const expectedTables = [
  'oficinas',
  'usuarios',
  'municipios',
  'oficina_municipio',
  'fichas_municipales',
  'partidos',
  'personas',
  'tipos_personal_territorio',
  'grupos_politicos',
  'municipio_grupo_dominante',
  'grupos_presencia_municipio',
  'directorio_diputaciones',
  'actores_municipio',
  'presidencia_referentes',
  'personal_territorio',
  'personal_coordinacion',
  'archivos_municipio',
  'audit_log',
  'historial_presidencias',
  'system_migrations',
];

function databaseAddress(raw) {
  if (!raw) {
    throw new Error('Falta MUNICIPAL_DATABASE_URL en .env.');
  }

  const address = new URL(raw);
  if (!['postgres:', 'postgresql:'].includes(address.protocol)) {
    throw new Error('MUNICIPAL_DATABASE_URL no es una URL PostgreSQL.');
  }
  if (!address.hostname || !address.pathname || address.pathname === '/') {
    throw new Error('La URL municipal necesita host y nombre de base.');
  }
  if (address.searchParams.get('sslmode') === 'disable') {
    throw new Error('No se permite desactivar TLS para PostgreSQL.');
  }

  const actorsRaw = process.env.ACTORES_PG_URL;
  if (actorsRaw) {
    const actors = new URL(actorsRaw);
    if (address.hostname === actors.hostname && address.pathname === actors.pathname) {
      throw new Error('La base municipal no puede ser la misma que la de Actores Políticos.');
    }
  }

  return address;
}

async function tableNames(client) {
  const result = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  return result.rows.map(row => row.table_name);
}

async function main() {
  const mode = process.argv[2] || '--check';
  if (!['--check', '--apply'].includes(mode) || process.argv.length > 3) {
    throw new Error('Usa únicamente --check o --apply.');
  }

  const address = databaseAddress(process.env.MUNICIPAL_DATABASE_URL);
  const client = new Client({
    connectionString: address.toString(),
    ssl: address.searchParams.has('sslmode')
      ? undefined
      : { rejectUnauthorized: true },
    connectionTimeoutMillis: 10000,
    query_timeout: 30000,
  });

  try {
    await client.connect();
    const before = await tableNames(client);
    console.log(`Conexión municipal: correcta. Tablas actuales: ${before.length}.`);

    if (mode === '--check') {
      console.log(before.length ? `Tablas: ${before.join(', ')}` : 'La base está vacía.');
      const municipalTables = expectedTables.filter(table => before.includes(table));
      if (municipalTables.length) {
        const counts = await Promise.all(municipalTables.map(async table => {
          const result = await client.query(`SELECT COUNT(*)::integer AS total FROM ${table}`);
          return result.rows[0].total;
        }));
        const missing = expectedTables.filter(table => !before.includes(table));
        console.log(`Registros en tablas municipales: ${counts.reduce((sum, count) => sum + count, 0)}.`);
        if (missing.length) {
          console.log(`Tablas municipales faltantes: ${missing.join(', ')}.`);
        }
      }
      return;
    }

    if (before.length) {
      throw new Error('No se aplicó el esquema: la base no está vacía.');
    }

    const databaseDirectory = path.join(__dirname, '..', '..', 'src', 'database');
    const sqliteSchema = fs.readFileSync(
      path.join(databaseDirectory, 'schema.sql'),
      'utf8',
    );
    if (!sqliteSchema.startsWith('PRAGMA foreign_keys = ON;')) {
      throw new Error('El esquema SQLite cambió; revisar la traducción a PostgreSQL.');
    }
    const baseSchema = sqliteSchema
      .replace(/^PRAGMA foreign_keys = ON;\s*/, '')
      .replace(
        '  grupo_politico_imagen_path TEXT,',
        '  grupo_politico_imagen_path TEXT,\n  grupo_politico_texto TEXT,',
      );
    if (!baseSchema.includes('  grupo_politico_texto TEXT,')) {
      throw new Error('No se pudo incorporar grupo_politico_texto.');
    }
    const additions = fs.readFileSync(
      path.join(databaseDirectory, 'schema.postgres.extra.sql'),
      'utf8',
    );
    const schema = `${baseSchema}\n${additions}`;

    await client.query('BEGIN');
    try {
      await client.query(schema);
      const after = await tableNames(client);
      const missing = expectedTables.filter(table => !after.includes(table));
      if (missing.length || after.length !== expectedTables.length) {
        throw new Error(`Esquema incompleto. Faltantes: ${missing.join(', ') || 'ninguno'}.`);
      }
      await client.query('COMMIT');
      console.log(`Esquema municipal creado: ${after.length} tablas, sin copiar registros.`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch(error => {
  console.error(`Migración detenida: ${error.code || error.message}`);
  process.exitCode = 1;
});
