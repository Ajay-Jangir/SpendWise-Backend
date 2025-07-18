const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const spendRoutes = require('./routes/spend');
const importRoutes = require('./routes/import');
const exportRoutes = require('./routes/export');
const resetPassword = require('./routes/resetPassword');
const users = require("./routes/users")

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/spend', spendRoutes);
app.use('/api/import', importRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/resetPassword', resetPassword);
app.use('/api/users', users);

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('✅ MongoDB Connected Successfully');
        app.listen(PORT, () => console.log(`🚀 Server running on port http://localhost:${PORT}`));
    })
    .catch(err => console.error('❌ MongoDB connection error:', err));