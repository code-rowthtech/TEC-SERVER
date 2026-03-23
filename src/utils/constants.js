'use strict';

const ONBOARDING_STATUS = Object.freeze({
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETE: 'complete',
  SUSPENDED: 'suspended',
});

const TRANSACTION_STATUS = Object.freeze({
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  DISPUTED: 'disputed',
});

const TRANSACTION_TYPE = Object.freeze({
  POS: 'POS',
  TEBRA_SYNC: 'TEBRA_SYNC',
});

const PAYOUT_STATUS = Object.freeze({
  PENDING: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
});

const PAYOUT_TYPE = Object.freeze({
  STANDARD: 'standard',
  INSTANT: 'instant',
});

const DISPUTE_STATUS = Object.freeze({
  OPEN: 'open',
  WON: 'won',
  LOST: 'lost',
});

const USER_ROLES = Object.freeze({
  ADMIN: 'admin',
  PROVIDER: 'provider',
});

const SYNC_STATUS = Object.freeze({
  SUCCESS: 'success',
  FAILED: 'failed',
});

// Instant payout fee in cents (e.g. 100 = $1.00)
const INSTANT_PAYOUT_FEE_CENTS = 100;

module.exports = {
  ONBOARDING_STATUS,
  TRANSACTION_STATUS,
  TRANSACTION_TYPE,
  PAYOUT_STATUS,
  PAYOUT_TYPE,
  DISPUTE_STATUS,
  USER_ROLES,
  SYNC_STATUS,
  INSTANT_PAYOUT_FEE_CENTS,
};
