'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { extraerFuente } = require('./src/extraer-html');
const { leerFichaLocal } = require('./src/leer-local');
const { compararFuente } = require('./src/comparar');

const projectRoot = path.resolve(__dirname, '..', '..');
const usePostgres = process.env.RENDER === 'true'
  || process.env.MUNICIPAL_DB_ENGINE === 'postgres';
const inputDir = usePostgres
  ? path.join(projectRoot, 'storage', 'private', 'revision-fuentes')
  : path.join(__dirname, 'entradas');
const dbPath = path.join(projectRoot, 'data', 'municipal.sqlite');

function listarFuentes() {
  fs.mkdirSync(inputDir, { recursive: true });
  return fs.readdirSync(inputDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && /\.html?$/i.test(entry.name))
    .map(entry => {
      const fullPath = path.join(inputDir, entry.name);
      const stat = fs.statSync(fullPath);
      return { archivo: entry.name, bytes: stat.size, modificado: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.modificado.localeCompare(a.modificado));
}

function resolverFuente(fileName) {
  const sources = listarFuentes();
  const selected = fileName ? sources.find(source => source.archivo === path.basename(fileName)) : sources[0];
  if (!selected) return null;
  return path.join(inputDir, selected.archivo);
}

function analizar(fileName) {
  const sourcePath = resolverFuente(fileName);
  if (!sourcePath) return { fuentes: [], fuente: null, resultados: [], totales: {} };
  if (!usePostgres && !fs.existsSync(dbPath)) {
    throw new Error('No se encontró la base municipal para consulta.');
  }
  const fuente = extraerFuente(sourcePath);
  const locales = leerFichaLocal(dbPath);
  const comparison = compararFuente(fuente, locales);
  return { fuentes: listarFuentes(), fuente, ...comparison };
}

module.exports = { inputDir, listarFuentes, analizar };
