'use strict';

const Payment = require('../models/Payment');
const Provider = require('../models/Provider');
const Transaction = require('../models/Transaction');

const getDashboard = async (req, res, next) => {
  try {
    const [
      totalPayments,
      splitPayments,
      unsplitPayments,
      failedPayments,
      totalProviders,
      providersByStatus,
      recentPayments,
      paymentTotals,
      payerBreakdown,
      recentTransactions,
    ] = await Promise.all([
      // counts
      Payment.countDocuments(),
      Payment.countDocuments({ split_status: 'split' }),
      Payment.countDocuments({ split_status: 'unsplit' }),
      Payment.countDocuments({ split_status: 'failed' }),

      // providers
      Provider.countDocuments(),

      // providers grouped by onboarding_status
      Provider.aggregate([
        { $group: { _id: '$onboarding_status', count: { $sum: 1 } } },
      ]),

      // recent 5 payments for table
      Payment.find()
        .sort({ post_date: -1 })
        .limit(5)
        .select('provider_name amount payment_method payer_type split_status post_date patient_name tebra_payment_id')
        .lean(),

      // total volume + split volume aggregation
      Payment.aggregate([
        {
          $group: {
            _id: null,
            totalVolume:    { $sum: '$amount' },
            splitVolume:    { $sum: { $cond: [{ $eq: ['$split_status', 'split'] }, '$amount', 0] } },
            unsplitVolume:  { $sum: { $cond: [{ $eq: ['$split_status', 'unsplit'] }, '$amount', 0] } },
            providerPaid:   { $sum: '$provider_amount' },
            platformEarned: { $sum: '$platform_amount' },
          },
        },
      ]),

      // payer type breakdown
      Payment.aggregate([
        {
          $group: {
            _id:    '$payer_type',
            count:  { $sum: 1 },
            amount: { $sum: '$amount' },
          },
        },
        { $sort: { amount: -1 } },
      ]),

      // recent 5 transactions
      Transaction.find({ status: 'success' })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('provider_name gross_amount provider_amount platform_amount stripe_fee createdAt')
        .lean(),
    ]);

    const totals = paymentTotals[0] || {
      totalVolume: 0, splitVolume: 0, unsplitVolume: 0, providerPaid: 0, platformEarned: 0,
    };

    const splitRate = totalPayments > 0
      ? Math.round((splitPayments / totalPayments) * 100)
      : 0;

    // build provider status map
    const providerStatusMap = {};
    providersByStatus.forEach((s) => { providerStatusMap[s._id] = s.count; });

    // payer breakdown with percentages
    const totalPayerCount = payerBreakdown.reduce((s, p) => s + p.count, 0);
    const breakdown = payerBreakdown.map((p) => ({
      label:  p._id || 'Unknown',
      count:  p.count,
      amount: p.amount,
      pct:    totalPayerCount > 0 ? Math.round((p.count / totalPayerCount) * 100) : 0,
    }));

    res.json({
      stats: {
        totalVolume:    totals.totalVolume,
        splitVolume:    totals.splitVolume,
        unsplitVolume:  totals.unsplitVolume,
        providerPaid:   totals.providerPaid,
        platformEarned: totals.platformEarned,
        totalPayments,
        splitPayments,
        unsplitPayments,
        failedPayments,
        splitRate,
        totalProviders,
      },
      providerStatus: {
        complete:    providerStatusMap['complete']    || 0,
        in_progress: providerStatusMap['in_progress'] || 0,
        pending:     providerStatusMap['pending']     || 0,
        suspended:   providerStatusMap['suspended']   || 0,
      },
      recentPayments,
      recentTransactions,
      payerBreakdown: breakdown,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getDashboard };
