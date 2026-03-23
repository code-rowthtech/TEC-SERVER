'use strict';

const stripe = require('../config/stripe');
const { sanitizeForStripe } = require('../middleware/phiSanitizer.middleware');
const logger = require('../utils/logger');
const { INSTANT_PAYOUT_FEE_CENTS } = require('../utils/constants');

/**
 * Creates a Stripe Express Connect account for a provider.
 */
const  createConnectAccount = async (providerEmail, providerName) => {
  const payload = { email: providerEmail, business_profile: { name: providerName } };
  sanitizeForStripe(payload);
  const account = await stripe.accounts.create({
    type: 'express',
    email: providerEmail,
    business_profile: { name: providerName },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  });

  logger.info('Stripe Connect account created', { accountId: account.id, email: providerEmail });
  return account;
};

/**
 * Generates an onboarding link for a Stripe Connect account.
 */
const generateOnboardingLink = async (stripeAccountId, returnUrl, refreshUrl) => {
  const payload = { account: stripeAccountId, return_url: returnUrl, refresh_url: refreshUrl };
  sanitizeForStripe(payload);

  const accountLink = await stripe.accountLinks.create({
    account: stripeAccountId,
    return_url: returnUrl,
    refresh_url: refreshUrl,
    type: 'account_onboarding',
  });

  logger.info('Stripe onboarding link generated', { accountId: stripeAccountId });
  return accountLink;
};

/**
 * Creates a destination charge with a transfer to the provider's Connect account.
 */
const createDestinationCharge = async (
  amount,
  paymentMethodId,
  providerStripeAccountId,
  providerAmount,
  metadata = {}
) => {
  sanitizeForStripe(metadata);

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: 'usd',
    payment_method: paymentMethodId,
    confirm: true,
    transfer_data: {
      destination: providerStripeAccountId,
      amount: providerAmount,
    },
    metadata,
    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
  });

  logger.info('Destination charge created', {
    paymentIntentId: paymentIntent.id,
    amount,
    providerAmount,
    destination: providerStripeAccountId,
  }); 

  return paymentIntent;
};

/**
 * Triggers an instant payout on a provider's Connect account.
 * Returns the payout object and the fee applied.
 */
const createInstantPayout = async (stripeAccountId, amount) => {
  const fee = INSTANT_PAYOUT_FEE_CENTS;
  const netAmount = amount - fee;

  if (netAmount <= 0) {
    throw new Error('Payout amount is too small to cover the instant payout fee');
  }

  const payload = { amount: netAmount, currency: 'usd', method: 'instant' };``
  sanitizeForStripe(payload);

  const payout = await stripe.payouts.create(
    { amount: netAmount, currency: 'usd', method: 'instant' },
    { stripeAccount: stripeAccountId }
  );

  logger.info('Instant payout created', {
    payoutId: payout.id,
    stripeAccountId,
    amount: netAmount,
    fee,
  });

  return { payout, fee };
};

/**
 * Retrieves the onboarding/capability status of a Connect account.
 */
const getAccountStatus = async (stripeAccountId) => {
  const account = await stripe.accounts.retrieve(stripeAccountId);

  return {
    charges_enabled: account.charges_enabled,
    payouts_enabled: account.payouts_enabled,
    details_submitted: account.details_submitted,
    requirements: account.requirements,
  };
};

/**
 * Deletes a Stripe Connect account.
 */
const deleteConnectAccount = async (stripeAccountId) => {
  const result = await stripe.accounts.del(stripeAccountId);
  logger.info('Stripe Connect account deleted', { accountId: stripeAccountId });
  return result;
};

module.exports = {
  createConnectAccount,
  generateOnboardingLink,
  createDestinationCharge,
  createInstantPayout,
  getAccountStatus,
  deleteConnectAccount,
};
