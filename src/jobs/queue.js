'use strict';

const { Queue } = require('bullmq');
const bullmqConnection = require('../config/bullmq');
const logger = require('../utils/logger');

const tebraSyncQueue = new Queue('tebra-sync', { connection: bullmqConnection });
const paymentProcessorQueue = new Queue('payment-processor', { connection: bullmqConnection });

tebraSyncQueue.on('error', (err) => logger.error('tebraSyncQueue error', { error: err.message }));
paymentProcessorQueue.on('error', (err) => logger.error('paymentProcessorQueue error', { error: err.message }));

module.exports = { tebraSyncQueue, paymentProcessorQueue };
