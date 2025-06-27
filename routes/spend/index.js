const express = require('express');
const Spend = require('../../model/Spend');
const auth = require('../../middleware/auth');
const router = express.Router();


// Create a new spend
router.post('/', auth, async (req, res) => {
    const { date, description, category, type, amount } = req.body;
    try {
        const spend = new Spend({
            user: req.userId, 
            date, description, category, type, amount
        });

        await spend.save();
        res.status(201).json(spend);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});


// Get all spends for the authenticated user
router.get('/', auth, async (req, res) => {
    try {
        const spends = await Spend.find({ user: req.userId });
        res.json(spends);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});


// ✅ Edit a spend by ID
router.put('/:id', auth, async (req, res) => {
    const { id } = req.params;
    const { date, description, category, type, amount } = req.body;

    try {
        const updated = await Spend.findOneAndUpdate(
            { _id: id, user: req.userId },
            { date, description, category, type, amount },
            { new: true }
        );

        if (!updated) {
            return res.status(404).json({ message: 'Spend not found' });
        }

        res.json(updated);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});


// ✅ Delete a spend by ID
router.delete('/:id', auth, async (req, res) => {
    const { id } = req.params;

    try {
        const deleted = await Spend.findOneAndDelete({ _id: id, user: req.userId });

        if (!deleted) {
            return res.status(404).json({ message: 'Spend not found' });
        }

        res.json({ message: 'Spend deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
