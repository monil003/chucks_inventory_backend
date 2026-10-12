const mongoose = require('mongoose');

const LiquorCountItemSchema = new mongoose.Schema({
  itemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LiquorItem'
  },
  name: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ['beer', 'liquor', 'wine'],
    required: true
  },
  // Beer AM counts
  amBarFridge: { type: Number, default: 0 },
  amAtBackBox: { type: Number, default: 0 },
  amBeerFridgeBottles: { type: Number, default: 0 },

  // Liquor/Wine AM counts
  amRunningBottleOz: { type: Number, default: 0 },
  amAtBarFull: { type: Number, default: 0 },

  // Added/Restocked
  added: { type: Number, default: 0 },

  // Beer PM counts
  pmBarFridge: { type: Number, default: 0 },
  pmAtBackBox: { type: Number, default: 0 },
  pmBeerFridgeBottles: { type: Number, default: 0 },

  // Liquor/Wine PM counts
  pmRunningBottleOz: { type: Number, default: 0 },
  pmAtBarFull: { type: Number, default: 0 },

  // POS Sold
  sold: { type: Number, default: 0 },

  // Optional custom previous day override
  customPrevious: {
    barFridge: Number,
    atBackBox: Number,
    beerFridgeBottles: Number,
    runningBottleOz: Number,
    atBarFull: Number
  }
}, { _id: false });

const WasteLogSchema = new mongoose.Schema({
  time: { type: String, default: '' },
  item: { type: String, default: '' },
  amount: { type: Number, default: 0 },
  unit: { type: String, default: 'oz' },
  reason: { type: String, default: '' },
  loggedBy: { type: String, default: '' }
}, { _id: true });

const LiquorCountSchema = new mongoose.Schema({
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true
  },
  date: {
    type: String,
    required: true,
    index: true // Format: YYYY-MM-DD
  },
  amBartender: {
    type: String,
    default: ''
  },
  pmBartender: {
    type: String,
    default: ''
  },
  items: [LiquorCountItemSchema],
  wasteLogs: [WasteLogSchema],
  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  status: {
    type: String,
    enum: ['draft', 'submitted', 'verified'],
    default: 'draft'
  }
}, {
  timestamps: true
});

LiquorCountSchema.index({ restaurant: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('LiquorCount', LiquorCountSchema);
