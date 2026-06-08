const express = require('express');
const router = express.Router();
const Recipe = require('../models/Recipe');

// @route   GET /api/recipes
// @desc    Get all recipes
router.get('/', async (req, res) => {
  try {
    const recipes = await Recipe.find()
      .populate('ingredients.rawItemId')
      .sort({ menuItemName: 1 });
    res.json(recipes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   POST /api/recipes
// @desc    Create or update a recipe
router.post('/', async (req, res) => {
  const { menuItemSku, menuItemName, ingredients } = req.body;
  if (!menuItemSku || !menuItemName || !ingredients || !Array.isArray(ingredients)) {
    return res.status(400).json({ error: 'menuItemSku, menuItemName, and ingredients array are required' });
  }

  try {
    // Clean and validate ingredients
    const formattedIngredients = ingredients.map(ing => ({
      rawItemId: ing.rawItemId,
      quantity: Number(ing.quantity) || 0
    }));

    // Find if recipe exists and update, or create a new one
    const recipe = await Recipe.findOneAndUpdate(
      { menuItemSku },
      { menuItemName, ingredients: formattedIngredients },
      { new: true, upsert: true }
    ).populate('ingredients.rawItemId');

    res.json(recipe);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   DELETE /api/recipes/:id
// @desc    Delete a recipe
router.delete('/:id', async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) {
      return res.status(404).json({ error: 'Recipe not found' });
    }
    await Recipe.deleteOne({ _id: req.params.id });
    res.json({ message: 'Recipe deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
