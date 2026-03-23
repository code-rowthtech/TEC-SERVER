'use strict';

const { Router } = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const { roleCheck } = require('../middleware/role.middleware');
const { getSummary, getProviderLedger } = require('../controllers/reconciliation.controller');

const router = Router();

router.use(authenticate, roleCheck('admin'));

router.get('/summary', getSummary);
router.get('/provider/:id', getProviderLedger);

module.exports = router;
