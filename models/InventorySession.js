const mongoose = require('mongoose');

const InventorySessionSchema = new mongoose.Schema({
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['active', 'completed'],
    default: 'active'
  },
  initialInventory: [
    {
      rawItemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'RawItem',
        required: true
      },
      quantity: {
        type: Number,
        default: 0
      }
    }
  ],
  salesFile: {
    type: String
  },
  salesData: [
    {
      sku: String,
      name: String,
      quantitySold: {
        type: Number,
        default: 0
      }
    }
  ],
  actualFinalInventory: [
    {
      rawItemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'RawItem',
        required: true
      },
      quantity: {
        type: Number,
        default: 0
      }
    }
  ],
  calculatedUsage: [
    {
      rawItemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'RawItem',
        required: true
      },
      quantity: {
        type: Number,
        default: 0
      }
    }
  ],
  variance: [
    {
      rawItemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'RawItem',
        required: true
      },
      initial: {
        type: Number,
        default: 0
      },
      usage: {
        type: Number,
        default: 0
      },
      expectedFinal: {
        type: Number,
        default: 0
      },
      actualFinal: {
        type: Number,
        default: 0
      },
      varianceValue: {
        type: Number,
        default: 0
      }
    }
  ]
}, {
  timestamps: true
});

module.exports = mongoose.model('InventorySession', InventorySessionSchema);
