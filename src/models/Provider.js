'use strict';

const mongoose = require('mongoose');
const { ONBOARDING_STATUS } = require('../utils/constants');

const providerSchema = new mongoose.Schema(
  {
    tebra_provider_id: { type: String, required: true, unique: true },
    npi: { type: String, required: true, unique: true },
    stripe_account_id: { type: String, unique: true, sparse: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    split_percentage: { type: Number, default: 64 },
    onboarding_status: {
      type: String,
      enum: Object.values(ONBOARDING_STATUS),
      default: ONBOARDING_STATUS.PENDING,
    },
    onboarding_url: { type: String },
    last_synced_at: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Provider', providerSchema);
