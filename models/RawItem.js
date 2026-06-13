const mongoose = require('mongoose');

const RawItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  unit: {
    type: String,
    required: true,
    trim: true
  },
  quantityPerBox: {
    type: Number,
    default: 0
  },
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true
  }
}, {
  timestamps: true
});

RawItemSchema.index({ name: 1, restaurant: 1 }, { unique: true });

module.exports = mongoose.model('RawItem', RawItemSchema);
