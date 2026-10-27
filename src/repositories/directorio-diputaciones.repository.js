const db = require('../config/database');

exports.list = tipo => db.prepare(`
  SELECT id,tipo,nombre_completo,distrito
  FROM directorio_diputaciones
  WHERE tipo=? AND activo=1
  ORDER BY nombre_completo,distrito
`).all(tipo);

exports.getById = id => db.prepare(`
  SELECT id,tipo,nombre_completo,distrito,activo
  FROM directorio_diputaciones
  WHERE id=?
`).get(id);

exports.findDuplicate = (tipo,nombreCompleto,distrito,excludeId='') => db.prepare(`
  SELECT id,tipo,nombre_completo,distrito,activo
  FROM directorio_diputaciones
  WHERE tipo=? AND nombre_completo=? COLLATE NOCASE AND distrito=? COLLATE NOCASE AND id<>?
  LIMIT 1
`).get(tipo,nombreCompleto,distrito,excludeId);

exports.insert = item => db.prepare(`
  INSERT INTO directorio_diputaciones
    (id,tipo,nombre_completo,distrito,activo,origen_archivo,origen_hoja,origen_fila,created_at,updated_at)
  VALUES (?,?,?,?,1,'CAPTURA DIRECTA',NULL,NULL,?,?)
`).run(item.id,item.tipo,item.nombre_completo,item.distrito,item.now,item.now);

exports.update = item => db.prepare(`
  UPDATE directorio_diputaciones
  SET nombre_completo=?,distrito=?,activo=1,updated_at=?
  WHERE id=? AND tipo=?
`).run(item.nombre_completo,item.distrito,item.now,item.id,item.tipo);

exports.reactivate = (id,now) => db.prepare(`
  UPDATE directorio_diputaciones SET activo=1,updated_at=? WHERE id=?
`).run(now,id);

exports.deactivate = (id,now) => db.prepare(`
  UPDATE directorio_diputaciones SET activo=0,updated_at=? WHERE id=?
`).run(now,id);
