'use strict';

const soap = require('soap');
const logger = require('../utils/logger');

const WSDL_URL = 'https://webservice.kareo.com/services/soap/2.1/KareoServices.svc?singleWsdl';
const TEBRA_CUSTOMER_KEY  = process.env.TEBRA_CUSTOMER_KEY  || '';
const TEBRA_USER          = process.env.TEBRA_USER          || '';
const TEBRA_PASSWORD      = process.env.TEBRA_PASSWORD      || '';
const TEBRA_PRACTICE_NAME = process.env.TEBRA_PRACTICE_NAME || '';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let clientCache = null;

const getClient = async () => {
  if (!clientCache) clientCache = await soap.createClientAsync(WSDL_URL);
  return clientCache;
};

const requestHeader = () => ({
  CustomerKey: TEBRA_CUSTOMER_KEY,
  Password:    TEBRA_PASSWORD,
  User:        TEBRA_USER,
});

const callWithRetry = async (client, method, args, retries = 3) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const [result] = await client[`${method}Async`](args);
      return result;
    } catch (err) {
      if (err?.response?.status === 429 && attempt < retries) {
        await sleep(attempt * 1000);
        continue;
      }
      throw err;
    }
  }
};

const toArray = (val) => {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
};

const getCharges = async (fromDate) => {
  const from = new Date(fromDate).toISOString().split('T')[0];
  try {
    await sleep(500);
    const client = await getClient();
    const result = await callWithRetry(client, 'GetCharges', {
      request: {
        RequestHeader: requestHeader(),
        Fields: {
          ChargeFields: {
            ID: true, EncounterID: true, PatientID: true, PatientName: true,
            AppointmentID: true, RenderingProviderID: true, RenderingProviderName: true,
            SchedulingProviderID: true, ServiceStartDate: true, ServiceEndDate: true,
            PostingDate: true, TotalCharges: true, Receipts: true, PatientBalance: true,
            InsuranceBalance: true, TotalBalance: true, Status: true,
            PracticeID: true, PracticeName: true,
          },
        },
        Filter: { PracticeName: TEBRA_PRACTICE_NAME, FromPostDate: from, Status: 'Completed' },
      },
    });

    if (result?.GetChargesResult?.ErrorResponse?.IsError === true) {
      logger.error('tebraService: getCharges Tebra error', result.GetChargesResult.ErrorResponse);
    }

    const raw = toArray(result?.GetChargesResult?.Charges?.ChargeData);
    const mapped = raw
      .filter((c) => c?.ID && String(c?.Status) === 'Completed')
      .map((c) => ({
        tebra_charge_id:         String(c.ID),
        encounter_id:            c.EncounterID           ? String(c.EncounterID)           : '',
        appointment_id:          c.AppointmentID         ? String(c.AppointmentID)         : '',
        patient_id:              c.PatientID             ? String(c.PatientID)             : '',
        patient_name:            c.PatientName           || '',
        rendering_provider_id:   c.RenderingProviderID   ? String(c.RenderingProviderID)   : '',
        rendering_provider_name: c.RenderingProviderName || '',
        scheduling_provider_id:  c.SchedulingProviderID  ? String(c.SchedulingProviderID)  : '',
        service_start_date:      c.ServiceStartDate      || null,
        service_end_date:        c.ServiceEndDate        || null,
        posting_date:            c.PostingDate           || null,
        total_charges:           parseFloat(c.TotalCharges)   || 0,
        receipts:                parseFloat(c.Receipts)       || 0,
        patient_balance:         parseFloat(c.PatientBalance) || 0,
        total_balance:           parseFloat(c.TotalBalance)   || 0,
        status:                  c.Status || '',
      }));

    console.log('[tebraService] CHARGES:', JSON.stringify(mapped, null, 2));
    return mapped;
  } catch (err) {
    logger.error('tebraService: getCharges FAILED', { error: err.message });
    throw err;
  }
};

const getPayments = async (fromDate) => {
  const from = new Date(fromDate).toISOString().split('T')[0];
  try {
    await sleep(1000);
    const client = await getClient();
    const result = await callWithRetry(client, 'GetPayments', {
      request: {
        RequestHeader: requestHeader(),
        Fields: {
          PaymentFields: {
            ID: true, AppointmentID: true, PayerType: true, PayerName: true,
            PaymentMethod: true, Amount: true, Applied: true, Unapplied: true,
            Adjustments: true, Refunds: true, PostDate: true,
            BatchNumber: true, ReferenceNumber: true, CreatedDate: true,
          },
        },
        Filter: { PracticeName: TEBRA_PRACTICE_NAME, FromCreatedDate: from },
      },
    });

    if (result?.GetPaymentsResult?.ErrorResponse?.IsError === true) {
      logger.error('tebraService: getPayments Tebra error', result.GetPaymentsResult.ErrorResponse);
    }

    const raw = toArray(result?.GetPaymentsResult?.Payments?.PaymentData);
    const mapped = raw
      .filter((p) => !!p?.ID)
      .map((p) => ({
        tebra_payment_id: String(p.ID),
        appointment_id:   p.AppointmentID   ? String(p.AppointmentID) : '',
        payer_type:       p.PayerType       || '',
        payer_name:       p.PayerName       || '',
        payment_method:   p.PaymentMethod   || '',
        amount:           parseFloat(p.Amount)    || 0,
        applied:          parseFloat(p.Applied)   || 0,
        unapplied:        parseFloat(p.Unapplied) || 0,
        post_date:        p.PostDate        || null,
        reference_number: p.ReferenceNumber || '',
        created_date:     p.CreatedDate     || null,
      }));

    console.log('[tebraService] PAYMENTS:', JSON.stringify(mapped, null, 2));
    return mapped;
  } catch (err) {
    logger.error('tebraService: getPayments FAILED', { error: err.message });
    throw err;
  }
};

const getAppointments = async (fromDate) => {
  const from = new Date(fromDate).toISOString().split('T')[0];
  try {
    await sleep(1000);
    const client = await getClient();
    const result = await callWithRetry(client, 'GetAppointments', {
      request: {
        RequestHeader: requestHeader(),
        Fields: {
          AppointmentFields: {
            ID: true, PatientID: true, PatientFullName: true, StartDate: true,
            EndDate: true, ConfirmationStatus: true, PracticeID: true, ResourceName1: true,
          },
        },
        Filter: { PracticeName: TEBRA_PRACTICE_NAME, StartDate: from, ConfirmationStatus: 'Check-out' },
      },
    });

    if (result?.GetAppointmentsResult?.ErrorResponse?.IsError === true) {
      logger.error('tebraService: getAppointments Tebra error', result.GetAppointmentsResult.ErrorResponse);
    }

    const raw = toArray(result?.GetAppointmentsResult?.Appointments?.AppointmentData);
    const mapped = raw
      .filter((a) => !!a?.ID)
      .map((a) => ({
        tebra_appointment_id: String(a.ID),
        patient_id:           a.PatientID          ? String(a.PatientID) : '',
        patient_name:         a.PatientFullName     || '',
        start_date:           a.StartDate           || null,
        end_date:             a.EndDate             || null,
        confirmation_status:  a.ConfirmationStatus  || '',
        resource_name:        a.ResourceName1       || '',
        practice_id:          a.PracticeID          ? String(a.PracticeID) : '',
      }));

    console.log('[tebraService] APPOINTMENTS:', JSON.stringify(mapped, null, 2));
    return mapped;
  } catch (err) {
    logger.error('tebraService: getAppointments FAILED', { error: err.message });
    throw err;
  }
};

module.exports = { getCharges, getPayments, getAppointments };
