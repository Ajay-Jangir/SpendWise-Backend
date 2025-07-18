const express = require("express");
const crypto = require("crypto");
const User = require("../../model/User");
const transporter = require("../../mailTransaport");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");


router.post("/", async (req, res) => {
    const { email } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: "User not found" });

        const token = crypto.randomBytes(32).toString("hex");
        const expiry = Date.now() + 1000 * 60 * 15;

        user.resetToken = token;
        user.resetTokenExpiry = expiry;
        await user.save();

        const resetLink = `http://localhost:5173/resetpassword/${token}`;

        await transporter.sendMail({
            from: `"SpendWise Support" <${process.env.MAIL_USER}>`,
            to: user.email,
            subject: "Reset your SpendWise password",
            html: `
                <p>Hello ${user.name},</p>
                <p>You requested to reset your password. Click below:</p>
                <a href="${resetLink}" target="_blank">Reset Password</a>
                <p>This link will expire in 15 minutes.</p>
            `,
        });

        res.json({ message: "Reset link sent to your email" });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});


router.post("/update", async (req, res) => {
    try {
        const { token, password } = req.body;

        if (!token || !password) {
            return res
                .status(400)
                .json({ message: "Token and password are required" });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId); // ← use userId instead of id
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashed = await bcrypt.hash(password, salt);

        user.password = hashed;
        await user.save();
        res.status(200).json({ message: "Password updated successfully" });

    } catch (err) {
        if (err.name === "TokenExpiredError") {
            return res.status(401).json({ message: "Reset link expired" });
        }

        res.status(500).json({ message: "Something went wrong" });
    }
});



module.exports = router;
