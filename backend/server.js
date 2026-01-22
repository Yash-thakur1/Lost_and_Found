const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');
const authRoutes = require('./routes/auth');
const itemRoutes = require('./routes/items');
const userRoutes = require('./routes/users');
const contactRoutes = require('./routes/contact');
const notificationRoutes = require('./routes/notifications');
const statsRoutes = require('./routes/stats');
const adminRoutes = require('./routes/admin');
const archiveRoutes = require('./routes/archive');
const scheduler = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve frontend files
app.use(express.static(path.join(__dirname, '..')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/users', userRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/archive', archiveRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Campus Lost & Found API is running!' });
});

// Serve frontend for any other route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!', message: err.message });
});

// Initialize database and start server
async function startServer() {
    await db.initialize();
    
    // Make database available to routes
    app.set('db', db.getDb());
    app.set('saveDatabase', db.saveDatabase);
    
    app.listen(PORT, () => {
        console.log(`🚀 Server is running on http://localhost:${PORT}`);
        console.log(`📦 API available at http://localhost:${PORT}/api`);
        console.log(`🔐 Admin portal at http://localhost:${PORT}/admin.html`);
        
        // Start the archive scheduler
        scheduler.startScheduler(60); // Run every 60 minutes
    });
}

startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
