'use strict';

const { ConnectionOptions } = require('bullmq');

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const url = new URL(redisUrl);

/** @type {ConnectionOptions} */
const bullmqConnection = {
  host: url.hostname,
  port: parseInt(url.port, 10) || 6379,
  password: url.password || undefined,
};

module.exports = bullmqConnection;
