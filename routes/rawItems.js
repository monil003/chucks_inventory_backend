const express = require('express');
const router = express.Router();
const RawItem = require('../models/RawItem');

// @route   GET /api/raw-items
// @desc    Get all raw items
router.get('/', async (req, res) => {
  try {
    const items = await RawItem.find().sort({ name: 1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   POST /api/raw-items
// @desc    Create a raw item
router.post('/', async (req, res) => {
  const { name, unit } = req.body;
  if (!name || !unit) {
    return res.status(400).json({ error: 'Name and Unit are required' });
  }
  try {
    const newItem = new RawItem({ name, unit });
    await newItem.save();
    res.status(201).json(newItem);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Raw Item with this name already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// @route   DELETE /api/raw-items/:id
// @desc    Delete a raw item
router.delete('/:id', async (req, res) => {
  try {
    const item = await RawItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    await RawItem.deleteOne({ _id: req.params.id });
    res.json({ message: 'Item deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
