'use strict';

const { Router } = require('express');
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth.middleware');
const { roleCheck } = require('../middleware/role.middleware');
const { charge, getTransactions, getTransaction } = require('../controllers/payment.controller');

const router = Router();

router.use(authenticate, roleCheck('admin'));

router.get('/', getTransactions);
router.get('/:id', getTransaction);

router.post(
  '/charge',
  [
    body('provider_id').notEmpty(),
    body('amount').isInt({ min: 1 }),
    body('payment_method_id').notEmpty(),
  ],
  charge
);

module.exports = router;
