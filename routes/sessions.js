const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const csv = require('csv-parser');
const InventorySession = require('../models/InventorySession');
const Recipe = require('../models/Recipe');
const RawItem = require('../models/RawItem');
const Restaurant = require('../models/Restaurant');
const geminiService = require('../services/geminiService');

const upload = multer({ dest: 'uploads/' });

// Helper to recalculate variance and closing metrics
const recalculateSessionVariance = async (session) => {
  const allRawItems = await RawItem.find({ restaurant: session.restaurant });
  
  const initialMap = {};
  session.initialInventory.forEach(item => {
    const idStr = (item.rawItemId._id || item.rawItemId).toString();
    initialMap[idStr] = item.quantity;
  });

  const deliveryMap = {};
  if (session.deliveries) {
    session.deliveries.forEach(item => {
      const idStr = (item.rawItemId._id || item.rawItemId).toString();
      deliveryMap[idStr] = item.quantity;
    });
  }

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
    const delivery = deliveryMap[itemIdStr] || 0;
    const usage = usageMap[itemIdStr] || 0;
    const expectedFinal = Math.max(0, initial + delivery - usage);
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
      .populate('deliveries.rawItemId')
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
    .populate('deliveries.rawItemId')
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
        actualFinalInventory: formattedInitial,
        calculatedUsage: [],
        variance: []
      });
    } else {
      session.initialInventory = formattedInitial;
      session.actualFinalInventory = formattedInitial;
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
        initialInventory: formattedActual,
        salesData: [],
        actualFinalInventory: formattedActual,
        calculatedUsage: [],
        variance: []
      });
    } else {
      session.actualFinalInventory = formattedActual;
      session.initialInventory = formattedActual;
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

// @route   POST /api/sessions/save-sales
// @desc    Save manual sales data for a specific date
router.post('/save-sales', async (req, res) => {
  const { date, salesData, salesFile } = req.body;
  if (!date || !salesData || !Array.isArray(salesData)) {
    return res.status(400).json({ error: 'Date and salesData array are required' });
  }

  try {
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

    const recipes = await Recipe.find({ restaurant: req.restaurantId });
    const usageMap = {};
    
    allRawItems.forEach(item => {
      usageMap[item._id.toString()] = 0;
    });

    const formattedSales = salesData.map(s => ({
      sku: (s.sku || '').trim(),
      name: (s.name || '').trim(),
      quantitySold: Number(s.quantitySold) || 0,
      price: Number(s.price) || 0
    })).filter(s => s.sku !== '');

    formattedSales.forEach(saleItem => {
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

    session.salesFile = salesFile || 'Manually Entered';
    session.salesData = formattedSales;
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
});

// @route   POST /api/sessions/save-deliveries
// @desc    Save manual deliveries data for a specific date
router.post('/save-deliveries', async (req, res) => {
  const { date, deliveries } = req.body;
  if (!date || !deliveries || !Array.isArray(deliveries)) {
    return res.status(400).json({ error: 'Date and deliveries array are required' });
  }

  try {
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
        deliveries: [],
        salesData: [],
        actualFinalInventory: allRawItems.map(item => ({ rawItemId: item._id, quantity: 0 })),
        calculatedUsage: [],
        variance: []
      });
    }

    const formattedDeliveries = deliveries.map(d => ({
      rawItemId: d.rawItemId,
      quantity: Number(d.quantity) || 0,
      price: Number(d.price) || 0
    })).filter(d => d.rawItemId);

    session.deliveries = formattedDeliveries;

    await recalculateSessionVariance(session);
    await session.save();

    const populated = await InventorySession.findById(session._id)
      .populate('initialInventory.rawItemId')
      .populate('deliveries.rawItemId')
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
              quantitySold: totalQty,
              price: 0
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

// @route   POST /api/sessions/parse-invoice
// @desc    Upload an invoice (PDF/Image) and call Gemini API to parse items and map to ingredients
router.post('/parse-invoice', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Please upload an invoice file' });
  }

  try {
    const rawItems = await RawItem.find({ restaurant: req.restaurantId }).sort({ name: 1 });
    const fileBuffer = fs.readFileSync(req.file.path);
    const mimeType = req.file.mimetype;

    const parsedData = await geminiService.extractInvoice(fileBuffer, mimeType, rawItems);
    
    // Clean up temporary file
    fs.unlinkSync(req.file.path);

    res.json(parsedData);
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: err.message });
  }
});

// @route   POST /api/sessions/parse-sales-report
// @desc    Upload a sales report (PDF/CSV/Excel/Image) and call Gemini API to extract menu sales
router.post('/parse-sales-report', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Please upload a sales report file' });
  }

  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    const mimeType = req.file.mimetype;

    const parsedData = await geminiService.extractSalesReport(fileBuffer, mimeType);
    
    // Clean up temporary file
    fs.unlinkSync(req.file.path);

    res.json(parsedData);
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: err.message });
  }
});

// @route   POST /api/sessions/generate-interval-report
// @desc    Generate a period-bounded audit report and save to DB
router.post('/generate-interval-report', async (req, res) => {
  const { startDate, endDate, deliveries, endingCounts, salesData, salesFile } = req.body;
  if (!startDate || !endDate || !endingCounts || !salesData) {
    return res.status(400).json({ error: 'startDate, endDate, endingCounts, and salesData are required' });
  }

  try {
    const parsedStart = new Date(startDate);
    parsedStart.setUTCHours(0,0,0,0);
    const parsedEnd = new Date(endDate);
    parsedEnd.setUTCHours(0,0,0,0);

    const allRawItems = await RawItem.find({ restaurant: req.restaurantId });
    const recipes = await Recipe.find({ restaurant: req.restaurantId });

    // 1. Fetch starting inventory: sum of all counts in [startDate, endDate) (exclusive of endDate)
    const dateQuery = parsedEnd > parsedStart
      ? { $gte: parsedStart, $lt: parsedEnd }
      : parsedStart;

    const startingSessions = await InventorySession.find({
      restaurant: req.restaurantId,
      date: dateQuery
    });

    const startingMap = {};
    allRawItems.forEach(item => {
      startingMap[item._id.toString()] = 0;
    });

    startingSessions.forEach(sess => {
      const inventoryToUse = sess.actualFinalInventory && sess.actualFinalInventory.length > 0
        ? sess.actualFinalInventory 
        : sess.initialInventory;
      
      if (inventoryToUse) {
        inventoryToUse.forEach(item => {
          if (!item.rawItemId) return;
          const id = (item.rawItemId._id || item.rawItemId).toString();
          if (startingMap[id] !== undefined) {
            startingMap[id] += Number(item.quantity) || 0;
          }
        });
      }
    });

    // 2. Map deliveries
    const deliveryMap = {};
    allRawItems.forEach(item => {
      deliveryMap[item._id.toString()] = 0;
    });
    if (Array.isArray(deliveries)) {
      deliveries.forEach(d => {
        const id = d.rawItemId;
        if (id && deliveryMap[id.toString()] !== undefined) {
          deliveryMap[id.toString()] += Number(d.quantity) || 0;
        }
      });
    }

    // 3. Map ending counts
    const endingMap = {};
    allRawItems.forEach(item => {
      endingMap[item._id.toString()] = 0;
    });
    if (Array.isArray(endingCounts)) {
      endingCounts.forEach(c => {
        const id = c.rawItemId;
        if (id && endingMap[id.toString()] !== undefined) {
          endingMap[id.toString()] = Number(c.quantity) || 0;
        }
      });
    }

    // 4. Calculate recipe depletion (Sold)
    const usageMap = {};
    allRawItems.forEach(item => {
      usageMap[item._id.toString()] = 0;
    });

    const formattedSales = salesData.map(s => ({
      sku: (s.sku || '').trim(),
      name: (s.name || '').trim(),
      quantitySold: Number(s.quantitySold) || 0,
      price: Number(s.price) || 0
    })).filter(s => s.sku !== '');

    formattedSales.forEach(saleItem => {
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

    // 5. Build variance array
    const varianceData = [];
    allRawItems.forEach(item => {
      const idStr = item._id.toString();
      const initial = startingMap[idStr] || 0;
      const delivery = deliveryMap[idStr] || 0;
      const sold = usageMap[idStr] || 0;
      const actualFinal = endingMap[idStr] || 0;

      // Used = Starting + Delivery - Ending
      const used = (initial + delivery) - actualFinal;
      // Lost = Used - Sold
      const lost = used - sold;

      const expectedFinal = Math.max(0, initial + delivery - sold);

      varianceData.push({
        rawItemId: item._id,
        initial: initial,
        usage: sold,
        expectedFinal: expectedFinal,
        actualFinal: actualFinal,
        varianceValue: lost
      });
    });

    // 6. Create/Overwrite the session on the endDate
    let session = await InventorySession.findOne({
      restaurant: req.restaurantId,
      date: parsedEnd
    });

    if (!session) {
      session = new InventorySession({
        restaurant: req.restaurantId,
        date: parsedEnd
      });
    }

    session.startDate = parsedStart;
    session.endDate = parsedEnd;
    session.status = 'completed';

    // Store deliveries
    session.deliveries = allRawItems.map(item => ({
      rawItemId: item._id,
      quantity: deliveryMap[item._id.toString()] || 0,
      price: 0
    }));

    // Store counts
    session.initialInventory = allRawItems.map(item => ({
      rawItemId: item._id,
      quantity: startingMap[item._id.toString()] || 0
    }));

    session.actualFinalInventory = allRawItems.map(item => ({
      rawItemId: item._id,
      quantity: endingMap[item._id.toString()] || 0
    }));

    session.salesData = formattedSales;
    session.salesFile = salesFile || 'Gemini AI Extract';
    
    session.calculatedUsage = allRawItems.map(item => ({
      rawItemId: item._id,
      quantity: usageMap[item._id.toString()] || 0
    }));

    session.variance = varianceData;

    await session.save();

    const populated = await InventorySession.findById(session._id)
      .populate('initialInventory.rawItemId')
      .populate('actualFinalInventory.rawItemId')
      .populate('calculatedUsage.rawItemId')
      .populate('variance.rawItemId');

    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
