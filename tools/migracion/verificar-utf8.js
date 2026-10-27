/**
 * Compara, sin escribir, todo el contenido de la copia SQLite usada para la
 * importación con PostgreSQL. No imprime nombres, textos ni credenciales.
 *
 * node tools/migracion/verificar-utf8.js
 */

require('dotenv').config();

const crypto = require('crypto');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { Client } = require('pg');

const source = path.resolve(
  'data/backups/municipal-pre-postgres-20261027.sqlite',
);

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

function fingerprint(rows) {
  let textFields = 0;
  let replacementCharacters = 0;
  const rowHashes = rows.map(row => {
    const fields = Object.keys(row).sort().map(key => {
      const value = row[key];
      if (typeof value === 'string') {
        textFields += 1;
        replacementCharacters += [...value].filter(char => char === '\uFFFD').length;
      }
      return [key, value];
    });
    return crypto.createHash('sha256')
      .update(JSON.stringify(fields), 'utf8')
      .digest('hex');
  });
  rowHashes.sort();
  return {
    rows: rows.length,
    textFields,
    replacementCharacters,
    digest: crypto.createHash('sha256')
      .update(rowHashes.join('\n'), 'utf8')
      .digest('hex'),
  };
}

async function main() {
  const rawUrl = process.env.MUNICIPAL_DATABASE_URL;
  if (!rawUrl) {
    throw new Error('Falta MUNICIPAL_DATABASE_URL.');
  }
  const url = new URL(rawUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('MUNICIPAL_DATABASE_URL no es PostgreSQL.');
  }

  const sqlite = new DatabaseSync(source, { readOnly: true });
  const postgres = new Client({
    connectionString: url.toString(),
    ssl: url.searchParams.has('sslmode')
      ? undefined
      : { rejectUnauthorized: true },
    connectionTimeoutMillis: 10000,
    query_timeout: 120000,
  });

  try {
    await postgres.connect();
    const sqliteEncoding = sqlite.prepare('PRAGMA encoding').get().encoding;
    const serverEncoding = (await postgres.query('SHOW server_encoding')).rows[0].server_encoding;
    const clientEncoding = (await postgres.query('SHOW client_encoding')).rows[0].client_encoding;
    console.log(`Codificación: SQLite=${sqliteEncoding}; PostgreSQL servidor=${serverEncoding}; cliente=${clientEncoding}.`);

    if (sqliteEncoding.toUpperCase() !== 'UTF-8'
      || serverEncoding.toUpperCase() !== 'UTF8'
      || clientEncoding.toUpperCase() !== 'UTF8') {
      throw new Error('Alguna codificación no es UTF-8.');
    }

    let totalRows = 0;
    let textFields = 0;
    let replacementCharacters = 0;
    const mismatches = [];

    for (const table of tables) {
      const original = fingerprint(sqlite.prepare(`SELECT * FROM "${table}"`).all());
      const imported = fingerprint((await postgres.query(`SELECT * FROM "${table}"`)).rows);
      const identical = original.rows === imported.rows
        && original.digest === imported.digest;
      if (!identical) {
        mismatches.push(table);
      }
      if (original.replacementCharacters !== imported.replacementCharacters) {
        mismatches.push(`${table}:caracteres_de_reemplazo`);
      }
      totalRows += original.rows;
      textFields += original.textFields;
      replacementCharacters += original.replacementCharacters;
      console.log(`${table}: ${original.rows} filas; texto idéntico=${identical ? 'sí' : 'no'}.`);
    }

    console.log(`Total: ${totalRows} filas; ${textFields} valores de texto comparados.`);
    console.log(`Caracteres de reemplazo U+FFFD presentes ya en SQLite: ${replacementCharacters}.`);
    if (mismatches.length) {
      throw new Error(`Diferencias en ${mismatches.join(', ')}.`);
    }
    console.log('Comparación completa: SQLite y PostgreSQL contienen los mismos valores.');
  } finally {
    sqlite.close();
    await postgres.end().catch(() => {});
  }
}

main().catch(error => {
  console.error(`Verificación detenida: ${error.code || error.message}`);
  process.exitCode = 1;
});
