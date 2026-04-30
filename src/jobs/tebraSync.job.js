'use strict';

const cron = require('node-cron');
const { getCharges, getPayments, getAppointments } = require('../services/tebraService');
const Payment = require('../models/Payment');
const Provider = require('../models/Provider');
const logger = require('../utils/logger');

const runSync = async () => {
  logger.info('tebraSync: ▶ STARTING SYNC');

  try {
    // STEP 1 — Calculate fromDate
    const latest = await Payment.findOne({}, { last_synced_at: 1 }).sort({ last_synced_at: -1 }).lean();
    let fromDate;
    if (latest?.last_synced_at) {
      fromDate = new Date(latest.last_synced_at.getTime() - 60 * 60 * 1000);
    } else {
      fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }
    logger.info(`tebraSync: fromDate = ${fromDate.toISOString()}`);

    // STEP 2 — Fetch charges, payments, appointments from Tebra
    let charges, payments, appointments;
    try {
      [charges, payments, appointments] = await Promise.all([
        getCharges(fromDate),
        getPayments(fromDate),
        getAppointments(fromDate),
      ]);
    } catch (apiErr) {
      logger.error('tebraSync: Tebra API call FAILED', { error: apiErr.message });
      throw apiErr;
    }

    logger.info(`tebraSync: fetched — charges: ${charges.length}, payments: ${payments.length}, appointments: ${appointments.length}`);

    if (payments.length === 0) {
      logger.info('tebraSync: no payments to process, exiting');
      return;
    }

    // STEP 3 — Build lookup Maps
    const chargeMap      = new Map(charges.map((c) => [c.appointment_id, c]));
    const appointmentMap = new Map(appointments.map((a) => [a.tebra_appointment_id, a]));

    // STEP 4 — Build unified docs
    const now = new Date();
    const unifiedDocs = [];
    let chargeMatchCount = 0, providerMatchCount = 0, appointmentMatchCount = 0;

    for (const payment of payments) {
      try {
        const charge      = chargeMap.get(payment.appointment_id) || null;
        const appointment = appointmentMap.get(payment.appointment_id) || null;

        // Always look up provider from DB
        let provider = null;
        if (charge?.rendering_provider_id) {
          provider = await Provider.findOne({ tebra_provider_id: charge.rendering_provider_id }).lean();
        }

        const chargeMatched      = !!charge;
        const providerMatched    = !!(provider?.stripe_account_id);
        const appointmentMatched = !!appointment;

        if (chargeMatched) chargeMatchCount++;
        if (providerMatched) providerMatchCount++;
        if (appointmentMatched) appointmentMatchCount++;

        if (!chargeMatched) {
          logger.warn(`tebraSync: no charge for appointment_id=${payment.appointment_id} (payment=${payment.tebra_payment_id})`);
        }
        if (chargeMatched && !providerMatched) {
          logger.warn(`tebraSync: provider not onboarded — rendering_provider_id=${charge.rendering_provider_id} (payment=${payment.tebra_payment_id})`);
        }

        unifiedDocs.push({
          tebra_payment_id:         payment.tebra_payment_id,
          tebra_charge_id:          charge?.tebra_charge_id          || null,
          tebra_appointment_id:     payment.appointment_id,

          payer_type:               payment.payer_type,
          payer_name:               payment.payer_name,
          payment_method:           payment.payment_method,
          amount:                   payment.amount,
          applied:                  payment.applied,
          unapplied:                payment.unapplied,
          post_date:                payment.post_date    ? new Date(payment.post_date)    : null,
          reference_number:         payment.reference_number,
          tebra_payment_created_at: payment.created_date ? new Date(payment.created_date) : null,

          encounter_id:             charge?.encounter_id    || null,
          total_charges:            charge?.total_charges   || 0,
          receipts:                 charge?.receipts        || 0,
          patient_balance:          charge?.patient_balance || 0,
          total_balance:            charge?.total_balance   || 0,
          charge_status:            charge?.status          || null,
          service_start_date:       charge?.service_start_date ? new Date(charge.service_start_date) : null,
          service_end_date:         charge?.service_end_date   ? new Date(charge.service_end_date)   : null,
          posting_date:             charge?.posting_date       ? new Date(charge.posting_date)       : null,

          patient_id:               charge?.patient_id              || null,
          patient_name:             charge?.patient_name            || null,

          tebra_provider_id:        charge?.rendering_provider_id   || null,
          provider_name:            charge?.rendering_provider_name || provider?.name || null,
          provider_npi:             provider?.npi                   || null,
          stripe_account_id:        provider?.stripe_account_id     || null,

          appointment_start_date:   appointment?.start_date          ? new Date(appointment.start_date) : null,
          appointment_status:       appointment?.confirmation_status || null,
          resource_name:            appointment?.resource_name       || null,

          charge_matched:           chargeMatched,
          provider_matched:         providerMatched,
          appointment_matched:      appointmentMatched,
          last_synced_at:           now,
        });
      } catch (itemErr) {
        logger.error(`tebraSync: error building doc for payment=${payment.tebra_payment_id}`, { error: itemErr.message });
      }
    }

    // STEP 5 — bulkWrite
    const bulkOps = unifiedDocs.map((doc) => ({
      updateOne: {
        filter: { tebra_payment_id: doc.tebra_payment_id },
        update: {
          $set: doc,
          $setOnInsert: { split_status: 'unsplit', provider_amount: 0, platform_amount: 0 },
        },
        upsert: true,
      },
    }));

    const bulkResult = await Payment.bulkWrite(bulkOps, { ordered: false });

    const readyToSplit = unifiedDocs.filter((d) => d.charge_matched && d.provider_matched && d.stripe_account_id).length;

    logger.info(
      `tebraSync: ✅ DONE — ${unifiedDocs.length} processed, ` +
      `${bulkResult.upsertedCount} new, ${bulkResult.modifiedCount} updated, ` +
      `${chargeMatchCount} charge-matched, ${providerMatchCount} provider-matched, ` +
      `${readyToSplit} ready to split`
    );

  } catch (err) {
    logger.error('tebraSync: ❌ SYNC FAILED', { error: err.message });
  }
};

module.exports = { runSync };

// Run immediately on startup
runSync().catch(logger.error);

// Schedule every 2 minutes
cron.schedule('*/2 * * * *', () => { runSync().catch(logger.error); });
