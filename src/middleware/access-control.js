'use strict';

const crypto = require('node:crypto');

const enabled = () => process.env.RENDER === 'true'
  || String(process.env.ACCESS_CONTROL_ENABLED || '').toLowerCase() === 'true';
const tokenFor = () => String(process.env.EDITOR_ACCESS_TOKEN || '').trim();

function same(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

function roleForToken(token) {
  if (same(token, tokenFor())) return 'editor';
  return null;
}

function tokenVersion() {
  const token = tokenFor();
  if (!token) return null;
  return crypto.createHmac(
    'sha256',
    String(process.env.SESSION_SECRET || 'local-dev-session')
  ).update(token).digest('hex');
}

function clearSession(req) {
  if (!req.session) return;
  delete req.session.accessRole;
  delete req.session.accessTokenVersion;
  delete req.session.accessExpiresAt;
}

function setSession(req, role) {
  req.session.accessRole = role;
  req.session.accessTokenVersion = tokenVersion();
  delete req.session.accessExpiresAt;
}

function currentRole(req) {
  if (!req.session?.accessRole) return null;
  if (req.session.accessRole === 'editor'
    && same(req.session.accessTokenVersion, tokenVersion())) return 'editor';
  clearSession(req);
  return null;
}

function login(req, res) {
  if (!enabled()) return res.json({ ok: true, role: 'editor', expiresAt: null });
  const role = roleForToken(req.body?.token);
  if (!role) return res.status(401).json({ ok: false, message: 'Token inválido.' });
  setSession(req, role);
  req.session.save(error => error
    ? res.status(500).json({ ok: false, message: 'No se pudo iniciar la sesión.' })
    : res.json({ ok: true, role, expiresAt: null }));
}

function session(req, res) {
  const role = enabled() ? currentRole(req) : 'editor';
  return res.json({ ok: true, authenticated: Boolean(role), role, expiresAt: null });
}

function logout(req, res) {
  clearSession(req);
  req.session.save(error => error ? res.status(500).json({ ok: false }) : res.json({ ok: true }));
}

function requireRole(role) {
  return (req, res, next) => {
    if (!enabled()) return next();
    const current = currentRole(req);
    // Los endpoints de consulta permanecen públicos; solo las operaciones de
    // edición exigen una sesión con token de editor.
    if (role === 'report') return next();
    if (current === 'editor' || (role === 'report' && current === 'report')) return next();
    return res.status(401).json({ ok: false, code: 'ACCESS_LOGIN_REQUIRED', message: 'Inicia sesión con un token de acceso para continuar.' });
  };
}

function viewRole(role) {
  return (req, res, next) => {
    if (!enabled()) return next();
    if (role === 'report') return next();
    const fromUrl = String(req.query.token || '').trim();
    const urlRole = roleForToken(fromUrl);
    if (urlRole) {
      setSession(req, urlRole);
      delete req.query.token;
      return req.session.save(error => {
        if (error) return next(error);
        return res.redirect(303, req.path);
      });
    }
    const current = currentRole(req);
    if (current === 'editor' || (role === 'report' && current === 'report')) return next();
    if (role === 'editor') return res.redirect(303, '/reportes/mapa?captura=token');
    return res.status(401).send('Acceso restringido. Usa el enlace con token autorizado.');
  };
}

module.exports = { enabled, login, session, logout, requireRole, viewRole, roleForToken };
