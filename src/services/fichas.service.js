const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const municipiosService = require('./municipios.service');
const personasService = require('./personas.service');
const repo = require('../repositories/fichas.repository');
const { normalizeUpper, normalizeText, normalizePersonName } = require('../utils/textNormalizer');
const { normalizeReferenceKey } = require('../utils/reference-normalizer');
const { writeAudit } = require('../utils/audit');

function referenceLabel(actor) {
  return normalizePersonName(
    actor?.referente_texto
      || [
        actor?.referente_nombre,
        actor?.referente_apellido_paterno,
        actor?.referente_apellido_materno
      ].filter(Boolean).join(' ')
      || ''
  );
}

function referenceKey(actor) {
  return normalizeReferenceKey(referenceLabel(actor));
}

function districtKey(value) {
  return normalizeReferenceKey(value || '');
}

function sameDeputyDistrict(left, right) {
  const leftDistrict = districtKey(left);
  const rightDistrict = districtKey(right);

  return !leftDistrict || !rightDistrict || leftDistrict === rightDistrict;
}

function findPreviousDeputy(rows, item, personId, districtText) {
  if (item.id) {
    const byId = rows.find(row => row.id === item.id);
    if (byId) return byId;
  }

  return rows.find(row => (
    row.persona_id === personId
    && sameDeputyDistrict(row.distrito_texto, districtText)
  ));
}

function propagateDeputyReference({
  officeId,
  sourceMunicipioId,
  personId,
  tipoActor,
  districtText,
  previousActor,
  referenceId,
  referenceText,
  affectedMunicipalities
}) {
  if (!previousActor) return;

  const previousReference = referenceKey(previousActor);
  const nextReference = normalizeReferenceKey(referenceText);

  if (previousReference === nextReference) return;

  const matches = repo.getDeputyOccurrencesInOffice({
    officeId,
    municipioId: sourceMunicipioId,
    personaId: personId,
    tipoActor
  });

  matches.forEach(match => {
    if (!sameDeputyDistrict(match.distrito_texto, districtText)) return;
    if (referenceKey(match) === nextReference) return;

    // El cambio que acaba de guardar el usuario es la actualización más reciente.
    // Por eso prevalece sobre los referentes anteriores de las demás fichas del diputado.
    repo.updateDeputyReference({
      actorId: match.id,
      referenceId,
      referenceText
    });

    if (!affectedMunicipalities.has(match.municipio_id)) {
      affectedMunicipalities.set(match.municipio_id, {
        municipio: match.municipio_nombre,
        diputados: []
      });
    }

    affectedMunicipalities.get(match.municipio_id).diputados.push({
      persona_id: personId,
      nombre: [match.nombre, match.apellido_paterno, match.apellido_materno]
        .filter(Boolean)
        .join(' '),
      tipo_actor: tipoActor,
      distrito: match.distrito_texto || districtText || '',
      referente_anterior: referenceLabel(match),
      referente_nuevo: referenceText
    });
  });
}

function fullName(r, prefix='') {
  return [r[`${prefix}nombre`],r[`${prefix}apellido_paterno`],r[`${prefix}apellido_materno`]].filter(Boolean).join(' ');
}
function mapActor(a) {
  return {
    ...a,
    distrito: a.distrito_texto || '',
    subreferente: a.subreferente_texto || '',
    nombre_completo: fullName(a),
    referente_completo: normalizePersonName(a.referente_texto || [a.referente_nombre,a.referente_apellido_paterno,a.referente_apellido_materno].filter(Boolean).join(' '))
  };
}
async function resolveRef(item) {
  if (!item) return null;
  if (item.referente_persona_id) return item.referente_persona_id;
  if (!item.referente_nombre) return null;
  return personasService.resolveOrCreate({
    nombre:item.referente_nombre,
    apellido_paterno:item.referente_apellido_paterno || '',
    apellido_materno:item.referente_apellido_materno || ''
  }).id;
}
function normalizeBool(v){ return v === '' || v === undefined || v === null ? null : Number(v); }
function resolveParty(item) {
  if (!item?.partido_id) return null;
  if (item.partido_id !== 'OTRO') return item.partido_id;
  const siglas = normalizeUpper(item.partido_otro || '');
  if (!siglas) throw Object.assign(new Error('ESCRIBE EL NOMBRE O LAS SIGLAS DEL PARTIDO'),{status:400});
  const existing = db.prepare(`SELECT id FROM partidos WHERE siglas=? AND activo=1 LIMIT 1`).get(siglas);
  if (existing) return existing.id;
  const id = `CUSTOM-${uuidv4()}`;
  db.prepare(`INSERT INTO partidos (id,siglas,nombre,activo) VALUES (?,?,?,1)`).run(id,siglas,siglas);
  return id;
}

exports.getFicha = (municipioId, officeId) => {
  const municipio = municipiosService.getAllowedMunicipio(municipioId,officeId);
  const row = repo.getFichaRow(municipioId);
  const hojas = repo.getHojas(municipioId);
  const presidencia = repo.getActors(municipioId,'PRESIDENCIA_MUNICIPAL').map(mapActor)[0] || null;
  const diputacionesFederales = repo.getActors(municipioId,'DIPUTACION_FEDERAL').map(mapActor);
  const diputacionesLocales = repo.getActors(municipioId,'DIPUTACION_LOCAL').map(mapActor);
  if (presidencia) {
    const savedReferences = repo.getPresidencyReferences(municipioId).map(reference => {
      const name = normalizePersonName(
        reference.referente_texto
          || [reference.referente_nombre,reference.referente_apellido_paterno,reference.referente_apellido_materno].filter(Boolean).join(' ')
      );
      return {
        ...reference,
        nombre_completo:name,
        referente_completo:name
      };
    });
    const legacyReference = presidencia.referente_completo
      ? [{
        referente_persona_id:presidencia.referente_persona_id,
        referente_nombre:presidencia.referente_completo,
        referente_completo:presidencia.referente_completo,
        nombre_completo:presidencia.referente_completo
      }]
      : [];
    presidencia.referentes_principales = savedReferences.length ? savedReferences : legacyReference;
    const primaryReference = presidencia.referentes_principales[0];
    if (primaryReference) {
      presidencia.referente_persona_id = primaryReference.referente_persona_id || null;
      presidencia.referente_nombre = primaryReference.referente_nombre || primaryReference.nombre_completo;
      presidencia.referente_completo = primaryReference.referente_completo || primaryReference.nombre_completo;
    }
  }
  return {
    municipio,
    estatus: row?.estatus || 'PENDIENTE',
    revision: row?.revision || 0,
    ultima_actualizacion: row && Number(row.revision) > 0 ? row.updated_at : null,
    grupo_politico: row?.grupo_politico_texto || '',
    grupo_politico_imagen_path: row?.grupo_politico_imagen_path || '',
    grupos_presencia: repo.getGruposPresencia(municipioId).map(item => ({
      ...item,
      actor_politico: item.actor_politico || '',
      grupo_nombre: item.grupo_nombre || '',
      imagen_path: item.imagen_path || ''
    })),
    presidencia,
    diputacionFederal: diputacionesFederales[0] || null,
    diputacionLocal: diputacionesLocales[0] || null,
    diputacionesFederales,
    diputacionesLocales,
    lideres: repo.getActors(municipioId,'LIDER').map(mapActor),
    aspirantes: repo.getActors(municipioId,'ASPIRANTE_2027').map(mapActor),
    territorio: repo.getTerritorio(municipioId).map(x => ({
      ...x,
      nombre_completo: fullName(x),
      referente_completo:normalizePersonName(x.referente_texto || [x.referente_nombre,x.referente_apellido_paterno,x.referente_apellido_materno].filter(Boolean).join(' '))
    })),
    personal_coordinacion: repo.getPersonalCoordinacion(municipioId),
    hojas,
    hoja2: hojas[0] || null
  };
};

exports.saveFull = ({ municipioId, officeId, payload }) => {
  municipiosService.getAllowedMunicipio(municipioId,officeId);
  const before = exports.getFicha(municipioId,officeId);
  const previousDeputies = {
    DIPUTACION_FEDERAL: repo.getActors(municipioId, 'DIPUTACION_FEDERAL'),
    DIPUTACION_LOCAL: repo.getActors(municipioId, 'DIPUTACION_LOCAL')
  };
  const affectedMunicipalities = new Map();

  const tx = db.transaction(() => {
    repo.deletePresidencyReferences(municipioId);
    const actorKinds = [
      ['presidencia','PRESIDENCIA_MUNICIPAL',false],
      ['diputacionesFederales','DIPUTACION_FEDERAL',true,'diputacionFederal'],
      ['diputacionesLocales','DIPUTACION_LOCAL',true,'diputacionLocal'],
      ['lideres','LIDER',true],
      ['aspirantes','ASPIRANTE_2027',true]
    ];

    for (const [key,tipo,isArray,legacyKey] of actorKinds) {
      repo.deleteActorsByType(municipioId,tipo);
      const records = isArray
        ? (Array.isArray(payload[key]) ? payload[key] : (legacyKey && payload[legacyKey] ? [payload[legacyKey]] : []))
        : (payload[key] ? [payload[key]] : []);
      records.forEach((item,index) => {
        if (!item?.nombre) return;
        const person = personasService.resolveOrCreate(item);
        const usesReference = tipo === 'PRESIDENCIA_MUNICIPAL' || tipo === 'DIPUTACION_FEDERAL' || tipo === 'DIPUTACION_LOCAL' || tipo === 'LIDER' || tipo === 'ASPIRANTE_2027';
        const presidencyReferenceItems = tipo === 'PRESIDENCIA_MUNICIPAL'
          ? (Array.isArray(item.referentes_principales)
            ? item.referentes_principales
            : [item].filter(referenceItem => referenceItem.referente_nombre || referenceItem.referente_completo || referenceItem.referente_persona_id))
          : [];
        const resolvedPresidencyReferences = presidencyReferenceItems
          .filter(referenceItem => referenceItem && (referenceItem.referente_nombre || referenceItem.referente_completo || referenceItem.referente_persona_id))
          .map(referenceItem => {
            const resolved = personasService.resolveReference(referenceItem);
            const name = normalizePersonName(
              referenceItem.referente_nombre
                || referenceItem.referente_completo
                || (resolved ? fullName(resolved) : '')
            );
            return { reference:resolved, name };
          })
          .filter(reference => reference.name)
          .filter((reference,index,list) => list.findIndex(candidate => normalizeReferenceKey(candidate.name) === normalizeReferenceKey(reference.name)) === index);
        const reference = tipo === 'PRESIDENCIA_MUNICIPAL'
          ? (resolvedPresidencyReferences[0]?.reference || null)
          : (usesReference ? personasService.resolveReference(item) : null);
        const refId = reference?.id || null;
        const referenceText = tipo === 'PRESIDENCIA_MUNICIPAL'
          ? (resolvedPresidencyReferences[0]?.name || '')
          : usesReference
          ? normalizePersonName(
            item.referente_nombre
              || item.referente_completo
              || (reference ? fullName(reference) : '')
              || ''
          )
          : '';
        const districtText = normalizeText(item.distrito || item.distrito_texto || '');

        if (tipo === 'DIPUTACION_FEDERAL' || tipo === 'DIPUTACION_LOCAL') {
          const previousActor = findPreviousDeputy(
            previousDeputies[tipo],
            item,
            person.id,
            districtText
          );

          propagateDeputyReference({
            officeId,
            sourceMunicipioId: municipioId,
            personId: person.id,
            tipoActor: tipo,
            districtText,
            previousActor,
            referenceId: refId,
            referenceText,
            affectedMunicipalities
          });
        }

        repo.insertActor({
          id:uuidv4(), municipioId, personaId:person.id, tipoActor:tipo,
          partidoId:resolveParty(item), referenteId:refId,
          referenteTexto:referenceText,
          distritoTexto:districtText,
          subreferenteTexto:normalizePersonName(item.subreferente || item.subreferente_texto || ''),
          puedeReelegirse:normalizeBool(item.puede_reelegirse),
          pretendeReelegirse:normalizeBool(item.pretende_reelegirse),
          podriaGanar:normalizeBool(item.podria_ganar_eleccion),
          observaciones:normalizeText(item.observaciones || ''),
          ordenVisual:index+1
        });

        if (tipo === 'PRESIDENCIA_MUNICIPAL') {
          resolvedPresidencyReferences.forEach((presidencyReference,index) => {
            repo.insertPresidencyReference({
              id:uuidv4(),
              municipioId,
              referenteId:presidencyReference.reference?.id,
              referenteText:presidencyReference.name,
              ordenVisual:index+1
            });
          });
        }
      });
    }

    repo.deleteTerritorio(municipioId);
    (payload.territorio || []).forEach((item,index) => {
      if (!item?.nombre) return;
      const person = personasService.resolveOrCreate(item);
      const reference = personasService.resolveReference(item);
      const refId = reference?.id || null;
      repo.insertTerritorio({
        id:uuidv4(),municipioId,personaId:person.id,
        tipoPersonalId:item.tipo_personal_id || 'COTS',
        cargoFuncionTexto:normalizeText(item.cargo_funcion || item.cargo_funcion_texto || ''),
        referenteId:refId,referenteTexto:normalizePersonName(item.referente_nombre || item.referente_completo || ''),ordenVisual:index+1
      });
    });

    if (Array.isArray(payload.personal_coordinacion)) {
      repo.deletePersonalCoordinacion(municipioId);
      payload.personal_coordinacion.forEach((item,index) => {
        const nombre = normalizePersonName(item.nombre || item.nombre_completo || '');
        if (!nombre) return;
        repo.insertPersonalCoordinacion({
          id:uuidv4(),
          municipioId,
          nombre,
          cargo:normalizeText(item.cargo || ''),
          coordinacionGeneral:normalizeText(item.coordinacion_general || ''),
          region:normalizeText(item.region || ''),
          telefono:normalizeText(item.telefono || ''),
          fotoPath:item.foto_path || null,
          ordenVisual:index+1
        });
      });
    }

    repo.deleteGruposPresencia(municipioId);
    (payload.grupos_presencia || []).forEach((item,index) => {
      const actorPolitico = normalizePersonName(item.actor_politico || '');
      const grupoNombre = normalizeText(item.grupo_nombre || '');
      if (!actorPolitico || !grupoNombre) return;
      repo.insertGrupoPresencia({
        id:uuidv4(),municipioId,actorPolitico,grupoNombre,
        imagenPath:item.imagen_path || null,ordenVisual:index+1
      });
    });

    repo.updateHeader(municipioId, normalizeText(payload.grupo_politico || ''), payload.grupo_politico_imagen_path || null, payload.hoja2_archivo_id || null);

    affectedMunicipalities.forEach((update, targetMunicipioId) => {
      repo.incrementFichaRevision(targetMunicipioId);

      writeAudit({
        officeId,
        municipioId: targetMunicipioId,
        entity: 'DIPUTADO_REFERENTE',
        entityId: targetMunicipioId,
        action: 'PROPAGATE',
        fieldName: 'REFERENTE',
        oldValue: JSON.stringify(update.diputados.map(deputy => ({
          nombre: deputy.nombre,
          tipo_actor: deputy.tipo_actor,
          distrito: deputy.distrito,
          referente: deputy.referente_anterior
        }))),
        newValue: JSON.stringify(update.diputados.map(deputy => ({
          nombre: deputy.nombre,
          tipo_actor: deputy.tipo_actor,
          distrito: deputy.distrito,
          referente: deputy.referente_nuevo,
          origen_municipio_id: municipioId
        })))
      });
    });

    writeAudit({
      officeId, municipioId, entity:'FICHA_MUNICIPAL', entityId:municipioId,
      action:'UPDATE', oldValue:JSON.stringify(before), newValue:JSON.stringify(payload)
    });
  });

  tx();
  const ficha = exports.getFicha(municipioId,officeId);
  ficha.propagacion_referentes = {
    total_municipios: affectedMunicipalities.size,
    total_diputados: [...affectedMunicipalities.values()]
      .reduce((total, update) => total + update.diputados.length, 0),
    municipios: [...affectedMunicipalities.values()].map(update => update.municipio)
  };

  return ficha;
};
