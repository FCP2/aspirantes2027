const service = require('../services/directorio-diputaciones.service');

exports.list = (req,res,next) => {
  try { res.json({ok:true,data:service.list(req.query.tipo)}); }
  catch (error) { next(error); }
};

exports.create = (req,res,next) => {
  try { res.status(201).json({ok:true,data:service.create(req.body)}); }
  catch (error) { next(error); }
};

exports.update = (req,res,next) => {
  try { res.json({ok:true,data:service.update(req.params.id,req.body)}); }
  catch (error) { next(error); }
};

exports.remove = (req,res,next) => {
  try { res.json({ok:true,data:service.remove(req.params.id)}); }
  catch (error) { next(error); }
};
