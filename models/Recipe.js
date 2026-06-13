const mongoose = require('mongoose');

const RecipeSchema = new mongoose.Schema({
  menuItemSku: {
    type: String,
    required: true,
    index: true
  },
  menuItemName: {
    type: String,
    required: true
  },
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true
  },
  ingredients: [
    {
      rawItemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'RawItem',
        required: true
      },
      quantity: {
        type: Number,
        required: true,
        min: 0
      }
    }
  ]
}, {
  timestamps: true
});

RecipeSchema.index({ menuItemSku: 1, restaurant: 1 }, { unique: true });

module.exports = mongoose.model('Recipe', RecipeSchema);
