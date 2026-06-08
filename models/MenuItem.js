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
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('MenuItem', MenuItemSchema);
