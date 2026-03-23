'use strict';

const { Router } = require('express');
const { handleWebhook } = require('../controllers/webhook.controller');

const router = Router();

// No auth — Stripe calls this directly
// Raw body is applied in server.js before this route
router.post('/', handleWebhook);

module.exports = router;
