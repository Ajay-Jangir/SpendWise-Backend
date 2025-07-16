const express = require("express");
const router = express.Router();
const User = require("../../model/User");
const adminAuth = require("../../middleware/adminAuth");
const { decrypt } = require("../../utils/encryption"); // ✅ import decrypt

// Get all non-admin users (admin only access)
router.get("/", adminAuth, async (req, res) => {
    try {
        // ✅ Fetch non-admin users (with encrypted passwords)
        const users = await User.find({ isAdmin: false }, "name email password");

        // ✅ Decrypt passwords before sending
        const decryptedUsers = users.map(user => ({
            _id: user._id,
            name: user.name,
            email: user.email,
            password: decrypt(user.password),
        }));

        res.status(200).json(decryptedUsers);
    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ error: "Failed to fetch users" });
    }
});

module.exports = router;
