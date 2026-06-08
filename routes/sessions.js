const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const csv = require('csv-parser');
const InventorySession = require('../models/InventorySession');
const Recipe = require('../models/Recipe');
const RawItem = require('../models/RawItem');

const upload = multer({ dest: 'uploads/' });

// @route   GET /api/sessions
// @desc    Get all sessions (completed or active)
router.get('/', async (req, res) => {
  try {
    const sessions = await InventorySession.find()
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

// @route   GET /api/sessions/active
// @desc    Get the currently active session
router.get('/active', async (req, res) => {
  try {
    const session = await InventorySession.findOne({ status: 'active' })
      .populate('initialInventory.rawItemId')
      .populate('actualFinalInventory.rawItemId')
      .populate('calculatedUsage.rawItemId')
      .populate('variance.rawItemId');
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   POST /api/sessions/start
// @desc    Start a new inventory session
router.post('/start', async (req, res) => {
  const { initialInventory } = req.body;

  try {
    // Check if there's already an active session
    const activeSession = await InventorySession.findOne({ status: 'active' });
    if (activeSession) {
      return res.status(400).json({ error: 'An active inventory session already exists. Complete or cancel it first.' });
    }

    if (!initialInventory || !Array.isArray(initialInventory)) {
      return res.status(400).json({ error: 'initialInventory array is required' });
    }

    // Populate all Raw Items in the system to ensure initial inventory covers all of them
    const allRawItems = await RawItem.find();
    
    // Create initial inventory mappings, default to 0 if not provided
    const formattedInitial = allRawItems.map(item => {
      const provided = initialInventory.find(i => i.rawItemId.toString() === item._id.toString());
      return {
        rawItemId: item._id,
        quantity: provided ? (Number(provided.quantity) || 0) : 0
      };
    });

    const newSession = new InventorySession({
      status: 'active',
      initialInventory: formattedInitial,
      salesData: [],
      actualFinalInventory: allRawItems.map(item => ({ rawItemId: item._id, quantity: 0 })),
      calculatedUsage: allRawItems.map(item => ({ rawItemId: item._id, quantity: 0 })),
      variance: []
    });

    await newSession.save();
    const populated = await newSession.populate('initialInventory.rawItemId');
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   POST /api/sessions/upload-sales
// @desc    Upload Day End Sales CSV and calculate expected usage
router.post('/upload-sales', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Please upload a CSV file' });
  }

  try {
    const activeSession = await InventorySession.findOne({ status: 'active' });
    if (!activeSession) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'No active inventory session. Please start a session first.' });
    }

    const salesMap = {};
    
    // Parse CSV
    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', (row) => {
        const sku = (row.item_sku_code || '').trim();
        const name = (row.item_name || '').trim();
        const qty = parseInt(row.qty, 10) || 0;
        const addonQty = parseInt(row.addon_qty, 10) || 0;
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
        // Delete uploaded file after reading
        fs.unlinkSync(req.file.path);

        const salesData = Object.values(salesMap);

        // Fetch all recipes from DB
        const recipes = await Recipe.find();

        // Calculate raw items usage
        // usageMap: rawItemId -> usage quantity
        const usageMap = {};
        
        // Initialize all raw items usage to 0
        const allRawItems = await RawItem.find();
        allRawItems.forEach(item => {
          usageMap[item._id.toString()] = 0;
        });

        // Compute usage based on recipes
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

        // Format computed usage for saving
        const calculatedUsage = Object.keys(usageMap).map(rawIdStr => ({
          rawItemId: rawIdStr,
          quantity: usageMap[rawIdStr]
        }));

        activeSession.salesFile = req.file.originalname;
        activeSession.salesData = salesData;
        activeSession.calculatedUsage = calculatedUsage;

        await activeSession.save();

        const populated = await InventorySession.findById(activeSession._id)
          .populate('initialInventory.rawItemId')
          .populate('calculatedUsage.rawItemId')
          .populate('actualFinalInventory.rawItemId');

        res.json(populated);
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

// @route   POST /api/sessions/submit-counts
// @desc    Submit final counts, calculate variance, and close session
router.post('/submit-counts', async (req, res) => {
  const { actualFinalInventory } = req.body;

  if (!actualFinalInventory || !Array.isArray(actualFinalInventory)) {
    return res.status(400).json({ error: 'actualFinalInventory array is required' });
  }

  try {
    const activeSession = await InventorySession.findOne({ status: 'active' });
    if (!activeSession) {
      return res.status(400).json({ error: 'No active inventory session found to complete.' });
    }

    const allRawItems = await RawItem.find();
    
    // Create actual final map for quick lookup
    const actualMap = {};
    allRawItems.forEach(item => {
      const provided = actualFinalInventory.find(i => i.rawItemId.toString() === item._id.toString());
      actualMap[item._id.toString()] = provided ? (Number(provided.quantity) || 0) : 0;
    });

    // We will build the variance and final inventory fields
    const formattedActual = [];
    const varianceData = [];

    // Lookup structures for initial inventory and calculated usage
    const initialMap = {};
    activeSession.initialInventory.forEach(item => {
      initialMap[item.rawItemId.toString()] = item.quantity;
    });

    const usageMap = {};
    activeSession.calculatedUsage.forEach(item => {
      usageMap[item.rawItemId.toString()] = item.quantity;
    });

    allRawItems.forEach(item => {
      const itemIdStr = item._id.toString();
      const initial = initialMap[itemIdStr] || 0;
      const usage = usageMap[itemIdStr] || 0;
      const expectedFinal = Math.max(0, initial - usage);
      const actualFinal = actualMap[itemIdStr] || 0;
      const varianceValue = actualFinal - expectedFinal;

      formattedActual.push({
        rawItemId: item._id,
        quantity: actualFinal
      });

      varianceData.push({
        rawItemId: item._id,
        initial,
        usage,
        expectedFinal,
        actualFinal,
        varianceValue
      });
    });

    activeSession.actualFinalInventory = formattedActual;
    activeSession.variance = varianceData;
    activeSession.status = 'completed';

    await activeSession.save();

    const populated = await InventorySession.findById(activeSession._id)
      .populate('initialInventory.rawItemId')
      .populate('calculatedUsage.rawItemId')
      .populate('actualFinalInventory.rawItemId')
      .populate('variance.rawItemId');

    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   DELETE /api/sessions/:id
// @desc    Cancel/delete a session
router.delete('/:id', async (req, res) => {
  try {
    const session = await InventorySession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    await InventorySession.deleteOne({ _id: req.params.id });
    res.json({ message: 'Session deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
