'use strict';

const mongoose = require('mongoose');
const { USER_ROLES } = require('../utils/constants');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password_hash: { type: String, required: true },
    role: { type: String, enum: Object.values(USER_ROLES), required: true },
    provider_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', sparse: true },
    last_login: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
