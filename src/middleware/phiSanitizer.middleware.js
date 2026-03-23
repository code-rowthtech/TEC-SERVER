'use strict';

const PHI_BLOCKLIST = [
  'patient_name',
  'dob',
  'date_of_birth',
  'ssn',
  'social_security',
  'mrn',
  'medical_record',
  'diagnosis',
  'icd',
  'insurance_id',
  'member_id',
];

/**
 * Recursively scans an object for PHI keys.
 * Throws an error if any blocklisted key is found.
 * @param {object} obj
 * @param {string} [path]
 */
const sanitizeForStripe = (obj, path = '') => {
  if (!obj || typeof obj !== 'object') return;

  for (const key of Object.keys(obj)) {
    const normalizedKey = key.toLowerCase();
    if (PHI_BLOCKLIST.includes(normalizedKey)) {
      throw new Error(
        `PHI field detected: "${key}" at path "${path || 'root'}" — cannot send to Stripe`
      );
    }
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitizeForStripe(obj[key], path ? `${path}.${key}` : key);
    }
  }
};

module.exports = { sanitizeForStripe };
