const express = require("express");
const { encrypt, decrypt } = require("../../utils/encryption");
const jwt = require("jsonwebtoken");
const User = require("../../model/User");
const auth = require("../../middleware/adminAuth");
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
            return res
                .status(409)
                .json({ message: "Email already registered. Please use another." });
        }

        const hashedPassword = encrypt(password);
        const user = new User({ name, email, password: hashedPassword });
        await user.save();

        res.status(201).json({ message: "User Registered Successfully" });
    } catch (err) {
        console.error(err);
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
    let { name, email, password } = req.body;

    email = email.toLowerCase().trim();

    const userId = req.userId;

    if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
    }

    try {
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (name) {
            user.name = name;
        }

        if (email && email !== user.email) {
            const emailExists = await User.findOne({ email });
            if (emailExists && emailExists._id.toString() !== userId) {
                return res.status(409).json({ message: "Email is already in use" });
            }
            user.email = email;
        }

        if (password) {
            const oldPassword = decrypt(user.password);
            if (password === oldPassword) {
                return res
                    .status(400)
                    .json({ message: "New password cannot be same as old password" });
            }
            const hashedPassword = encrypt(password);
            user.password = hashedPassword;
        }

        await user.save();
        res.json({ message: "User updated successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Update failed" });
    }
});

module.exports = router;
