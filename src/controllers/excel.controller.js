const service = require('../services/excel.service');

exports.generate = async (req,res,next) => {
  try {
    const officeId = process.env.OFFICE_ID || 'COORD-01';
    const {ficha,buffer} = await service.generate({municipioId:req.params.municipioId,officeId});
    const safeName = String(ficha.municipio.nombre || 'FICHA_MUNICIPAL').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9_-]+/gi,'_');
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',`attachment; filename="${safeName}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch(e){ next(e); }
};

exports.generateGeneral = async (req,res,next) => {
  try {
    const officeId = process.env.OFFICE_ID || 'COORD-01';
    const municipioIds = Array.isArray(req.body?.municipioIds) ? [...new Set(req.body.municipioIds.map(String))].slice(0,125) : [];
    const includePhotos = req.body?.includePhotos === true || req.body?.includePhotos === 'true';
    const {buffer} = await service.generateGeneral({municipioIds,officeId,includePhotos});
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition','attachment; filename="REPORTE_GENERAL_FICHAS_MUNICIPALES.xlsx"');
    res.send(Buffer.from(buffer));
  } catch(e){ next(e); }
};
