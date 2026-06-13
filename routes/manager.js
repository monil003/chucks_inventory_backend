const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Restaurant = require('../models/Restaurant');
const { hashPassword } = require('./auth');

// Middleware to ensure user is a manager
const requireManager = (req, res, next) => {
  const role = req.header('x-user-role');
  if (role !== 'manager') {
    return res.status(403).json({ error: 'Access denied. Manager privileges required.' });
  }
  next();
};

// @route   POST /api/manager/staff
// @desc    Create a staff user credentials for a specific restaurant
router.post('/staff', requireManager, async (req, res) => {
  const { username, password, restaurantId } = req.body;
  if (!username || !password || !restaurantId) {
    return res.status(400).json({ error: 'Username, password, and restaurantId are required' });
  }

  try {
    const existingUser = await User.findOne({ username: username.trim().toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'Username/Email already exists' });
    }

    const newStaff = new User({
      username: username.trim().toLowerCase(),
      password: hashPassword(password),
      role: 'staff',
      approved: true, // staff created by manager are approved by default
      restaurants: [restaurantId]
    });

    await newStaff.save();
    res.status(201).json({ _id: newStaff._id, username: newStaff.username, role: newStaff.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   GET /api/manager/staff
// @desc    Get staff list for a specific restaurant
router.get('/staff', requireManager, async (req, res) => {
  const { restaurantId } = req.query;
  if (!restaurantId) {
    return res.status(400).json({ error: 'restaurantId query parameter is required' });
  }

  try {
    const staff = await User.find({ role: 'staff', restaurants: restaurantId });
    res.json(staff);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   POST /api/manager/restaurants
// @desc    Add an additional restaurant (starts as unapproved)
router.post('/restaurants', requireManager, async (req, res) => {
  const { name, managerId } = req.body;
  if (!name || !managerId) {
    return res.status(400).json({ error: 'Restaurant name and managerId are required' });
  }

  try {
    const newRestaurant = new Restaurant({
      name: name.trim(),
      approved: false,
      createdBy: managerId
    });

    await newRestaurant.save();

    // Add to manager's restaurants list
    await User.findByIdAndUpdate(managerId, {
      $push: { restaurants: newRestaurant._id }
    });

    res.status(201).json(newRestaurant);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   PUT /api/manager/restaurants/:id/csv-mapping
// @desc    Update CSV headers mapping configuration for a restaurant
router.put('/restaurants/:id/csv-mapping', requireManager, async (req, res) => {
  const { csvMapping } = req.body;
  if (!csvMapping) {
    return res.status(400).json({ error: 'csvMapping object is required' });
  }

  try {
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ error: 'Restaurant not found' });
    }

    restaurant.csvMapping = {
      orderGuideNameKey: csvMapping.orderGuideNameKey?.trim() || restaurant.csvMapping.orderGuideNameKey,
      orderGuideUnitKey: csvMapping.orderGuideUnitKey?.trim() || restaurant.csvMapping.orderGuideUnitKey,
      countNameKey: csvMapping.countNameKey?.trim() || restaurant.csvMapping.countNameKey,
      countQtyKey: csvMapping.countQtyKey?.trim() || restaurant.csvMapping.countQtyKey,
      initialCountNameKey: csvMapping.initialCountNameKey?.trim() || restaurant.csvMapping.initialCountNameKey,
      initialCountQtyKey: csvMapping.initialCountQtyKey?.trim() || restaurant.csvMapping.initialCountQtyKey,
      endCountNameKey: csvMapping.endCountNameKey?.trim() || restaurant.csvMapping.endCountNameKey,
      endCountQtyKey: csvMapping.endCountQtyKey?.trim() || restaurant.csvMapping.endCountQtyKey,
      salesSkuKey: csvMapping.salesSkuKey?.trim() || restaurant.csvMapping.salesSkuKey,
      salesNameKey: csvMapping.salesNameKey?.trim() || restaurant.csvMapping.salesNameKey,
      salesQtyKey: csvMapping.salesQtyKey?.trim() || restaurant.csvMapping.salesQtyKey,
      salesAddonQtyKey: csvMapping.salesAddonQtyKey?.trim() || restaurant.csvMapping.salesAddonQtyKey
    };

    await restaurant.save();
    res.json(restaurant);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
