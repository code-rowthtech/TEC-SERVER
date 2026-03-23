'use strict';

const stripe = require('../config/stripe');
const { sanitizeForStripe } = require('../middleware/phiSanitizer.middleware');
const logger = require('../utils/logger');

const createConnectAccount = async (providerEmail, providerName) => {
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

const getAccountStatus = async (stripeAccountId) => {
  const account = await stripe.accounts.retrieve(stripeAccountId);
  return {
    charges_enabled: account.charges_enabled,
    payouts_enabled: account.payouts_enabled,
    details_submitted: account.details_submitted,
    requirements: account.requirements,
  };
};

const deleteConnectAccount = async (stripeAccountId) => {
  const result = await stripe.accounts.del(stripeAccountId);
  logger.info('Stripe Connect account deleted', { accountId: stripeAccountId });
  return result;
};

module.exports = {
  createConnectAccount,
  generateOnboardingLink,
  getAccountStatus,
  deleteConnectAccount,
};
