const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

exports.register = ({ municipioId, tipo, file, userId=null }) => {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(file.path)).digest('hex');
  const id = uuidv4();
  const relativePath = path.relative(process.cwd(), file.path).replace(/\\/g,'/');
  const nextOrder = db.prepare(`SELECT COALESCE(MAX(orden_visual),0)+1 value FROM archivos_municipio WHERE municipio_id=? AND tipo=?`).get(municipioId,tipo).value;
  db.prepare(`
    INSERT INTO archivos_municipio (
      id,municipio_id,tipo,ruta,nombre_original,mime_type,hash_sha256,user_id,orden_visual,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,datetime('now','localtime'))
  `).run(id,municipioId,tipo,relativePath,file.originalname,file.mimetype,hash,userId,nextOrder);
  return { id, ruta:relativePath, nombre_original:file.originalname, mime_type:file.mimetype, hash_sha256:hash, orden_visual:nextOrder };
};

exports.remove = ({municipioId,archivoId}) => {
  const record = db.prepare(`SELECT * FROM archivos_municipio WHERE id=? AND municipio_id=? AND tipo='HOJA_02'`).get(archivoId,municipioId);
  if (!record) throw Object.assign(new Error('ARCHIVO NO ENCONTRADO'),{status:404});

  db.transaction(() => {
    db.prepare(`UPDATE fichas_municipales SET hoja_2_archivo_id=NULL WHERE municipio_id=? AND hoja_2_archivo_id=?`).run(municipioId,archivoId);
    db.prepare(`DELETE FROM archivos_municipio WHERE id=?`).run(archivoId);
  })();

  const attachmentsRoot = path.resolve('./storage/hoja2');
  const filePath = path.resolve(record.ruta);
  const relative = path.relative(attachmentsRoot,filePath);
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative) && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  return record;
};

exports.replace = ({municipioId,archivoId,file}) => {
  const record = db.prepare(`SELECT * FROM archivos_municipio WHERE id=? AND municipio_id=? AND tipo='HOJA_02'`).get(archivoId,municipioId);
  if (!record) throw Object.assign(new Error('ARCHIVO NO ENCONTRADO'),{status:404});
  const hash = crypto.createHash('sha256').update(fs.readFileSync(file.path)).digest('hex');
  const relativePath = path.relative(process.cwd(),file.path).replace(/\\/g,'/');
  db.prepare(`UPDATE archivos_municipio SET ruta=?,nombre_original=?,mime_type=?,hash_sha256=? WHERE id=?`).run(relativePath,file.originalname,file.mimetype,hash,archivoId);

  const attachmentsRoot = path.resolve('./storage/hoja2');
  const oldPath = path.resolve(record.ruta);
  const relative = path.relative(attachmentsRoot,oldPath);
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative) && fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  return {...record,ruta:relativePath,nombre_original:file.originalname,mime_type:file.mimetype,hash_sha256:hash};
};
