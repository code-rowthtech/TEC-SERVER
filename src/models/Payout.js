'use strict';

const mongoose = require('mongoose');
const { PAYOUT_STATUS, PAYOUT_TYPE } = require('../utils/constants');

const payoutSchema = new mongoose.Schema(
  {
    provider_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', required: true },
    stripe_payout_id: { type: String, unique: true, sparse: true },
    amount: { type: Number, required: true },
    type: { type: String, enum: Object.values(PAYOUT_TYPE), required: true },
    fee: { type: Number, default: 0 },
    status: {
      type: String,
      enum: Object.values(PAYOUT_STATUS),
      default: PAYOUT_STATUS.PENDING,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Payout', payoutSchema);
