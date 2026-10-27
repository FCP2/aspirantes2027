'use strict';

const enlaces = require('./enlaces.repository');
const { nombreCompleto, normalizarNombre, similitudNombre, terminosBusqueda } = require('./nombres');

const DEFAULT_BASE_URL = 'https://actores-edomex.onrender.com';
const REQUEST_TIMEOUT_MS = 60000;

function baseUrl() {
  const configured = String(process.env.ACTORES_API_URL || DEFAULT_BASE_URL).trim().replace(/\/$/, '');
  const parsed = new URL(configured);
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('ACTORES_API_URL no es válida.');
  return parsed.toString().replace(/\/$/, '');
}

class ExternalApiError extends Error {
  constructor(message, status = 502, code = 'EXTERNAL_API_ERROR') {
    super(message);
    this.name = 'ExternalApiError';
    this.status = status;
    this.code = code;
  }
}

async function externalFetch(pathname, { token, method = 'GET', body, timeout = REQUEST_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  try {
    const response = await fetch(`${baseUrl()}/api${pathname}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
    return response;
  } catch (error) {
    if (error.name === 'AbortError') throw new ExternalApiError('El Sistema de Actores tardó demasiado en responder.', 504, 'TIMEOUT');
    console.error('[integracion-actores] Falló la conexión externa', {
      method,
      pathname,
      error: error.name,
      cause: error.cause?.code || error.code || 'UNKNOWN',
      detail: error.cause?.message || error.message
    });
    throw new ExternalApiError('No fue posible conectar con el Sistema de Actores.', 502, 'CONNECTION_ERROR');
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(response) {
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) {
    const message = response.status === 401
      ? 'La sesión del Sistema de Actores expiró.'
      : response.status === 403
        ? 'Tu usuario no tiene permiso para consultar este expediente.'
        : (data?.error || data?.message || 'El Sistema de Actores no pudo completar la consulta.');
    throw new ExternalApiError(message, response.status, response.status === 401 ? 'AUTH_EXPIRED' : 'EXTERNAL_REJECTED');
  }
  return data;
}

async function login(email, password, turnstileToken) {
  const response = await externalFetch('/auth/login', { method: 'POST', body: { email, password, turnstileToken } });
  if (!response.ok) {
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    throw new ExternalApiError(
      data?.error || data?.message || (response.status === 401 ? 'Correo o contraseña incorrectos.' : 'No se pudo iniciar sesión en el Sistema de Actores.'),
      response.status,
      data?.code || 'LOGIN_REJECTED'
    );
  }
  const data = await readJson(response);
  if (!data?.token) throw new ExternalApiError('El Sistema de Actores no devolvió una sesión válida.', 502);
  return { token: data.token, user: data.user || null };
}

async function me(token) {
  return readJson(await externalFetch('/auth/me', { token }));
}

async function searchRemote(token, name) {
  const terms = terminosBusqueda(name);
  if (!terms.length) return [];
  const responses = await Promise.all(terms.map(term => externalFetch(
    `/personas?search=${encodeURIComponent(term)}&limit=100`, { token }
  )));
  const resultSets = await Promise.all(responses.map(readJson));
  const unique = new Map();
  resultSets.flat().forEach(person => {
    if (person?.id_persona != null) unique.set(Number(person.id_persona), person);
  });
  return [...unique.values()];
}

function rankCandidates(name, people) {
  return people
    .map(person => {
      const fullName = nombreCompleto(person);
      return {
        id_persona: Number(person.id_persona),
        nombre_completo: fullName,
        escala_influencia: person.escala_influencia || null,
        puntuacion: Number((similitudNombre(name, fullName) * 100).toFixed(1)),
        exacta: normalizarNombre(name) === normalizarNombre(fullName)
      };
    })
    .filter(person => person.nombre_completo && person.puntuacion >= 62)
    .sort((a, b) => b.puntuacion - a.puntuacion || a.nombre_completo.localeCompare(b.nombre_completo, 'es'))
    .slice(0, 8);
}

async function findCandidates(token, localId, name, ignoreLink = false) {
  if (!ignoreLink) {
    const linked = enlaces.find(localId);
    if (linked) {
      return {
        estado: 'ENLAZADA',
        candidatos: [{
          id_persona: linked.persona_externa_id,
          nombre_completo: linked.nombre_externo,
          puntuacion: 100,
          enlace_confirmado: true
        }]
      };
    }
  }
  const candidates = rankCandidates(name, await searchRemote(token, name));
  if (!candidates.length) return { estado: 'NO_ENCONTRADA', candidatos: [] };
  const first = candidates[0];
  const second = candidates[1];
  const unambiguous = first.exacta || (first.puntuacion >= 93 && first.puntuacion - (second?.puntuacion || 0) >= 4);
  return { estado: unambiguous ? 'COINCIDENCIA' : 'REQUIERE_SELECCION', candidatos: candidates };
}

async function profile(token, id) {
  return readJson(await externalFetch(`/personas/${id}/perfil`, { token }));
}

async function pdf(token, id) {
  return externalFetch(`/personas/${id}/pdf`, { token, timeout: 120000 });
}

module.exports = { ExternalApiError, login, me, findCandidates, profile, pdf, enlaces };
