'use strict';

const fs = require('node:fs');
const path = require('node:path');
const db = require('../config/database');
const municipiosService = require('./municipios.service');
const fichasService = require('./fichas.service');
const { normalizeReferenceKey, referenceDisplayName, probablySameReference } = require('../utils/reference-normalizer');
const { referenceColor, partyColor, partyLogos } = require('../utils/map-colors');
const { orderAspirantsForDisplay } = require('../utils/aspirantes-order');

let polygonsByKey = null;

function value(source, names) {
  for (const name of names) {
    if (source?.[name] !== undefined && source[name] !== null) return source[name];
  }
  return null;
}

function loadPolygons() {
  if (polygonsByKey) return polygonsByKey;
  const file = path.join(__dirname, '..', 'database', 'seeds', 'municipios.json');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const rows = Array.isArray(raw) ? raw : (raw.municipios || raw.features || []);
  polygonsByKey = new Map();
  rows.forEach((row, index) => {
    const props = row.properties || row;
    const key = String(value(props, ['clave', 'cve_municipio', 'CVE_MUN', 'cve_mun']) ?? index + 1).padStart(3, '0');
    const wkt = value(props, ['poligono', 'wkt', 'WKT', 'geometry_wkt']);
    if (typeof wkt === 'string' && wkt.trim()) polygonsByKey.set(key, wkt.trim());
  });
  return polygonsByKey;
}

exports.list = officeId => {
  const polygons = loadPolygons();
  return municipiosService.listByOffice(officeId).map(municipio => ({
    id_municipio: Number(municipio.clave),
    municipio_id: municipio.id,
    clave: municipio.clave,
    nombre: municipio.nombre,
    wkt: polygons.get(String(municipio.clave).padStart(3, '0')) || '',
    tiene_informacion: Boolean(municipio.tiene_informacion),
    total: municipio.tiene_informacion ? 1 : 0,
    estatus: municipio.estatus || 'PENDIENTE',
    revision: Number(municipio.revision || 0),
    ultima_actualizacion: municipio.ultima_actualizacion || null
  }));
};

exports.getFicha = (municipioId, officeId) => fichasService.getFicha(municipioId, officeId);

exports.history = officeId => {
  const rows = db.prepare(`
    SELECT h.periodo,h.municipio_id,h.municipio_nombre,h.presidente_nombre,h.partido,
           h.referente_original,h.referente_normalizado,h.estado_normalizacion
    FROM historial_presidencias h
    JOIN oficina_municipio om ON om.municipio_id=h.municipio_id
    WHERE om.office_id=? AND om.activo=1
    ORDER BY h.periodo,h.municipio_nombre
  `).all(officeId);
  const current = db.prepare(`
    SELECT a.municipio_id,m.nombre municipio_nombre,
      COALESCE(pr.referente_texto,a.referente_texto) referente_original,
      r.nombre referente_nombre,r.apellido_paterno referente_apellido_paterno,r.apellido_materno referente_apellido_materno
    FROM oficina_municipio om
    JOIN municipios m ON m.id=om.municipio_id
    JOIN actores_municipio a ON a.municipio_id=m.id AND a.tipo_actor='PRESIDENCIA_MUNICIPAL' AND a.activo=1
    LEFT JOIN presidencia_referentes pr ON pr.municipio_id=a.municipio_id
    LEFT JOIN personas r ON r.id=COALESCE(pr.referente_persona_id,a.referente_persona_id)
    WHERE om.office_id=? AND om.activo=1
  `).all(officeId).map(row => ({
    ...row,
    referente_texto: row.referente_original,
    referente: referenceDisplayName(row),
    referente_normalizado: normalizeReferenceKey(referenceDisplayName(row))
  }));
  const periods = [...new Set(rows.map(row => row.periodo))].map(periodo => {
    const periodRows=rows.filter(row=>row.periodo===periodo);
    return { periodo, municipios:periodRows.length, referentes:[...new Set(periodRows.map(row=>row.referente_normalizado).filter(Boolean))].length };
  });
  return { periodos: periods, rows, current, municipios:exports.list(officeId) };
};

function storageUrl(filePath) {
  if (!filePath) return '';
  const normalized = String(filePath).replace(/\\/g, '/');
  const storageIndex = normalized.toLowerCase().lastIndexOf('/storage/');
  if (storageIndex >= 0) return normalized.slice(storageIndex);
  return normalized.toLowerCase().startsWith('storage/') ? `/${normalized}` : '';
}

function presidencyReferenceRows(officeId) {
  return db.prepare(`
    SELECT m.id municipio_id,m.clave,m.nombre municipio_nombre,
      a.id actor_id,
      COALESCE(pr.referente_persona_id,a.referente_persona_id) referente_persona_id,
      COALESCE(pr.referente_texto,a.referente_texto) referente_texto,
      rp.nombre referente_nombre,rp.apellido_paterno referente_apellido_paterno,
      rp.apellido_materno referente_apellido_materno,rp.foto_path referente_foto_path,
      pp.nombre actor_nombre,pp.apellido_paterno actor_apellido_paterno,
      pp.apellido_materno actor_apellido_materno,pp.foto_path actor_foto_path,
      a.tipo_actor,pa.siglas partido
    FROM oficina_municipio om
    JOIN municipios m ON m.id=om.municipio_id
    JOIN actores_municipio a ON a.municipio_id=m.id
      AND a.tipo_actor IN ('PRESIDENCIA_MUNICIPAL','DIPUTACION_FEDERAL','DIPUTACION_LOCAL') AND a.activo=1
    LEFT JOIN presidencia_referentes pr ON a.tipo_actor='PRESIDENCIA_MUNICIPAL'
      AND pr.municipio_id=a.municipio_id
    JOIN personas pp ON pp.id=a.persona_id
    LEFT JOIN personas rp ON rp.id=COALESCE(pr.referente_persona_id,a.referente_persona_id)
    LEFT JOIN partidos pa ON pa.id=a.partido_id
    WHERE om.office_id=? AND om.activo=1
    ORDER BY m.nombre,
      CASE a.tipo_actor WHEN 'PRESIDENCIA_MUNICIPAL' THEN 1 WHEN 'DIPUTACION_FEDERAL' THEN 2 ELSE 3 END,
      a.orden_visual,a.created_at
  `).all(officeId);
}

function aspirantReferenceCounts(officeId) {
  const counts = new Map();
  // Prioriza el vínculo por persona_id y usa el nombre exacto normalizado como respaldo.
  const deputyByPersonId = new Map();
  const deputyByNormalizedName = new Map();
  const deputyRows = db.prepare(`
    SELECT a.persona_id,a.tipo_actor,a.distrito_texto,a.updated_at,
      p.nombre,p.apellido_paterno,p.apellido_materno
    FROM oficina_municipio om
    JOIN actores_municipio a ON a.municipio_id=om.municipio_id
      AND a.tipo_actor IN ('DIPUTACION_FEDERAL','DIPUTACION_LOCAL')
      AND a.activo=1
    JOIN personas p ON p.id=a.persona_id
    WHERE om.office_id=? AND om.activo=1
    ORDER BY CASE a.tipo_actor WHEN 'DIPUTACION_FEDERAL' THEN 1 ELSE 2 END,
      a.updated_at DESC
  `).all(officeId);

  deputyRows.forEach(deputy => {
    if (deputy.persona_id && !deputyByPersonId.has(deputy.persona_id)) {
      deputyByPersonId.set(deputy.persona_id, deputy);
    }

    const fullName = [deputy.nombre,deputy.apellido_paterno,deputy.apellido_materno]
      .filter(Boolean)
      .join(' ');
    const normalizedName = normalizeReferenceKey(fullName);
    if (normalizedName && !deputyByNormalizedName.has(normalizedName)) {
      deputyByNormalizedName.set(normalizedName, deputy);
    }
  });

  const rows = db.prepare(`
    SELECT a.municipio_id,a.persona_id aspirante_persona_id,a.referente_texto,
      p.nombre aspirante_nombre,
      p.apellido_paterno aspirante_apellido_paterno,
      p.apellido_materno aspirante_apellido_materno,
      p.foto_path aspirante_foto_path,
      pa.siglas aspirante_partido,
      rp.nombre referente_nombre,
      rp.apellido_paterno referente_apellido_paterno,
      rp.apellido_materno referente_apellido_materno
    FROM oficina_municipio om
    JOIN actores_municipio a ON a.municipio_id=om.municipio_id
      AND a.tipo_actor='ASPIRANTE_2027' AND a.activo=1
    JOIN personas p ON p.id=a.persona_id
    LEFT JOIN partidos pa ON pa.id=a.partido_id
    LEFT JOIN personas rp ON rp.id=a.referente_persona_id
    WHERE om.office_id=? AND om.activo=1
  `).all(officeId);

  rows.forEach(row => {
    const name = referenceDisplayName(row);
    const key = normalizeReferenceKey(name);
    if (!key) return;

    if (!counts.has(key)) {
      counts.set(key, { total:0, municipalities:new Set(), records:[] });
    }

    const count = counts.get(key);
    count.total += 1;
    count.municipalities.add(row.municipio_id);
    const aspirantName = [
      row.aspirante_nombre,
      row.aspirante_apellido_paterno,
      row.aspirante_apellido_materno
    ].filter(Boolean).join(' ');
    const normalizedAspirantName = normalizeReferenceKey(aspirantName);
    const deputy = deputyByPersonId.get(row.aspirante_persona_id)
      || deputyByNormalizedName.get(normalizedAspirantName);
    count.records.push({
      municipio_id: row.municipio_id,
      persona_id: row.aspirante_persona_id,
      nombre: aspirantName,
      partido: row.aspirante_partido || 'SIN PARTIDO',
      distrito: deputy?.distrito_texto || '',
      cargo_tipo: deputy?.tipo_actor || '',
      foto_url: storageUrl(row.aspirante_foto_path)
    });
  });

  return counts;
}

function buildReferenceGroups(officeId) {
  const municipalityById = new Map(exports.list(officeId).map(row => [row.municipio_id, row]));
  const referencedMunicipalityIds = new Set();
  const groups = new Map();
  const photoByName = new Map();
  const aspirantsByReference = aspirantReferenceCounts(officeId);
  db.prepare(`SELECT nombre,apellido_paterno,apellido_materno,foto_path FROM personas WHERE activo=1 AND foto_path IS NOT NULL AND TRIM(foto_path)<>''`).all().forEach(person => {
    const key = normalizeReferenceKey([person.nombre,person.apellido_paterno,person.apellido_materno].filter(Boolean).join(' '));
    if (key && !photoByName.has(key)) photoByName.set(key,storageUrl(person.foto_path));
  });

  presidencyReferenceRows(officeId).forEach(row => {
    const referenceName = referenceDisplayName(row);
    const normalized = normalizeReferenceKey(referenceName);
    if (!normalized) return;

    const key = `N:${normalized}`;
    if (!groups.has(key)) groups.set(key, {
      key,
      nombre: referenceName,
      foto_url: storageUrl(row.referente_foto_path),
      variants: new Set(),
      person_ids: new Set(),
      municipios: new Map(),
      registros: []
    });
    const group = groups.get(key);
    group.variants.add(referenceName);
    if (row.referente_persona_id) group.person_ids.add(row.referente_persona_id);
    if (!group.foto_url) group.foto_url = storageUrl(row.referente_foto_path);
    referencedMunicipalityIds.add(row.municipio_id);
    group.municipios.set(row.municipio_id,{
      ...(municipalityById.get(row.municipio_id) || {}),
      municipio_id: row.municipio_id,
      clave: row.clave,
      nombre: row.municipio_nombre
    });
    group.registros.push({
      municipio_id:row.municipio_id,clave:row.clave,municipio:row.municipio_nombre,
      actor_id:row.actor_id,
      tipo_actor:row.tipo_actor,
      tipo_label:row.tipo_actor==='PRESIDENCIA_MUNICIPAL' ? 'PRESIDENCIA MUNICIPAL' : row.tipo_actor==='DIPUTACION_FEDERAL' ? 'DIPUTACIÓN FEDERAL' : 'DIPUTACIÓN LOCAL',
      nombre:[row.actor_nombre,row.actor_apellido_paterno,row.actor_apellido_materno].filter(Boolean).join(' '),
      foto_url:storageUrl(row.actor_foto_path),partido:row.partido || 'SIN PARTIDO'
    });
  });

  const references = [...groups.values()].map(group => ({
    key:group.key,nombre:group.nombre,
    color:referenceColor(group.nombre),
    foto_url: group.foto_url || photoByName.get(normalizeReferenceKey(group.nombre)) || '',
    variants: [...group.variants].sort((a,b) => a.localeCompare(b,'es')),
    person_ids: [...group.person_ids],
    municipios:[...group.municipios.values()],
    registros:group.registros,
    total_municipios: group.municipios.size,
    total_aspirantes: aspirantsByReference.get(normalizeReferenceKey(group.nombre))?.total || 0,
    municipios_con_aspirantes: aspirantsByReference.get(normalizeReferenceKey(group.nombre))?.municipalities.size || 0,
    municipios_aspirantes: [...(aspirantsByReference.get(normalizeReferenceKey(group.nombre))?.municipalities || new Set())],
    aspirantes: aspirantsByReference.get(normalizeReferenceKey(group.nombre))?.records || [],
    total_presidencias:new Set(group.registros.filter(item=>item.tipo_actor==='PRESIDENCIA_MUNICIPAL').map(item=>item.actor_id)).size,
    total_diputaciones_federales:group.registros.filter(item=>item.tipo_actor==='DIPUTACION_FEDERAL').length,
    total_diputaciones_locales:group.registros.filter(item=>item.tipo_actor==='DIPUTACION_LOCAL').length,
    municipios_presidencias:[...new Set(group.registros.filter(item=>item.tipo_actor==='PRESIDENCIA_MUNICIPAL').map(item=>item.municipio_id))],
    municipios_diputaciones_federales:[...new Set(group.registros.filter(item=>item.tipo_actor==='DIPUTACION_FEDERAL').map(item=>item.municipio_id))],
    municipios_diputaciones_locales:[...new Set(group.registros.filter(item=>item.tipo_actor==='DIPUTACION_LOCAL').map(item=>item.municipio_id))],
    posibles_coincidencias: [],
    requiere_revision: group.person_ids.size > 1 || group.variants.size > 1
  }));
  references.forEach((reference,index) => references.slice(index+1).forEach(candidate => {
    if (!probablySameReference(reference.nombre,candidate.nombre)) return;
    reference.posibles_coincidencias.push(candidate.nombre);
    candidate.posibles_coincidencias.push(reference.nombre);
    reference.requiere_revision=true;
    candidate.requiere_revision=true;
  }));
  references.sort((a,b) => b.total_municipios - a.total_municipios || a.nombre.localeCompare(b.nombre,'es'));

  return { references, municipalityCount:municipalityById.size, referencedMunicipalityIds };
}

exports.listReferences = officeId => {
  const { references, municipalityCount, referencedMunicipalityIds } = buildReferenceGroups(officeId);
  const covered = referencedMunicipalityIds.size;
  return {
    resumen: {
      total_referentes: references.length,
      municipios_con_referente: covered,
      municipios_sin_referente: Math.max(0,municipalityCount-covered),
      variantes_por_revisar: references.filter(item => item.requiere_revision).length
    },
    referentes: references.map(({ municipios, registros, ...item }) => item)
  };
};

exports.getReference = (officeId, key) => {
  const { references } = buildReferenceGroups(officeId);
  const reference = references.find(item => item.key === key);
  if (!reference) throw Object.assign(new Error('REFERENTE NO ENCONTRADO'), { status: 404 });
  return reference;
};

exports.listParties = officeId => {
  const municipalities = exports.list(officeId);
  const municipalityById = new Map(municipalities.map(item => [item.municipio_id,item]));
  const rows = db.prepare(`
    SELECT m.id municipio_id,m.clave,m.nombre municipio_nombre,pa.siglas partido,
      pp.nombre presidente_nombre,pp.apellido_paterno presidente_apellido_paterno,pp.apellido_materno presidente_apellido_materno
    FROM oficina_municipio om
    JOIN municipios m ON m.id=om.municipio_id
    JOIN actores_municipio a ON a.municipio_id=m.id
      AND a.tipo_actor='PRESIDENCIA_MUNICIPAL' AND a.activo=1
    LEFT JOIN partidos pa ON pa.id=a.partido_id
    JOIN personas pp ON pp.id=a.persona_id
    WHERE om.office_id=? AND om.activo=1
    ORDER BY pa.siglas,m.nombre
  `).all(officeId);
  const groups = new Map();
  rows.forEach(row => {
    const party = String(row.partido || 'SIN PARTIDO').trim().toUpperCase();
    if (!groups.has(party)) groups.set(party,{key:party,nombre:party,color:partyColor(party),logos:partyLogos(party),municipios:[]});
    groups.get(party).municipios.push({
      ...(municipalityById.get(row.municipio_id) || {}),
      municipio_id:row.municipio_id,clave:row.clave,nombre:row.municipio_nombre,
      partido_dominante:party,
      presidencia:[row.presidente_nombre,row.presidente_apellido_paterno,row.presidente_apellido_materno].filter(Boolean).join(' ')
    });
  });
  const partidos = [...groups.values()].map(group=>({...group,total_municipios:group.municipios.length}))
    .sort((a,b)=>b.total_municipios-a.total_municipios||a.nombre.localeCompare(b.nombre,'es'));
  const covered = new Set(rows.map(row=>row.municipio_id)).size;
  return {resumen:{total_partidos:partidos.length,municipios_con_partido:covered,municipios_sin_partido:Math.max(0,municipalities.length-covered)},partidos};
};

exports.getParty = (officeId,key) => {
  const party = exports.listParties(officeId).partidos.find(item=>item.key===String(key||'').trim().toUpperCase());
  if (!party) throw Object.assign(new Error('PARTIDO POLÍTICO NO ENCONTRADO'),{status:404});
  return party;
};

function aspirantRows(officeId) {
  return db.prepare(`
    SELECT
      m.id municipio_id,
      m.clave,
      m.nombre municipio_nombre,
      a.persona_id,
      p.nombre,
      p.apellido_paterno,
      p.apellido_materno,
      p.foto_path,
      pa.siglas partido,
      a.referente_texto,
      a.subreferente_texto,
      rp.nombre referente_nombre,
      rp.apellido_paterno referente_apellido_paterno,
      rp.apellido_materno referente_apellido_materno,
      a.orden_visual
    FROM oficina_municipio om
    JOIN municipios m ON m.id = om.municipio_id
    JOIN actores_municipio a ON a.municipio_id = m.id
      AND a.tipo_actor = 'ASPIRANTE_2027'
      AND a.activo = 1
    JOIN personas p ON p.id = a.persona_id
    LEFT JOIN partidos pa ON pa.id = a.partido_id
    LEFT JOIN personas rp ON rp.id = a.referente_persona_id
    WHERE om.office_id = ?
      AND om.activo = 1
    ORDER BY m.nombre, a.orden_visual, p.nombre, p.apellido_paterno
  `).all(officeId);
}

exports.listAspirants = officeId => {
  const municipalities = new Map();
  const governingPartyByMunicipality = new Map();

  exports.listParties(officeId).partidos.forEach(party => {
    party.municipios.forEach(municipality => {
      governingPartyByMunicipality.set(municipality.municipio_id, party.nombre);
    });
  });

  aspirantRows(officeId).forEach(row => {
    if (!municipalities.has(row.municipio_id)) {
      municipalities.set(row.municipio_id, {
        municipio_id: row.municipio_id,
        clave: row.clave,
        nombre: row.municipio_nombre,
        aspirantes: []
      });
    }

    const referenceFromPerson = [
      row.referente_nombre,
      row.referente_apellido_paterno,
      row.referente_apellido_materno
    ].filter(Boolean).join(' ');

    municipalities.get(row.municipio_id).aspirantes.push({
      persona_id: row.persona_id,
      nombre: [row.nombre, row.apellido_paterno, row.apellido_materno].filter(Boolean).join(' '),
      foto_url: storageUrl(row.foto_path),
      partido: row.partido || 'SIN PARTIDO',
      referente: referenceFromPerson || row.referente_texto || '',
      subreferente: row.subreferente_texto || ''
    });
  });

  const rows = [...municipalities.values()].map(municipality => {
    const orderedAspirants = orderAspirantsForDisplay(
      municipality.aspirantes,
      { partido: governingPartyByMunicipality.get(municipality.municipio_id) || '' }
    );

    return {
      ...municipality,
      aspirantes: orderedAspirants,
      total_aspirantes: orderedAspirants.length
    };
  });

  return {
    resumen: {
      total_aspirantes: rows.reduce((total, municipality) => total + municipality.total_aspirantes, 0),
      municipios_con_aspirantes: rows.length,
      municipios_sin_aspirantes: Math.max(0, exports.list(officeId).length - rows.length)
    },
    municipios: rows
  };
};

exports.getMunicipalityAspirants = (officeId, municipalityId) => {
  const municipality = exports.listAspirants(officeId).municipios.find(
    item => item.municipio_id === municipalityId
  );

  if (!municipality) {
    throw Object.assign(new Error('EL MUNICIPIO NO TIENE ASPIRANTES CAPTURADOS'), { status: 404 });
  }

  return municipality;
};
