'use strict';

const logger = require('../utils/logger');

const TEBRA_API_URL = process.env.TEBRA_API_URL || '';
const TEBRA_API_KEY = process.env.TEBRA_API_KEY || '';

const tebraHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${TEBRA_API_KEY}`,
});

/**
 * Fetches all providers from the Tebra API.
 * @returns {Promise<Array>}
 */
const getProviders = async () => {
  // Placeholder — real endpoint to be filled when Tebra API docs are available
  logger.info('tebraService.getProviders called (placeholder)');
  return [];
};

/**
 * Fetches payments from Tebra from a given date.
 * @param {Date|string} fromDate
 * @returns {Promise<Array>}
 */
const getPayments = async (fromDate) => {
  // Placeholder — real endpoint to be filled when Tebra API docs are available
  logger.info('tebraService.getPayments called (placeholder)', { fromDate });
  return [];
};

/**
 * Fetches appointments from Tebra from a given date.
 * @param {Date|string} fromDate
 * @returns {Promise<Array>}
 */
const getAppointments = async (fromDate) => {
  // Placeholder — real endpoint to be filled when Tebra API docs are available
  logger.info('tebraService.getAppointments called (placeholder)', { fromDate });
  return [];
};

module.exports = { getProviders, getPayments, getAppointments };
