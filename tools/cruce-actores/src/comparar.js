'use strict';

const { normalizarNombre, crearPerfilNombre, similitudPerfiles } = require('./normalizar');

function candidato(record, score) {
  return {
    id_persona: record.id_persona,
    nombre_completo: record.nombre_completo,
    score,
    oculto: Boolean(record.oculto),
    updated_at: record.updated_at || '',
    foto_url: record.foto_url || ''
  };
}

function resolverNombre(nombre, postgres, exactos) {
  const key = normalizarNombre(nombre);
  const exactMatches = exactos.get(key) || [];
  if (exactMatches.length) {
    return {
      estado: exactMatches.length === 1 ? 'COINCIDENCIA EXACTA' : 'EXACTA AMBIGUA',
      candidatos: exactMatches.map(record => candidato(record, 1))
    };
  }

  const localProfile = crearPerfilNombre(nombre);
  const ranked = postgres
    .map(record => candidato(record, similitudPerfiles(localProfile, record.perfil_nombre)))
    .filter(item => item.score >= 0.65)
    .sort((a, b) => b.score - a.score || String(a.nombre_completo).localeCompare(String(b.nombre_completo), 'es'))
    .slice(0, 3);

  const best = ranked[0];
  if (!best || best.score < 0.82) return { estado: 'NO ENCONTRADO', candidatos: ranked };

  const second = ranked[1];
  const gap = second ? best.score - second.score : 1;
  if (gap < 0.025) return { estado: 'AMBIGUA', candidatos: ranked };
  if (best.score >= 0.92) return { estado: 'PROBABLE', candidatos: ranked };
  return { estado: 'POSIBLE', candidatos: ranked };
}

function comparar(localRows, postgresRows) {
  const pgValid = postgresRows
    .map(row => ({ ...row, perfil_nombre: crearPerfilNombre(row.nombre_completo) }))
    .filter(row => row.perfil_nombre.normalizado);
  const exactos = new Map();
  for (const record of pgValid) {
    const key = record.perfil_nombre.normalizado;
    if (!exactos.has(key)) exactos.set(key, []);
    exactos.get(key).push(record);
  }

  const localGroups = new Map();
  for (const row of localRows) {
    const key = normalizarNombre(row.nombre_local);
    if (!key) continue;
    if (!localGroups.has(key)) {
      localGroups.set(key, {
        nombre_local: row.nombre_local,
        nombre_normalizado: key,
        apariciones: 0,
        municipios: new Set(),
        cargos: new Set(),
        origenes: new Set()
      });
    }
    const group = localGroups.get(key);
    group.apariciones += 1;
    group.municipios.add(row.municipio);
    group.cargos.add(row.cargo_tipo);
    group.origenes.add(row.origen);
  }

  const byKey = new Map();
  const nombresUnicos = [...localGroups.values()].map(group => {
    const match = resolverNombre(group.nombre_local, pgValid, exactos);
    const result = {
      nombre_local: group.nombre_local,
      nombre_normalizado: group.nombre_normalizado,
      apariciones: group.apariciones,
      municipios: [...group.municipios].sort((a, b) => a.localeCompare(b, 'es')).join(' | '),
      cargos: [...group.cargos].sort((a, b) => a.localeCompare(b, 'es')).join(' | '),
      origenes: [...group.origenes].sort((a, b) => a.localeCompare(b, 'es')).join(' | '),
      ...match
    };
    byKey.set(group.nombre_normalizado, result);
    return result;
  }).sort((a, b) => a.nombre_local.localeCompare(b.nombre_local, 'es'));

  const porFicha = localRows.map(row => ({
    ...row,
    ...byKey.get(normalizarNombre(row.nombre_local))
  }));

  return { nombresUnicos, porFicha };
}

module.exports = { comparar };
