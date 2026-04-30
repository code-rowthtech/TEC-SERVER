'use strict';

const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const { roleCheck } = require('../middleware/role.middleware');
const { getPayments, splitPayments } = require('../controllers/payment.controller');

router.get('/',      authenticate, roleCheck('admin'), getPayments);
router.post('/split', authenticate, roleCheck('admin'), splitPayments);

module.exports = router;
