const router = require('express').Router();
const controller = require('../controllers/directorio-diputaciones.controller');

router.get('/',controller.list);
router.post('/',controller.create);
router.put('/:id',controller.update);
router.delete('/:id',controller.remove);

module.exports = router;
