const router=require('express').Router();
const controller=require('../controllers/pdf.controller');
router.post('/general',controller.generateGeneral);
router.post('/preview/:municipioId',controller.previewDraft);
router.get('/preview/:municipioId',controller.preview);
router.get('/:municipioId',controller.generate);
module.exports=router;
