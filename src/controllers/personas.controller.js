const service = require('../services/personas.service');

exports.search = (req, res, next) => {
  try {
    res.json({ ok: true, data: service.search(req.query.q || '') });
  } catch (error) {
    next(error);
  }
};

exports.searchReferentes = (req, res, next) => {
  try {
    res.json({ ok: true, data: service.searchReferentes(req.query.q || '') });
  } catch (error) {
    next(error);
  }
};

exports.update = (req, res, next) => {
  try {
    res.json({ ok: true, data: service.update(req.params.id, req.body) });
  } catch (error) {
    next(error);
  }
};
