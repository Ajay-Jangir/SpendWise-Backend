const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../../model/User');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'AjayJangirAdmin';


router.post('/register', async (req, res) => {
    const { name, email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ name, email, password: hashedPassword });
        await user.save();
        res.status(201).json({ message: 'User Registered Successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Registration Failed' });
    }
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: 'Invalid Credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid Credentials' });
        }

        const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '2h' });
        res.json({ token });
    } catch (err) {
        res.status(500).json({ message: 'Login Failed' });
    }
});

module.exports = router;
