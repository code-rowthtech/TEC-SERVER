'use strict';

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const { success, error } = require('../utils/apiResponse');
const logger = require('../utils/logger');

const SALT_ROUNDS = 12;

const register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return error(res, 'Validation failed', 422, errors.array());
  }

  const { email, password, role = 'admin' } = req.body;

  try {
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return error(res, 'Email already registered', 409);
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({ email: email.toLowerCase(), password_hash, role });

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    logger.info('User registered', { userId: user._id, role: user.role });

    return success(res, { token, user: { id: user._id, email: user.email, role: user.role } }, 'User registered', 201);
  } catch (err) {
    logger.error('register error', { error: err.message });
    return error(res, 'Registration failed', 500, err.message);
  }
};

const login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return error(res, 'Validation failed', 422, errors.array());
  }

  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return error(res, 'Invalid credentials', 401);
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return error(res, 'Invalid credentials', 401);
    }

    user.last_login = new Date();
    await user.save();

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    logger.info('User logged in', { userId: user._id });

    return success(res, { token, user: { id: user._id, email: user.email, role: user.role } }, 'Login successful');
  } catch (err) {
    logger.error('login error', { error: err.message });
    return error(res, 'Login failed', 500, err.message);
  }
};

module.exports = { register, login };
