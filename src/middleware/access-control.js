'use strict';

const crypto = require('node:crypto');

const enabled = () => process.env.RENDER === 'true'
  || String(process.env.ACCESS_CONTROL_ENABLED || '').toLowerCase() === 'true';

const editorToken = () => String(process.env.EDITOR_ACCESS_TOKEN || '').trim();
const reportToken = () => String(process.env.REPORT_VIEW_TOKEN || '').trim();

function same(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));

  return left.length === right.length
    && left.length > 0
    && crypto.timingSafeEqual(left, right);
}

function roleForToken(token) {
  if (same(token, editorToken())) return 'editor';
  if (same(token, reportToken())) return 'report';
  return null;
}

function tokenForRole(role) {
  if (role === 'editor') return editorToken();
  if (role === 'report') return reportToken();
  return '';
}

function tokenVersion(role) {
  const token = tokenForRole(role);
  if (!token) return null;

  return crypto
    .createHmac(
      'sha256',
      String(process.env.SESSION_SECRET || 'local-dev-session')
    )
    .update(`${role}:${token}`)
    .digest('hex');
}

function clearSession(req) {
  if (!req.session) return;

  delete req.session.accessRole;
  delete req.session.accessTokenVersion;
  delete req.session.accessExpiresAt;
}

function setSession(req, role) {
  req.session.accessRole = role;
  req.session.accessTokenVersion = tokenVersion(role);
  delete req.session.accessExpiresAt;
}

function currentRole(req) {
  const role = req.session?.accessRole;
  if (!role || !['editor', 'report'].includes(role)) return null;

  if (same(req.session.accessTokenVersion, tokenVersion(role))) return role;

  clearSession(req);
  return null;
}

function roleCanAccess(current, required) {
  if (current === 'editor') return true;
  return required === 'report' && current === 'report';
}

function login(req, res) {
  if (!enabled()) {
    return res.json({ ok: true, role: 'editor', expiresAt: null });
  }

  const role = roleForToken(req.body?.token);
  if (!role) {
    return res.status(401).json({
      ok: false,
      message: 'Token inválido.'
    });
  }

  setSession(req, role);

  return req.session.save(error => {
    if (error) {
      return res.status(500).json({
        ok: false,
        message: 'No se pudo iniciar la sesión.'
      });
    }

    return res.json({ ok: true, role, expiresAt: null });
  });
}

function session(req, res) {
  const role = enabled() ? currentRole(req) : 'editor';

  return res.json({
    ok: true,
    authenticated: Boolean(role),
    role,
    expiresAt: null
  });
}

function logout(req, res) {
  clearSession(req);
  req.session.save(error => error
    ? res.status(500).json({ ok: false })
    : res.json({ ok: true }));
}

function requireRole(role) {
  return (req, res, next) => {
    if (!enabled()) return next();

    const current = currentRole(req);
    if (roleCanAccess(current, role)) return next();

    return res.status(401).json({
      ok: false,
      code: 'ACCESS_LOGIN_REQUIRED',
      message: 'Inicia sesión con un token de acceso para continuar.'
    });
  };
}

function viewRole(role) {
  return (req, res, next) => {
    if (!enabled()) return next();

    const fromUrl = String(req.query.token || '').trim();
    const urlRole = roleForToken(fromUrl);

    if (urlRole && roleCanAccess(urlRole, role)) {
      setSession(req, urlRole);
      delete req.query.token;

      return req.session.save(error => {
        if (error) return next(error);
        return res.redirect(303, req.path);
      });
    }

    const current = currentRole(req);
    if (roleCanAccess(current, role)) return next();

    if (role === 'editor') {
      return res.redirect(303, '/reportes/acceso?destino=captura');
    }

    return res.redirect(303, '/reportes/acceso');
  };
}

module.exports = {
  enabled,
  login,
  session,
  logout,
  requireRole,
  viewRole,
  roleForToken
};
