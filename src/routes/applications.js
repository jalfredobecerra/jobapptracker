const router = require('express').Router();
const controller = require('../controllers/applications');
const { applicationBody, validateBody, validateId, validateEmptyQuery } = require('../validation');

router.get('/', validateEmptyQuery, controller.list);
router.get('/:id', validateId, validateEmptyQuery, controller.get);
router.post('/', validateEmptyQuery, validateBody(applicationBody), controller.create);
router.put('/:id', validateId, validateEmptyQuery, validateBody(applicationBody), controller.replace);
router.delete('/:id', validateId, validateEmptyQuery, controller.remove);

module.exports = router;