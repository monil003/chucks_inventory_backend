const express = require('express');
const router = express.Router();
const RawItem = require('../models/RawItem');
const multer = require('multer');
const fs = require('fs');
const csv = require('csv-parser');

const upload = multer({ dest: 'uploads/' });


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

// @route   PUT /api/raw-items/:id
// @desc    Update a raw item
router.put('/:id', async (req, res) => {
  const { name, unit } = req.body;
  if (!name || !unit) {
    return res.status(400).json({ error: 'Name and Unit are required' });
  }
  try {
    const item = await RawItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    item.name = name.trim();
    item.unit = unit.trim();
    await item.save();
    res.json(item);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Raw Item with this name already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// @route   POST /api/raw-items/upload-order-guide
// @desc    Upload Order Guide CSV and upsert raw items
router.post('/upload-order-guide', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Please upload a CSV file' });
  }

  const uniqueItems = {};

  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (row) => {
      const keys = Object.keys(row);
      const descKey = keys.find(k => k.trim() === 'Description') || 'Description';
      const unitKey = keys.find(k => k.trim() === 'Unit Measure') || 'Unit Measure';

      const name = (row[descKey] || '').trim();
      const unit = (row[unitKey] || '').trim();

      if (name) {
        uniqueItems[name] = unit || 'pcs';
      }
    })
    .on('end', async () => {
      try {
        fs.unlinkSync(req.file.path);

        const names = Object.keys(uniqueItems);
        if (names.length === 0) {
          return res.status(400).json({ error: 'No valid ingredients found in the CSV file' });
        }

        const bulkOps = names.map(name => ({
          updateOne: {
            filter: { name },
            update: {
              $set: { unit: uniqueItems[name] }
            },
            upsert: true
          }
        }));

        const result = await RawItem.bulkWrite(bulkOps);

        res.json({
          success: true,
          totalProcessed: names.length,
          upsertedCount: result.upsertedCount,
          modifiedCount: result.modifiedCount,
          matchedCount: result.matchedCount
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    })
    .on('error', (err) => {
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: `Failed to parse CSV: ${err.message}` });
    });
});

module.exports = router;

