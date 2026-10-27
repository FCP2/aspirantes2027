const router = require('express').Router();
const controller = require('../controllers/personas.controller');

router.get('/search', controller.search);
router.get('/referentes', controller.searchReferentes);
router.put('/:id', controller.update);

module.exports = router;
