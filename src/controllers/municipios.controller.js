const service = require('../services/municipios.service');

exports.list = (req, res, next) => {
  try {
    const officeId = process.env.OFFICE_ID || 'COORD-01';
    res.json({ ok: true, data: service.listByOffice(officeId) });
  } catch (error) {
    next(error);
  }
};

exports.getById = (req, res, next) => {
  try {
    const officeId = process.env.OFFICE_ID || 'COORD-01';
    const item = service.getAllowedMunicipio(req.params.id, officeId);
    res.json({ ok: true, data: item });
  } catch (error) {
    next(error);
  }
};
