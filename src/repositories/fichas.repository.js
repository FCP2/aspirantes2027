const db = require('../config/database');

exports.getFichaRow = municipioId => db.prepare(`
  SELECT * FROM fichas_municipales WHERE municipio_id=?
`).get(municipioId);

exports.updateHeader = (municipioId, grupoPoliticoTexto, grupoPoliticoImagenPath=null, hoja2Id=null) => {
  db.prepare(`
    UPDATE fichas_municipales
    SET grupo_politico_texto=?,
        grupo_politico_imagen_path=?,
        hoja_2_archivo_id=?,
        estatus='EN_CAPTURA', revision=revision+1,
        updated_at=datetime('now','localtime')
    WHERE municipio_id=?
  `).run(grupoPoliticoTexto || null, grupoPoliticoImagenPath, hoja2Id, municipioId);
};

exports.deleteActorsByType = (municipioId, tipo) => {
  db.prepare(`DELETE FROM actores_municipio WHERE municipio_id=? AND tipo_actor=?`).run(municipioId,tipo);
};

exports.deleteTerritorio = municipioId => {
  db.prepare(`DELETE FROM personal_territorio WHERE municipio_id=?`).run(municipioId);
};

exports.deletePersonalCoordinacion = municipioId => {
  db.prepare(`DELETE FROM personal_coordinacion WHERE municipio_id=?`).run(municipioId);
};

exports.insertPersonalCoordinacion = row => {
  db.prepare(`
    INSERT INTO personal_coordinacion (
      id,municipio_id,nombre,cargo,coordinacion_general,region,telefono,foto_path,
      orden_visual,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,datetime('now','localtime'),datetime('now','localtime'))
  `).run(
    row.id,
    row.municipioId,
    row.nombre,
    row.cargo || null,
    row.coordinacionGeneral || null,
    row.region || null,
    row.telefono || null,
    row.fotoPath || null,
    row.ordenVisual || 0
  );
};

exports.getPersonalCoordinacion = municipioId => db.prepare(`
  SELECT * FROM personal_coordinacion
  WHERE municipio_id=?
  ORDER BY orden_visual,created_at,id
`).all(municipioId);

exports.deleteGruposPresencia = municipioId => {
  db.prepare(`DELETE FROM grupos_presencia_municipio WHERE municipio_id=?`).run(municipioId);
};

exports.insertGrupoPresencia = row => {
  db.prepare(`
    INSERT INTO grupos_presencia_municipio (
      id,municipio_id,actor_politico,grupo_nombre,imagen_path,orden_visual,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,datetime('now','localtime'),datetime('now','localtime'))
  `).run(row.id,row.municipioId,row.actorPolitico,row.grupoNombre,row.imagenPath||null,row.ordenVisual||0);
};

exports.getGruposPresencia = municipioId => db.prepare(`
  SELECT * FROM grupos_presencia_municipio
  WHERE municipio_id=?
  ORDER BY orden_visual,created_at,id
`).all(municipioId);

exports.insertActor = row => {
  db.prepare(`
    INSERT INTO actores_municipio (
      id,municipio_id,persona_id,tipo_actor,partido_id,referente_persona_id,referente_texto,distrito_texto,subreferente_texto,
      puede_reelegirse,pretende_reelegirse,podria_ganar_eleccion,observaciones,
      orden_visual,activo,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,datetime('now','localtime'),datetime('now','localtime'))
  `).run(
    row.id,row.municipioId,row.personaId,row.tipoActor,row.partidoId||null,row.referenteId||null,row.referenteTexto||null,
    row.distritoTexto||null,row.subreferenteTexto||null,
    row.puedeReelegirse??null,row.pretendeReelegirse??null,row.podriaGanar??null,
    row.observaciones||null,row.ordenVisual||0
  );
};

exports.insertTerritorio = row => {
  db.prepare(`
    INSERT INTO personal_territorio (
      id,municipio_id,persona_id,tipo_personal_id,cargo_funcion_texto,referente_persona_id,referente_texto,
      orden_visual,activo,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,1,datetime('now','localtime'),datetime('now','localtime'))
  `).run(row.id,row.municipioId,row.personaId,row.tipoPersonalId,row.cargoFuncionTexto||null,row.referenteId||null,row.referenteTexto||null,row.ordenVisual||0);
};

exports.getActors = (municipioId, tipo) => db.prepare(`
  SELECT a.*, p.nombre,p.apellido_paterno,p.apellido_materno,p.foto_path,
         pa.siglas partido,
         r.nombre referente_nombre,r.apellido_paterno referente_apellido_paterno,r.apellido_materno referente_apellido_materno
  FROM actores_municipio a
  JOIN personas p ON p.id=a.persona_id
  LEFT JOIN partidos pa ON pa.id=a.partido_id
  LEFT JOIN personas r ON r.id=a.referente_persona_id
  WHERE a.municipio_id=? AND a.tipo_actor=? AND a.activo=1
  ORDER BY a.orden_visual,a.created_at
`).all(municipioId,tipo);

exports.getPresidencyReferences = municipioId => db.prepare(`
  SELECT pr.id,pr.municipio_id,pr.referente_persona_id,pr.referente_texto,
         p.nombre referente_nombre,p.apellido_paterno referente_apellido_paterno,
         p.apellido_materno referente_apellido_materno,p.foto_path referente_foto_path
  FROM presidencia_referentes pr
  LEFT JOIN personas p ON p.id=pr.referente_persona_id
  WHERE pr.municipio_id=?
  ORDER BY pr.orden_visual,pr.created_at,pr.id
`).all(municipioId);

exports.deletePresidencyReferences = municipioId => db.prepare(`
  DELETE FROM presidencia_referentes WHERE municipio_id=?
`).run(municipioId);

exports.insertPresidencyReference = row => db.prepare(`
  INSERT INTO presidencia_referentes (
    id,municipio_id,referente_persona_id,referente_texto,orden_visual,created_at,updated_at
  ) VALUES (?,?,?,?,?,datetime('now','localtime'),datetime('now','localtime'))
`).run(
  row.id,
  row.municipioId,
  row.referenteId || null,
  row.referenteText || null,
  row.ordenVisual || 0
);

exports.getDeputyOccurrencesInOffice = ({ officeId, municipioId, personaId, tipoActor }) => db.prepare(`
  SELECT
    a.id,
    a.municipio_id,
    a.persona_id,
    a.tipo_actor,
    a.distrito_texto,
    a.referente_persona_id,
    a.referente_texto,
    p.nombre,
    p.apellido_paterno,
    p.apellido_materno,
    r.nombre referente_nombre,
    r.apellido_paterno referente_apellido_paterno,
    r.apellido_materno referente_apellido_materno,
    m.nombre municipio_nombre
  FROM actores_municipio a
  JOIN oficina_municipio om ON om.municipio_id = a.municipio_id
    AND om.office_id = ?
    AND om.activo = 1
  JOIN municipios m ON m.id = a.municipio_id
  JOIN personas p ON p.id = a.persona_id
  LEFT JOIN personas r ON r.id = a.referente_persona_id
  WHERE a.municipio_id <> ?
    AND a.persona_id = ?
    AND a.tipo_actor = ?
    AND a.activo = 1
  ORDER BY m.nombre, a.orden_visual, a.created_at
`).all(officeId, municipioId, personaId, tipoActor);

exports.updateDeputyReference = ({ actorId, referenceId, referenceText }) => db.prepare(`
  UPDATE actores_municipio
  SET referente_persona_id = ?,
      referente_texto = ?,
      updated_at = datetime('now','localtime')
  WHERE id = ?
`).run(referenceId || null, referenceText || null, actorId);

exports.incrementFichaRevision = municipioId => db.prepare(`
  UPDATE fichas_municipales
  SET revision = revision + 1,
      estatus = 'EN_CAPTURA',
      updated_at = datetime('now','localtime')
  WHERE municipio_id = ?
`).run(municipioId);

exports.getTerritorio = municipioId => db.prepare(`
  SELECT t.*,p.nombre,p.apellido_paterno,p.apellido_materno,p.foto_path,
         tp.nombre tipo_personal,
         r.nombre referente_nombre,r.apellido_paterno referente_apellido_paterno,r.apellido_materno referente_apellido_materno
  FROM personal_territorio t
  JOIN personas p ON p.id=t.persona_id
  JOIN tipos_personal_territorio tp ON tp.id=t.tipo_personal_id
  LEFT JOIN personas r ON r.id=t.referente_persona_id
  WHERE t.municipio_id=? AND t.activo=1
  ORDER BY t.orden_visual,t.created_at
`).all(municipioId);

exports.getHoja2 = municipioId => db.prepare(`
  SELECT a.*
  FROM fichas_municipales f
  JOIN archivos_municipio a ON a.id=f.hoja_2_archivo_id
  WHERE f.municipio_id=? AND a.tipo='HOJA_02'
  LIMIT 1
`).get(municipioId);

exports.getHojas = municipioId => db.prepare(`
  SELECT * FROM archivos_municipio
  WHERE municipio_id=? AND tipo='HOJA_02'
  ORDER BY orden_visual,created_at,id
`).all(municipioId);
