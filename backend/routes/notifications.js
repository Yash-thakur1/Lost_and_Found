const express = require('express');
const { db, saveDatabase } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get user's notifications
router.get('/', authenticateToken, (req, res) => {
    try {
        const { unreadOnly } = req.query;

        let query = `
            SELECT n.*, i.name as item_name
            FROM notifications n
            LEFT JOIN items i ON n.related_item_id = i.id
            WHERE n.user_id = ?
        `;

        if (unreadOnly === 'true') {
            query += ' AND n.is_read = 0';
        }

        query += ' ORDER BY n.created_at DESC LIMIT 50';

        const notifications = db.prepare(query).all(req.user.id);

        // Get unread count
        const unreadCount = db.prepare(`
            SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0
        `).get(req.user.id);

        res.json({
            notifications: notifications.map(n => ({
                id: n.id,
                type: n.type,
                title: n.title,
                message: n.message,
                isRead: n.is_read === 1,
                relatedItemId: n.related_item_id,
                itemName: n.item_name,
                createdAt: n.created_at
            })),
            unreadCount: unreadCount.count
        });
    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({ error: 'Failed to fetch notifications.' });
    }
});

// Mark notification as read
router.put('/:id/read', authenticateToken, (req, res) => {
    try {
        const notification = db.prepare('SELECT * FROM notifications WHERE id = ? AND user_id = ?')
            .get(req.params.id, req.user.id);

        if (!notification) {
            return res.status(404).json({ error: 'Notification not found.' });
        }

        db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(req.params.id);

        res.json({ message: 'Notification marked as read.' });
    } catch (error) {
        console.error('Mark read error:', error);
        res.status(500).json({ error: 'Failed to mark notification as read.' });
    }
});

// Mark all notifications as read
router.put('/read-all', authenticateToken, (req, res) => {
    try {
        db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);

        res.json({ message: 'All notifications marked as read.' });
    } catch (error) {
        console.error('Mark all read error:', error);
        res.status(500).json({ error: 'Failed to mark notifications as read.' });
    }
});

// Delete notification
router.delete('/:id', authenticateToken, (req, res) => {
    try {
        const notification = db.prepare('SELECT * FROM notifications WHERE id = ? AND user_id = ?')
            .get(req.params.id, req.user.id);

        if (!notification) {
            return res.status(404).json({ error: 'Notification not found.' });
        }

        db.prepare('DELETE FROM notifications WHERE id = ?').run(req.params.id);

        res.json({ message: 'Notification deleted.' });
    } catch (error) {
        console.error('Delete notification error:', error);
        res.status(500).json({ error: 'Failed to delete notification.' });
    }
});

// Delete all notifications
router.delete('/', authenticateToken, (req, res) => {
    try {
        db.prepare('DELETE FROM notifications WHERE user_id = ?').run(req.user.id);

        res.json({ message: 'All notifications deleted.' });
    } catch (error) {
        console.error('Delete all notifications error:', error);
        res.status(500).json({ error: 'Failed to delete notifications.' });
    }
});

module.exports = router;
