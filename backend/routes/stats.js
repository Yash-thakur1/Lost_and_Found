const express = require('express');
const { db, saveDatabase } = require('../database');

const router = express.Router();

// Get overall statistics
router.get('/', (req, res) => {
    try {
        // Total items by status
        const itemStats = db.prepare(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) as lost,
                SUM(CASE WHEN status = 'found' THEN 1 ELSE 0 END) as found,
                SUM(CASE WHEN status = 'claimed' THEN 1 ELSE 0 END) as claimed,
                SUM(CASE WHEN status = 'returned' THEN 1 ELSE 0 END) as returned
            FROM items
        `).get();

        // Items by category
        const categoryStats = db.prepare(`
            SELECT category, COUNT(*) as count
            FROM items
            GROUP BY category
            ORDER BY count DESC
        `).all();

        // Items by location
        const locationStats = db.prepare(`
            SELECT location, COUNT(*) as count
            FROM items
            GROUP BY location
            ORDER BY count DESC
            LIMIT 10
        `).all();

        // Total users
        const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();

        // Success rate (claimed + returned / total)
        const successRate = itemStats.total > 0 
            ? Math.round(((itemStats.claimed + itemStats.returned) / itemStats.total) * 100) 
            : 0;

        // Items this week
        const weeklyItems = db.prepare(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) as lost,
                SUM(CASE WHEN status = 'found' THEN 1 ELSE 0 END) as found
            FROM items
            WHERE created_at >= datetime('now', '-7 days')
        `).get();

        // Items this month
        const monthlyItems = db.prepare(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) as lost,
                SUM(CASE WHEN status = 'found' THEN 1 ELSE 0 END) as found
            FROM items
            WHERE created_at >= datetime('now', '-30 days')
        `).get();

        res.json({
            overview: {
                totalItems: itemStats.total,
                lostItems: itemStats.lost,
                foundItems: itemStats.found,
                claimedItems: itemStats.claimed,
                returnedItems: itemStats.returned,
                totalUsers: userCount.count,
                successRate: successRate
            },
            byCategory: categoryStats,
            byLocation: locationStats,
            weekly: weeklyItems,
            monthly: monthlyItems
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Failed to fetch statistics.' });
    }
});

// Get activity feed
router.get('/activity', (req, res) => {
    try {
        const { limit = 20 } = req.query;

        const activities = db.prepare(`
            SELECT 
                a.*,
                u.name as user_name,
                i.name as item_name
            FROM activity_log a
            LEFT JOIN users u ON a.user_id = u.id
            LEFT JOIN items i ON a.item_id = i.id
            ORDER BY a.created_at DESC
            LIMIT ?
        `).all(parseInt(limit));

        res.json({
            activities: activities.map(a => ({
                id: a.id,
                type: a.type,
                message: a.message,
                userName: a.user_name,
                itemName: a.item_name,
                createdAt: a.created_at
            }))
        });
    } catch (error) {
        console.error('Get activity error:', error);
        res.status(500).json({ error: 'Failed to fetch activity.' });
    }
});

// Get trending/recent items
router.get('/trending', (req, res) => {
    try {
        // Most recent items
        const recentItems = db.prepare(`
            SELECT 
                i.*,
                u.name as reporter_name
            FROM items i
            JOIN users u ON i.user_id = u.id
            WHERE i.status IN ('lost', 'found')
            ORDER BY i.created_at DESC
            LIMIT 6
        `).all();

        // Most claimed categories
        const trendingCategories = db.prepare(`
            SELECT 
                category,
                COUNT(*) as count,
                SUM(CASE WHEN status IN ('claimed', 'returned') THEN 1 ELSE 0 END) as resolved
            FROM items
            GROUP BY category
            ORDER BY count DESC
            LIMIT 5
        `).all();

        res.json({
            recentItems: recentItems.map(item => ({
                id: item.id,
                name: item.name,
                category: item.category,
                status: item.status,
                location: item.location,
                image: item.image ? `/uploads/${item.image}` : null,
                reporter: item.reporter_name,
                createdAt: item.created_at
            })),
            trendingCategories
        });
    } catch (error) {
        console.error('Get trending error:', error);
        res.status(500).json({ error: 'Failed to fetch trending data.' });
    }
});

module.exports = router;
