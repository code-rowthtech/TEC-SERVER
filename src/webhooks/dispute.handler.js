'use strict';

const Transaction = require('../models/Transaction');
const Dispute = require('../models/Dispute');
const logger = require('../utils/logger');
const { TRANSACTION_STATUS, DISPUTE_STATUS } = require('../utils/constants');

/**
 * Handles charge.dispute.created / charge.dispute.updated webhook events.
 * @param {object} dispute - Stripe Dispute object
 */
const handleDispute = async (dispute) => {
  // Stripe dispute object contains payment_intent field
  const paymentIntentId = dispute.payment_intent;

  if (!paymentIntentId) {
    logger.warn('dispute: no payment_intent on dispute object', { disputeId: dispute.id });
    return;
  }

  const transaction = await Transaction.findOne({
    stripe_payment_intent_id: paymentIntentId,
  });

  if (!transaction) {
    logger.warn('dispute: transaction not found', { paymentIntentId, disputeId: dispute.id });
    return;
  }

  // Mark transaction as disputed
  transaction.status = TRANSACTION_STATUS.DISPUTED;
  await transaction.save();

  // Clawback amount = provider's share of the original transaction
  const clawbackAmount = transaction.provider_amount;

  const evidenceDueBy = dispute.evidence_details?.due_by
    ? new Date(dispute.evidence_details.due_by * 1000)
    : null;

  // Upsert dispute record
  await Dispute.findOneAndUpdate(
    { stripe_dispute_id: dispute.id },
    {
      transaction_id: transaction._id,
      stripe_dispute_id: dispute.id,
      amount: dispute.amount,
      reason: dispute.reason,
      status: DISPUTE_STATUS.OPEN,
      evidence_due_by: evidenceDueBy,
    },
    { upsert: true, new: true }
  );

  logger.info('Dispute created/updated', {
    disputeId: dispute.id,
    transactionId: transaction._id,
    clawbackAmount,
    evidenceDueBy,
  });
};

module.exports = handleDispute;
