const express = require('express');
const router = express.Router();
const MenuItem = require('../models/MenuItem');

// @route   GET /api/menu-items
// @desc    Search menu items (by name or SKU)
router.get('/', async (req, res) => {
  const { query } = req.query;
  try {
    let filter = { restaurant: req.restaurantId };
    if (query) {
      filter.$or = [
        { name: { $regex: query, $options: 'i' } },
        { item_sku_code: { $regex: query, $options: 'i' } }
      ];
    }
    // We only care about items of type 'Item' or 'Add-on' since they can be sold/used.
    // Let's return the matching items, limiting to 20 results for performance
    const items = await MenuItem.find(filter).limit(20);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
