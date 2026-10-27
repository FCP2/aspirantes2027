'use strict';

const { Readable } = require('node:stream');
const actores = require('../../tools/integracion-actores');
const municipalDb = require('../config/database');

function credentials(req) {
  return {
    email: String(req.body?.email || '').trim(),
    password: String(req.body?.password || ''),
    turnstileToken: String(req.body?.turnstileToken || '').trim()
  };
}

function token(req) {
  if (!req.session?.actoresToken) {
    const error = new Error('Inicia sesión en el Sistema de Actores para continuar.');
    error.status = 401;
    error.code = 'ACTORES_LOGIN_REQUIRED';
    throw error;
  }
  return req.session.actoresToken;
}

function handle(error, req, res, next) {
  if (error.code === 'AUTH_EXPIRED' && req.session) {
    delete req.session.actoresToken;
    delete req.session.actoresUser;
  }
  if (error.status) return res.status(error.status).json({ ok: false, code: error.code, message: error.message });
  return next(error);
}

exports.session = async (req, res, next) => {
  if (!req.session?.actoresToken) return res.json({ ok: true, authenticated: false });
  try {
    const response = await actores.me(req.session.actoresToken);
    const user = response?.user || response;
    req.session.actoresUser = user;
    return res.json({ ok: true, authenticated: true, user });
  } catch (error) {
    if (error.code === 'AUTH_EXPIRED') {
      delete req.session.actoresToken;
      delete req.session.actoresUser;
      return res.json({ ok: true, authenticated: false, expired: true });
    }
    return handle(error, req, res, next);
  }
};

exports.login = async (req, res, next) => {
  const { email, password, turnstileToken } = credentials(req);
  if (!email || !password) return res.status(400).json({ ok: false, message: 'Captura correo y contraseña.' });
  if (!turnstileToken) return res.status(400).json({ ok: false, code: 'TURNSTILE_REQUIRED', message: 'Completa la verificación de seguridad.' });
  try {
    const result = await actores.login(email, password, turnstileToken);
    req.session.actoresToken = result.token;
    req.session.actoresUser = result.user;
    req.session.save(error => {
      if (error) return next(error);
      return res.json({ ok: true, user: result.user });
    });
  } catch (error) { return handle(error, req, res, next); }
};

exports.logout = (req, res, next) => {
  delete req.session.actoresToken;
  delete req.session.actoresUser;
  req.session.save(error => error ? next(error) : res.json({ ok: true }));
};

exports.search = async (req, res, next) => {
  const localId = String(req.query.persona_local_id || '').trim();
  const name = String(req.query.nombre || '').trim();
  if (!localId || !name || localId.length > 100 || name.length > 250) {
    return res.status(400).json({ ok: false, message: 'La persona local no es válida.' });
  }
  try {
    const result = await actores.findCandidates(token(req), localId, name, req.query.ignorar_enlace === '1');
    return res.json({ ok: true, ...result });
  } catch (error) { return handle(error, req, res, next); }
};

exports.link = (req, res, next) => {
  try {
    token(req);
    const localId = String(req.body?.persona_local_id || '').trim();
    const localName = String(req.body?.nombre_local || '').trim();
    const externalId = Number(req.body?.persona_externa_id);
    const externalName = String(req.body?.nombre_externo || '').trim();
    if (!localId || localId.length > 100 || !localName || localName.length > 250 || !Number.isSafeInteger(externalId) || externalId <= 0 || !externalName || externalName.length > 250) {
      return res.status(400).json({ ok: false, message: 'El enlace seleccionado no es válido.' });
    }
    const confirmedBy = req.session.actoresUser?.email || req.session.actoresUser?.id_usuario || null;
    const link = actores.enlaces.save({ localId, localName, externalId, externalName, confirmedBy: String(confirmedBy || '') });
    return res.json({ ok: true, enlace: link });
  } catch (error) { return handle(error, req, res, next); }
};

exports.unlink = (req, res, next) => {
  try {
    token(req);
    actores.enlaces.remove(String(req.params.localId || ''));
    return res.json({ ok: true });
  } catch (error) { return handle(error, req, res, next); }
};

exports.statuses = (req, res) => {
  const ids = String(req.query.ids || '').split(',').map(value => value.trim()).filter(Boolean);
  if (ids.length > 200 || ids.some(id => id.length > 100)) {
    return res.status(400).json({ ok: false, message: 'La consulta de personas no es válida.' });
  }
  const statuses = actores.enlaces.getStatuses(ids);
  const knownIds = new Set(statuses.map(status => status.persona_local_id));
  const missingIds = ids.filter(id => !knownIds.has(id));
  if (missingIds.length) {
    const placeholders = missingIds.map(() => '?').join(',');
    const people = municipalDb.prepare(`
      SELECT DISTINCT p.id localId,
             TRIM(p.nombre || ' ' || COALESCE(p.apellido_paterno || ' ', '') || COALESCE(p.apellido_materno, '')) localName
      FROM personas p
      JOIN actores_municipio a ON a.persona_id=p.id
      WHERE p.id IN (${placeholders}) AND p.activo=1 AND a.activo=1
        AND a.tipo_actor IN ('PRESIDENCIA_MUNICIPAL','ASPIRANTE_2027','LIDER')
      UNION
      SELECT DISTINCT p.id localId,
             TRIM(p.nombre || ' ' || COALESCE(p.apellido_paterno || ' ', '') || COALESCE(p.apellido_materno, '')) localName
      FROM personas p
      JOIN personal_territorio t ON t.persona_id=p.id
      WHERE p.id IN (${placeholders}) AND p.activo=1 AND t.activo=1
    `).all(...missingIds, ...missingIds);
    if (people.length) setImmediate(() => actores.verificador.verifyPeople(people).catch(error => {
      console.error('No se pudo completar una verificación de identidad pendiente:', error.message);
    }));
  }
  return res.json({ ok: true, data: statuses });
};

exports.profile = async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ ok: false, message: 'Identificador inválido.' });
  try { return res.json(await actores.profile(token(req), id)); }
  catch (error) { return handle(error, req, res, next); }
};

exports.pdf = async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ ok: false, message: 'Identificador inválido.' });
  try {
    const response = await actores.pdf(token(req), id);
    if (!response.ok) {
      const body = await response.text();
      let message = 'No se pudo abrir el expediente.';
      try { message = JSON.parse(body)?.error || message; } catch {}
      if (response.status === 401) {
        delete req.session.actoresToken;
        delete req.session.actoresUser;
      }
      return res.status(response.status).json({ ok: false, message });
    }
    res.status(200);
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="expediente-actor.pdf"');
    res.setHeader('Cache-Control', 'private, no-store');
    if (!response.body) return res.end();
    return Readable.fromWeb(response.body).pipe(res);
  } catch (error) { return handle(error, req, res, next); }
};
