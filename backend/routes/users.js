const express = require('express');
const { db, saveDatabase } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

// Get user profile
router.get('/profile', authenticateToken, (req, res) => {
    try {
        const user = db.prepare(`
            SELECT id, name, email, student_id, phone, avatar, created_at 
            FROM users WHERE id = ?
        `).get(req.user.id);

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            studentId: user.student_id,
            phone: user.phone,
            avatar: user.avatar ? `/uploads/${user.avatar}` : null,
            createdAt: user.created_at
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Failed to get profile.' });
    }
});

// Update user profile
router.put('/profile', authenticateToken, upload.single('avatar'), (req, res) => {
    try {
        const { name, phone, studentId } = req.body;

        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const avatar = req.file ? req.file.filename : user.avatar;

        db.prepare(`
            UPDATE users 
            SET name = ?, phone = ?, student_id = ?, avatar = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            name || user.name,
            phone || user.phone,
            studentId || user.student_id,
            avatar,
            req.user.id
        );

        const updatedUser = db.prepare(`
            SELECT id, name, email, student_id, phone, avatar, created_at 
            FROM users WHERE id = ?
        `).get(req.user.id);

        res.json({
            message: 'Profile updated successfully!',
            user: {
                id: updatedUser.id,
                name: updatedUser.name,
                email: updatedUser.email,
                studentId: updatedUser.student_id,
                phone: updatedUser.phone,
                avatar: updatedUser.avatar ? `/uploads/${updatedUser.avatar}` : null,
                createdAt: updatedUser.created_at
            }
        });
        
        saveDatabase();
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Failed to update profile.' });
    }
});

// Get user's claims
router.get('/claims', authenticateToken, (req, res) => {
    try {
        const claims = db.prepare(`
            SELECT 
                c.*,
                i.name as item_name,
                i.status as item_status,
                i.category as item_category,
                i.image as item_image,
                u.name as owner_name,
                u.email as owner_email
            FROM claims c
            JOIN items i ON c.item_id = i.id
            JOIN users u ON i.user_id = u.id
            WHERE c.user_id = ?
            ORDER BY c.created_at DESC
        `).all(req.user.id);

        res.json({
            claims: claims.map(c => ({
                id: c.id,
                message: c.message,
                status: c.status,
                item: {
                    id: c.item_id,
                    name: c.item_name,
                    status: c.item_status,
                    category: c.item_category,
                    image: c.item_image ? `/uploads/${c.item_image}` : null
                },
                owner: {
                    name: c.owner_name,
                    email: c.owner_email
                },
                createdAt: c.created_at
            }))
        });
    } catch (error) {
        console.error('Get claims error:', error);
        res.status(500).json({ error: 'Failed to fetch claims.' });
    }
});

// Get user's items
router.get('/items', authenticateToken, (req, res) => {
    try {
        const items = db.prepare(`
            SELECT * FROM items WHERE user_id = ? ORDER BY created_at DESC
        `).all(req.user.id);

        res.json({
            items: items.map(item => ({
                id: item.id,
                name: item.name,
                description: item.description,
                category: item.category,
                status: item.status,
                location: item.location,
                dateLostFound: item.date_lost_found,
                image: item.image ? `/uploads/${item.image}` : null,
                createdAt: item.created_at
            }))
        });
    } catch (error) {
        console.error('Get user items error:', error);
        res.status(500).json({ error: 'Failed to fetch items.' });
    }
});

// Get claims on user's items
router.get('/item-claims', authenticateToken, (req, res) => {
    try {
        const claims = db.prepare(`
            SELECT 
                c.*,
                i.name as item_name,
                i.status as item_status,
                u.name as claimer_name,
                u.email as claimer_email,
                u.phone as claimer_phone
            FROM claims c
            JOIN items i ON c.item_id = i.id
            JOIN users u ON c.user_id = u.id
            WHERE i.user_id = ?
            ORDER BY c.created_at DESC
        `).all(req.user.id);

        res.json({
            claims: claims.map(c => ({
                id: c.id,
                message: c.message,
                status: c.status,
                item: {
                    id: c.item_id,
                    name: c.item_name,
                    status: c.item_status
                },
                claimer: {
                    id: c.user_id,
                    name: c.claimer_name,
                    email: c.claimer_email,
                    phone: c.claimer_phone
                },
                createdAt: c.created_at
            }))
        });
    } catch (error) {
        console.error('Get item claims error:', error);
        res.status(500).json({ error: 'Failed to fetch claims.' });
    }
});

// Create search alert
router.post('/alerts', authenticateToken, (req, res) => {
    try {
        const { keywords, category } = req.body;

        if (!keywords) {
            return res.status(400).json({ error: 'Keywords are required.' });
        }

        const result = db.prepare(`
            INSERT INTO search_alerts (user_id, keywords, category)
            VALUES (?, ?, ?)
        `).run(req.user.id, keywords, category || null);
        
        saveDatabase();

        res.status(201).json({
            message: 'Search alert created successfully!',
            alertId: result.lastInsertRowid
        });
    } catch (error) {
        console.error('Create alert error:', error);
        res.status(500).json({ error: 'Failed to create alert.' });
    }
});

// Get user's search alerts
router.get('/alerts', authenticateToken, (req, res) => {
    try {
        const alerts = db.prepare(`
            SELECT * FROM search_alerts WHERE user_id = ? ORDER BY created_at DESC
        `).all(req.user.id);

        res.json({ alerts });
    } catch (error) {
        console.error('Get alerts error:', error);
        res.status(500).json({ error: 'Failed to fetch alerts.' });
    }
});

// Delete search alert
router.delete('/alerts/:id', authenticateToken, (req, res) => {
    try {
        const alert = db.prepare('SELECT * FROM search_alerts WHERE id = ? AND user_id = ?')
            .get(req.params.id, req.user.id);

        if (!alert) {
            return res.status(404).json({ error: 'Alert not found.' });
        }

        db.prepare('DELETE FROM search_alerts WHERE id = ?').run(req.params.id);
        saveDatabase();

        res.json({ message: 'Alert deleted successfully!' });
    } catch (error) {
        console.error('Delete alert error:', error);
        res.status(500).json({ error: 'Failed to delete alert.' });
    }
});

module.exports = router;
