'use strict';

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' '
};

function decodeHtml(value = '') {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match);
}

function textoPlano(value = '') {
  return decodeHtml(String(value).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function normalizar(value = '') {
  return textoPlano(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleUpperCase('es-MX')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function perfil(value) {
  const normalized = normalizar(value);
  const compact = normalized.replace(/\s/g, '');
  const bigrams = new Map();
  for (let index = 0; index < Math.max(1, compact.length - 1); index += 1) {
    const pair = compact.length < 2 ? compact : compact.slice(index, index + 2);
    if (pair) bigrams.set(pair, (bigrams.get(pair) || 0) + 1);
  }
  return {
    normalized,
    bigrams,
    totalBigrams: [...bigrams.values()].reduce((sum, count) => sum + count, 0),
    tokens: new Set(normalized.split(' ').filter(Boolean))
  };
}

function similitud(leftValue, rightValue) {
  const left = perfil(leftValue);
  const right = perfil(rightValue);
  if (!left.normalized || !right.normalized) return 0;
  if (left.normalized === right.normalized) return 1;
  let pairs = 0;
  for (const [pair, count] of left.bigrams) pairs += Math.min(count, right.bigrams.get(pair) || 0);
  const dice = left.totalBigrams && right.totalBigrams
    ? (2 * pairs) / (left.totalBigrams + right.totalBigrams)
    : 0;
  let words = 0;
  for (const token of left.tokens) if (right.tokens.has(token)) words += 1;
  const tokenScore = left.tokens.size && right.tokens.size
    ? (2 * words) / (left.tokens.size + right.tokens.size)
    : 0;
  return (dice * 0.85) + (tokenScore * 0.15);
}

function normalizarPartido(value = '') {
  const normalized = normalizar(value).replace(/\s/g, '');
  const aliases = {
    MOVIMIENTOCIUDADANO: 'MC', VERDE: 'PVEM', PARTIDOVERDE: 'PVEM',
    INDEPENDIENTE: 'INDEP', INDEPENDENCIA: 'INDEP', SINPARTIDO: 'SP',
    'S/P': 'SP', NINGUNO: 'SP'
  };
  return aliases[normalized] || normalized;
}

module.exports = { decodeHtml, textoPlano, normalizar, similitud, normalizarPartido };
