'use strict';

const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema(
  {
    // --- Identity / Dedup ---
    tebra_payment_id:         { type: String, required: true, unique: true },
    tebra_charge_id:          { type: String, sparse: true },
    tebra_appointment_id:     { type: String },

    // --- Payment Info (from GetPayments) ---
    payer_type:               { type: String, enum: ['Patient', 'Insurance', 'Other', ''], default: '' },
    payer_name:               { type: String },
    payment_method:           { type: String, enum: ['Cash', 'CreditCard', 'Check', 'Other', ''], default: '' },
    amount:                   { type: Number, required: true },
    applied:                  { type: Number, default: 0 },
    unapplied:                { type: Number, default: 0 },
    post_date:                { type: Date },
    reference_number:         { type: String },
    tebra_payment_created_at: { type: Date },

    // --- Charge Info (from GetCharges) ---
    encounter_id:             { type: String },
    total_charges:            { type: Number, default: 0 },
    receipts:                 { type: Number, default: 0 },
    patient_balance:          { type: Number, default: 0 },
    total_balance:            { type: Number, default: 0 },
    charge_status:            { type: String },
    service_start_date:       { type: Date },
    service_end_date:         { type: Date },
    posting_date:             { type: Date },

    // --- Patient Info (from Charge response) ---
    patient_id:               { type: String },
    patient_name:             { type: String },

    // --- Provider Info (from Charge → Provider lookup) ---
    tebra_provider_id:        { type: String },
    provider_name:            { type: String },
    provider_npi:             { type: String },
    stripe_account_id:        { type: String },

    // --- Appointment Info (display only) ---
    appointment_start_date:   { type: Date },
    appointment_status:       { type: String },
    resource_name:            { type: String },

    // --- Split Info ---
    split_status:             { type: String, enum: ['unsplit', 'split', 'failed'], default: 'unsplit' },
    stripe_transfer_id:       { type: String, sparse: true },
    provider_amount:          { type: Number, default: 0 },
    platform_amount:          { type: Number, default: 0 },
    split_at:                 { type: Date },
    split_error:              { type: String },

    // --- Sync Metadata ---
    charge_matched:           { type: Boolean, default: false },
    provider_matched:         { type: Boolean, default: false },
    appointment_matched:      { type: Boolean, default: false },
    last_synced_at:           { type: Date },
  },
  { timestamps: true }
);

// --- Indexes ---
PaymentSchema.index({ tebra_payment_id: 1 }, { unique: true });
PaymentSchema.index({ tebra_appointment_id: 1 });
PaymentSchema.index({ tebra_provider_id: 1 });
PaymentSchema.index({ split_status: 1 });
PaymentSchema.index({ post_date: 1 });

// --- Virtual ---
PaymentSchema.virtual('is_ready_to_split').get(function () {
  return (
    this.charge_matched === true &&
    this.provider_matched === true &&
    !!this.stripe_account_id &&
    this.split_status === 'unsplit'
  );
});

module.exports = mongoose.model('Payment', PaymentSchema);
