'use strict';

const { DatabaseSync } = require('node:sqlite');

function leerFichaLocal(dbPath) {
  const query = `
    SELECT m.nombre municipio, a.tipo_actor, p.id persona_id,
           TRIM(p.nombre || ' ' || COALESCE(p.apellido_paterno || ' ', '') || COALESCE(p.apellido_materno, '')) nombre,
           pa.siglas partido, a.observaciones, f.updated_at ficha_actualizada
    FROM actores_municipio a
    JOIN municipios m ON m.id = a.municipio_id
    JOIN personas p ON p.id = a.persona_id
    LEFT JOIN partidos pa ON pa.id = a.partido_id
    LEFT JOIN fichas_municipales f ON f.municipio_id = m.id
    WHERE a.activo = 1
      AND a.tipo_actor IN ('PRESIDENCIA_MUNICIPAL', 'ASPIRANTE_2027')
    ORDER BY m.nombre, a.tipo_actor, a.orden_visual, a.created_at
  `;
  if (process.env.RENDER === 'true' || process.env.MUNICIPAL_DB_ENGINE === 'postgres') {
    return require('../../../src/config/database').prepare(query).all();
  }

  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return db.prepare(query).all();
  } finally {
    db.close();
  }
}

module.exports = { leerFichaLocal };
