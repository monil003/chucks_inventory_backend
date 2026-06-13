const mongoose = require('mongoose');

const MenuItemSchema = new mongoose.Schema({
  item_sku_code: {
    type: String,
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  category_name: {
    type: String
  },
  subcat_name: {
    type: String
  },
  type: {
    type: String,
    index: true
  },
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true
  }
}, {
  timestamps: true
});

MenuItemSchema.index({ item_sku_code: 1, restaurant: 1 });

module.exports = mongoose.model('MenuItem', MenuItemSchema);
