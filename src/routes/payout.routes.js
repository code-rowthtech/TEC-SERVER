'use strict';

const { Router } = require('express');
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth.middleware');
const { roleCheck } = require('../middleware/role.middleware');
const { getPayouts, triggerInstantPayout } = require('../controllers/payout.controller');

const router = Router();

router.use(authenticate, roleCheck('admin'));

router.get('/', getPayouts);

router.post(
  '/instant/:providerId',
  [body('amount').isInt({ min: 1 })],
  triggerInstantPayout
);

module.exports = router;
