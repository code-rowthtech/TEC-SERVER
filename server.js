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
const { startStripeSyncJob } = require('./src/jobs/stripeSync.job');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(morgan('dev'));
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(generalLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/providers', providerRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use(errorHandler);

const start = async () => {
  await connectDB();

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
