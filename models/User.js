const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    required: true,
    enum: ['admin', 'manager', 'staff', 'food_access', 'liquor_access'],
    default: 'staff'
  },
  approved: {
    type: Boolean,
    default: false
  },
  restaurants: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant'
    }
  ]
}, {
  timestamps: true
});

module.exports = mongoose.model('User', UserSchema);
