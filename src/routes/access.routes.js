const router = require('express').Router();
const controller = require('../middleware/access-control');

router.post('/login', controller.login);
router.get('/session', controller.session);
router.delete('/session', controller.logout);

module.exports = router;
