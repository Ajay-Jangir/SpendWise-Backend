const mongoose = require('mongoose')

const spendSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },
  description: { type: String, required: true },
  category: { type: String, required: true },
  type: { type: String, enum: ['income', 'expense'], required: true },
  amount: { type: Number, required: true }
});

module.exports = mongoose.model('Spend', spendSchema);