'use strict';

const { error } = require('../utils/apiResponse');

const roleCheck = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return error(res, 'Forbidden: insufficient permissions', 403);
    }
    return next();
  };
};

module.exports = { roleCheck };
