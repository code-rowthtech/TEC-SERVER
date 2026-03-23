'use strict';

const stripe = require('../config/stripe');
const WebhookLog = require('../models/WebhookLog');
const { success, error } = require('../utils/apiResponse');
const logger = require('../utils/logger');

const handlePaymentSuccess = require('../webhooks/paymentSuccess.handler');
const handlePaymentFailed = require('../webhooks/paymentFailed.handler');
const handleDispute = require('../webhooks/dispute.handler');
const handlePayout = require('../webhooks/payout.handler');
const handleAccount = require('../webhooks/account.handler');

const handleWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.error('Webhook signature verification failed', { error: err.message });
    return error(res, `Webhook Error: ${err.message}`, 400);
  }

  // Idempotency check
  const existing = await WebhookLog.findOne({ stripe_event_id: event.id });
  if (existing && existing.processed) {
    logger.info('Duplicate webhook event — skipping', { eventId: event.id });
    return success(res, {}, 'Already processed');
  }

  // Log the event
  let webhookLog;
  try {
    webhookLog = await WebhookLog.findOneAndUpdate(
      { stripe_event_id: event.id },
      { stripe_event_id: event.id, event_type: event.type, payload: event.data.object },
      { upsert: true, new: true }
    );
  } catch (err) {
    logger.error('Failed to log webhook event', { error: err.message });
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSuccess(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
      case 'charge.dispute.created':
      case 'charge.dispute.updated':
        await handleDispute(event.data.object);
        break;
      case 'payout.paid':
      case 'payout.failed':
        await handlePayout(event.data.object, event.type);
        break;
      case 'account.updated':
        await handleAccount(event.data.object);
        break;
      default:
        logger.info('Unhandled webhook event type', { type: event.type });
    }

    if (webhookLog) {
      webhookLog.processed = true;
      await webhookLog.save();
    }

    return success(res, {}, 'Webhook processed');
  } catch (err) {
    logger.error('Webhook handler error', { eventType: event.type, error: err.message });

    if (webhookLog) {
      webhookLog.error = err.message;
      await webhookLog.save();
    }

    return error(res, 'Webhook processing failed', 500, err.message);
  }
};

module.exports = { handleWebhook };
