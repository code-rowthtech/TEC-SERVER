'use strict';

const cron = require('node-cron');
const { getProviders, getCharges, getPayments, getAppointments } = require('../services/tebraService');
const mockData = require('../mock/tebraMockData.json');
const Payment = require('../models/Payment');
const Provider = require('../models/Provider');
const logger = require('../utils/logger');

const USE_MOCK = process.env.USE_MOCK_TEBRA === 'true';

const runSync = async () => {
  logger.info('tebraSync: starting sync');

  try {
    // STEP 1 — Calculate fromDate
    const latest = await Payment.findOne({}, { last_synced_at: 1 }).sort({ last_synced_at: -1 }).lean();
    let fromDate;
    if (latest?.last_synced_at) {
      fromDate = new Date(latest.last_synced_at.getTime() - 60 * 60 * 1000); // minus 1 hour
    } else {
      fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    }
    logger.info(`tebraSync: fromDate = ${fromDate.toISOString()}`);

    // STEP 2 — Fetch all 4 APIs in parallel (or use mock data)
    let providers, charges, payments, appointments;
    if (USE_MOCK) {
      logger.info('tebraSync: using mock Tebra data (USE_MOCK_TEBRA=true)');
      ({ providers, charges, payments, appointments } = mockData);
    } else {
      [providers, charges, payments, appointments] = await Promise.all([
        getProviders(),
        getCharges(fromDate),
        getPayments(fromDate),
        getAppointments(fromDate),
      ]);
    }
    logger.info(`tebraSync: fetched ${providers.length} providers, ${charges.length} charges, ${payments.length} payments, ${appointments.length} appointments`);

    if (payments.length === 0) {
      logger.info('tebraSync: no payments to process, exiting');
      return;
    }

    // STEP 3 — Build in-memory lookup Maps
    const providerMap = new Map(providers.map((p) => [p.tebra_provider_id, p]));
    const chargeMap   = new Map(charges.map((c) => [c.appointment_id, c]));
    const appointmentMap = new Map(appointments.map((a) => [a.tebra_appointment_id, a]));

    // STEP 4 — Build unified docs
    const now = new Date();
    const unifiedDocs = [];
    let chargeMatchCount = 0;
    let providerMatchCount = 0;

    for (const payment of payments) {
      try {
        const charge      = chargeMap.get(payment.appointment_id) || null;
        const appointment = appointmentMap.get(payment.appointment_id) || null;

        let provider = charge ? providerMap.get(charge.rendering_provider_id) || null : null;

        // fallback: DB lookup if not in memory (provider added after last getProviders call)
        if (!provider && charge?.rendering_provider_id) {
          provider = await Provider.findOne({ tebra_provider_id: charge.rendering_provider_id }).lean();
        }

        if (!charge) {
          logger.warn(`tebraSync: no charge matched for appointment_id=${payment.appointment_id} (payment=${payment.tebra_payment_id})`);
        }
        if (charge && !provider?.stripe_account_id) {
          logger.warn(`tebraSync: provider not matched/onboarded for rendering_provider_id=${charge.rendering_provider_id} (payment=${payment.tebra_payment_id})`);
        }

        const chargeMatched   = !!charge;
        const providerMatched = !!(provider?.stripe_account_id);
        if (chargeMatched) chargeMatchCount++;
        if (providerMatched) providerMatchCount++;

        unifiedDocs.push({
          tebra_payment_id:         payment.tebra_payment_id,
          tebra_charge_id:          charge?.tebra_charge_id || null,
          tebra_appointment_id:     payment.appointment_id,

          payer_type:               payment.payer_type,
          payer_name:               payment.payer_name,
          payment_method:           payment.payment_method,
          amount:                   payment.amount,
          applied:                  payment.applied,
          unapplied:                payment.unapplied,
          post_date:                payment.post_date ? new Date(payment.post_date) : null,
          reference_number:         payment.reference_number,
          tebra_payment_created_at: payment.created_date ? new Date(payment.created_date) : null,

          encounter_id:             charge?.encounter_id || null,
          total_charges:            charge?.total_charges || 0,
          receipts:                 charge?.receipts || 0,
          patient_balance:          charge?.patient_balance || 0,
          total_balance:            charge?.total_balance || 0,
          charge_status:            charge?.status || null,
          service_start_date:       charge?.service_start_date ? new Date(charge.service_start_date) : null,
          service_end_date:         charge?.service_end_date ? new Date(charge.service_end_date) : null,
          posting_date:             charge?.posting_date ? new Date(charge.posting_date) : null,

          patient_id:               charge?.patient_id || null,
          patient_name:             charge?.patient_name || null,

          tebra_provider_id:        charge?.rendering_provider_id || null,
          provider_name:            charge?.rendering_provider_name || provider?.name || null,
          provider_npi:             provider?.npi || null,
          stripe_account_id:        provider?.stripe_account_id || null,

          appointment_start_date:   appointment?.start_date ? new Date(appointment.start_date) : null,
          appointment_status:       appointment?.confirmation_status || null,
          resource_name:            appointment?.resource_name || null,

          charge_matched:           chargeMatched,
          provider_matched:         providerMatched,
          appointment_matched:      !!appointment,
          last_synced_at:           now,
        });
      } catch (itemErr) {
        logger.error(`tebraSync: error building doc for payment=${payment.tebra_payment_id}`, { error: itemErr.message });
      }
    }

    // STEP 5 — bulkWrite upsert (never overwrite split fields on existing docs)
    const bulkOps = unifiedDocs.map((doc) => {
      const { ...syncFields } = doc;
      return {
        updateOne: {
          filter: { tebra_payment_id: doc.tebra_payment_id },
          update: {
            $set: syncFields,
            $setOnInsert: {
              split_status:    'unsplit',
              provider_amount: 0,
              platform_amount: 0,
            },
          },
          upsert: true,
        },
      };
    });

    const bulkResult = await Payment.bulkWrite(bulkOps, { ordered: false });

    // STEP 6 — Summary
    const readyToSplit = unifiedDocs.filter(
      (d) => d.charge_matched && d.provider_matched && d.stripe_account_id
    ).length;

    logger.info(
      `tebraSync complete: ${unifiedDocs.length} payments processed, ` +
      `${bulkResult.upsertedCount} new, ${bulkResult.modifiedCount} updated, ` +
      `${chargeMatchCount} charge-matched, ${providerMatchCount} provider-matched, ` +
      `${readyToSplit} ready to split`
    );
  } catch (err) {
    // STEP 7 — Top-level error handler — never crash the process
    logger.error('tebraSync: sync failed', { error: err.message, stack: err.stack });
  }
};

module.exports = { runSync };

// Run immediately on startup
runSync().catch(logger.error);

// Schedule every 15 minutes
cron.schedule('*/15 * * * *', () => { runSync().catch(logger.error); });
