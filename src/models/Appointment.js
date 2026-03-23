'use strict';

const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema(
  {
    provider_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', required: true },
    tebra_appointment_id: { type: String, unique: true, required: true },
    patient_id: { type: String },
    appointment_date: { type: Date, required: true },
    status: { type: String, enum: ['scheduled', 'completed', 'cancelled', 'no_show'], default: 'scheduled' },
    raw_payload: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Appointment', appointmentSchema);
