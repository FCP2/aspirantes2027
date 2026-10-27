'use strict';

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');
const enlaces = require('./enlaces.repository');
const { nombreCompleto, normalizarNombre, perfilNombre, similitudNombre } = require('./nombres');

const DIRECTORY_MAX_AGE_MS = 6 * 60 * 60 * 1000;
let syncPromise = null;

function pgConfiguration() {
  const toolEnvPath = path.resolve('tools', 'cruce-actores', '.env');
  const toolEnv = fs.existsSync(toolEnvPath) ? dotenv.parse(fs.readFileSync(toolEnvPath)) : {};
  return {
    connectionString: process.env.ACTORES_PG_URL || toolEnv.ACTORES_PG_URL || '',
    ssl: String(process.env.ACTORES_PG_SSL ?? toolEnv.ACTORES_PG_SSL ?? 'true').toLowerCase() !== 'false',
    rejectUnauthorized: String(process.env.ACTORES_PG_SSL_REJECT_UNAUTHORIZED ?? toolEnv.ACTORES_PG_SSL_REJECT_UNAUTHORIZED ?? 'false').toLowerCase() === 'true'
  };
}

function directoryIsFresh() {
  const info = enlaces.directoryInfo();
  if (!Number(info?.total)) return false;
  const date = new Date(String(info.sincronizado_en || '').replace(' ', 'T'));
  return Number.isFinite(date.getTime()) && Date.now() - date.getTime() < DIRECTORY_MAX_AGE_MS;
}

async function synchronizeDirectory() {
  if (directoryIsFresh()) return enlaces.listDirectory();
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    const config = pgConfiguration();
    if (!config.connectionString) return enlaces.listDirectory();
    const client = new Client({
      connectionString: config.connectionString,
      connectionTimeoutMillis: 20000,
      application_name: 'fichas-identidad-solo-lectura',
      ssl: config.ssl ? { rejectUnauthorized: config.rejectUnauthorized } : false
    });
    await client.connect();
    try {
      await client.query('BEGIN READ ONLY');
      const { rows } = await client.query(`
        SELECT id_persona,nombre,apellido_paterno,apellido_materno,updated_at
        FROM public.personas
        WHERE COALESCE(oculto,false)=false
        ORDER BY id_persona
      `);
      await client.query('ROLLBACK');
      const people = rows.map(person => {
        const fullName = nombreCompleto(person);
        return { ...person, nombre_completo: fullName, nombre_normalizado: normalizarNombre(fullName) };
      }).filter(person => person.nombre_normalizado);
      enlaces.replaceDirectory(people);
      return enlaces.listDirectory();
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      throw error;
    } finally {
      await client.end().catch(() => {});
    }
  })().finally(() => { syncPromise = null; });
  return syncPromise;
}

function relevantPeople(ficha) {
  const people = [ficha?.presidencia, ...(ficha?.aspirantes || [])]
    .filter(person => person?.persona_id && (person.nombre_completo || nombreCompleto(person)))
    .map(person => ({ localId: person.persona_id, localName: person.nombre_completo || nombreCompleto(person) }));
  return [...people.reduce((map, person) => map.set(person.localId, person), new Map()).values()];
}

function buildDirectoryIndex(directory) {
  const bySignature = new Map();
  const byToken = new Map();
  directory.forEach(person => {
    const profile = perfilNombre(person.nombre_completo);
    const indexed = { ...person, _nameProfile: profile };
    if (!bySignature.has(profile.firma)) bySignature.set(profile.firma, []);
    bySignature.get(profile.firma).push(indexed);
    new Set(profile.tokens).forEach(token => {
      if (!byToken.has(token)) byToken.set(token, []);
      byToken.get(token).push(indexed);
    });
  });
  return { directory, bySignature, byToken };
}

function evaluate(local, directoryOrIndex) {
  const index = Array.isArray(directoryOrIndex) ? buildDirectoryIndex(directoryOrIndex) : directoryOrIndex;
  const localProfile = perfilNombre(local.localName);
  const signatureMatches = index.bySignature.get(localProfile.firma) || [];
  const candidateMap = new Map(signatureMatches.map(person => [person.id_persona, person]));
  if (!candidateMap.size) {
    localProfile.tokens
      .map(token => index.byToken.get(token) || [])
      .filter(bucket => bucket.length)
      .sort((a, b) => a.length - b.length)
      .slice(0, 2)
      .forEach(bucket => bucket.forEach(person => candidateMap.set(person.id_persona, person)));
  }
  const ranked = [...candidateMap.values()].map(person => ({
    id_persona: Number(person.id_persona),
    nombre_completo: person.nombre_completo,
    score: similitudNombre(local.localName, person.nombre_completo)
  })).filter(item => item.score >= 0.62).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const second = ranked[1];
  if (!best) return { status: 'NO_ENCONTRADA', detail: 'Sin coincidencias suficientes en el directorio.' };
  const exactMatches = ranked.filter(item => normalizarNombre(item.nombre_completo) === normalizarNombre(local.localName));
  if (exactMatches.length > 1) return { status: 'REVISAR', externalId: best.id_persona, externalName: best.nombre_completo, score: 100, detail: 'Hay más de un expediente con el mismo nombre.' };
  const score = Number((best.score * 100).toFixed(1));
  const gap = score - Number(((second?.score || 0) * 100).toFixed(1));
  if (exactMatches.length === 1 || (score >= 93 && gap >= 4)) {
    return { status: 'DISPONIBLE', externalId: best.id_persona, externalName: best.nombre_completo, score, detail: 'Coincidencia automática pendiente de confirmación al abrir.' };
  }
  return { status: 'REVISAR', externalId: best.id_persona, externalName: best.nombre_completo, score, detail: 'La coincidencia requiere selección humana.' };
}

async function verifyPeople(inputPeople) {
  const people = [...(inputPeople || []).reduce((map, person) => {
    if (person?.localId && person?.localName) map.set(person.localId, person);
    return map;
  }, new Map()).values()];
  if (!people.length) return [];
  people.forEach(local => {
    const confirmed = enlaces.find(local.localId);
    const previous = enlaces.getStatuses([local.localId])[0];
    if (confirmed && previous?.nombre_local && normalizarNombre(previous.nombre_local) !== normalizarNombre(local.localName)) enlaces.remove(local.localId);
    if (!enlaces.find(local.localId)) enlaces.saveVerification({ localId: local.localId, localName: local.localName, status: 'PENDIENTE', detail: 'Verificación automática en proceso.' });
  });
  let directory = enlaces.listDirectory();
  if (directory.length) {
    synchronizeDirectory().catch(error => {
      console.error('No se pudo actualizar el directorio mínimo de Actores; se usará la copia local:', error.message);
    });
  } else {
    try { directory = await synchronizeDirectory(); }
    catch (error) {
      console.error('No se pudo sincronizar el directorio mínimo de Actores:', error.message);
    }
  }
  const directoryIndex = buildDirectoryIndex(directory);
  for (const local of people) {
    if (enlaces.find(local.localId)) continue;
    if (!directory.length) {
      enlaces.saveVerification({ localId: local.localId, localName: local.localName, status: 'PENDIENTE', detail: 'Directorio externo todavía no disponible.' });
      continue;
    }
    const result = evaluate(local, directoryIndex);
    enlaces.saveVerification({
      localId: local.localId, localName: local.localName, status: result.status,
      externalId: result.externalId, externalName: result.externalName,
      score: result.score, detail: result.detail
    });
  }
  return enlaces.getStatuses(people.map(person => person.localId));
}

async function verifyFicha(ficha) {
  return verifyPeople(relevantPeople(ficha));
}

module.exports = { verifyFicha, verifyPeople, synchronizeDirectory, relevantPeople, buildDirectoryIndex, evaluate };
