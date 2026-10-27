const db = require('../config/database');
const { normalizeSearch } = require('../utils/textNormalizer');

exports.findById = (id) => db.prepare(`SELECT * FROM personas WHERE id = ?`).get(id);

exports.findExact = ({ nombre, apellidoPaterno, apellidoMaterno }) => {
  const target = [nombre,apellidoPaterno,apellidoMaterno].map(value => normalizeSearch(value || ''));
  return db.prepare(`SELECT * FROM personas WHERE activo=1`).all().find(person =>
    [person.nombre,person.apellido_paterno,person.apellido_materno]
      .map(value => normalizeSearch(value || ''))
      .every((value,index)=>value===target[index])
  );
};

exports.search = (term, limit = 20) => {
  const q = `%${term}%`;
  return db.prepare(`
    SELECT id, nombre, apellido_paterno, apellido_materno, foto_path
    FROM personas
    WHERE activo = 1
      AND (nombre LIKE ? OR apellido_paterno LIKE ? OR apellido_materno LIKE ?
        OR (nombre || ' ' || COALESCE(apellido_paterno,'') || ' ' || COALESCE(apellido_materno,'')) LIKE ?)
    ORDER BY nombre, apellido_paterno, apellido_materno
    LIMIT ?
  `).all(q,q,q,q,limit);
};

exports.searchReferentes = (term, limit = 30) => {
  const q = `%${term}%`;
  return db.prepare(`
    SELECT DISTINCT p.id, p.nombre, p.apellido_paterno, p.apellido_materno
    FROM personas p
    WHERE p.activo = 1
      AND (
        EXISTS(SELECT 1 FROM actores_municipio a WHERE a.referente_persona_id=p.id)
        OR EXISTS(SELECT 1 FROM personal_territorio t WHERE t.referente_persona_id=p.id)
        OR EXISTS(SELECT 1 FROM presidencia_referentes pr WHERE pr.referente_persona_id=p.id)
      )
      AND (p.nombre LIKE ? OR p.apellido_paterno LIKE ? OR p.apellido_materno LIKE ?
        OR (p.nombre || ' ' || COALESCE(p.apellido_paterno,'') || ' ' || COALESCE(p.apellido_materno,'')) LIKE ?)
    ORDER BY p.nombre, p.apellido_paterno, p.apellido_materno
    LIMIT ?
  `).all(q,q,q,q,limit);
};

exports.markAsReferente = id => {
  db.prepare(`UPDATE personas SET es_referente=1,updated_at=datetime('now','localtime') WHERE id=?`).run(id);
  return exports.findById(id);
};

exports.create = ({ id, nombre, apellidoPaterno, apellidoMaterno, fotoPath = null }) => {
  db.prepare(`
    INSERT INTO personas (id,nombre,apellido_paterno,apellido_materno,foto_path,activo,created_at,updated_at)
    VALUES (?,?,?,?,?,1,datetime('now','localtime'),datetime('now','localtime'))
  `).run(id,nombre,apellidoPaterno||null,apellidoMaterno||null,fotoPath);
  return exports.findById(id);
};

exports.update = ({ id, nombre, apellidoPaterno, apellidoMaterno, fotoPath, clearPhoto=false }) => {
  db.prepare(`
    UPDATE personas SET nombre=?, apellido_paterno=?, apellido_materno=?,
      foto_path=CASE WHEN ?=1 THEN NULL ELSE COALESCE(?,foto_path) END,
      updated_at=datetime('now','localtime')
    WHERE id=?
  `).run(nombre,apellidoPaterno||null,apellidoMaterno||null,clearPhoto?1:0,fotoPath||null,id);
  return exports.findById(id);
};
