'use strict';

const stripe = require('../config/stripe');
const Payment = require('../models/Payment');
const Provider = require('../models/Provider');
const Transaction = require('../models/Transaction');
const logger = require('../utils/logger');

// Stripe fee: 2.9% + $0.30 — deducted from provider's share only
const calcStripeFee = (amountDollars) => {
  return parseFloat(((amountDollars * 0.029) + 0.30).toFixed(2));
};

const toCents = (dollars) => Math.round(dollars * 100);

/**
 * Splits a single Payment document.
 * Returns { success: boolean, transfer_id?, error? }
 */
const splitOne = async (payment) => {
  if (!payment.stripe_account_id) {
    return { success: false, error: 'No stripe_account_id on payment' };
  }

  // Fetch provider to get live split_percentage
  const provider = await Provider.findOne({ stripe_account_id: payment.stripe_account_id }).lean();
  if (!provider) {
    return { success: false, error: `Provider not found for stripe_account_id=${payment.stripe_account_id}` };
  }

  const providerPct  = provider.split_percentage / 100;          // e.g. 0.64
  const platformPct  = 1 - providerPct;                          // e.g. 0.36
  const gross        = payment.amount;                           // dollars
  const stripeFee    = calcStripeFee(gross);                     // deducted from provider share
  const providerGross = parseFloat((gross * providerPct).toFixed(2));
  const providerNet  = parseFloat((providerGross - stripeFee).toFixed(2));
  const platformAmt  = parseFloat((gross * platformPct).toFixed(2));

  if (providerNet <= 0) {
    return { success: false, error: `Provider net amount is ${providerNet} after fee deduction — too small to transfer` };
  }

  let transfer;
  try {
    transfer = await stripe.transfers.create({
      amount:      toCents(providerNet),
      currency:    'usd',
      destination: payment.stripe_account_id,
      metadata: {
        tebra_payment_id: payment.tebra_payment_id,
        payment_id:       String(payment._id),
        provider_name:    payment.provider_name || '',
      },
    });
  } catch (stripeErr) {
    logger.error('splitService: Stripe transfer failed', { payment_id: payment._id, error: stripeErr.message });
    return { success: false, error: stripeErr.message };
  }

  // Update Payment doc
  await Payment.updateOne(
    { _id: payment._id },
    {
      split_status:      'split',
      stripe_transfer_id: transfer.id,
      provider_amount:   providerNet,
      platform_amount:   platformAmt,
      split_at:          new Date(),
      split_error:       null,
    }
  );

  // Record Transaction
  await Transaction.create({
    payment_id:          payment._id,
    tebra_payment_id:    payment.tebra_payment_id,
    stripe_account_id:   payment.stripe_account_id,
    provider_name:       payment.provider_name,
    gross_amount:        gross,
    stripe_fee:          stripeFee,
    net_amount:          parseFloat((gross - stripeFee).toFixed(2)),
    provider_percentage: provider.split_percentage,
    provider_amount:     providerNet,
    platform_amount:     platformAmt,
    stripe_transfer_id:  transfer.id,
    status:              'success',
  });

  logger.info('splitService: split success', {
    payment_id: payment._id,
    transfer_id: transfer.id,
    gross,
    stripe_fee: stripeFee,
    provider_net: providerNet,
    platform: platformAmt,
  });

  return { success: true, transfer_id: transfer.id };
};

/**
 * Splits an array of payment IDs.
 * @param {string[]} paymentIds - MongoDB _id strings
 */
const splitByIds = async (paymentIds) => {
  const payments = await Payment.find({
    _id: { $in: paymentIds },
    split_status: { $in: ['unsplit', 'failed'] },
    stripe_account_id: { $exists: true, $ne: null },
  }).lean();

  return runBatch(payments);
};

/**
 * Splits ALL unsplit + failed payments that have a stripe_account_id.
 */
const splitAll = async () => {
  const payments = await Payment.find({
    split_status: { $in: ['unsplit', 'failed'] },
    stripe_account_id: { $exists: true, $ne: null },
  }).lean();

  return runBatch(payments);
};

const runBatch = async (payments) => {
  const results = { total: payments.length, success: 0, failed: 0, errors: [] };

  for (const payment of payments) {
    const result = await splitOne(payment);
    if (result.success) {
      results.success++;
    } else {
      results.failed++;
      results.errors.push({ tebra_payment_id: payment.tebra_payment_id, error: result.error });

      // Mark as failed in DB + record failed transaction
      await Payment.updateOne(
        { _id: payment._id },
        { split_status: 'failed', split_error: result.error }
      );
      await Transaction.create({
        payment_id:          payment._id,
        tebra_payment_id:    payment.tebra_payment_id,
        stripe_account_id:   payment.stripe_account_id || '',
        provider_name:       payment.provider_name,
        gross_amount:        payment.amount,
        stripe_fee:          calcStripeFee(payment.amount),
        net_amount:          payment.amount - calcStripeFee(payment.amount),
        provider_percentage: 64,
        provider_amount:     0,
        platform_amount:     0,
        status:              'failed',
        error_message:       result.error,
      });
    }
  }

  logger.info('splitService: batch complete', results);
  return results;
};

module.exports = { splitByIds, splitAll };
