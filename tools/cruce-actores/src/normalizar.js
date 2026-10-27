'use strict';

function limpiarEspacios(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function nombreCompleto(nombre, apellidoPaterno, apellidoMaterno) {
  return [nombre, apellidoPaterno, apellidoMaterno]
    .map(limpiarEspacios)
    .filter(Boolean)
    .join(' ');
}

function normalizarNombre(value) {
  return limpiarEspacios(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleUpperCase('es-MX')
    .replace(/[^A-Z0-9Ñ]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function frecuencias(items) {
  const result = new Map();
  for (const item of items) result.set(item, (result.get(item) || 0) + 1);
  return result;
}

function crearPerfilNombre(value) {
  const normalizado = normalizarNombre(value);
  const compact = normalizado.replace(/\s/g, '');
  const pairs = [];
  if (compact.length === 1) pairs.push(compact);
  else {
    for (let index = 0; index < compact.length - 1; index += 1) {
      pairs.push(compact.slice(index, index + 2));
    }
  }
  return {
    normalizado,
    bigramas: frecuencias(pairs),
    totalBigramas: pairs.length,
    tokens: new Set(normalizado.split(' ').filter(Boolean))
  };
}

function similitudPerfiles(left, right) {
  if (!left.normalizado || !right.normalizado) return 0;
  if (left.normalizado === right.normalizado) return 1;

  let bigramMatches = 0;
  for (const [pair, count] of left.bigramas) {
    bigramMatches += Math.min(count, right.bigramas.get(pair) || 0);
  }
  const bigramScore = left.totalBigramas && right.totalBigramas
    ? (2 * bigramMatches) / (left.totalBigramas + right.totalBigramas)
    : 0;

  let tokenMatches = 0;
  for (const token of left.tokens) if (right.tokens.has(token)) tokenMatches += 1;
  const wordsScore = left.tokens.size && right.tokens.size
    ? (2 * tokenMatches) / (left.tokens.size + right.tokens.size)
    : 0;

  return (bigramScore * 0.85) + (wordsScore * 0.15);
}

function similitudNombres(a, b) {
  return similitudPerfiles(crearPerfilNombre(a), crearPerfilNombre(b));
}

module.exports = {
  limpiarEspacios,
  nombreCompleto,
  normalizarNombre,
  crearPerfilNombre,
  similitudPerfiles,
  similitudNombres
};
