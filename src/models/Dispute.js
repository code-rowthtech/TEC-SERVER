'use strict';

const mongoose = require('mongoose');
const { DISPUTE_STATUS } = require('../utils/constants');

const disputeSchema = new mongoose.Schema(
  {
    transaction_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', required: true },
    stripe_dispute_id: { type: String, unique: true, required: true },
    amount: { type: Number, required: true },
    reason: { type: String },
    status: {
      type: String,
      enum: Object.values(DISPUTE_STATUS),
      default: DISPUTE_STATUS.OPEN,
    },
    evidence_due_by: { type: Date },
    resolved_at: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Dispute', disputeSchema);
