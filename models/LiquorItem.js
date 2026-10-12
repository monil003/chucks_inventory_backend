const mongoose = require('mongoose');

const LiquorItemSchema = new mongoose.Schema({
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    required: true,
    enum: ['beer', 'liquor', 'wine']
  },
  boxCount: {
    type: Number,
    default: 24 // default 24 cans/bottles per box
  },
  fullWeightOz: {
    type: Number,
    default: 0
  },
  liquorOz: {
    type: Number,
    default: 25.0 // 25 oz for 750ml, 38.5 oz for 1.14L
  },
  emptyWeightOz: {
    type: Number,
    default: 0 // tare weight = fullWeightOz - liquorOz
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('LiquorItem', LiquorItemSchema);
