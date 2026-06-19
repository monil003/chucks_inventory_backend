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
  const { username, password, restaurantId, role } = req.body;
  if (!username || !password || !restaurantId) {
    return res.status(400).json({ error: 'Username, password, and restaurantId are required' });
  }

  try {
    const existingUser = await User.findOne({ username: username.trim().toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'Username/Email already exists' });
    }

    const allowedRoles = ['manager', 'staff', 'food_access', 'liquor_access'];
    const finalRole = allowedRoles.includes(role) ? role : 'food_access';

    const newStaff = new User({
      username: username.trim().toLowerCase(),
      password: hashPassword(password),
      role: finalRole,
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
    const staff = await User.find({ 
      restaurants: restaurantId,
      role: { $in: ['manager', 'staff', 'food_access', 'liquor_access'] }
    });
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

// @route   PUT /api/manager/staff/:id
// @desc    Update staff credentials & role
router.put('/staff/:id', requireManager, async (req, res) => {
  const { username, password, role } = req.body;
  try {
    const staffMember = await User.findOne({ 
      _id: req.params.id,
      role: { $in: ['manager', 'staff', 'food_access', 'liquor_access'] }
    });
    
    if (!staffMember) {
      return res.status(404).json({ error: 'Staff member not found' });
    }
    
    if (username && username.trim().toLowerCase() !== staffMember.username) {
      const existing = await User.findOne({ username: username.trim().toLowerCase() });
      if (existing) {
        return res.status(400).json({ error: 'Username/Email already exists' });
      }
      staffMember.username = username.trim().toLowerCase();
    }
    
    if (password && password.trim()) {
      staffMember.password = hashPassword(password);
    }
    
    if (role) {
      const allowedRoles = ['manager', 'staff', 'food_access', 'liquor_access'];
      if (allowedRoles.includes(role)) {
        staffMember.role = role;
      } else {
        return res.status(400).json({ error: 'Invalid role permission' });
      }
    }
    
    await staffMember.save();
    res.json({ _id: staffMember._id, username: staffMember.username, role: staffMember.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   DELETE /api/manager/staff/:id
// @desc    Delete staff credentials
router.delete('/staff/:id', requireManager, async (req, res) => {
  try {
    const staffMember = await User.findOne({ 
      _id: req.params.id,
      role: { $in: ['manager', 'staff', 'food_access', 'liquor_access'] }
    });
    
    if (!staffMember) {
      return res.status(404).json({ error: 'Staff member not found' });
    }
    
    await User.deleteOne({ _id: req.params.id });
    res.json({ message: 'Staff member credentials deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
