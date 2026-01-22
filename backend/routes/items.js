const express = require('express');
const { db, saveDatabase } = require('../database');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

// Get all items with filters
router.get('/', optionalAuth, (req, res) => {
    try {
        const { category, status, search, location, page = 1, limit = 12 } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT 
                i.*,
                u.name as reporter_name,
                u.email as reporter_email
            FROM items i
            JOIN users u ON i.user_id = u.id
            WHERE 1=1
        `;
        const params = [];

        if (category && category !== 'all') {
            query += ' AND i.category = ?';
            params.push(category);
        }

        if (status) {
            query += ' AND i.status = ?';
            params.push(status);
        }

        if (location) {
            query += ' AND i.location = ?';
            params.push(location);
        }

        if (search) {
            query += ' AND (i.name LIKE ? OR i.description LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        // Get total count
        const countQuery = query.replace('SELECT \n                i.*,\n                u.name as reporter_name,\n                u.email as reporter_email', 'SELECT COUNT(*) as total');
        const totalResult = db.prepare(countQuery).get(...params);

        // Add pagination
        query += ' ORDER BY i.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const items = db.prepare(query).all(...params);

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
                rewardAmount: item.reward_amount || 0,
                rewardOffered: item.reward_offered || 0,
                reporter: {
                    id: item.user_id,
                    name: item.reporter_name,
                    email: item.reporter_email
                },
                createdAt: item.created_at
            })),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalResult.total,
                pages: Math.ceil(totalResult.total / limit)
            }
        });
    } catch (error) {
        console.error('Get items error:', error);
        res.status(500).json({ error: 'Failed to fetch items.' });
    }
});

// Get single item
router.get('/:id', optionalAuth, (req, res) => {
    try {
        const item = db.prepare(`
            SELECT 
                i.*,
                u.name as reporter_name,
                u.email as reporter_email,
                u.phone as reporter_phone
            FROM items i
            JOIN users u ON i.user_id = u.id
            WHERE i.id = ?
        `).get(req.params.id);

        if (!item) {
            return res.status(404).json({ error: 'Item not found.' });
        }

        // Get claims for this item
        const claims = db.prepare(`
            SELECT c.*, u.name as claimer_name, u.email as claimer_email
            FROM claims c
            JOIN users u ON c.user_id = u.id
            WHERE c.item_id = ?
            ORDER BY c.created_at DESC
        `).all(req.params.id);

        res.json({
            id: item.id,
            name: item.name,
            description: item.description,
            category: item.category,
            status: item.status,
            location: item.location,
            dateLostFound: item.date_lost_found,
            image: item.image ? `/uploads/${item.image}` : null,
            rewardAmount: item.reward_amount || 0,
            rewardOffered: item.reward_offered || 0,
            reporter: {
                id: item.user_id,
                name: item.reporter_name,
                email: item.reporter_email,
                phone: item.reporter_phone
            },
            claims: claims.map(c => ({
                id: c.id,
                message: c.message,
                status: c.status,
                claimer: { name: c.claimer_name, email: c.claimer_email },
                createdAt: c.created_at
            })),
            createdAt: item.created_at
        });
    } catch (error) {
        console.error('Get item error:', error);
        res.status(500).json({ error: 'Failed to fetch item.' });
    }
});

// Create new item
router.post('/', authenticateToken, upload.single('image'), (req, res) => {
    try {
        const { name, description, category, status, location, dateLostFound, rewardAmount } = req.body;

        // Validation
        if (!name || !description || !category || !status || !location || !dateLostFound) {
            return res.status(400).json({ error: 'All fields are required.' });
        }

        const image = req.file ? req.file.filename : null;
        const reward = rewardAmount && parseFloat(rewardAmount) > 0 ? parseFloat(rewardAmount) : 0;
        const rewardOffered = reward > 0 ? 1 : 0;

        const result = db.prepare(`
            INSERT INTO items (name, description, category, status, location, date_lost_found, image, user_id, reward_amount, reward_offered)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(name, description, category, status, location, dateLostFound, image, req.user.id, reward, rewardOffered);

        // Log activity
        const rewardMsg = reward > 0 ? ` (Reward: $${reward})` : '';
        db.prepare(`
            INSERT INTO activity_log (type, message, user_id, item_id)
            VALUES (?, ?, ?, ?)
        `).run(status, `New ${status} item reported: ${name} at ${location}${rewardMsg}`, req.user.id, result.lastInsertRowid);
        
        saveDatabase();

        // Check for potential matches and create notifications
        checkForMatches(result.lastInsertRowid, status, category, name);

        const newItem = db.prepare('SELECT * FROM items WHERE id = ?').get(result.lastInsertRowid);

        res.status(201).json({
            message: 'Item reported successfully!',
            item: {
                id: newItem.id,
                name: newItem.name,
                description: newItem.description,
                category: newItem.category,
                status: newItem.status,
                location: newItem.location,
                dateLostFound: newItem.date_lost_found,
                image: newItem.image ? `/uploads/${newItem.image}` : null,
                rewardAmount: newItem.reward_amount,
                rewardOffered: newItem.reward_offered,
                createdAt: newItem.created_at
            }
        });
    } catch (error) {
        console.error('Create item error:', error);
        res.status(500).json({ error: 'Failed to create item.' });
    }
});

// Update item
router.put('/:id', authenticateToken, upload.single('image'), (req, res) => {
    try {
        const { name, description, category, status, location, dateLostFound } = req.body;

        // Check if item exists and belongs to user
        const item = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
        if (!item) {
            return res.status(404).json({ error: 'Item not found.' });
        }
        if (item.user_id !== req.user.id) {
            return res.status(403).json({ error: 'You can only edit your own items.' });
        }

        const image = req.file ? req.file.filename : item.image;

        db.prepare(`
            UPDATE items 
            SET name = ?, description = ?, category = ?, status = ?, location = ?, 
                date_lost_found = ?, image = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(name, description, category, status, location, dateLostFound, image, req.params.id);

        const updatedItem = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
        saveDatabase();

        res.json({
            message: 'Item updated successfully!',
            item: updatedItem
        });
    } catch (error) {
        console.error('Update item error:', error);
        res.status(500).json({ error: 'Failed to update item.' });
    }
});

// Delete item
router.delete('/:id', authenticateToken, (req, res) => {
    try {
        const item = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
        if (!item) {
            return res.status(404).json({ error: 'Item not found.' });
        }
        if (item.user_id !== req.user.id) {
            return res.status(403).json({ error: 'You can only delete your own items.' });
        }

        db.prepare('DELETE FROM items WHERE id = ?').run(req.params.id);
        saveDatabase();

        res.json({ message: 'Item deleted successfully!' });
    } catch (error) {
        console.error('Delete item error:', error);
        res.status(500).json({ error: 'Failed to delete item.' });
    }
});

// Claim an item
router.post('/:id/claim', authenticateToken, (req, res) => {
    try {
        const { message } = req.body;
        const itemId = req.params.id;

        const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
        if (!item) {
            return res.status(404).json({ error: 'Item not found.' });
        }

        // Check if user already claimed this item
        const existingClaim = db.prepare('SELECT * FROM claims WHERE item_id = ? AND user_id = ?')
            .get(itemId, req.user.id);
        if (existingClaim) {
            return res.status(400).json({ error: 'You have already claimed this item.' });
        }

        // Create claim
        const result = db.prepare(`
            INSERT INTO claims (item_id, user_id, message)
            VALUES (?, ?, ?)
        `).run(itemId, req.user.id, message || '');

        // Notify item owner
        db.prepare(`
            INSERT INTO notifications (user_id, type, title, message, related_item_id)
            VALUES (?, ?, ?, ?, ?)
        `).run(
            item.user_id,
            'claim',
            'New Claim on Your Item',
            `Someone has claimed your ${item.status} item: ${item.name}`,
            itemId
        );

        // Log activity
        db.prepare(`
            INSERT INTO activity_log (type, message, user_id, item_id)
            VALUES (?, ?, ?, ?)
        `).run('claimed', `Item claim submitted: ${item.name}`, req.user.id, itemId);
        
        saveDatabase();

        res.status(201).json({
            message: 'Claim submitted successfully! The item owner will be notified.',
            claimId: result.lastInsertRowid
        });
    } catch (error) {
        console.error('Claim item error:', error);
        res.status(500).json({ error: 'Failed to submit claim.' });
    }
});

// Approve/Reject claim
router.put('/claims/:claimId', authenticateToken, (req, res) => {
    try {
        const { status } = req.body; // 'approved' or 'rejected'
        const claimId = req.params.claimId;

        const claim = db.prepare(`
            SELECT c.*, i.user_id as item_owner_id, i.name as item_name
            FROM claims c
            JOIN items i ON c.item_id = i.id
            WHERE c.id = ?
        `).get(claimId);

        if (!claim) {
            return res.status(404).json({ error: 'Claim not found.' });
        }

        if (claim.item_owner_id !== req.user.id) {
            return res.status(403).json({ error: 'Only the item owner can approve/reject claims.' });
        }

        // Update claim status
        db.prepare('UPDATE claims SET status = ? WHERE id = ?').run(status, claimId);

        // If approved, update item status
        if (status === 'approved') {
            db.prepare('UPDATE items SET status = ?, claimed_by = ? WHERE id = ?')
                .run('claimed', claim.user_id, claim.item_id);
        }

        // Notify claimer
        db.prepare(`
            INSERT INTO notifications (user_id, type, title, message, related_item_id)
            VALUES (?, ?, ?, ?, ?)
        `).run(
            claim.user_id,
            status === 'approved' ? 'approved' : 'rejected',
            `Claim ${status.charAt(0).toUpperCase() + status.slice(1)}`,
            `Your claim for ${claim.item_name} has been ${status}.`,
            claim.item_id
        );
        
        saveDatabase();

        res.json({ message: `Claim ${status} successfully!` });
    } catch (error) {
        console.error('Update claim error:', error);
        res.status(500).json({ error: 'Failed to update claim.' });
    }
});

// Get user's items
router.get('/user/my-items', authenticateToken, (req, res) => {
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

// Helper function to check for matches
function checkForMatches(newItemId, status, category, name) {
    const oppositeStatus = status === 'lost' ? 'found' : 'lost';
    
    // Find similar items
    const matches = db.prepare(`
        SELECT i.*, u.id as owner_id
        FROM items i
        JOIN users u ON i.user_id = u.id
        WHERE i.status = ? 
        AND i.category = ?
        AND i.id != ?
        AND (i.name LIKE ? OR ? LIKE '%' || i.name || '%')
        LIMIT 5
    `).all(oppositeStatus, category, newItemId, `%${name}%`, name);

    // Create notifications for potential matches
    matches.forEach(match => {
        db.prepare(`
            INSERT INTO notifications (user_id, type, title, message, related_item_id)
            VALUES (?, ?, ?, ?, ?)
        `).run(
            match.owner_id,
            'match',
            'Potential Match Found!',
            `A ${status} item similar to your ${oppositeStatus} item "${match.name}" has been reported.`,
            newItemId
        );
    });
    
    if (matches.length > 0) {
        saveDatabase();
    }
}

module.exports = router;
