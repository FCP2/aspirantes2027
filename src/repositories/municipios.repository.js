const db = require('../config/database');

exports.listByOffice = (officeId) => {
  return db.prepare(`
    SELECT m.id, m.clave, m.nombre, fm.estatus, fm.revision,
      CASE WHEN fm.revision > 0 THEN fm.updated_at ELSE NULL END ultima_actualizacion,
      CASE WHEN fm.grupo_politico_texto IS NOT NULL
        OR fm.grupo_politico_imagen_path IS NOT NULL
        OR EXISTS(SELECT 1 FROM actores_municipio am WHERE am.municipio_id=m.id AND am.activo=1)
        OR EXISTS(SELECT 1 FROM personal_territorio pt WHERE pt.municipio_id=m.id AND pt.activo=1)
        OR EXISTS(SELECT 1 FROM grupos_presencia_municipio gp WHERE gp.municipio_id=m.id)
        OR EXISTS(SELECT 1 FROM archivos_municipio ar WHERE ar.municipio_id=m.id AND ar.tipo='HOJA_02')
      THEN 1 ELSE 0 END tiene_informacion
    FROM oficina_municipio om
    JOIN municipios m ON m.id = om.municipio_id
    LEFT JOIN fichas_municipales fm ON fm.municipio_id = m.id
    WHERE om.office_id = ? AND om.activo = 1
    ORDER BY m.nombre
  `).all(officeId);
};

exports.getAllowedMunicipio = (municipioId, officeId) => {
  return db.prepare(`
    SELECT m.id, m.clave, m.nombre
    FROM oficina_municipio om
    JOIN municipios m ON m.id = om.municipio_id
    WHERE om.office_id = ? AND m.id = ? AND om.activo = 1
  `).get(officeId, municipioId);
};
