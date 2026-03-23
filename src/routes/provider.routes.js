'use strict';

const { Router } = require('express');
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth.middleware');
const { roleCheck } = require('../middleware/role.middleware');
const {
  getProviders,
  getProvider,
  onboardProvider,
  getOnboardingStatus,
  updateProvider,
  updateSplit,
  deleteProvider,
} = require('../controllers/provider.controller');

const router = Router();

router.use(authenticate, roleCheck('admin'));

router.get('/', getProviders);
router.get('/:id', getProvider);
router.get('/:id/onboarding-status', getOnboardingStatus);

router.post(
  '/onboard',
  [
    body('tebra_provider_id').notEmpty(),
    body('npi').notEmpty(),
    body('name').notEmpty(),
    body('email').isEmail().normalizeEmail(),
  ],
  onboardProvider
);

router.patch(
  '/:id',
  [
    body('name').optional().notEmpty(),
    body('email').optional().isEmail().normalizeEmail(),
    body('npi').optional().isLength({ min: 10, max: 10 }),
    body('tebra_provider_id').optional().notEmpty(),
    body('split_percentage').optional().isFloat({ min: 0, max: 100 }),
  ],
  updateProvider
);

router.patch(
  '/:id/split',
  [body('split_percentage').isFloat({ min: 0, max: 100 })],
  updateSplit
);

router.delete('/:id', deleteProvider);

module.exports = router;
