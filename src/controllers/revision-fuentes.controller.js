'use strict';

const revision = require('../../tools/revision-fuentes');

exports.data = (req, res, next) => {
  try {
    res.json(revision.analizar(req.query.source));
  } catch (error) {
    next(error);
  }
};

exports.upload = (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, message: 'SELECCIONA UN ARCHIVO HTML.' });
    return res.status(201).json({ ok: true, archivo: req.file.filename });
  } catch (error) {
    return next(error);
  }
};
