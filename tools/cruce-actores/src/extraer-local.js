'use strict';

const { DatabaseSync } = require('node:sqlite');
const { nombreCompleto } = require('./normalizar');

const ETIQUETAS_ACTOR = {
  PRESIDENCIA_MUNICIPAL: 'PRESIDENCIA MUNICIPAL',
  DIPUTACION_FEDERAL: 'DIPUTACIÓN FEDERAL',
  DIPUTACION_LOCAL: 'DIPUTACIÓN LOCAL',
  LIDER: 'LÍDER',
  ASPIRANTE_2027: 'ASPIRANTE'
};

function agregarReferencia(rows, row, cargoRelacionado) {
  const referencia = nombreCompleto(
    row.referente_nombre,
    row.referente_apellido_paterno,
    row.referente_apellido_materno
  ) || String(row.referente_texto || '').trim();

  if (!referencia) return;
  rows.push({
    municipio: row.municipio,
    cargo_tipo: `REFERENTE DE ${cargoRelacionado}`,
    origen: 'REFERENTE',
    nombre_local: referencia,
    persona_relacionada: nombreCompleto(row.nombre, row.apellido_paterno, row.apellido_materno),
    persona_local_id: row.referente_persona_id || ''
  });
}

function extraerLocal(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const actores = db.prepare(`
      SELECT m.nombre municipio, a.tipo_actor, a.referente_persona_id, a.referente_texto,
             p.id persona_id, p.nombre, p.apellido_paterno, p.apellido_materno,
             r.nombre referente_nombre, r.apellido_paterno referente_apellido_paterno,
             r.apellido_materno referente_apellido_materno
      FROM actores_municipio a
      JOIN municipios m ON m.id = a.municipio_id
      JOIN personas p ON p.id = a.persona_id
      LEFT JOIN personas r ON r.id = a.referente_persona_id
      WHERE a.activo = 1
      ORDER BY m.nombre, a.tipo_actor, a.orden_visual, a.created_at
    `).all();

    const territorio = db.prepare(`
      SELECT m.nombre municipio, t.cargo_funcion_texto, t.referente_persona_id, t.referente_texto,
             p.id persona_id, p.nombre, p.apellido_paterno, p.apellido_materno,
             tp.nombre tipo_personal,
             r.nombre referente_nombre, r.apellido_paterno referente_apellido_paterno,
             r.apellido_materno referente_apellido_materno
      FROM personal_territorio t
      JOIN municipios m ON m.id = t.municipio_id
      JOIN personas p ON p.id = t.persona_id
      JOIN tipos_personal_territorio tp ON tp.id = t.tipo_personal_id
      LEFT JOIN personas r ON r.id = t.referente_persona_id
      WHERE t.activo = 1
      ORDER BY m.nombre, t.orden_visual, t.created_at
    `).all();

    const grupos = db.prepare(`
      SELECT m.nombre municipio, g.actor_politico, g.grupo_nombre
      FROM grupos_presencia_municipio g
      JOIN municipios m ON m.id = g.municipio_id
      ORDER BY m.nombre, g.orden_visual, g.created_at
    `).all();

    const rows = [];
    for (const actor of actores) {
      const cargo = ETIQUETAS_ACTOR[actor.tipo_actor] || actor.tipo_actor;
      rows.push({
        municipio: actor.municipio,
        cargo_tipo: cargo,
        origen: 'ACTOR',
        nombre_local: nombreCompleto(actor.nombre, actor.apellido_paterno, actor.apellido_materno),
        persona_relacionada: '',
        persona_local_id: actor.persona_id
      });
      agregarReferencia(rows, actor, cargo);
    }

    for (const person of territorio) {
      const cargo = String(person.tipo_personal || 'PERSONAL EN TERRITORIO').trim();
      rows.push({
        municipio: person.municipio,
        cargo_tipo: person.cargo_funcion_texto
          ? `${cargo} — ${String(person.cargo_funcion_texto).trim()}`
          : cargo,
        origen: 'PERSONAL EN TERRITORIO',
        nombre_local: nombreCompleto(person.nombre, person.apellido_paterno, person.apellido_materno),
        persona_relacionada: '',
        persona_local_id: person.persona_id
      });
      agregarReferencia(rows, person, cargo);
    }

    for (const group of grupos) {
      rows.push({
        municipio: group.municipio,
        cargo_tipo: group.grupo_nombre
          ? `GRUPO CON PRESENCIA — ${String(group.grupo_nombre).trim()}`
          : 'GRUPO CON PRESENCIA',
        origen: 'GRUPO CON PRESENCIA',
        nombre_local: String(group.actor_politico || '').trim(),
        persona_relacionada: '',
        persona_local_id: ''
      });
    }

    return rows.filter(row => row.nombre_local);
  } finally {
    db.close();
  }
}

module.exports = { extraerLocal };
