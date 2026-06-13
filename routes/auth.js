const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/User');
const Restaurant = require('../models/Restaurant');

// Helper to hash passwords using built-in crypto SHA256
const hashPassword = (password) => {
  return crypto.createHash('sha256').update(password).digest('hex');
};

// @route   POST /api/auth/login
// @desc    Authenticate user & return credentials
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const user = await User.findOne({ username: username.trim().toLowerCase() }).populate('restaurants');
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const hashed = hashPassword(password);
    if (user.password !== hashed) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    if (!user.approved && user.role !== 'admin') {
      return res.status(403).json({ error: 'Your account is pending admin approval.' });
    }

    res.json({
      _id: user._id,
      username: user.username,
      role: user.role,
      restaurants: user.restaurants || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   POST /api/auth/register
// @desc    Register a manager and their initial restaurant
router.post('/register', async (req, res) => {
  const { username, password, restaurantName } = req.body;

  if (!username || !password || !restaurantName) {
    return res.status(400).json({ error: 'Email, password, and restaurant name are required' });
  }

  try {
    const existingUser = await User.findOne({ username: username.trim().toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'This email/username is already registered.' });
    }

    const newRestaurant = new Restaurant({
      name: restaurantName.trim(),
      approved: false
    });

    const savedRestaurant = await newRestaurant.save();

    const newUser = new User({
      username: username.trim().toLowerCase(),
      password: hashPassword(password),
      role: 'manager',
      approved: false,
      restaurants: [savedRestaurant._id]
    });

    const savedUser = await newUser.save();

    savedRestaurant.createdBy = savedUser._id;
    await savedRestaurant.save();

    res.status(201).json({
      success: true,
      message: 'Registration successful! Your account and restaurant are awaiting admin approval.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   GET /api/auth/profile
// @desc    Get user profile with updated restaurants list
router.get('/profile', async (req, res) => {
  const userId = req.header('x-user-id');
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required in headers (x-user-id)' });
  }
  try {
    const user = await User.findById(userId).populate('restaurants');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({
      _id: user._id,
      username: user.username,
      role: user.role,
      restaurants: user.restaurants || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = {
  router,
  hashPassword
};
