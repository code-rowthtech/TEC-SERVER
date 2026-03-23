'use strict';

const Payout = require('../models/Payout');
const logger = require('../utils/logger');
const { PAYOUT_STATUS } = require('../utils/constants');

/**
 * Handles payout.paid and payout.failed webhook events.
 * @param {object} stripePayout - Stripe Payout object
 * @param {string} eventType - 'payout.paid' | 'payout.failed'
 */
const handlePayout = async (stripePayout, eventType) => {
  const payout = await Payout.findOne({ stripe_payout_id: stripePayout.id });

  if (!payout) {
    logger.warn('payout handler: payout not found', { stripePayoutId: stripePayout.id });
    return;
  }

  if (eventType === 'payout.paid') {
    payout.status = PAYOUT_STATUS.PAID;
    logger.info('Payout marked paid', { payoutId: payout._id, stripePayoutId: stripePayout.id });
  } else if (eventType === 'payout.failed') {
    payout.status = PAYOUT_STATUS.FAILED;
    logger.error('Payout marked failed', {
      payoutId: payout._id,
      stripePayoutId: stripePayout.id,
      failureCode: stripePayout.failure_code,
      failureMessage: stripePayout.failure_message,
    });
  }

  await payout.save();
};

module.exports = handlePayout;
