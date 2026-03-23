'use strict';

const Transaction = require('../models/Transaction');
const Payout = require('../models/Payout');
const Provider = require('../models/Provider');
const { success, error } = require('../utils/apiResponse');
const logger = require('../utils/logger');
const { TRANSACTION_STATUS } = require('../utils/constants');

const getSummary = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const [platformEarnings, providerPayouts, monthlyTransactions] = await Promise.all([
      Transaction.aggregate([
        { $match: { status: TRANSACTION_STATUS.COMPLETED } },
        { $group: { _id: null, total: { $sum: '$platform_amount' } } },
      ]),
      Payout.aggregate([
        { $match: { status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Transaction.countDocuments({
        createdAt: { $gte: startOfMonth, $lte: endOfMonth },
      }),
    ]);

    return success(res, {
      total_platform_earnings: platformEarnings[0]?.total || 0,
      total_provider_payouts: providerPayouts[0]?.total || 0,
      total_transactions_this_month: monthlyTransactions,
    });
  } catch (err) {
    logger.error('getSummary error', { error: err.message });
    return error(res, 'Failed to fetch summary', 500, err.message);
  }
};

const getProviderLedger = async (req, res) => {
  try {
    const provider = await Provider.findById(req.params.id);
    if (!provider) return error(res, 'Provider not found', 404);

    const [transactions, payouts] = await Promise.all([
      Transaction.find({ provider_id: provider._id }).sort({ createdAt: -1 }),
      Payout.find({ provider_id: provider._id }).sort({ createdAt: -1 }),
    ]);

    const totalCharged = transactions.reduce((sum, t) => sum + t.total_amount, 0);
    const totalProviderEarned = transactions.reduce((sum, t) => sum + t.provider_amount, 0);
    const totalPlatformEarned = transactions.reduce((sum, t) => sum + t.platform_amount, 0);
    const totalPaidOut = payouts.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0);

    return success(res, {
      provider,
      transactions,
      payouts,
      summary: {
        total_charged: totalCharged,
        total_provider_earned: totalProviderEarned,
        total_platform_earned: totalPlatformEarned,
        total_paid_out: totalPaidOut,
      },
    });
  } catch (err) {
    logger.error('getProviderLedger error', { error: err.message });
    return error(res, 'Failed to fetch provider ledger', 500, err.message);
  }
};

module.exports = { getSummary, getProviderLedger };
