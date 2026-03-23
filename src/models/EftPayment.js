'use strict';

const mongoose = require('mongoose');

const eftPaymentSchema = new mongoose.Schema(
  {
    provider_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', required: true },
    tebra_payment_id: { type: String, unique: true, required: true },
    amount: { type: Number, required: true },
    payment_date: { type: Date, required: true },
    payer_name: { type: String },
    status: { type: String, enum: ['pending', 'posted', 'failed'], default: 'pending' },
    raw_payload: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

module.exports = mongoose.model('EftPayment', eftPaymentSchema);
