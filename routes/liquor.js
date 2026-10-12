const express = require('express');
const router = express.Router();
const LiquorItem = require('../models/LiquorItem');
const LiquorCount = require('../models/LiquorCount');

// Predefined default catalog extracted from "Daily liquor verification sheet.xlsx"
const DEFAULT_LIQUOR_ITEMS = [
  // Beer & Cans (boxCount: 24 or 12)
  { name: 'Canadian', category: 'beer', boxCount: 24, fullWeightOz: 0, liquorOz: 0, emptyWeightOz: 0 },
  { name: 'Coors Light', category: 'beer', boxCount: 24, fullWeightOz: 0, liquorOz: 0, emptyWeightOz: 0 },
  { name: 'Corona', category: 'beer', boxCount: 24, fullWeightOz: 0, liquorOz: 0, emptyWeightOz: 0 },
  { name: 'Corona 0%', category: 'beer', boxCount: 24, fullWeightOz: 0, liquorOz: 0, emptyWeightOz: 0 },
  { name: 'Bud Light', category: 'beer', boxCount: 24, fullWeightOz: 0, liquorOz: 0, emptyWeightOz: 0 },
  { name: 'Heiniken 0%', category: 'beer', boxCount: 24, fullWeightOz: 0, liquorOz: 0, emptyWeightOz: 0 },
  { name: 'Heiniken', category: 'beer', boxCount: 24, fullWeightOz: 0, liquorOz: 0, emptyWeightOz: 0 },
  { name: 'MGD', category: 'beer', boxCount: 24, fullWeightOz: 0, liquorOz: 0, emptyWeightOz: 0 },
  { name: 'Dos Equis', category: 'beer', boxCount: 24, fullWeightOz: 0, liquorOz: 0, emptyWeightOz: 0 },
  { name: 'Molson Export', category: 'beer', boxCount: 24, fullWeightOz: 0, liquorOz: 0, emptyWeightOz: 0 },
  { name: 'Belgium Moon', category: 'beer', boxCount: 12, fullWeightOz: 0, liquorOz: 0, emptyWeightOz: 0 },
  { name: 'Guiness Cans', category: 'beer', boxCount: 24, fullWeightOz: 0, liquorOz: 0, emptyWeightOz: 0 },
  { name: 'Guiness 0%', category: 'beer', boxCount: 24, fullWeightOz: 0, liquorOz: 0, emptyWeightOz: 0 },
  { name: 'Alexander Keiths', category: 'beer', boxCount: 24, fullWeightOz: 0, liquorOz: 0, emptyWeightOz: 0 },
  { name: 'TB Sommersby', category: 'beer', boxCount: 24, fullWeightOz: 0, liquorOz: 0, emptyWeightOz: 0 },
  { name: 'SMIRNOFF ICE', category: 'beer', boxCount: 24, fullWeightOz: 0, liquorOz: 0, emptyWeightOz: 0 },
  { name: 'Blueberry pomegranate', category: 'beer', boxCount: 24, fullWeightOz: 0, liquorOz: 0, emptyWeightOz: 0 },
  { name: 'RED BULL', category: 'beer', boxCount: 24, fullWeightOz: 0, liquorOz: 0, emptyWeightOz: 0 },

  // Liquor Bottles (with accurate tare / full / liquor oz weights)
  { name: 'Vodka Smirnoff (750ml)', category: 'liquor', boxCount: 1, fullWeightOz: 53.0, liquorOz: 25.0, emptyWeightOz: 28.0 },
  { name: 'Casamigos(750 mL)', category: 'liquor', boxCount: 1, fullWeightOz: 41.8, liquorOz: 25.0, emptyWeightOz: 16.8 },
  { name: 'Crown Royal 1.14l', category: 'liquor', boxCount: 1, fullWeightOz: 62.5, liquorOz: 38.5, emptyWeightOz: 24.0 },
  { name: 'Caption White 1.14l', category: 'liquor', boxCount: 1, fullWeightOz: 58.5, liquorOz: 38.5, emptyWeightOz: 20.0 },
  { name: 'Gin 1.14l', category: 'liquor', boxCount: 1, fullWeightOz: 58.65, liquorOz: 38.5, emptyWeightOz: 20.15 },
  { name: 'SPICED RUM 1.14l', category: 'liquor', boxCount: 1, fullWeightOz: 58.85, liquorOz: 38.5, emptyWeightOz: 20.35 },
  { name: 'Dark RUM 1.14l', category: 'liquor', boxCount: 1, fullWeightOz: 38.5, liquorOz: 38.5, emptyWeightOz: 0.0 },
  { name: 'Jameson 1.14L', category: 'liquor', boxCount: 1, fullWeightOz: 61.65, liquorOz: 38.5, emptyWeightOz: 23.15 },
  { name: 'Jagermeister 1.14l', category: 'liquor', boxCount: 1, fullWeightOz: 61.35, liquorOz: 38.5, emptyWeightOz: 22.85 },
  { name: 'Red Cask Wayne (750 ml)', category: 'liquor', boxCount: 1, fullWeightOz: 51.0, liquorOz: 25.0, emptyWeightOz: 26.0 },
  { name: 'Busker', category: 'liquor', boxCount: 1, fullWeightOz: 49.65, liquorOz: 38.5, emptyWeightOz: 11.15 },
  { name: 'Kettle One', category: 'liquor', boxCount: 1, fullWeightOz: 48.15, liquorOz: 25.0, emptyWeightOz: 23.15 },

  // Wine Bottles
  { name: 'Pinot Grigio', category: 'wine', boxCount: 1, fullWeightOz: 41.1, liquorOz: 25.0, emptyWeightOz: 16.1 },
  { name: 'Wayne gretzky Shiraz', category: 'wine', boxCount: 1, fullWeightOz: 41.3, liquorOz: 25.0, emptyWeightOz: 16.3 },
  { name: 'Trius Cabernet Merlot', category: 'wine', boxCount: 1, fullWeightOz: 40.95, liquorOz: 25.0, emptyWeightOz: 15.95 },
  { name: 'Chardonnay', category: 'wine', boxCount: 1, fullWeightOz: 40.95, liquorOz: 25.0, emptyWeightOz: 15.95 },
  { name: 'Rose', category: 'wine', boxCount: 1, fullWeightOz: 41.15, liquorOz: 25.0, emptyWeightOz: 16.15 },
  { name: 'Santa Margherit', category: 'wine', boxCount: 1, fullWeightOz: 41.1, liquorOz: 25.0, emptyWeightOz: 16.1 }
];

// Helper to auto-seed restaurant liquor items if not present
const ensureDefaultLiquorItems = async (restaurantId) => {
  const count = await LiquorItem.countDocuments({ restaurant: restaurantId });
  if (count === 0) {
    const itemsToInsert = DEFAULT_LIQUOR_ITEMS.map((item, idx) => ({
      ...item,
      restaurant: restaurantId,
      sortOrder: idx + 1,
      active: true
    }));
    await LiquorItem.insertMany(itemsToInsert);
    console.log(`Auto-seeded ${itemsToInsert.length} liquor items for restaurant ${restaurantId}`);
  }
};

// Helper to calculate previous date string (YYYY-MM-DD)
const getPreviousDateStr = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().split('T')[0];
};

// @route   GET /api/liquor/items
// @desc    Get all liquor items for current restaurant
router.get('/items', async (req, res) => {
  try {
    await ensureDefaultLiquorItems(req.restaurantId);
    const items = await LiquorItem.find({ restaurant: req.restaurantId, active: true }).sort({ sortOrder: 1, createdAt: 1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   POST /api/liquor/items
// @desc    Add a new liquor item
router.post('/items', async (req, res) => {
  const { name, category, boxCount, fullWeightOz, liquorOz, emptyWeightOz } = req.body;
  if (!name || !category) {
    return res.status(400).json({ error: 'Name and category are required' });
  }

  try {
    const highestSort = await LiquorItem.findOne({ restaurant: req.restaurantId }).sort({ sortOrder: -1 });
    const nextOrder = highestSort ? (highestSort.sortOrder || 0) + 1 : 1;

    const newItem = new LiquorItem({
      restaurant: req.restaurantId,
      name: name.trim(),
      category,
      boxCount: Number(boxCount) || (category === 'beer' ? 24 : 1),
      fullWeightOz: Number(fullWeightOz) || 0,
      liquorOz: Number(liquorOz) || 25,
      emptyWeightOz: Number(emptyWeightOz) || (Number(fullWeightOz) && Number(liquorOz) ? Math.max(0, Number(fullWeightOz) - Number(liquorOz)) : 0),
      sortOrder: nextOrder,
      active: true
    });

    await newItem.save();
    res.status(201).json(newItem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   PUT /api/liquor/items/:id
// @desc    Update a liquor item specs
router.put('/items/:id', async (req, res) => {
  const { name, category, boxCount, fullWeightOz, liquorOz, emptyWeightOz, active, sortOrder } = req.body;
  try {
    const item = await LiquorItem.findOne({ _id: req.params.id, restaurant: req.restaurantId });
    if (!item) {
      return res.status(404).json({ error: 'Liquor item not found' });
    }

    if (name) item.name = name.trim();
    if (category) item.category = category;
    if (boxCount !== undefined) item.boxCount = Number(boxCount);
    if (fullWeightOz !== undefined) item.fullWeightOz = Number(fullWeightOz);
    if (liquorOz !== undefined) item.liquorOz = Number(liquorOz);
    if (emptyWeightOz !== undefined) {
      item.emptyWeightOz = Number(emptyWeightOz);
    } else if (fullWeightOz !== undefined && liquorOz !== undefined) {
      item.emptyWeightOz = Math.max(0, Number(fullWeightOz) - Number(liquorOz));
    }
    if (active !== undefined) item.active = active;
    if (sortOrder !== undefined) item.sortOrder = Number(sortOrder);

    await item.save();
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   DELETE /api/liquor/items/:id
// @desc    Soft-delete a liquor item
router.delete('/items/:id', async (req, res) => {
  try {
    const item = await LiquorItem.findOne({ _id: req.params.id, restaurant: req.restaurantId });
    if (!item) {
      return res.status(404).json({ error: 'Liquor item not found' });
    }
    item.active = false;
    await item.save();
    res.json({ message: 'Item archived successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   GET /api/liquor/count
// @desc    Get liquor count for a specific date (and previous day count for baseline)
router.get('/count', async (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'date query parameter is required (YYYY-MM-DD)' });
  }

  try {
    await ensureDefaultLiquorItems(req.restaurantId);
    const catalog = await LiquorItem.find({ restaurant: req.restaurantId, active: true }).sort({ sortOrder: 1 });

    let countDoc = await LiquorCount.findOne({ restaurant: req.restaurantId, date });
    
    // Also fetch the most recent previous day count
    const prevDateStr = getPreviousDateStr(date);
    let prevCountDoc = await LiquorCount.findOne({ restaurant: req.restaurantId, date: prevDateStr });
    if (!prevCountDoc) {
      // Find the latest prior count before this date
      prevCountDoc = await LiquorCount.findOne({ 
        restaurant: req.restaurantId, 
        date: { $lt: date } 
      }).sort({ date: -1 });
    }

    res.json({
      date,
      count: countDoc,
      previousCount: prevCountDoc,
      catalog
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   POST /api/liquor/count
// @desc    Save liquor count for a date
router.post('/count', async (req, res) => {
  const { date, amBartender, pmBartender, items, wasteLogs, status } = req.body;
  const userRole = req.header('x-user-role');

  if (!date) {
    return res.status(400).json({ error: 'Date is required (YYYY-MM-DD)' });
  }

  // Frontstaff lock enforcement:
  // If role is liquor_access, they are restricted to today's date only!
  if (userRole === 'liquor_access') {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    // Also allow local client date offset (e.g. within 24h timezone window)
    const localToday = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    
    if (date !== todayStr && date !== localToday) {
      return res.status(403).json({
        error: `Permission Denied: Front staff are only allowed to submit counts for today's date (${todayStr}).`
      });
    }
  }

  try {
    let countDoc = await LiquorCount.findOne({ restaurant: req.restaurantId, date });

    if (!countDoc) {
      countDoc = new LiquorCount({
        restaurant: req.restaurantId,
        date,
        amBartender: amBartender || '',
        pmBartender: pmBartender || '',
        items: items || [],
        wasteLogs: wasteLogs || [],
        status: status || 'submitted'
      });
    } else {
      if (amBartender !== undefined) countDoc.amBartender = amBartender;
      if (pmBartender !== undefined) countDoc.pmBartender = pmBartender;
      if (items !== undefined) countDoc.items = items;
      if (wasteLogs !== undefined) countDoc.wasteLogs = wasteLogs;
      if (status !== undefined) countDoc.status = status;
    }

    await countDoc.save();
    res.json({ success: true, count: countDoc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   GET /api/liquor/variance
// @desc    Calculate variance report between selected date and previous day (or AM vs PM)
router.get('/variance', async (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'date query parameter is required (YYYY-MM-DD)' });
  }

  try {
    await ensureDefaultLiquorItems(req.restaurantId);
    const catalog = await LiquorItem.find({ restaurant: req.restaurantId, active: true }).sort({ sortOrder: 1 });

    const currentDoc = await LiquorCount.findOne({ restaurant: req.restaurantId, date });
    
    // Find previous day count (or closest earlier date)
    const prevDateStr = getPreviousDateStr(date);
    let prevDoc = await LiquorCount.findOne({ restaurant: req.restaurantId, date: prevDateStr });
    if (!prevDoc) {
      prevDoc = await LiquorCount.findOne({
        restaurant: req.restaurantId,
        date: { $lt: date }
      }).sort({ date: -1 });
    }

    const currentMap = new Map();
    if (currentDoc && currentDoc.items) {
      currentDoc.items.forEach(it => {
        currentMap.set(it.name.toLowerCase().trim(), it);
      });
    }

    const prevMap = new Map();
    if (prevDoc && prevDoc.items) {
      prevDoc.items.forEach(it => {
        prevMap.set(it.name.toLowerCase().trim(), it);
      });
    }

    const report = catalog.map(item => {
      const key = item.name.toLowerCase().trim();
      const curr = currentMap.get(key) || {};
      const prev = prevMap.get(key) || {};

      if (item.category === 'beer') {
        const boxCount = item.boxCount || 24;

        // Previous Day numbers
        const prevBarFridge = prev.customPrevious?.barFridge ?? (prev.amBarFridge ?? 0);
        const prevFridgeBox = prev.customPrevious?.atBackBox ?? (prev.amAtBackBox ?? 0);
        const prevFridgeBottles = prev.customPrevious?.beerFridgeBottles ?? (prev.amBeerFridgeBottles ?? 0);
        const prevTotalFridge = prevFridgeBottles + (prevFridgeBox * boxCount);
        const prevTotalCount = prevTotalFridge + prevBarFridge;

        // Current Day numbers
        const todayBarFridge = curr.amBarFridge ?? 0;
        const todayFridgeBox = curr.amAtBackBox ?? 0;
        const todayFridgeBottles = curr.amBeerFridgeBottles ?? 0;
        const todayTotalFridge = todayFridgeBottles + (todayFridgeBox * boxCount);
        const todayTotalCount = todayTotalFridge + todayBarFridge;

        // PM Closing numbers
        const pmBarFridge = curr.pmBarFridge ?? 0;
        const pmFridgeBox = curr.pmAtBackBox ?? 0;
        const pmFridgeBottles = curr.pmBeerFridgeBottles ?? 0;
        const pmTotalCount = (pmFridgeBottles + pmFridgeBox * boxCount) + pmBarFridge;

        // Difference = Today - Yesterday (or net consumption change)
        const diff = todayTotalCount - prevTotalCount;
        const sold = curr.sold || 0;
        // Variance: Diff is negative when consumed. E.g. 5 sold, diff -5 -> variance = 0!
        const variance = (diff * -1) - sold;

        return {
          itemId: item._id,
          name: item.name,
          category: 'beer',
          boxCount,
          previous: {
            barFridge: prevBarFridge,
            beerFridgeBox: prevFridgeBox,
            beerFridgeBottles: prevFridgeBottles,
            totalBeerFridge: prevTotalFridge,
            totalCount: prevTotalCount
          },
          today: {
            barFridge: todayBarFridge,
            beerFridgeBox: todayFridgeBox,
            beerFridgeBottles: todayFridgeBottles,
            totalBeerFridge: todayTotalFridge,
            totalCount: todayTotalCount
          },
          pm: {
            barFridge: pmBarFridge,
            beerFridgeBox: pmFridgeBox,
            beerFridgeBottles: pmFridgeBottles,
            totalCount: pmTotalCount
          },
          difference: diff,
          sold,
          variance
        };
      } else {
        // Liquor & Wine
        const fullWeightOz = item.fullWeightOz || 0;
        const liquorOz = item.liquorOz || 25;
        const emptyWeightOz = item.emptyWeightOz || (fullWeightOz && liquorOz ? Math.max(0, fullWeightOz - liquorOz) : 0);

        // Previous Day
        const prevGross = prev.customPrevious?.runningBottleOz ?? (prev.amRunningBottleOz ?? 0);
        const prevNetRunning = prevGross > 0 ? Math.max(0, +(prevGross - emptyWeightOz).toFixed(2)) : 0;
        const prevBackupFull = prev.customPrevious?.atBarFull ?? (prev.amAtBarFull ?? 0);
        const prevBackupOz = +(prevBackupFull * liquorOz).toFixed(2);
        const prevTotalOz = +(prevNetRunning + prevBackupOz).toFixed(2);

        // Today
        const todayGross = curr.amRunningBottleOz ?? 0;
        const todayNetRunning = todayGross > 0 ? Math.max(0, +(todayGross - emptyWeightOz).toFixed(2)) : 0;
        const todayBackupFull = curr.amAtBarFull ?? 0;
        const todayBackupOz = +(todayBackupFull * liquorOz).toFixed(2);
        const todayTotalOz = +(todayNetRunning + todayBackupOz).toFixed(2);

        // PM Closing
        const pmGross = curr.pmRunningBottleOz ?? 0;
        const pmNetRunning = pmGross > 0 ? Math.max(0, +(pmGross - emptyWeightOz).toFixed(2)) : 0;
        const pmBackupFull = curr.pmAtBarFull ?? 0;
        const pmBackupOz = +(pmBackupFull * liquorOz).toFixed(2);
        const pmTotalOz = +(pmNetRunning + pmBackupOz).toFixed(2);

        // In Excel: cell N22 = G22 - M22 (Total Previous oz - Total Today oz)
        // This is positive when liquor is consumed! E.g. used 20 oz
        const diffOz = +(prevTotalOz - todayTotalOz).toFixed(2);
        const soldOz = curr.sold || 0;
        // Variance = Sold - Used (if sold 20 oz and used 20 oz, variance = 0. If used 25 oz and sold 20, variance = -5)
        const varianceOz = +(soldOz - diffOz).toFixed(2);

        return {
          itemId: item._id,
          name: item.name,
          category: item.category,
          specs: {
            fullWeightOz,
            liquorOz,
            emptyWeightOz
          },
          previous: {
            grossRunningOz: prevGross,
            netRunningOz: prevNetRunning,
            backupFullCount: prevBackupFull,
            backupWeightOz: prevBackupOz,
            totalOz: prevTotalOz
          },
          today: {
            grossRunningOz: todayGross,
            netRunningOz: todayNetRunning,
            backupFullCount: todayBackupFull,
            backupWeightOz: todayBackupOz,
            totalOz: todayTotalOz
          },
          pm: {
            grossRunningOz: pmGross,
            netRunningOz: pmNetRunning,
            backupFullCount: pmBackupFull,
            backupWeightOz: pmBackupOz,
            totalOz: pmTotalOz
          },
          differenceOz: diffOz,
          soldOz,
          varianceOz
        };
      }
    });

    res.json({
      date,
      previousDate: prevDoc ? prevDoc.date : prevDateStr,
      amBartender: currentDoc?.amBartender || '',
      pmBartender: currentDoc?.pmBartender || '',
      prevAmBartender: prevDoc?.amBartender || '',
      prevPmBartender: prevDoc?.pmBartender || '',
      report
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   POST /api/liquor/save-sold
// @desc    Save sold values for variance reconciliation
router.post('/save-sold', async (req, res) => {
  const { date, soldMap } = req.body;
  if (!date || !soldMap) {
    return res.status(400).json({ error: 'date and soldMap are required' });
  }

  try {
    let countDoc = await LiquorCount.findOne({ restaurant: req.restaurantId, date });
    if (!countDoc) {
      return res.status(404).json({ error: 'Count document for this date not found' });
    }

    countDoc.items.forEach(item => {
      const key = item.name.toLowerCase().trim();
      if (soldMap[key] !== undefined) {
        item.sold = Number(soldMap[key]) || 0;
      }
    });

    await countDoc.save();
    res.json({ success: true, count: countDoc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
