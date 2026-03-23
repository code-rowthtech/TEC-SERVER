'use strict';

/**
 * Calculates the provider/platform split for a given amount.
 * Uses Math.floor for provider to avoid fractional cents.
 * Platform receives the remainder.
 *
 * @param {number} totalAmountCents - Total charge in cents (integer)
 * @param {number} splitPercentage - Provider's percentage (e.g. 64)
 * @returns {{ providerAmount: number, platformAmount: number }}
 */
const calculateSplit = (totalAmountCents, splitPercentage) => {
  if (!Number.isInteger(totalAmountCents) || totalAmountCents <= 0) {
    throw new Error('totalAmountCents must be a positive integer');
  }
  if (splitPercentage < 0 || splitPercentage > 100) {
    throw new Error('splitPercentage must be between 0 and 100');
  }

  const providerAmount = Math.floor((totalAmountCents * splitPercentage) / 100);
  const platformAmount = totalAmountCents - providerAmount;

  return { providerAmount, platformAmount };
};

module.exports = { calculateSplit };
