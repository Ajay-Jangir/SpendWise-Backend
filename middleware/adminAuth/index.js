
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'AjayJangirAdmin';

const adminAuth = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // ❗ Check if user is admin
        if (!decoded.isAdmin) {
            return res.status(403).json({ message: 'Access denied: Admins only' });
        }

        req.userId = decoded.userId;
        req.isAdmin = true;
        next();
    } catch (err) {
        res.status(401).json({ message: 'Invalid token' });
    }
};

module.exports = adminAuth;