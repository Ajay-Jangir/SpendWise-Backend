const express = require("express");
const { encrypt, decrypt } = require("../../utils/encryption");
const jwt = require("jsonwebtoken");
const User = require("../../model/User");
const auth = require("../../middleware/auth");
const validator = require("validator");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "AjayJangirAdmin";

// to register admin enable this;

// router.post("/register", async (req, res) => {
//     let { name, email, password, isAdmin = true } = req.body;
//     email = email.toLowerCase().trim();
//     if (!validator.isEmail(email)) {
//         return res.status(400).json({ message: "Invalid email format" });
//     }
//     try {
//         const existingUser = await User.findOne({ email });
//         if (existingUser) {
//             return res.status(409).json({ message: "Email already registered. Please use another." });
//         }
//         const hashedPassword = encrypt(password);
//         const user = new User({ name, email, password: hashedPassword, isAdmin });
//         await user.save();

//         res.status(201).json({ message: "Admin Registered Successfully" });
//     } catch (err) {
//         console.error(err);
//         res.status(500).json({ message: "Registration Failed" });
//     }
// });

router.post("/register", async (req, res) => {
    let { name, email, password } = req.body;

    email = email.toLowerCase().trim();

    if (!validator.isEmail(email)) {
        return res.status(400).json({ message: "Invalid email format" });
    }

    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).json({
                message: "Email already registered. Please use another email.",
            });
        }

        const hashedPassword = encrypt(password);
        const user = new User({ name, email, password: hashedPassword });
        await user.save();

        res.status(201).json({ message: "User Registered Successfully" });
    } catch (err) {
        res.status(500).json({ message: "Registration Failed. Please try again." });
    }
});

router.post("/login", async (req, res) => {
    let { email, password } = req.body;

    email = email.toLowerCase().trim();

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: "Invalid Credentials" });
        }

        const decryptedPassword = decrypt(user.password);
        if (password !== decryptedPassword) {
            return res.status(401).json({ message: "Invalid Credentials" });
        }

        const token = jwt.sign(
            { userId: user._id, isAdmin: user.isAdmin },
            JWT_SECRET,
            { expiresIn: "2h" }
        );

        res.json({ token });
    } catch (err) {
        res.status(500).json({ message: "Login Failed" });
    }
});

router.put("/edit", auth, async (req, res) => {
    let { name, email, currentPassword, password: newPassword } = req.body;

    const userId = req.userId;
    if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Update name (username)
        if (name) {
            user.name = name;
        }

        // Update email after checking uniqueness
        if (email && email !== user.email) {
            const normalizedEmail = email.toLowerCase().trim();
            const emailExists = await User.findOne({ email: normalizedEmail });
            if (emailExists && emailExists._id.toString() !== userId) {
                return res.status(409).json({ message: "Email is already in use" });
            }
            user.email = normalizedEmail;
        }

        // Handle password change
        if (currentPassword && newPassword) {
            const oldPassword = decrypt(user.password);
            if (currentPassword !== oldPassword) {
                return res
                    .status(401)
                    .json({ message: "Current password is incorrect" });
            }
            if (newPassword === oldPassword) {
                return res.status(400).json({
                    message: "New password must be different from current password",
                });
            }

            const hashedPassword = encrypt(newPassword);
            user.password = hashedPassword;
        }

        await user.save();
        res.json({ message: "User updated successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Update failed" });
    }
});

// Get all non-admin users (admin only access)
router.get("/user", auth, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("name email");

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        res.status(200).json({
            _id: user._id,
            name: user.name,
            email: user.email,
        });
    } catch (error) {
        console.error("Error fetching user:", error);
        res.status(500).json({ error: "Failed to fetch user" });
    }
});

module.exports = router;
