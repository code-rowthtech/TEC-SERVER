'use strict';

const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const { roleCheck } = require('../middleware/role.middleware');
const { getDashboard } = require('../controllers/dashboard.controller');

router.get('/', authenticate, roleCheck('admin'), getDashboard);

module.exports = router;
