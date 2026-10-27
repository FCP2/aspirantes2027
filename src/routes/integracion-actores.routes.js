'use strict';

const router = require('express').Router();
const controller = require('../controllers/integracion-actores.controller');

router.get('/session', controller.session);
router.post('/login', controller.login);
router.delete('/session', controller.logout);
router.get('/buscar', controller.search);
router.get('/estados', controller.statuses);
router.post('/enlaces', controller.link);
router.delete('/enlaces/:localId', controller.unlink);
router.get('/perfil/:id', controller.profile);
router.get('/pdf/:id', controller.pdf);

module.exports = router;
