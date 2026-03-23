'use strict';

const mongoose = require('mongoose');
const { SYNC_STATUS } = require('../utils/constants');

const syncLogSchema = new mongoose.Schema({
  entity_type: { type: String, required: true },
  tebra_id: { type: String, required: true },
  action: { type: String, required: true },
  status: { type: String, enum: Object.values(SYNC_STATUS), required: true },
  error_msg: { type: String },
  synced_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model('SyncLog', syncLogSchema);
