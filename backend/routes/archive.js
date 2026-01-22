// ============================================
//  Archive Routes - Auto-Expiry & Archiving System
// ============================================

const express = require('express');
const { db, saveDatabase } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Helper to get archive settings
function getArchiveSettings() {
    const settings = {};
    const rows = db.prepare(`SELECT setting_key, setting_value FROM archive_settings`).all();
    rows.forEach(row => {
        settings[row.setting_key] = parseInt(row.setting_value) || row.setting_value;
    });
    return settings;
}

// ============================================
//  Get Archive Settings
// ============================================
router.get('/settings', (req, res) => {
    try {
        const settings = getArchiveSettings();
        res.json({ settings });
    } catch (error) {
        console.error('Get archive settings error:', error);
        res.status(500).json({ error: 'Failed to fetch archive settings.' });
    }
});

// ============================================
//  Get Archived Items (Public - separate search)
// ============================================
router.get('/items', (req, res) => {
    try {
        const { category, search, location, page = 1, limit = 12 } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT 
                i.*,
                u.name as reporter_name,
                u.email as reporter_email
            FROM items i
            JOIN users u ON i.user_id = u.id
            WHERE i.is_archived = 1
        `;
        const params = [];

        if (category && category !== 'all') {
            query += ' AND i.category = ?';
            params.push(category);
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
        const countQuery = query.replace(
            'SELECT \n                i.*,\n                u.name as reporter_name,\n                u.email as reporter_email',
            'SELECT COUNT(*) as total'
        );
        const totalResult = db.prepare(countQuery).get(...params);

        // Add pagination
        query += ' ORDER BY i.archived_at DESC LIMIT ? OFFSET ?';
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
                isArchived: true,
                archivedAt: item.archived_at,
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
                total: totalResult?.total || 0,
                pages: Math.ceil((totalResult?.total || 0) / limit)
            }
        });
    } catch (error) {
        console.error('Get archived items error:', error);
        res.status(500).json({ error: 'Failed to fetch archived items.' });
    }
});

// ============================================
//  Get Items Expiring Soon (for user notifications)
// ============================================
router.get('/expiring', authenticateToken, (req, res) => {
    try {
        const settings = getArchiveSettings();
        const warningDays = settings.expiry_warning_days || 7;

        const items = db.prepare(`
            SELECT 
                i.*,
                julianday(i.expires_at) - julianday('now') as days_until_expiry
            FROM items i
            WHERE i.user_id = ?
            AND i.is_archived = 0
            AND i.expires_at IS NOT NULL
            AND julianday(i.expires_at) - julianday('now') <= ?
            AND julianday(i.expires_at) - julianday('now') > 0
            ORDER BY i.expires_at ASC
        `).all(req.user.id, warningDays);

        res.json({
            items: items.map(item => ({
                id: item.id,
                name: item.name,
                status: item.status,
                category: item.category,
                expiresAt: item.expires_at,
                daysUntilExpiry: Math.ceil(item.days_until_expiry),
                extensionCount: item.extension_count || 0,
                maxExtensions: settings.max_extensions || 2,
                canExtend: (item.extension_count || 0) < (settings.max_extensions || 2)
            })),
            settings: {
                warningDays,
                maxExtensions: settings.max_extensions || 2,
                extensionDays: settings.extension_days || 30
            }
        });
    } catch (error) {
        console.error('Get expiring items error:', error);
        res.status(500).json({ error: 'Failed to fetch expiring items.' });
    }
});

// ============================================
//  Extend Item Listing
// ============================================
router.post('/extend/:id', authenticateToken, (req, res) => {
    try {
        const itemId = req.params.id;
        const settings = getArchiveSettings();
        const maxExtensions = settings.max_extensions || 2;
        const extensionDays = settings.extension_days || 30;

        // Get the item
        const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
        
        if (!item) {
            return res.status(404).json({ error: 'Item not found.' });
        }

        // Check ownership
        if (item.user_id !== req.user.id) {
            return res.status(403).json({ error: 'You can only extend your own items.' });
        }

        // Check if already archived
        if (item.is_archived === 1) {
            return res.status(400).json({ error: 'Cannot extend an archived item. Please repost it instead.' });
        }

        // Check extension limit
        const currentExtensions = item.extension_count || 0;
        if (currentExtensions >= maxExtensions) {
            return res.status(400).json({ 
                error: `Maximum of ${maxExtensions} extensions allowed per item.`,
                extensionsUsed: currentExtensions,
                maxExtensions
            });
        }

        // Calculate new expiry date
        const currentExpiry = item.expires_at ? new Date(item.expires_at) : new Date();
        const newExpiry = new Date(Math.max(currentExpiry.getTime(), Date.now()));
        newExpiry.setDate(newExpiry.getDate() + extensionDays);

        // Update item
        db.prepare(`
            UPDATE items 
            SET expires_at = ?,
                extension_count = ?,
                expiry_notified = 0,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(newExpiry.toISOString(), currentExtensions + 1, itemId);

        // Log activity
        db.prepare(`
            INSERT INTO activity_log (type, message, user_id, item_id)
            VALUES (?, ?, ?, ?)
        `).run('extended', `Item listing extended: ${item.name}`, req.user.id, itemId);

        saveDatabase();

        res.json({
            message: `Listing extended by ${extensionDays} days!`,
            newExpiresAt: newExpiry.toISOString(),
            extensionsUsed: currentExtensions + 1,
            extensionsRemaining: maxExtensions - (currentExtensions + 1)
        });
    } catch (error) {
        console.error('Extend item error:', error);
        res.status(500).json({ error: 'Failed to extend item listing.' });
    }
});

// ============================================
//  Archive Single Item (Manual)
// ============================================
router.post('/archive/:id', authenticateToken, (req, res) => {
    try {
        const itemId = req.params.id;

        const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
        
        if (!item) {
            return res.status(404).json({ error: 'Item not found.' });
        }

        if (item.user_id !== req.user.id) {
            return res.status(403).json({ error: 'You can only archive your own items.' });
        }

        if (item.is_archived === 1) {
            return res.status(400).json({ error: 'Item is already archived.' });
        }

        // Archive the item
        db.prepare(`
            UPDATE items 
            SET is_archived = 1,
                archived_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(itemId);

        // Log activity
        db.prepare(`
            INSERT INTO activity_log (type, message, user_id, item_id)
            VALUES (?, ?, ?, ?)
        `).run('archived', `Item archived: ${item.name}`, req.user.id, itemId);

        saveDatabase();

        res.json({ message: 'Item archived successfully!' });
    } catch (error) {
        console.error('Archive item error:', error);
        res.status(500).json({ error: 'Failed to archive item.' });
    }
});

// ============================================
//  Unarchive Item (Restore)
// ============================================
router.post('/unarchive/:id', authenticateToken, (req, res) => {
    try {
        const itemId = req.params.id;
        const settings = getArchiveSettings();
        const autoArchiveDays = settings.auto_archive_days || 30;

        const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
        
        if (!item) {
            return res.status(404).json({ error: 'Item not found.' });
        }

        if (item.user_id !== req.user.id) {
            return res.status(403).json({ error: 'You can only unarchive your own items.' });
        }

        if (item.is_archived !== 1) {
            return res.status(400).json({ error: 'Item is not archived.' });
        }

        // Calculate new expiry date
        const newExpiry = new Date();
        newExpiry.setDate(newExpiry.getDate() + autoArchiveDays);

        // Unarchive the item
        db.prepare(`
            UPDATE items 
            SET is_archived = 0,
                archived_at = NULL,
                expires_at = ?,
                extension_count = 0,
                expiry_notified = 0,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(newExpiry.toISOString(), itemId);

        // Log activity
        db.prepare(`
            INSERT INTO activity_log (type, message, user_id, item_id)
            VALUES (?, ?, ?, ?)
        `).run('restored', `Item restored from archive: ${item.name}`, req.user.id, itemId);

        saveDatabase();

        res.json({ 
            message: 'Item restored from archive!',
            newExpiresAt: newExpiry.toISOString()
        });
    } catch (error) {
        console.error('Unarchive item error:', error);
        res.status(500).json({ error: 'Failed to restore item.' });
    }
});

// ============================================
//  Get User's Archived Items
// ============================================
router.get('/my-archived', authenticateToken, (req, res) => {
    try {
        const items = db.prepare(`
            SELECT * FROM items 
            WHERE user_id = ? AND is_archived = 1
            ORDER BY archived_at DESC
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
                archivedAt: item.archived_at,
                createdAt: item.created_at
            }))
        });
    } catch (error) {
        console.error('Get user archived items error:', error);
        res.status(500).json({ error: 'Failed to fetch archived items.' });
    }
});

module.exports = router;
