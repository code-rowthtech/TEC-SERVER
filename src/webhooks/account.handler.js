'use strict';

const Provider = require('../models/Provider');
const logger = require('../utils/logger');
const { ONBOARDING_STATUS } = require('../utils/constants');

/**
 * Handles account.updated webhook event.
 * @param {object} account - Stripe Account object
 */
const handleAccount = async (account) => {
  const provider = await Provider.findOne({ stripe_account_id: account.id });

  if (!provider) {
    logger.warn('account.updated: provider not found', { stripeAccountId: account.id });
    return;
  }

  if (account.charges_enabled) {
    provider.onboarding_status = ONBOARDING_STATUS.COMPLETE;
    logger.info('Provider onboarding complete', { providerId: provider._id, stripeAccountId: account.id });
  } else {
    provider.onboarding_status = ONBOARDING_STATUS.SUSPENDED;
    logger.warn('Provider account suspended/incomplete', { providerId: provider._id, stripeAccountId: account.id });
  }

  await provider.save();
};

module.exports = handleAccount;
