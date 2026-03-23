'use strict';

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const mongoose = require('mongoose');

const logger = require('./src/utils/logger');
const morgan = require('morgan');
const { errorHandler } = require('./src/utils/errorHandler');
const { generalLimiter } = require('./src/middleware/rateLimiter.middleware');
const connectDB = require('./src/config/db');

const authRoutes = require('./src/routes/auth.routes');
const providerRoutes = require('./src/routes/provider.routes');
const paymentRoutes = require('./src/routes/payment.routes');
const webhookRoutes = require('./src/routes/webhook.routes');
const payoutRoutes = require('./src/routes/payout.routes');
const reconciliationRoutes = require('./src/routes/reconciliation.routes');

// const { startTebraSyncJob } = require('./src/jobs/tebraSync.job');
// const { startPaymentProcessorJob } = require('./src/jobs/paymentProcessor.job');
const { startStripeSyncJob } = require('./src/jobs/stripeSync.job');

const app = express();
const PORT = process.env.PORT || 3000;

// HTTP request logging
app.use(morgan('dev'));

// Security headers
app.use(helmet());

// CORS
app.use(cors());

// Raw body for Stripe webhook — must come before express.json
app.use('/api/webhook', express.raw({ type: 'application/json' }));

// JSON body parser for all other routes
app.use(express.json());

// General rate limiter
app.use(generalLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/payouts', payoutRoutes);
app.use('/api/reconciliation', reconciliationRoutes);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Global error handler
app.use(errorHandler);

// Boot
const start = async () => {
  await connectDB();

  // startTebraSyncJob();
  // startPaymentProcessorJob();
  startStripeSyncJob();

  const server = app.listen(PORT, () => {
    logger.info(`tec-payments running on port ${PORT} [${process.env.NODE_ENV}]`);
  });

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received — shutting down gracefully');
    server.close(async () => {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed');
      process.exit(0);
    });
  });
};

start().catch((err) => {
  logger.error('Failed to start server', { error: err.message });
  process.exit(1);
});

