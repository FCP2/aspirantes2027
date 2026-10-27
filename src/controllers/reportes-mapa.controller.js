'use strict';

const service = require('../services/reportes-mapa.service');
const referencePdfService = require('../services/reference-map-pdf.service');
const partyPdfService = require('../services/party-map-pdf.service');
const aspirantPdfService = require('../services/aspirant-map-pdf.service');

exports.list = (req, res, next) => {
  try {
    const officeId = process.env.OFFICE_ID || 'COORD-01';
    res.json({ ok: true, data: service.list(officeId) });
  } catch (error) {
    next(error);
  }
};

exports.ficha = (req, res, next) => {
  try {
    const officeId = process.env.OFFICE_ID || 'COORD-01';
    res.json({ ok: true, data: service.getFicha(req.params.municipioId, officeId) });
  } catch (error) {
    next(error);
  }
};

exports.references = (req, res, next) => {
  try {
    const officeId = process.env.OFFICE_ID || 'COORD-01';
    res.json({ ok: true, data: service.listReferences(officeId) });
  } catch (error) {
    next(error);
  }
};

exports.parties = (req, res, next) => {
  try {
    const officeId = process.env.OFFICE_ID || 'COORD-01';
    res.json({ ok:true, data:service.listParties(officeId) });
  } catch (error) {
    next(error);
  }
};

exports.history = (req, res, next) => {
  try {
    const officeId = process.env.OFFICE_ID || 'COORD-01';
    res.json({ ok: true, data: service.history(officeId) });
  } catch (error) {
    next(error);
  }
};

exports.reference = (req, res, next) => {
  try {
    const officeId = process.env.OFFICE_ID || 'COORD-01';
    res.json({ ok: true, data: service.getReference(officeId, String(req.query.key || '')) });
  } catch (error) {
    next(error);
  }
};

exports.referencePreview = async (req, res, next) => {
  try {
    const officeId = process.env.OFFICE_ID || 'COORD-01';
    const html = await referencePdfService.renderPreview({ officeId, key:String(req.query.key || '') });
    res.type('html').send(html);
  } catch (error) {
    next(error);
  }
};

exports.referencePdf = async (req, res, next) => {
  try {
    const officeId = process.env.OFFICE_ID || 'COORD-01';
    const file = await referencePdfService.generate({ officeId, key:String(req.query.key || '') });
    res.download(file);
  } catch (error) {
    next(error);
  }
};

exports.partyPreview = async (req,res,next) => {
  try { const officeId=process.env.OFFICE_ID||'COORD-01';res.type('html').send(await partyPdfService.renderPreview({officeId,key:String(req.query.key||'')})); }
  catch(error){next(error)}
};
exports.partyPdf = async (req,res,next) => {
  try { const officeId=process.env.OFFICE_ID||'COORD-01';res.download(await partyPdfService.generate({officeId,key:String(req.query.key||'')})); }
  catch(error){next(error)}
};
exports.partyGeneralPreview = async (req,res,next) => {
  try { const officeId=process.env.OFFICE_ID||'COORD-01';res.type('html').send(await partyPdfService.renderGeneralPreview({officeId})); }
  catch(error){next(error)}
};
exports.partyGeneralPdf = async (req,res,next) => {
  try { const officeId=process.env.OFFICE_ID||'COORD-01';res.download(await partyPdfService.generateGeneral({officeId})); }
  catch(error){next(error)}
};

exports.aspirants = (req, res, next) => {
  try {
    const officeId = process.env.OFFICE_ID || 'COORD-01';
    res.json({ ok: true, data: service.listAspirants(officeId) });
  } catch (error) {
    next(error);
  }
};

exports.aspirantPreview = async (req, res, next) => {
  try {
    const officeId = process.env.OFFICE_ID || 'COORD-01';
    const html = await aspirantPdfService.renderPreview({
      officeId,
      municipalityId: String(req.query.municipioId || ''),
      scope: String(req.query.scope || 'ambos')
    });
    res.type('html').send(html);
  } catch (error) {
    next(error);
  }
};

exports.aspirantPdf = async (req, res, next) => {
  try {
    const officeId = process.env.OFFICE_ID || 'COORD-01';
    const file = await aspirantPdfService.generate({
      officeId,
      municipalityId: String(req.query.municipioId || ''),
      scope: String(req.query.scope || 'ambos')
    });
    res.download(file);
  } catch (error) {
    next(error);
  }
};

exports.aspirantGeneralPreview = async (req, res, next) => {
  try {
    const officeId = process.env.OFFICE_ID || 'COORD-01';
    const html = await aspirantPdfService.renderGeneralPreview({
      officeId,
      scope: String(req.query.scope || 'ambos')
    });
    res.type('html').send(html);
  } catch (error) {
    next(error);
  }
};

exports.aspirantGeneralPdf = async (req, res, next) => {
  try {
    const officeId = process.env.OFFICE_ID || 'COORD-01';
    const file = await aspirantPdfService.generateGeneral({
      officeId,
      scope: String(req.query.scope || 'ambos')
    });
    res.download(file);
  } catch (error) {
    next(error);
  }
};

exports.subreferenceAspirantsPreview = async (req, res, next) => {
  try {
    const subreference = String(req.query.subreferente || '').trim();
    if (!subreference) {
      return res.status(400).json({ ok: false, message: 'SELECCIONA UN SUBREFERENTE' });
    }

    const officeId = process.env.OFFICE_ID || 'COORD-01';
    const html = await aspirantPdfService.renderSubreferenceGeneralPreview({
      officeId,
      subreference
    });
    res.type('html').send(html);
  } catch (error) {
    next(error);
  }
};

exports.subreferenceAspirantsPdf = async (req, res, next) => {
  try {
    const subreference = String(req.query.subreferente || '').trim();
    if (!subreference) {
      return res.status(400).json({ ok: false, message: 'SELECCIONA UN SUBREFERENTE' });
    }

    const officeId = process.env.OFFICE_ID || 'COORD-01';
    const file = await aspirantPdfService.generateSubreferenceGeneral({
      officeId,
      subreference
    });
    res.download(file);
  } catch (error) {
    next(error);
  }
};
