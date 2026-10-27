const service = require('../services/pdf.service');

exports.generate = async (req,res,next) => {
  try {
    const officeId = process.env.OFFICE_ID || 'COORD-01';
    const file = await service.generate({municipioId:req.params.municipioId,officeId});
    res.download(file);
  } catch(e){ next(e); }
};

exports.preview = async (req,res,next) => {
  try {
    const officeId = process.env.OFFICE_ID || 'COORD-01';
    const html = await service.renderPreview({municipioId:req.params.municipioId,officeId});
    res.type('html').send(html);
  } catch(e){ next(e); }
};

exports.previewDraft = async (req,res,next) => {
  try {
    const officeId = process.env.OFFICE_ID || 'COORD-01';
    const html = await service.renderDraftPreview({municipioId:req.params.municipioId,officeId,payload:req.body || {}});
    res.type('html').send(html);
  } catch(e){ next(e); }
};

exports.generateGeneral = async (req,res,next) => {
  try {
    const officeId = process.env.OFFICE_ID || 'COORD-01';
    const municipioIds = Array.isArray(req.body?.municipioIds) ? [...new Set(req.body.municipioIds.map(String))].slice(0,125) : [];
    const file = await service.generateGeneral({municipioIds,officeId});
    res.download(file);
  } catch(e){ next(e); }
};
