'use strict';

const router = require('express').Router();
const controller = require('../controllers/reportes-mapa.controller');

router.get('/', controller.list);
router.get('/referentes', controller.references);
router.get('/partidos', controller.parties);
router.get('/historial', controller.history);
router.get('/partidos/general/vista-previa', controller.partyGeneralPreview);
router.get('/partidos/general/pdf', controller.partyGeneralPdf);
router.get('/partidos/vista-previa', controller.partyPreview);
router.get('/partidos/pdf', controller.partyPdf);
router.get('/aspirantes', controller.aspirants);
router.get('/aspirantes/general/vista-previa', controller.aspirantGeneralPreview);
router.get('/aspirantes/general/pdf', controller.aspirantGeneralPdf);
router.get('/aspirantes/subreferente/vista-previa', controller.subreferenceAspirantsPreview);
router.get('/aspirantes/subreferente/pdf', controller.subreferenceAspirantsPdf);
router.get('/aspirantes/vista-previa', controller.aspirantPreview);
router.get('/aspirantes/pdf', controller.aspirantPdf);
router.get('/referentes/detalle', controller.reference);
router.get('/referentes/vista-previa', controller.referencePreview);
router.get('/referentes/pdf', controller.referencePdf);
router.get('/:municipioId/ficha', controller.ficha);

module.exports = router;
