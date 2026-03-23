'use strict';

const success = (res, data = {}, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    data,
    message,
    error: '',
  });
};

const error = (res, message = 'An error occurred', statusCode = 500, errorDetail = '') => {
  return res.status(statusCode).json({
    success: false,
    data: {},
    message,
    error: errorDetail || message,
  });
};

module.exports = { success, error };
