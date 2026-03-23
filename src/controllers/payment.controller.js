'use strict';

const { validationResult } = require('express-validator');
const Provider = require('../models/Provider');
const Transaction = require('../models/Transaction');
const stripeService = require('../services/stripeService');
const { calculateSplit } = require('../services/splitService');
const { success, error } = require('../utils/apiResponse');
const logger = require('../utils/logger');
const { TRANSACTION_TYPE, TRANSACTION_STATUS } = require('../utils/constants');

const charge = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return error(res, 'Validation failed', 422, errors.array());
  }

  const { provider_id, amount, payment_method_id, tebra_claim_id, metadata = {} } = req.body;

  try {
    const provider = await Provider.findById(provider_id);
    if (!provider) return error(res, 'Provider not found', 404);
    if (!provider.stripe_account_id) return error(res, 'Provider has no Stripe account', 400);

    const { providerAmount, platformAmount } = calculateSplit(amount, provider.split_percentage);

    const paymentIntent = await stripeService.createDestinationCharge(
      amount,
      payment_method_id,
      provider.stripe_account_id,
      providerAmount,
      { provider_id: provider._id.toString(), tebra_claim_id: tebra_claim_id || '', ...metadata }
    );

    const transaction = await Transaction.create({
      stripe_payment_intent_id: paymentIntent.id,
      provider_id: provider._id,
      tebra_claim_id,
      type: TRANSACTION_TYPE.POS,
      total_amount: amount,
      provider_amount: providerAmount,
      platform_amount: platformAmount,
      stripe_transfer_id: paymentIntent.transfer_data?.destination || null,
      status: TRANSACTION_STATUS.PENDING,
    });

    logger.info('Charge created', { transactionId: transaction._id, paymentIntentId: paymentIntent.id });

    return success(res, { transaction }, 'Charge created', 201);
  } catch (err) {
    logger.error('charge error', { error: err.message });
    return error(res, 'Charge failed', 500, err.message);
  }
};

const getTransactions = async (req, res) => {
  try {
    const { provider, status, from, to, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (provider) filter.provider_id = provider;
    if (status) filter.status = status;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    const skip = (Math.max(1, parseInt(page)) - 1) * Math.min(100, parseInt(limit));
    const pageLimit = Math.min(100, parseInt(limit));

    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .populate('provider_id', 'name email npi')
        .skip(skip)
        .limit(pageLimit)
        .sort({ createdAt: -1 }),
      Transaction.countDocuments(filter),
    ]);

    return success(res, { transactions, total, page: parseInt(page), limit: pageLimit });
  } catch (err) {
    logger.error('getTransactions error', { error: err.message });
    return error(res, 'Failed to fetch transactions', 500, err.message);
  }
};

const getTransaction = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id).populate('provider_id', 'name email npi');
    if (!transaction) return error(res, 'Transaction not found', 404);
    return success(res, { transaction });
  } catch (err) {
    logger.error('getTransaction error', { error: err.message });
    return error(res, 'Failed to fetch transaction', 500, err.message);
  }
};

module.exports = { charge, getTransactions, getTransaction };
