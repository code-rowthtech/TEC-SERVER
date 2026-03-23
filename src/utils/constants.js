'use strict';

const ONBOARDING_STATUS = Object.freeze({
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETE: 'complete',
  SUSPENDED: 'suspended',
});

const USER_ROLES = Object.freeze({
  ADMIN: 'admin',
  PROVIDER: 'provider',
});

module.exports = {
  ONBOARDING_STATUS,
  USER_ROLES,
};
