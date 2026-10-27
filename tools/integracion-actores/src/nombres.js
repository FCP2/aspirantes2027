'use strict';

const PARTICULAS = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'Y', 'DA', 'DAS']);

function normalizarNombre(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleUpperCase('es-MX')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokensNombre(value = '') {
  return normalizarNombre(value).split(' ').filter(token => token && !PARTICULAS.has(token));
}

function perfilNombre(value = '') {
  const normalizado = normalizarNombre(value);
  const tokens = tokensNombre(value);
  return {
    normalizado,
    tokens,
    firma: [...tokens].sort((a, b) => a.localeCompare(b, 'es')).join(' ')
  };
}

function diceCaracteres(left, right) {
  const a = normalizarNombre(left).replace(/\s/g, '');
  const b = normalizarNombre(right).replace(/\s/g, '');
  if (!a || !b) return 0;
  if (a === b) return 1;
  const pairs = value => {
    const map = new Map();
    for (let index = 0; index < Math.max(1, value.length - 1); index += 1) {
      const pair = value.length < 2 ? value : value.slice(index, index + 2);
      map.set(pair, (map.get(pair) || 0) + 1);
    }
    return map;
  };
  const leftPairs = pairs(a);
  const rightPairs = pairs(b);
  let intersection = 0;
  for (const [pair, count] of leftPairs) intersection += Math.min(count, rightPairs.get(pair) || 0);
  const total = [...leftPairs.values(), ...rightPairs.values()].reduce((sum, count) => sum + count, 0);
  return total ? (2 * intersection) / total : 0;
}

function similitudNombre(left, right) {
  const a = perfilNombre(left);
  const b = perfilNombre(right);
  if (!a.normalizado || !b.normalizado) return 0;
  if (a.normalizado === b.normalizado || (a.firma && a.firma === b.firma)) return 1;
  const counts = tokens => tokens.reduce((map, token) => map.set(token, (map.get(token) || 0) + 1), new Map());
  const leftCounts = counts(a.tokens);
  const rightCounts = counts(b.tokens);
  let shared = 0;
  for (const [token, count] of leftCounts) shared += Math.min(count, rightCounts.get(token) || 0);
  const tokenDice = a.tokens.length + b.tokens.length
    ? (2 * shared) / (a.tokens.length + b.tokens.length)
    : 0;
  return (tokenDice * 0.72) + (diceCaracteres(left, right) * 0.28);
}

function terminosBusqueda(value = '') {
  const tokens = [...new Set(tokensNombre(value))]
    .filter(token => token.length >= 3)
    .sort((a, b) => b.length - a.length);
  return tokens.slice(0, 3);
}

function nombreCompleto(persona = {}) {
  return [persona.nombre, persona.apellido_paterno, persona.apellido_materno]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { normalizarNombre, perfilNombre, similitudNombre, terminosBusqueda, nombreCompleto };
