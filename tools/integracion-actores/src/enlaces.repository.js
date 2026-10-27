'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const databasePath = path.resolve(
  process.env.ACTORES_LINK_DB_PATH || path.join(process.cwd(), 'data', 'integracion-actores.sqlite')
);
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS enlaces_personas (
    persona_local_id TEXT PRIMARY KEY,
    persona_externa_id INTEGER NOT NULL,
    nombre_externo TEXT NOT NULL,
    confirmado_por TEXT,
    creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    actualizado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS directorio_actores (
    persona_externa_id INTEGER PRIMARY KEY,
    nombre TEXT,
    apellido_paterno TEXT,
    apellido_materno TEXT,
    nombre_completo TEXT NOT NULL,
    nombre_normalizado TEXT NOT NULL,
    actualizado_externo TEXT,
    sincronizado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_directorio_actores_nombre
    ON directorio_actores(nombre_normalizado);
  CREATE TABLE IF NOT EXISTS verificaciones_personas (
    persona_local_id TEXT PRIMARY KEY,
    nombre_local TEXT NOT NULL,
    estado TEXT NOT NULL,
    persona_externa_id INTEGER,
    nombre_externo TEXT,
    puntuacion REAL,
    detalle TEXT,
    verificado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
`);

const findStatement = db.prepare(`
  SELECT persona_local_id, persona_externa_id, nombre_externo, confirmado_por, actualizado_en
  FROM enlaces_personas WHERE persona_local_id = ?
`);
const saveStatement = db.prepare(`
  INSERT INTO enlaces_personas (
    persona_local_id, persona_externa_id, nombre_externo, confirmado_por
  ) VALUES (?, ?, ?, ?)
  ON CONFLICT(persona_local_id) DO UPDATE SET
    persona_externa_id=excluded.persona_externa_id,
    nombre_externo=excluded.nombre_externo,
    confirmado_por=excluded.confirmado_por,
    actualizado_en=datetime('now','localtime')
`);
const deleteStatement = db.prepare('DELETE FROM enlaces_personas WHERE persona_local_id = ?');
const verificationStatement = db.prepare(`
  INSERT INTO verificaciones_personas (
    persona_local_id,nombre_local,estado,persona_externa_id,nombre_externo,puntuacion,detalle
  ) VALUES (?,?,?,?,?,?,?)
  ON CONFLICT(persona_local_id) DO UPDATE SET
    nombre_local=excluded.nombre_local,
    estado=excluded.estado,
    persona_externa_id=excluded.persona_externa_id,
    nombre_externo=excluded.nombre_externo,
    puntuacion=excluded.puntuacion,
    detalle=excluded.detalle,
    verificado_en=datetime('now','localtime')
`);

exports.find = localId => findStatement.get(localId) || null;
exports.save = ({ localId, localName, externalId, externalName, confirmedBy }) => {
  saveStatement.run(localId, externalId, externalName, confirmedBy || null);
  verificationStatement.run(localId, localName || externalName, 'ENLAZADA', externalId, externalName, 100, 'Vínculo confirmado por una persona usuaria.');
  return exports.find(localId);
};
exports.remove = localId => {
  const removed = deleteStatement.run(localId).changes > 0;
  db.prepare(`UPDATE verificaciones_personas SET estado='PENDIENTE',persona_externa_id=NULL,nombre_externo=NULL,puntuacion=NULL,detalle='Enlace retirado; pendiente de nueva verificación.',verificado_en=datetime('now','localtime') WHERE persona_local_id=?`).run(localId);
  return removed;
};
exports.saveVerification = ({ localId, localName, status, externalId = null, externalName = null, score = null, detail = null }) => {
  verificationStatement.run(localId, localName, status, externalId, externalName, score, detail);
};
exports.getStatuses = localIds => {
  const ids = [...new Set((localIds || []).map(String).filter(Boolean))].slice(0, 200);
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const verifications = db.prepare(`SELECT * FROM verificaciones_personas WHERE persona_local_id IN (${placeholders})`).all(...ids);
  const links = db.prepare(`SELECT * FROM enlaces_personas WHERE persona_local_id IN (${placeholders})`).all(...ids);
  const byId = new Map(verifications.map(item => [item.persona_local_id, item]));
  links.forEach(link => {
    const verification = byId.get(link.persona_local_id);
    byId.set(link.persona_local_id, {
      persona_local_id: link.persona_local_id,
      nombre_local: verification?.nombre_local || null,
      estado: 'ENLAZADA',
      persona_externa_id: link.persona_externa_id,
      nombre_externo: link.nombre_externo,
      puntuacion: 100,
      detalle: verification?.detalle || 'Vínculo confirmado existente.',
      verificado_en: verification?.verificado_en || link.actualizado_en
    });
  });
  return ids.map(id => byId.get(id)).filter(Boolean);
};
exports.directoryInfo = () => db.prepare(`SELECT COUNT(*) total,MAX(sincronizado_en) sincronizado_en FROM directorio_actores`).get();
exports.listDirectory = () => db.prepare(`SELECT persona_externa_id id_persona,nombre,apellido_paterno,apellido_materno,nombre_completo,actualizado_externo FROM directorio_actores`).all();
exports.replaceDirectory = people => {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec('DELETE FROM directorio_actores');
    const insert = db.prepare(`INSERT INTO directorio_actores (persona_externa_id,nombre,apellido_paterno,apellido_materno,nombre_completo,nombre_normalizado,actualizado_externo) VALUES (?,?,?,?,?,?,?)`);
    people.forEach(person => insert.run(
      person.id_persona,person.nombre || null,person.apellido_paterno || null,person.apellido_materno || null,
      person.nombre_completo,person.nombre_normalizado,
      person.updated_at instanceof Date ? person.updated_at.toISOString() : (person.updated_at ? String(person.updated_at) : null)
    ));
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw error;
  }
  return exports.directoryInfo();
};
exports.databasePath = databasePath;
