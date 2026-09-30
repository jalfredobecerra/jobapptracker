const router = require('express').Router();
const controller = require('../controllers/interviews');
const { interviewBody, validateBody, validateId, validateEmptyQuery } = require('../validation');

router.get('/', validateEmptyQuery, controller.list);
router.get('/:id', validateId, validateEmptyQuery, controller.get);
router.post('/', validateEmptyQuery, validateBody(interviewBody), controller.create);
router.put('/:id', validateId, validateEmptyQuery, validateBody(interviewBody), controller.replace);
router.delete('/:id', validateId, validateEmptyQuery, controller.remove);

module.exports = router;