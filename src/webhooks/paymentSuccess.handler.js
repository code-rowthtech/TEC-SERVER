'use strict';

const Transaction = require('../models/Transaction');
const logger = require('../utils/logger');
const { TRANSACTION_STATUS } = require('../utils/constants');

/**
 * Handles payment_intent.succeeded webhook event.
 * @param {object} paymentIntent - Stripe PaymentIntent object
 */
const handlePaymentSuccess = async (paymentIntent) => {
  const transaction = await Transaction.findOne({
    stripe_payment_intent_id: paymentIntent.id,
  });

  if (!transaction) {
    logger.warn('paymentSuccess: transaction not found', { paymentIntentId: paymentIntent.id });
    return;
  }

  transaction.status = TRANSACTION_STATUS.COMPLETED;
  await transaction.save();

  logger.info('Transaction marked completed', {
    transactionId: transaction._id,
    paymentIntentId: paymentIntent.id,
  });
};

module.exports = handlePaymentSuccess;
