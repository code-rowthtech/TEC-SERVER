'use strict';

const Payment = require('../models/Payment');
const { splitByIds, splitAll } = require('../services/splitService');

const getPayments = async (req, res, next) => {
  try {
    const page        = Math.max(1, parseInt(req.query.page)  || 1);
    const limit       = Math.min(100, parseInt(req.query.limit) || 20);
    const skip        = (page - 1) * limit;
    const splitStatus = req.query.split_status;
    const payerType   = req.query.payer_type;

    const filter = {};
    if (splitStatus) filter.split_status = splitStatus;
    if (payerType)   filter.payer_type   = payerType;

    const [docs, total] = await Promise.all([
      Payment.find(filter).sort({ post_date: -1 }).skip(skip).limit(limit).lean(),
      Payment.countDocuments(filter),
    ]);

    res.json({
      data: docs,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

const splitPayments = async (req, res, next) => {
  try {
    const { mode, payment_ids } = req.body;

    // mode: 'all' | 'selected'
    if (mode === 'all') {
      const results = await splitAll();
      return res.json(results);
    }

    if (mode === 'selected') {
      console.log('Splitting selected payments:', payment_ids);
      if (!Array.isArray(payment_ids) || payment_ids.length === 0) {
        return res.status(400).json({ message: 'payment_ids array is required for mode=selected' });
      }
      const results = await splitByIds(payment_ids);
      return res.json(results);
    }

    return res.status(400).json({ message: 'mode must be "all" or "selected"' });
  } catch (err) {
    next(err);
  }
};

module.exports = { getPayments, splitPayments };
