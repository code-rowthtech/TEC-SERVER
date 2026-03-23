'use strict';

const { Worker } = require('bullmq');
const bullmqConnection = require('../config/bullmq');
const Transaction = require('../models/Transaction');
const logger = require('../utils/logger');
const { TRANSACTION_STATUS } = require('../utils/constants');

const QUEUE_NAME = 'payment-processor';

const startPaymentProcessorJob = () => {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { transactionId } = job.data;

      const transaction = await Transaction.findById(transactionId);
      if (!transaction) {
        logger.warn('paymentProcessor: transaction not found', { transactionId });
        return;
      }

      if (transaction.status !== TRANSACTION_STATUS.PENDING) {
        logger.info('paymentProcessor: transaction already processed', {
          transactionId,
          status: transaction.status,
        });
        return;
      }

      // Additional processing logic can be added here
      logger.info('paymentProcessor: processing transaction', { transactionId });
    },
    { connection: bullmqConnection }
  );

  worker.on('completed', (job) =>
    logger.info('paymentProcessor job completed', { jobId: job.id })
  );
  worker.on('failed', (job, err) =>
    logger.error('paymentProcessor job failed', { jobId: job?.id, error: err.message })
  );

  logger.info('paymentProcessor worker started');
};

module.exports = { startPaymentProcessorJob };
