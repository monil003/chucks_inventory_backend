const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const csv = require('csv-parser');
const InventorySession = require('../models/InventorySession');
const Recipe = require('../models/Recipe');
const RawItem = require('../models/RawItem');
const Restaurant = require('../models/Restaurant');

const upload = multer({ dest: 'uploads/' });

// Helper to recalculate variance and closing metrics
const recalculateSessionVariance = async (session) => {
  const allRawItems = await RawItem.find({ restaurant: session.restaurant });
  
  const initialMap = {};
  session.initialInventory.forEach(item => {
    const idStr = (item.rawItemId._id || item.rawItemId).toString();
    initialMap[idStr] = item.quantity;
  });

  const usageMap = {};
  session.calculatedUsage.forEach(item => {
    const idStr = (item.rawItemId._id || item.rawItemId).toString();
    usageMap[idStr] = item.quantity;
  });

  const actualMap = {};
  session.actualFinalInventory.forEach(item => {
    const idStr = (item.rawItemId._id || item.rawItemId).toString();
    actualMap[idStr] = item.quantity;
  });

  const varianceData = [];
  allRawItems.forEach(item => {
    const itemIdStr = item._id.toString();
    const initial = initialMap[itemIdStr] || 0;
    const usage = usageMap[itemIdStr] || 0;
    const expectedFinal = Math.max(0, initial - usage);
    const actualFinal = actualMap[itemIdStr] || 0;
    const varianceValue = actualFinal - expectedFinal;

    varianceData.push({
      rawItemId: item._id,
      initial,
      usage,
      expectedFinal,
      actualFinal,
      varianceValue
    });
  });

  session.variance = varianceData;

  // Complete session status only if all three parts are entered
  const hasInitial = session.initialInventory && session.initialInventory.length > 0;
  const hasSales = session.salesData && session.salesData.length > 0;
  const hasActual = session.actualFinalInventory && session.actualFinalInventory.length > 0;
  
  if (hasInitial && hasSales && hasActual) {
    session.status = 'completed';
  } else {
    session.status = 'active';
  }
};

// @route   GET /api/sessions
// @desc    Get all sessions for the active restaurant
router.get('/', async (req, res) => {
  try {
    const sessions = await InventorySession.find({ restaurant: req.restaurantId })
      .populate('initialInventory.rawItemId')
      .populate('actualFinalInventory.rawItemId')
      .populate('calculatedUsage.rawItemId')
      .populate('variance.rawItemId')
      .sort({ date: -1 });
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   GET /api/sessions/by-date
// @desc    Get inventory session for a specific date
router.get('/by-date', async (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'Date query parameter is required YYYY-MM-DD' });
  }
  try {
    const targetDate = new Date(date);
    targetDate.setUTCHours(0,0,0,0);

    const session = await InventorySession.findOne({
      restaurant: req.restaurantId,
      date: targetDate
    })
    .populate('initialInventory.rawItemId')
    .populate('actualFinalInventory.rawItemId')
    .populate('calculatedUsage.rawItemId')
    .populate('variance.rawItemId');

    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   POST /api/sessions/save-initial
// @desc    Save starting count inventory for a specific date
router.post('/save-initial', async (req, res) => {
  const { date, initialInventory } = req.body;
  if (!date || !initialInventory || !Array.isArray(initialInventory)) {
    return res.status(400).json({ error: 'Date and initialInventory array are required' });
  }

  try {
    const targetDate = new Date(date);
    targetDate.setUTCHours(0,0,0,0);

    let session = await InventorySession.findOne({ date: targetDate, restaurant: req.restaurantId });
    const allRawItems = await RawItem.find({ restaurant: req.restaurantId });

    const formattedInitial = allRawItems.map(item => {
      const provided = initialInventory.find(i => i.rawItemId.toString() === item._id.toString());
      return {
        rawItemId: item._id,
        quantity: provided ? (Number(provided.quantity) || 0) : 0
      };
    });

    if (!session) {
      session = new InventorySession({
        restaurant: req.restaurantId,
        date: targetDate,
        status: 'active',
        initialInventory: formattedInitial,
        salesData: [],
        actualFinalInventory: allRawItems.map(item => ({ rawItemId: item._id, quantity: 0 })),
        calculatedUsage: [],
        variance: []
      });
    } else {
      session.initialInventory = formattedInitial;
    }

    await recalculateSessionVariance(session);
    await session.save();

    const populated = await InventorySession.findById(session._id)
      .populate('initialInventory.rawItemId')
      .populate('calculatedUsage.rawItemId')
      .populate('actualFinalInventory.rawItemId')
      .populate('variance.rawItemId');

    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   POST /api/sessions/save-final
// @desc    Save actual final counts for a specific date
router.post('/save-final', async (req, res) => {
  const { date, actualFinalInventory } = req.body;
  if (!date || !actualFinalInventory || !Array.isArray(actualFinalInventory)) {
    return res.status(400).json({ error: 'Date and actualFinalInventory array are required' });
  }

  try {
    const targetDate = new Date(date);
    targetDate.setUTCHours(0,0,0,0);

    let session = await InventorySession.findOne({ date: targetDate, restaurant: req.restaurantId });
    const allRawItems = await RawItem.find({ restaurant: req.restaurantId });

    const formattedActual = allRawItems.map(item => {
      const provided = actualFinalInventory.find(i => i.rawItemId.toString() === item._id.toString());
      return {
        rawItemId: item._id,
        quantity: provided ? (Number(provided.quantity) || 0) : 0
      };
    });

    if (!session) {
      // Create a new session if they are counting final count first
      session = new InventorySession({
        restaurant: req.restaurantId,
        date: targetDate,
        status: 'active',
        initialInventory: allRawItems.map(item => ({ rawItemId: item._id, quantity: 0 })),
        salesData: [],
        actualFinalInventory: formattedActual,
        calculatedUsage: [],
        variance: []
      });
    } else {
      session.actualFinalInventory = formattedActual;
    }

    await recalculateSessionVariance(session);
    await session.save();

    const populated = await InventorySession.findById(session._id)
      .populate('initialInventory.rawItemId')
      .populate('calculatedUsage.rawItemId')
      .populate('actualFinalInventory.rawItemId')
      .populate('variance.rawItemId');

    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   POST /api/sessions/upload-sales
// @desc    Upload Day End Sales CSV and calculate expected usage for a specific date
router.post('/upload-sales', upload.single('file'), async (req, res) => {
  const { date } = req.query;
  if (!req.file) {
    return res.status(400).json({ error: 'Please upload a CSV file' });
  }
  if (!date) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Date parameter is required' });
  }

  try {
    const restaurant = await Restaurant.findById(req.restaurantId);
    const mapping = restaurant?.csvMapping || {};

    const targetDate = new Date(date);
    targetDate.setUTCHours(0,0,0,0);

    let session = await InventorySession.findOne({ date: targetDate, restaurant: req.restaurantId });
    const allRawItems = await RawItem.find({ restaurant: req.restaurantId });

    if (!session) {
      session = new InventorySession({
        restaurant: req.restaurantId,
        date: targetDate,
        status: 'active',
        initialInventory: allRawItems.map(item => ({ rawItemId: item._id, quantity: 0 })),
        salesData: [],
        actualFinalInventory: allRawItems.map(item => ({ rawItemId: item._id, quantity: 0 })),
        calculatedUsage: [],
        variance: []
      });
    }

    const salesMap = {};
    
    // Parse CSV
    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', (row) => {
        const skuKey = mapping.salesSkuKey || 'item_sku_code';
        const nameKey = mapping.salesNameKey || 'item_name';
        const qtyKey = mapping.salesQtyKey || 'qty';
        const addonQtyKey = mapping.salesAddonQtyKey || 'addon_qty';

        const sku = (row[skuKey] || row['item_sku_code'] || '').trim();
        const name = (row[nameKey] || row['item_name'] || '').trim();
        const qty = parseInt(row[qtyKey] || row['qty'], 10) || 0;
        const addonQty = parseInt(row[addonQtyKey] || row['addon_qty'], 10) || 0;
        const totalQty = qty + addonQty;

        if (sku && totalQty > 0) {
          if (salesMap[sku]) {
            salesMap[sku].quantitySold += totalQty;
          } else {
            salesMap[sku] = {
              sku,
              name,
              quantitySold: totalQty
            };
          }
        }
      })
      .on('end', async () => {
        try {
          fs.unlinkSync(req.file.path);

          const salesData = Object.values(salesMap);
          const recipes = await Recipe.find({ restaurant: req.restaurantId });
          const usageMap = {};
          
          allRawItems.forEach(item => {
            usageMap[item._id.toString()] = 0;
          });

          salesData.forEach(saleItem => {
            const recipe = recipes.find(r => r.menuItemSku === saleItem.sku);
            if (recipe) {
              recipe.ingredients.forEach(ing => {
                const rawIdStr = ing.rawItemId.toString();
                if (usageMap[rawIdStr] !== undefined) {
                  usageMap[rawIdStr] += saleItem.quantitySold * ing.quantity;
                }
              });
            }
          });

          const calculatedUsage = Object.keys(usageMap).map(rawIdStr => ({
            rawItemId: rawIdStr,
            quantity: usageMap[rawIdStr]
          }));

          session.salesFile = req.file.originalname;
          session.salesData = salesData;
          session.calculatedUsage = calculatedUsage;

          await recalculateSessionVariance(session);
          await session.save();

          const populated = await InventorySession.findById(session._id)
            .populate('initialInventory.rawItemId')
            .populate('calculatedUsage.rawItemId')
            .populate('actualFinalInventory.rawItemId')
            .populate('variance.rawItemId');

          res.json(populated);
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      })
      .on('error', (error) => {
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: `Error parsing CSV: ${error.message}` });
      });

  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: err.message });
  }
});

// @route   POST /api/sessions/upload-initial-count
// @desc    Parse a CSV of initial counts (Description/Name, Quantity) and return pre-filled map
router.post('/upload-initial-count', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Please upload a CSV file' });
  }

  try {
    const restaurant = await Restaurant.findById(req.restaurantId);
    const mapping = restaurant?.csvMapping || {};

    const allRawItems = await RawItem.find({ restaurant: req.restaurantId });
    const countsMap = {}; // { rawItemId: quantity }
    const unmatched = [];
    const rows = [];

    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', (row) => {
        rows.push(row);
      })
      .on('end', () => {
        try {
          fs.unlinkSync(req.file.path);
        } catch (e) {}

        rows.forEach(row => {
          const customNameKey = mapping.initialCountNameKey || mapping.countNameKey;
          const customQtyKey = mapping.initialCountQtyKey || mapping.countQtyKey;

          let name = '';
          let qtyVal = undefined;

          // If custom keys are configured and present in row, use them
          if (customNameKey && row[customNameKey] !== undefined) {
            name = (row[customNameKey] || '').trim();
          }
          if (customQtyKey && row[customQtyKey] !== undefined) {
            qtyVal = row[customQtyKey];
          }

          // Fallbacks if not found via custom keys
          if (!name) {
            const keys = Object.keys(row);
            const altNameKey = keys.find(k =>
              ['description', 'item', 'name', 'ingredient', 'rawitem', 'item_name'].includes(k.trim().toLowerCase())
            );
            if (altNameKey) {
              name = (row[altNameKey] || '').trim();
            }
          }

          if (qtyVal === undefined) {
            const keys = Object.keys(row);
            const altQtyKey = keys.find(k =>
              ['quantity', 'qty', 'count', 'amount', 'initial', 'initial count', 'initial_count', 'final', 'final count', 'final_count', 'actual', 'actual count', 'actual_count'].includes(k.trim().toLowerCase())
            );
            if (altQtyKey) {
              qtyVal = row[altQtyKey];
            }
          }

          const qty = parseFloat(qtyVal || '0') || 0;

          if (!name) return;

          const match = allRawItems.find(
            item => item.name.toLowerCase() === name.toLowerCase()
          );

          if (match) {
            countsMap[match._id.toString()] = qty;
          } else {
            unmatched.push(name);
          }
        });

        res.json({
          success: true,
          countsMap,
          matchedCount: Object.keys(countsMap).length,
          unmatchedCount: unmatched.length,
          unmatched: unmatched.slice(0, 20)
        });
      })
      .on('error', (err) => {
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: `Failed to parse CSV: ${err.message}` });
      });

  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: err.message });
  }
});

// @route   POST /api/sessions/upload-end-count
// @desc    Parse a CSV of day end counts (Description/Name, Quantity) and return pre-filled map
router.post('/upload-end-count', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Please upload a CSV file' });
  }

  try {
    const restaurant = await Restaurant.findById(req.restaurantId);
    const mapping = restaurant?.csvMapping || {};

    const allRawItems = await RawItem.find({ restaurant: req.restaurantId });
    const countsMap = {}; // { rawItemId: quantity }
    const unmatched = [];
    const rows = [];

    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', (row) => {
        rows.push(row);
      })
      .on('end', () => {
        try {
          fs.unlinkSync(req.file.path);
        } catch (e) {}

        rows.forEach(row => {
          const customNameKey = mapping.endCountNameKey || mapping.countNameKey;
          const customQtyKey = mapping.endCountQtyKey || mapping.countQtyKey;

          let name = '';
          let qtyVal = undefined;

          // If custom keys are configured and present in row, use them
          if (customNameKey && row[customNameKey] !== undefined) {
            name = (row[customNameKey] || '').trim();
          }
          if (customQtyKey && row[customQtyKey] !== undefined) {
            qtyVal = row[customQtyKey];
          }

          // Fallbacks if not found via custom keys
          if (!name) {
            const keys = Object.keys(row);
            const altNameKey = keys.find(k =>
              ['description', 'item', 'name', 'ingredient', 'rawitem', 'item_name'].includes(k.trim().toLowerCase())
            );
            if (altNameKey) {
              name = (row[altNameKey] || '').trim();
            }
          }

          if (qtyVal === undefined) {
            const keys = Object.keys(row);
            const altQtyKey = keys.find(k =>
              ['quantity', 'qty', 'count', 'amount', 'initial', 'initial count', 'initial_count', 'final', 'final count', 'final_count', 'actual', 'actual count', 'actual_count'].includes(k.trim().toLowerCase())
            );
            if (altQtyKey) {
              qtyVal = row[altQtyKey];
            }
          }

          const qty = parseFloat(qtyVal || '0') || 0;

          if (!name) return;

          const match = allRawItems.find(
            item => item.name.toLowerCase() === name.toLowerCase()
          );

          if (match) {
            countsMap[match._id.toString()] = qty;
          } else {
            unmatched.push(name);
          }
        });

        res.json({
          success: true,
          countsMap,
          matchedCount: Object.keys(countsMap).length,
          unmatchedCount: unmatched.length,
          unmatched: unmatched.slice(0, 20)
        });
      })
      .on('error', (err) => {
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: `Failed to parse CSV: ${err.message}` });
      });

  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: err.message });
  }
});

// @route   DELETE /api/sessions/:id
// @desc    Cancel/delete a session
router.delete('/:id', async (req, res) => {
  try {
    const session = await InventorySession.findOne({ _id: req.params.id, restaurant: req.restaurantId });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    await InventorySession.deleteOne({ _id: req.params.id, restaurant: req.restaurantId });
    res.json({ message: 'Session deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
