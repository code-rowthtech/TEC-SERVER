'use strict';

const mongoose = require('mongoose');
const { TRANSACTION_STATUS, TRANSACTION_TYPE } = require('../utils/constants');

const transactionSchema = new mongoose.Schema(
  {
    stripe_payment_intent_id: { type: String, unique: true, sparse: true },
    provider_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', required: true },
    tebra_claim_id: { type: String },
    type: { type: String, enum: Object.values(TRANSACTION_TYPE), required: true },
    total_amount: { type: Number, required: true },
    provider_amount: { type: Number, required: true },
    platform_amount: { type: Number, required: true },
    stripe_transfer_id: { type: String },
    status: {
      type: String,
      enum: Object.values(TRANSACTION_STATUS),
      default: TRANSACTION_STATUS.PENDING,
    },
    posted_to_tebra: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Transaction', transactionSchema);
