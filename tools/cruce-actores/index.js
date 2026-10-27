'use strict';

const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { extraerLocal } = require('./src/extraer-local');
const { consultarPostgresql } = require('./src/consultar-postgresql');
const { comparar } = require('./src/comparar');
const { generarExcel } = require('./src/generar-excel');

const toolDir = __dirname;
const projectRoot = path.resolve(toolDir, '..', '..');
dotenv.config({ path: path.join(projectRoot, '.env'), quiet: true });
dotenv.config({ path: path.join(toolDir, '.env'), override: true, quiet: true });

async function main() {
  const connectionString = String(process.env.ACTORES_PG_URL || '').trim();
  if (!connectionString) {
    throw new Error(
      'Falta ACTORES_PG_URL. Copia tools/cruce-actores/.env.example como tools/cruce-actores/.env y coloca ahí la URL externa de PostgreSQL.'
    );
  }

  const dbPath = path.resolve(process.env.DATABASE_PATH || path.join(projectRoot, 'data', 'municipal.sqlite'));
  if (!fs.existsSync(dbPath)) throw new Error(`No se encontró la base SQLite local: ${dbPath}`);

  const outputDir = path.join(toolDir, 'salidas');
  fs.mkdirSync(outputDir, { recursive: true });

  console.log('Leyendo las fichas municipales (solo lectura)...');
  const localRows = extraerLocal(dbPath);
  console.log(`Apariciones locales encontradas: ${localRows.length}`);

  console.log('Consultando el directorio PostgreSQL (solo lectura)...');
  const postgresRows = await consultarPostgresql(connectionString);
  console.log(`Personas recibidas de PostgreSQL: ${postgresRows.length}`);

  console.log('Comparando nombres y generando el reporte...');
  const comparison = comparar(localRows, postgresRows);
  const outputPath = await generarExcel({
    ...comparison,
    localCount: localRows.length,
    postgresCount: postgresRows.length,
    outputDir
  });

  console.log(`Reporte generado: ${outputPath}`);
  console.log('Las bases SQLite y PostgreSQL no fueron modificadas.');
}

main().catch(error => {
  console.error(`No se pudo generar el cruce: ${error.message}`);
  process.exitCode = 1;
});
