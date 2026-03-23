'use strict';

const { validationResult } = require('express-validator');
const Provider = require('../models/Provider');
const Transaction = require('../models/Transaction');
const stripeService = require('../services/stripeService');
const { success, error } = require('../utils/apiResponse');
const logger = require('../utils/logger');
const { ONBOARDING_STATUS } = require('../utils/constants');

const getProviders = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const [providers, total] = await Promise.all([
      Provider.find().skip(skip).limit(limit).sort({ createdAt: -1 }),
      Provider.countDocuments(),
    ]);

    return success(res, { providers, total, page, limit });
  } catch (err) {
    logger.error('getProviders error', { error: err.message });
    return error(res, 'Failed to fetch providers', 500, err.message);
  }
};

const getProvider = async (req, res) => {
  try {
    const provider = await Provider.findById(req.params.id);
    if (!provider) return error(res, 'Provider not found', 404);

    const transactions = await Transaction.find({ provider_id: provider._id })
      .sort({ createdAt: -1 })
      .limit(50);

    return success(res, { provider, transactions });
  } catch (err) {
    logger.error('getProvider error', { error: err.message });
    return error(res, 'Failed to fetch provider', 500, err.message);
  }
};

const onboardProvider = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return error(res, 'Validation failed', 422, errors.array());
  }

  const { tebra_provider_id, npi, name, email } = req.body;

  try {
    const existing = await Provider.findOne({ $or: [{ tebra_provider_id }, { npi }] });
    if (existing) {
      return error(res, 'Provider with this tebra_provider_id or NPI already exists', 409);
    }

    const stripeAccount = await stripeService.createConnectAccount(email, name);

    const provider = await Provider.create({
      tebra_provider_id,
      npi,
      name,
      email,
      stripe_account_id: stripeAccount.id,
      onboarding_status: ONBOARDING_STATUS.IN_PROGRESS,
    });

    const baseUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const onboardingLink = await stripeService.generateOnboardingLink(
      stripeAccount.id,
      `${baseUrl}/onboarding/return`,
      `${baseUrl}/onboarding/refresh`
    );

    provider.onboarding_url = onboardingLink.url;
    await provider.save();

    logger.info('Provider onboarded', { providerId: provider._id, stripeAccountId: stripeAccount.id });

    return success(res, { provider, onboarding_url: onboardingLink.url }, 'Provider created', 201);
  } catch (err) {
    logger.error('onboardProvider error', { error: err.message });
    return error(res, 'Failed to onboard provider', 500, err.message);
  }
};

const getOnboardingStatus = async (req, res) => {
  try {
    const provider = await Provider.findById(req.params.id);
    if (!provider) return error(res, 'Provider not found', 404);
    if (!provider.stripe_account_id) return error(res, 'Provider has no Stripe account', 400);

    const status = await stripeService.getAccountStatus(provider.stripe_account_id);

    if (status.charges_enabled) {
      provider.onboarding_status = ONBOARDING_STATUS.COMPLETE;
    } else {
      provider.onboarding_status = ONBOARDING_STATUS.IN_PROGRESS;
    }
    await provider.save();

    return success(res, { provider, stripe_status: status });
  } catch (err) {
    logger.error('getOnboardingStatus error', { error: err.message });
    return error(res, 'Failed to get onboarding status', 500, err.message);
  }
};

const deleteProvider = async (req, res) => {
  try {
    const provider = await Provider.findById(req.params.id);
    if (!provider) return error(res, 'Provider not found', 404);

    if (provider.stripe_account_id) {
      try {
        await stripeService.deleteConnectAccount(provider.stripe_account_id);
      } catch (stripeErr) {
        // If Stripe account doesn't exist, continue with DB deletion
        if (stripeErr?.raw?.code !== 'account_invalid' && stripeErr?.statusCode !== 404) {
          logger.error('Stripe account deletion failed', { error: stripeErr.message, stripeAccountId: provider.stripe_account_id });
          return error(res, 'Failed to delete Stripe account: ' + stripeErr.message, 500);
        }
        logger.warn('Stripe account not found, proceeding with DB deletion', { stripeAccountId: provider.stripe_account_id });
      }
    }

    await Provider.findByIdAndDelete(req.params.id);
    logger.info('Provider deleted', { providerId: req.params.id });
    return success(res, { deleted: true }, 'Provider deleted');
  } catch (err) {
    logger.error('deleteProvider error', { error: err.message });
    return error(res, 'Failed to delete provider', 500, err.message);
  }
};

const updateProvider = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return error(res, 'Validation failed', 422, errors.array());

  try {
    const provider = await Provider.findById(req.params.id);
    if (!provider) return error(res, 'Provider not found', 404);

    const { name, email, npi, tebra_provider_id, split_percentage } = req.body;
    if (name !== undefined) provider.name = name;
    if (email !== undefined) provider.email = email;
    if (npi !== undefined) provider.npi = npi;
    if (tebra_provider_id !== undefined) provider.tebra_provider_id = tebra_provider_id;
    if (split_percentage !== undefined) provider.split_percentage = split_percentage;
    await provider.save();

    logger.info('Provider updated', { providerId: provider._id });
    return success(res, { provider }, 'Provider updated');
  } catch (err) {
    logger.error('updateProvider error', { error: err.message });
    return error(res, 'Failed to update provider', 500, err.message);
  }
};

const updateSplit = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return error(res, 'Validation failed', 422, errors.array());
  }

  try {
    const provider = await Provider.findById(req.params.id);
    if (!provider) return error(res, 'Provider not found', 404);

    provider.split_percentage = req.body.split_percentage;
    await provider.save();

    logger.info('Provider split updated', { providerId: provider._id, split: provider.split_percentage });

    return success(res, { provider }, 'Split percentage updated');
  } catch (err) {
    logger.error('updateSplit error', { error: err.message });
    return error(res, 'Failed to update split', 500, err.message);
  }
};

module.exports = { getProviders, getProvider, onboardProvider, getOnboardingStatus, updateProvider, updateSplit, deleteProvider };
