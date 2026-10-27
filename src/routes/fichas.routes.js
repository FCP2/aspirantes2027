const router=require('express').Router();
const controller=require('../controllers/fichas.controller');
router.get('/:municipioId',controller.get);
router.put('/:municipioId',controller.saveFull);
module.exports=router;
