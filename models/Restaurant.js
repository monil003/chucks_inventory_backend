const mongoose = require('mongoose');

const RestaurantSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  approved: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  csvMapping: {
    orderGuideNameKey: { type: String, default: 'Description' },
    orderGuideUnitKey: { type: String, default: 'Unit Measure' },
    countNameKey: { type: String, default: 'Description' },
    countQtyKey: { type: String, default: 'Quantity' },
    initialCountNameKey: { type: String, default: 'Description' },
    initialCountQtyKey: { type: String, default: 'Quantity' },
    endCountNameKey: { type: String, default: 'Description' },
    endCountQtyKey: { type: String, default: 'Quantity' },
    salesSkuKey: { type: String, default: 'item_sku_code' },
    salesNameKey: { type: String, default: 'item_name' },
    salesQtyKey: { type: String, default: 'qty' },
    salesAddonQtyKey: { type: String, default: 'addon_qty' }
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Restaurant', RestaurantSchema);
