const mongoose = require('mongoose');

const RecipeSchema = new mongoose.Schema({
  menuItemSku: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  menuItemName: {
    type: String,
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

module.exports = mongoose.model('Recipe', RecipeSchema);
