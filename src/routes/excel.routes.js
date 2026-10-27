const router = require('express').Router();
const controller = require('../controllers/excel.controller');

router.post('/general',controller.generateGeneral);
router.get('/:municipioId',controller.generate);

module.exports = router;
