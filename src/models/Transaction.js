'use strict';

const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema(
  {
    // --- Links ---
    payment_id:           { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true, index: true },
    tebra_payment_id:     { type: String, required: true, index: true },
    stripe_account_id:    { type: String, required: true },
    provider_name:        { type: String },

    // --- Amounts (all in USD dollars) ---
    gross_amount:         { type: Number, required: true },   // original payment amount
    stripe_fee:           { type: Number, required: true },   // 2.9% + $0.30
    net_amount:           { type: Number, required: true },   // gross - stripe_fee
    provider_percentage:  { type: Number, required: true },   // e.g. 64
    provider_amount:      { type: Number, required: true },   // net * provider% — fee already deducted
    platform_amount:      { type: Number, required: true },   // gross * platform%

    // --- Stripe ---
    stripe_transfer_id:   { type: String, sparse: true },

    // --- Status ---
    status:               { type: String, enum: ['success', 'failed'], required: true },
    error_message:        { type: String },
  },
  { timestamps: true }
);

TransactionSchema.index({ status: 1 });
TransactionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Transaction', TransactionSchema);
