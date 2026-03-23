'use strict';

const cron = require('node-cron');
const Provider = require('../models/Provider');
const stripeService = require('../services/stripeService');
const logger = require('../utils/logger');
const { ONBOARDING_STATUS } = require('../utils/constants');

const CRON_SCHEDULE = process.env.STRIPE_SYNC_CRON || '* * * * *';

const runStripeSync = async () => {
  const providers = await Provider.find({
    stripe_account_id: { $exists: true, $ne: null },
    onboarding_status: { $ne: ONBOARDING_STATUS.COMPLETE },
  });

  if (providers.length === 0) {
    logger.info('[stripeSync] No pending providers to check');
    return;
  }

  logger.info(`[stripeSync] Checking ${providers.length} provider(s)`);

  let updated = 0;

  for (const provider of providers) {
    try {
      const status = await stripeService.getAccountStatus(provider.stripe_account_id);

      if (status.charges_enabled) {
        provider.onboarding_status = ONBOARDING_STATUS.COMPLETE;
        await provider.save();
        updated++;
        logger.info('[stripeSync] Provider marked complete', {
          providerId: provider._id,
          stripeAccountId: provider.stripe_account_id,
        });
      } else {
        logger.info('[stripeSync] Provider still pending', {
          providerId: provider._id,
          stripeAccountId: provider.stripe_account_id,
          details_submitted: status.details_submitted,
          payouts_enabled: status.payouts_enabled,
        });
      }
    } catch (err) {
      logger.error('[stripeSync] Failed to check provider', {
        providerId: provider._id,
        stripeAccountId: provider.stripe_account_id,
        error: err.message,
      });
    }
  }

  logger.info(`[stripeSync] Done — ${updated}/${providers.length} updated to complete`);
};

const startStripeSyncJob = () => {
  cron.schedule(CRON_SCHEDULE, async () => {
    logger.info(`[stripeSync] Cron triggered — schedule: ${CRON_SCHEDULE}`);
    try {
      await runStripeSync();
    } catch (err) {
      logger.error('[stripeSync] Unexpected error', { error: err.message });
    }
  });

  logger.info(`[stripeSync] Cron scheduled — ${CRON_SCHEDULE}`);
};

module.exports = { startStripeSyncJob };
