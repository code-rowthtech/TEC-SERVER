'use strict';

const Transaction = require('../models/Transaction');
const logger = require('../utils/logger');
const { TRANSACTION_STATUS } = require('../utils/constants');

/**
 * Handles payment_intent.payment_failed webhook event.
 * @param {object} paymentIntent - Stripe PaymentIntent object
 */
const handlePaymentFailed = async (paymentIntent) => {
  const transaction = await Transaction.findOne({
    stripe_payment_intent_id: paymentIntent.id,
  });

  if (!transaction) {
    logger.warn('paymentFailed: transaction not found', { paymentIntentId: paymentIntent.id });
    return;
  }

  transaction.status = TRANSACTION_STATUS.FAILED;
  await transaction.save();

  const failureReason =
    paymentIntent.last_payment_error?.message || 'Unknown failure reason';

  logger.error('Transaction marked failed', {
    transactionId: transaction._id,
    paymentIntentId: paymentIntent.id,
    reason: failureReason,
  });
};

module.exports = handlePaymentFailed;
