const db = require('../config/database');

exports.getByMunicipioAndType = (municipioId, tipoActor) => {
  return db.prepare(`
    SELECT am.*, p.nombre, p.apellido_paterno, p.apellido_materno, p.foto_path,
           pa.siglas AS partido,
           rp.nombre AS referente_nombre,
           rp.apellido_paterno AS referente_apellido_paterno,
           rp.apellido_materno AS referente_apellido_materno
    FROM actores_municipio am
    JOIN personas p ON p.id = am.persona_id
    LEFT JOIN partidos pa ON pa.id = am.partido_id
    LEFT JOIN personas rp ON rp.id = am.referente_persona_id
    WHERE am.municipio_id = ? AND am.tipo_actor = ? AND am.activo = 1
    ORDER BY am.orden_visual, am.created_at
  `).all(municipioId, tipoActor);
};

exports.getOne = (municipioId, tipoActor) => {
  return exports.getByMunicipioAndType(municipioId, tipoActor)[0] || null;
};

exports.create = (row) => {
  db.prepare(`
    INSERT INTO actores_municipio (
      id, municipio_id, persona_id, tipo_actor, partido_id, referente_persona_id,
      puede_reelegirse, pretende_reelegirse, podria_ganar_eleccion,
      observaciones, activo, orden_visual, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now','localtime'), datetime('now','localtime'))
  `).run(
    row.id, row.municipioId, row.personaId, row.tipoActor, row.partidoId || null,
    row.referentePersonaId || null, row.puedeReelegirse ?? null, row.pretendeReelegirse ?? null,
    row.podriaGanar ?? null, row.observaciones || null, row.ordenVisual || 0
  );
  return row.id;
};

exports.update = (id, row) => {
  db.prepare(`
    UPDATE actores_municipio
    SET persona_id = ?, partido_id = ?, referente_persona_id = ?,
        puede_reelegirse = ?, pretende_reelegirse = ?, podria_ganar_eleccion = ?,
        observaciones = ?, updated_at = datetime('now','localtime')
    WHERE id = ?
  `).run(
    row.personaId, row.partidoId || null, row.referentePersonaId || null,
    row.puedeReelegirse ?? null, row.pretendeReelegirse ?? null, row.podriaGanar ?? null,
    row.observaciones || null, id
  );
};
