const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Restaurant = require('../models/Restaurant');
const MenuItem = require('../models/MenuItem');

// Middleware to ensure user is an admin
const requireAdmin = (req, res, next) => {
  const role = req.header('x-user-role');
  if (role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
  }
  next();
};

// @route   GET /api/admin/users
// @desc    Get all users (except admin) with populated restaurants
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const users = await User.find({ role: { $ne: 'admin' } }).populate('restaurants');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   PUT /api/admin/users/:id/approve
// @desc    Approve/disapprove a user
router.put('/users/:id/approve', requireAdmin, async (req, res) => {
  const { approved } = req.body;
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    user.approved = approved;
    await user.save();
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   GET /api/admin/restaurants
// @desc    Get all restaurants in the system
router.get('/restaurants', requireAdmin, async (req, res) => {
  try {
    const restaurants = await Restaurant.find().populate('createdBy');
    res.json(restaurants);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to clone menu items from default Chuck's Kitchen
const initializeRestaurantMenu = async (restaurantId) => {
  try {
    const count = await MenuItem.countDocuments({ restaurant: restaurantId });
    if (count > 0) return;

    const defaultRest = await Restaurant.findOne({ name: "Chuck's Kitchen" });
    if (!defaultRest) return;

    const defaultMenuItems = await MenuItem.find({ restaurant: defaultRest._id });
    if (defaultMenuItems.length === 0) return;

    const newMenuItems = defaultMenuItems.map(item => ({
      item_sku_code: item.item_sku_code,
      name: item.name,
      category_name: item.category_name,
      subcat_name: item.subcat_name,
      type: item.type,
      restaurant: restaurantId
    }));

    await MenuItem.insertMany(newMenuItems);
    console.log(`Cloned ${newMenuItems.length} menu items for restaurant ${restaurantId}`);
  } catch (err) {
    console.error('Error cloning menu items for restaurant:', err.message);
  }
};

// @route   PUT /api/admin/restaurants/:id/approve
// @desc    Approve/disapprove a restaurant
router.put('/restaurants/:id/approve', requireAdmin, async (req, res) => {
  const { approved } = req.body;
  try {
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ error: 'Restaurant not found' });
    }
    restaurant.approved = approved;
    await restaurant.save();

    if (approved) {
      await initializeRestaurantMenu(restaurant._id);
    }

    res.json(restaurant);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
