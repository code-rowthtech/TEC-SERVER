'use strict';

const { Worker, QueueScheduler } = require('bullmq');
const bullmqConnection = require('../config/bullmq');
const { tebraSyncQueue } = require('./queue');
const tebraService = require('../services/tebraService');
const Provider = require('../models/Provider');
const Transaction = require('../models/Transaction');
const SyncLog = require('../models/SyncLog');
const logger = require('../utils/logger');
const { calculateSplit } = require('../services/splitService');
const { TRANSACTION_TYPE, TRANSACTION_STATUS, SYNC_STATUS } = require('../utils/constants');

const QUEUE_NAME = 'tebra-sync';
const REPEAT_EVERY_MS = 15 * 60 * 1000; // 15 minutes

const processTebraSync = async () => {
  // Sync providers
  let providers = [];
  try {
    providers = await tebraService.getProviders();

    for (const tebraProvider of providers) {
      try {
        await Provider.findOneAndUpdate(
          { tebra_provider_id: tebraProvider.id },
          {
            tebra_provider_id: tebraProvider.id,
            npi: tebraProvider.npi,
            name: tebraProvider.name,
            email: tebraProvider.email,
            last_synced_at: new Date(),
          },
          { upsert: true, new: true }
        );

        await SyncLog.create({
          entity_type: 'provider',
          tebra_id: tebraProvider.id,
          action: 'upsert',
          status: SYNC_STATUS.SUCCESS,
        });
      } catch (err) {
        logger.error('tebraSync: provider upsert failed', { tebraId: tebraProvider.id, error: err.message });
        await SyncLog.create({
          entity_type: 'provider',
          tebra_id: tebraProvider.id,
          action: 'upsert',
          status: SYNC_STATUS.FAILED,
          error_msg: err.message,
        });
      }
    }
  } catch (err) {
    logger.error('tebraSync: getProviders failed', { error: err.message });
  }

  // Sync payments
  const fromDate = new Date(Date.now() - REPEAT_EVERY_MS * 2);
  let payments = [];
  try {
    payments = await tebraService.getPayments(fromDate);

    for (const payment of payments) {
      try {
        const existing = await Transaction.findOne({ tebra_claim_id: payment.claim_id });
        if (existing) continue;

        const provider = await Provider.findOne({ tebra_provider_id: payment.provider_id });
        if (!provider) {
          logger.warn('tebraSync: provider not found for payment', { tebraProviderId: payment.provider_id });
          continue;
        }

        const { providerAmount, platformAmount } = calculateSplit(
          payment.amount,
          provider.split_percentage
        );

        await Transaction.create({
          provider_id: provider._id,
          tebra_claim_id: payment.claim_id,
          type: TRANSACTION_TYPE.TEBRA_SYNC,
          total_amount: payment.amount,
          provider_amount: providerAmount,
          platform_amount: platformAmount,
          status: TRANSACTION_STATUS.PENDING,
        });

        await SyncLog.create({
          entity_type: 'payment',
          tebra_id: payment.claim_id,
          action: 'create',
          status: SYNC_STATUS.SUCCESS,
        });
      } catch (err) {
        logger.error('tebraSync: payment create failed', { claimId: payment.claim_id, error: err.message });
        await SyncLog.create({
          entity_type: 'payment',
          tebra_id: payment.claim_id || 'unknown',
          action: 'create',
          status: SYNC_STATUS.FAILED,
          error_msg: err.message,
        });
      }
    }
  } catch (err) {
    logger.error('tebraSync: getPayments failed', { error: err.message });
  }

  logger.info('tebraSync job completed', {
    providersProcessed: providers.length,
    paymentsProcessed: payments.length,
  });
};

const startTebraSyncJob = () => {
  // Schedule repeating job
  tebraSyncQueue.add(
    'sync',
    {},
    {
      repeat: { every: REPEAT_EVERY_MS },
      removeOnComplete: 10,
      removeOnFail: 20,
    }
  );

  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      await processTebraSync();
    },
    { connection: bullmqConnection }
  );

  worker.on('completed', () => logger.info('tebraSync job completed'));
  worker.on('failed', (job, err) => logger.error('tebraSync job failed', { error: err.message }));

  logger.info('tebraSync worker started');
};

module.exports = { startTebraSyncJob };
