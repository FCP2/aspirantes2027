'use strict';

const { normalizar, similitud, normalizarPartido } = require('./normalizar');

function mejorCoincidencia(external, candidates) {
  const uniqueCandidates = [...candidates.reduce((map, candidate) => {
    const current = map.get(candidate.persona_id);
    if (!current || candidate.tipo_actor === 'ASPIRANTE_2027') map.set(candidate.persona_id, candidate);
    return map;
  }, new Map()).values()];
  const exact = uniqueCandidates.filter(candidate => normalizar(candidate.nombre) === normalizar(external.nombre));
  if (exact.length === 1) return { local: exact[0], score: 1, nivel: 'EXACTA' };
  if (exact.length > 1) return { local: exact[0], score: 1, nivel: 'EXACTA_AMBIGUA', alternativas: exact.length };
  const ranked = uniqueCandidates
    .map(candidate => ({ local: candidate, score: similitud(external.nombre, candidate.nombre) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < 0.78) return { local: null, score: best?.score || 0, nivel: 'SIN_COINCIDENCIA' };
  const gap = best.score - (ranked[1]?.score || 0);
  if (gap < 0.025) return { ...best, nivel: 'AMBIGUA' };
  return { ...best, nivel: best.score >= 0.92 ? 'PROBABLE' : 'POSIBLE' };
}

function clasificar(external, match) {
  if (!match.local) return 'NUEVO_EN_FUENTE';
  if (match.nivel === 'AMBIGUA' || match.nivel === 'EXACTA_AMBIGUA') return 'REQUIERE_REVISION';
  const externalParty = normalizarPartido(external.partido);
  const localParty = normalizarPartido(match.local.partido);
  if (externalParty && localParty && externalParty !== localParty) return 'CONTRADICCION_PARTIDISTA';
  if (match.nivel !== 'EXACTA') return 'VARIACION_DE_NOMBRE';
  if (external.alerta) return 'ALERTA_EN_FUENTE';
  return 'COINCIDE';
}

function compararFuente(fuente, locales) {
  const usados = new Set();
  const resultados = [];
  for (const municipality of fuente.municipios) {
    const candidates = locales.filter(local => normalizar(local.municipio) === normalizar(municipality.municipio));
    for (const external of municipality.perfiles) {
      const match = mejorCoincidencia(external, candidates);
      if (match.local) usados.add(`${match.local.persona_id}:${normalizar(match.local.municipio)}`);
      resultados.push({
        id: `externo-${resultados.length + 1}`,
        municipio: municipality.municipio,
        estado: clasificar(external, match),
        coincidencia: match.nivel,
        puntuacion: Number((match.score * 100).toFixed(1)),
        externo: external,
        local: match.local || null
      });
    }
  }

  for (const local of locales) {
    if (!fuente.municipios.some(item => normalizar(item.municipio) === normalizar(local.municipio))) continue;
    const key = `${local.persona_id}:${normalizar(local.municipio)}`;
    if (usados.has(key)) continue;
    usados.add(key);
    resultados.push({
      id: `local-${resultados.length + 1}`,
      municipio: local.municipio,
      estado: 'SOLO_EN_FICHA',
      coincidencia: 'SIN_COINCIDENCIA',
      puntuacion: 0,
      externo: null,
      local
    });
  }

  const totals = resultados.reduce((result, row) => {
    result[row.estado] = (result[row.estado] || 0) + 1;
    return result;
  }, {});
  return { resultados, totales: totals };
}

module.exports = { compararFuente };
