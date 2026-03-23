'use strict';

const Provider = require('../models/Provider');
const Payout = require('../models/Payout');
const stripeService = require('../services/stripeService');
const { success, error } = require('../utils/apiResponse');
const logger = require('../utils/logger');
const { PAYOUT_TYPE, PAYOUT_STATUS } = require('../utils/constants');

const getPayouts = async (req, res) => {
  try {
    const { provider, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (provider) filter.provider_id = provider;

    const skip = (Math.max(1, parseInt(page)) - 1) * Math.min(100, parseInt(limit));
    const pageLimit = Math.min(100, parseInt(limit));

    const [payouts, total] = await Promise.all([
      Payout.find(filter)
        .populate('provider_id', 'name email')
        .skip(skip)
        .limit(pageLimit)
        .sort({ createdAt: -1 }),
      Payout.countDocuments(filter),
    ]);

    return success(res, { payouts, total, page: parseInt(page), limit: pageLimit });
  } catch (err) {
    logger.error('getPayouts error', { error: err.message });
    return error(res, 'Failed to fetch payouts', 500, err.message);
  }
};

const triggerInstantPayout = async (req, res) => {
  const { providerId } = req.params;
  const { amount } = req.body;

  if (!amount || !Number.isInteger(amount) || amount <= 0) {
    return error(res, 'amount must be a positive integer (cents)', 400);
  }

  try {
    const provider = await Provider.findById(providerId);
    if (!provider) return error(res, 'Provider not found', 404);
    if (!provider.stripe_account_id) return error(res, 'Provider has no Stripe account', 400);

    const { payout: stripePayout, fee } = await stripeService.createInstantPayout(
      provider.stripe_account_id,
      amount
    );

    const payout = await Payout.create({
      provider_id: provider._id,
      stripe_payout_id: stripePayout.id,
      amount: stripePayout.amount,
      type: PAYOUT_TYPE.INSTANT,
      fee,
      status: PAYOUT_STATUS.PENDING,
    });

    logger.info('Instant payout triggered', { payoutId: payout._id, stripePayoutId: stripePayout.id });

    return success(res, { payout }, 'Instant payout initiated', 201);
  } catch (err) {
    logger.error('triggerInstantPayout error', { error: err.message });
    return error(res, 'Failed to trigger instant payout', 500, err.message);
  }
};

module.exports = { getPayouts, triggerInstantPayout };
