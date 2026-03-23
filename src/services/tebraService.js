'use strict';

const soap = require('soap');
const logger = require('../utils/logger');

const WSDL_URL = 'https://webservice.kareo.com/services/soap/2.1/KareoServices.svc?singleWsdl';
const TEBRA_CUSTOMER_KEY = process.env.TEBRA_CUSTOMER_KEY || '';
const TEBRA_USER = process.env.TEBRA_USER || '';
const TEBRA_PASSWORD = process.env.TEBRA_PASSWORD || '';
const TEBRA_PRACTICE_NAME = process.env.TEBRA_PRACTICE_NAME || '';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let clientCache = null;

const getClient = async () => {
  if (!clientCache) clientCache = await soap.createClientAsync(WSDL_URL);
  return clientCache;
};

const requestHeader = () => ({
  CustomerKey: TEBRA_CUSTOMER_KEY,
  User: TEBRA_USER,
  Password: TEBRA_PASSWORD,
});

const callWithRetry = async (client, method, args, retries = 3) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const [result] = await client[`${method}Async`](args);
      return result;
    } catch (err) {
      if (err?.response?.status === 429 && attempt < retries) {
        const delay = attempt * 1000;
        logger.warn(`Tebra rate limit hit on ${method}, retrying in ${delay}ms (attempt ${attempt}/${retries})`);
        await sleep(delay);
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

/**
 * Fetches active normal providers from Tebra.
 * @returns {Promise<Array<{
 *   tebra_provider_id: string,
 *   npi: string,
 *   name: string,
 *   firstName: string,
 *   lastName: string,
 *   specialtyName: string,
 *   active: boolean,
 *   practiceName: string
 * }>>}
 */
const getProviders = async () => {
  logger.info('tebraService.getProviders called');
  try {
    await sleep(500);
    const client = await getClient();

    const result = await callWithRetry(client, 'GetProviders', {
      request: {
        RequestHeader: requestHeader(),
        Fields: {
          ProviderFields: {
            ID: true,
            FullName: true,
            FirstName: true,
            LastName: true,
            NationalProviderIdentifier: true,
            SpecialtyName: true,
            Active: true,
            PracticeName: true,
          },
        },
        Filter: {
          PracticeName: TEBRA_PRACTICE_NAME,
          Type: 'Normal Provider',
        },
      },
    });

    return toArray(result?.GetProvidersResult?.Providers?.Provider)
      .filter((p) => p?.ID && String(p?.Active).toLowerCase() === 'true')
      .map((p) => ({
        tebra_provider_id: String(p.ID),
        npi: p.NationalProviderIdentifier || '',
        name: p.FullName || `${p.FirstName || ''} ${p.LastName || ''}`.trim(),
        firstName: p.FirstName || '',
        lastName: p.LastName || '',
        specialtyName: p.SpecialtyName || '',
        active: true,
        practiceName: p.PracticeName || '',
      }));
  } catch (err) {
    logger.error('tebraService.getProviders error', { error: err.message });
    throw err;
  }
};

/**
 * Fetches completed charges from Tebra since a given date.
 * This is the bridge between payments and rendering providers.
 * @param {Date|string} fromDate
 * @returns {Promise<Array<{
 *   tebra_charge_id: string,
 *   encounter_id: string,
 *   appointment_id: string,
 *   patient_id: string,
 *   patient_name: string,
 *   rendering_provider_id: string,
 *   rendering_provider_name: string,
 *   scheduling_provider_id: string,
 *   service_start_date: string,
 *   service_end_date: string,
 *   posting_date: string,
 *   total_charges: number,
 *   receipts: number,
 *   patient_balance: number,
 *   total_balance: number,
 *   status: string
 * }>>}
 */
const getCharges = async (fromDate) => {
  const from = new Date(fromDate).toISOString().split('T')[0];
  logger.info('tebraService.getCharges called', { fromDate: from });
  try {
    await sleep(500);
    const client = await getClient();

    const result = await callWithRetry(client, 'GetCharges', {
      request: {
        RequestHeader: requestHeader(),
        Fields: {
          ChargeFields: {
            ID: true,
            EncounterID: true,
            PatientID: true,
            PatientName: true,
            AppointmentID: true,
            RenderingProviderID: true,
            RenderingProviderName: true,
            SchedulingProviderID: true,
            ServiceStartDate: true,
            ServiceEndDate: true,
            PostingDate: true,
            TotalCharges: true,
            Receipts: true,
            PatientBalance: true,
            InsuranceBalance: true,
            TotalBalance: true,
            Status: true,
            PracticeID: true,
            PracticeName: true,
          },
        },
        Filter: {
          PracticeName: TEBRA_PRACTICE_NAME,
          FromPostDate: from,
          Status: 'Completed',
        },
      },
    });

    return toArray(result?.GetChargesResult?.Charges?.Charge)
      .filter((c) => c?.ID && String(c?.Status) === 'Completed')
      .map((c) => ({
        tebra_charge_id: String(c.ID),
        encounter_id: c.EncounterID ? String(c.EncounterID) : '',
        appointment_id: c.AppointmentID ? String(c.AppointmentID) : '',
        patient_id: c.PatientID ? String(c.PatientID) : '',
        patient_name: c.PatientName || '',
        rendering_provider_id: c.RenderingProviderID ? String(c.RenderingProviderID) : '',
        rendering_provider_name: c.RenderingProviderName || '',
        scheduling_provider_id: c.SchedulingProviderID ? String(c.SchedulingProviderID) : '',
        service_start_date: c.ServiceStartDate || null,
        service_end_date: c.ServiceEndDate || null,
        posting_date: c.PostingDate || null,
        total_charges: parseFloat(c.TotalCharges) || 0,
        receipts: parseFloat(c.Receipts) || 0,
        patient_balance: parseFloat(c.PatientBalance) || 0,
        total_balance: parseFloat(c.TotalBalance) || 0,
        status: c.Status || '',
      }));
  } catch (err) {
    logger.error('tebraService.getCharges error', { error: err.message });
    throw err;
  }
};

/**
 * Fetches payments from Tebra since a given date.
 * Links to provider via appointment_id → getCharges → rendering_provider_id.
 * @param {Date|string} fromDate
 * @returns {Promise<Array<{
 *   tebra_payment_id: string,
 *   appointment_id: string,
 *   payer_type: string,
 *   payer_name: string,
 *   payment_method: string,
 *   amount: number,
 *   applied: number,
 *   unapplied: number,
 *   post_date: string,
 *   reference_number: string,
 *   created_date: string
 * }>>}
 */
const getPayments = async (fromDate) => {
  const from = new Date(fromDate).toISOString().split('T')[0];
  logger.info('tebraService.getPayments called', { fromDate: from });
  try {
    await sleep(1000);
    const client = await getClient();

    const result = await callWithRetry(client, 'GetPayments', {
      request: {
        RequestHeader: requestHeader(),
        Fields: {
          PaymentFields: {
            ID: true,
            AppointmentID: true,
            PayerType: true,
            PayerName: true,
            PaymentMethod: true,
            Amount: true,
            Applied: true,
            Unapplied: true,
            Adjustments: true,
            Refunds: true,
            PostDate: true,
            BatchNumber: true,
            ReferenceNumber: true,
            CreatedDate: true,
          },
        },
        Filter: {
          PracticeName: TEBRA_PRACTICE_NAME,
          FromCreatedDate: from,
        },
      },
    });

    return toArray(result?.GetPaymentsResult?.Payments?.Payment)
      .filter((p) => p?.ID)
      .map((p) => ({
        tebra_payment_id: String(p.ID),
        appointment_id: p.AppointmentID ? String(p.AppointmentID) : '',
        payer_type: p.PayerType || '',
        payer_name: p.PayerName || '',
        payment_method: p.PaymentMethod || '',
        amount: parseFloat(p.Amount) || 0,
        applied: parseFloat(p.Applied) || 0,
        unapplied: parseFloat(p.Unapplied) || 0,
        post_date: p.PostDate || null,
        reference_number: p.ReferenceNumber || '',
        created_date: p.CreatedDate || null,
      }));
  } catch (err) {
    logger.error('tebraService.getPayments error', { error: err.message });
    throw err;
  }
};

/**
 * Fetches checked-out appointments from Tebra since a given date.
 * Provider is resolved via getCharges (RenderingProviderID), not directly here.
 * @param {Date|string} fromDate
 * @returns {Promise<Array<{
 *   tebra_appointment_id: string,
 *   patient_id: string,
 *   patient_name: string,
 *   start_date: string,
 *   end_date: string,
 *   confirmation_status: string,
 *   resource_name: string,
 *   practice_id: string
 * }>>}
 */
const getAppointments = async (fromDate) => {
  const from = new Date(fromDate).toISOString().split('T')[0];
  logger.info('tebraService.getAppointments called', { fromDate: from });
  try {
    await sleep(1000);
    const client = await getClient();

    const result = await callWithRetry(client, 'GetAppointments', {
      request: {
        RequestHeader: requestHeader(),
        Fields: {
          AppointmentFields: {
            ID: true,
            PatientID: true,
            PatientFullName: true,
            StartDate: true,
            EndDate: true,
            ConfirmationStatus: true,
            PracticeID: true,
            ResourceName1: true,
          },
        },
        Filter: {
          PracticeName: TEBRA_PRACTICE_NAME,
          StartDate: from,
          ConfirmationStatus: 'Check-out',
        },
      },
    });

    return toArray(result?.GetAppointmentsResult?.Appointments?.Appointment)
      .filter((a) => a?.ID)
      .map((a) => ({
        tebra_appointment_id: String(a.ID),
        patient_id: a.PatientID ? String(a.PatientID) : '',
        patient_name: a.PatientFullName || '',
        start_date: a.StartDate || null,
        end_date: a.EndDate || null,
        confirmation_status: a.ConfirmationStatus || '',
        resource_name: a.ResourceName1 || '',
        practice_id: a.PracticeID ? String(a.PracticeID) : '',
      }));
  } catch (err) {
    logger.error('tebraService.getAppointments error', { error: err.message });
    throw err;
  }
};

module.exports = { getProviders, getCharges, getPayments, getAppointments };
