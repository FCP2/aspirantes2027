'use strict';

const { Client } = require('pg');
const { nombreCompleto } = require('./normalizar');

function envBoolean(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'si', 'sí', 'yes'].includes(String(value).toLocaleLowerCase('es-MX'));
}

async function consultarPostgresql(connectionString, env = process.env) {
  const useSsl = envBoolean(env.ACTORES_PG_SSL, true);
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 15000,
    application_name: 'cruce-actores-solo-lectura',
    ssl: useSsl
      ? { rejectUnauthorized: envBoolean(env.ACTORES_PG_SSL_REJECT_UNAUTHORIZED, false) }
      : false
  });

  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const result = await client.query(`
      SELECT id_persona, nombre, apellido_paterno, apellido_materno,
             oculto, updated_at, foto_url
      FROM public.personas
      ORDER BY id_persona
    `);
    await client.query('ROLLBACK');
    return result.rows.map(row => ({
      ...row,
      nombre_completo: nombreCompleto(row.nombre, row.apellido_paterno, row.apellido_materno)
    }));
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* La conexión puede haberse cerrado. */ }
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}

module.exports = { consultarPostgresql };
