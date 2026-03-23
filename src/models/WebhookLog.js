'use strict';

const mongoose = require('mongoose');

const webhookLogSchema = new mongoose.Schema({
  stripe_event_id: { type: String, unique: true, required: true },
  event_type: { type: String, required: true },
  payload: { type: mongoose.Schema.Types.Mixed },
  processed: { type: Boolean, default: false },
  error: { type: String },
  received_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model('WebhookLog', webhookLogSchema);
