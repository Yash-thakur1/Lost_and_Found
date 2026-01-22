const express = require('express');
const bcrypt = require('bcryptjs');
const { db, saveDatabase } = require('../database');
const { generateToken, authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Register new user
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, studentId, phone } = req.body;

        // Validation
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email, and password are required.' });
        }

        // Check if email already exists
        const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (existingUser) {
            return res.status(400).json({ error: 'Email already registered.' });
        }

        // Check if student ID already exists (if provided)
        if (studentId) {
            const existingStudentId = db.prepare('SELECT id FROM users WHERE student_id = ?').get(studentId);
            if (existingStudentId) {
                return res.status(400).json({ error: 'Student ID already registered.' });
            }
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert user
        const result = db.prepare(`
            INSERT INTO users (name, email, password, student_id, phone) 
            VALUES (?, ?, ?, ?, ?)
        `).run(name, email, hashedPassword, studentId || null, phone || null);
        
        saveDatabase();

        const user = db.prepare('SELECT id, name, email, student_id, phone, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);

        // Generate token
        const token = generateToken(user);

        res.status(201).json({
            message: 'Registration successful!',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                studentId: user.student_id,
                phone: user.phone
            },
            token
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
});

// Login user
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validation
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        // Find user
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        // Generate token
        const token = generateToken(user);

        res.json({
            message: 'Login successful!',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                studentId: user.student_id,
                phone: user.phone,
                avatar: user.avatar
            },
            token
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed. Please try again.' });
    }
});

// Get current user profile
router.get('/me', authenticateToken, (req, res) => {
    try {
        const user = db.prepare(`
            SELECT id, name, email, student_id, phone, avatar, created_at 
            FROM users WHERE id = ?
        `).get(req.user.id);

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // Get user's items count
        const itemsCount = db.prepare(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) as lost,
                SUM(CASE WHEN status = 'found' THEN 1 ELSE 0 END) as found,
                SUM(CASE WHEN status = 'claimed' OR status = 'returned' THEN 1 ELSE 0 END) as resolved
            FROM items WHERE user_id = ?
        `).get(req.user.id);

        res.json({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                studentId: user.student_id,
                phone: user.phone,
                avatar: user.avatar,
                createdAt: user.created_at
            },
            stats: itemsCount
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Failed to get profile.' });
    }
});

// Update password
router.put('/password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current and new password are required.' });
        }

        // Get user
        const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);

        // Verify current password
        const validPassword = await bcrypt.compare(currentPassword, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Current password is incorrect.' });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password
        db.prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(hashedPassword, req.user.id);

        res.json({ message: 'Password updated successfully!' });
    } catch (error) {
        console.error('Password update error:', error);
        res.status(500).json({ error: 'Failed to update password.' });
    }
});

// Logout (client-side should delete token)
router.post('/logout', authenticateToken, (req, res) => {
    res.json({ message: 'Logged out successfully!' });
});

module.exports = router;
