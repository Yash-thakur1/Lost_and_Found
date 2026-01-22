// ============================================
//  Admin Routes
// ============================================

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const upload = require('../middleware/upload');
const fs = require('fs');
const path = require('path');

const JWT_SECRET = process.env.JWT_SECRET || 'campus-lost-found-admin-secret-2024';

// Admin middleware
const adminAuth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'Admin authentication required' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Check if admin exists
        const db = req.app.get('db');
        const result = db.exec(`SELECT * FROM admins WHERE id = ${decoded.adminId}`);
        
        if (!result.length || !result[0].values.length) {
            return res.status(401).json({ error: 'Admin not found' });
        }

        const adminRow = result[0].values[0];
        const columns = result[0].columns;
        const admin = {};
        columns.forEach((col, i) => admin[col] = adminRow[i]);

        req.admin = admin;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid admin token' });
    }
};

// Helper to save database
const saveDatabase = (app) => {
    const saveDbFn = app.get('saveDatabase');
    if (saveDbFn) saveDbFn();
};

// Helper to run query and return results as objects
const runQuery = (db, sql, asArray = true) => {
    const result = db.exec(sql);
    if (!result.length) return asArray ? [] : null;
    
    const columns = result[0].columns;
    const rows = result[0].values.map(row => {
        const obj = {};
        columns.forEach((col, i) => obj[col] = row[i]);
        return obj;
    });
    
    return asArray ? rows : rows[0];
};

// ============================================
//  Admin Authentication
// ============================================

// Admin Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const db = req.app.get('db');

        const result = db.exec(`SELECT * FROM admins WHERE email = '${email.replace(/'/g, "''")}'`);
        
        if (!result.length || !result[0].values.length) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const adminRow = result[0].values[0];
        const columns = result[0].columns;
        const admin = {};
        columns.forEach((col, i) => admin[col] = adminRow[i]);

        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ adminId: admin.id }, JWT_SECRET, { expiresIn: '24h' });

        res.json({
            token,
            admin: {
                id: admin.id,
                name: admin.name,
                email: admin.email
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
//  Dashboard Stats
// ============================================

router.get('/stats', adminAuth, (req, res) => {
    try {
        const db = req.app.get('db');

        const totalItems = runQuery(db, 'SELECT COUNT(*) as count FROM items', false)?.count || 0;
        const totalUsers = runQuery(db, 'SELECT COUNT(*) as count FROM users', false)?.count || 0;
        const lostItems = runQuery(db, "SELECT COUNT(*) as count FROM items WHERE status = 'lost'", false)?.count || 0;
        const foundItems = runQuery(db, "SELECT COUNT(*) as count FROM items WHERE status = 'found'", false)?.count || 0;
        const claimedItems = runQuery(db, "SELECT COUNT(*) as count FROM items WHERE status = 'claimed'", false)?.count || 0;
        const totalMessages = runQuery(db, 'SELECT COUNT(*) as count FROM contact_messages', false)?.count || 0;

        res.json({
            totalItems,
            totalUsers,
            lostItems,
            foundItems,
            claimedItems,
            totalMessages
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
//  Items Management
// ============================================

// Get all items
router.get('/items', adminAuth, (req, res) => {
    try {
        const db = req.app.get('db');
        const { search, status, category } = req.query;

        let sql = `
            SELECT items.*, users.name as reporterName 
            FROM items 
            LEFT JOIN users ON items.user_id = users.id
            WHERE 1=1
        `;

        if (search) {
            sql += ` AND (items.name LIKE '%${search.replace(/'/g, "''")}%' OR items.description LIKE '%${search.replace(/'/g, "''")}%')`;
        }
        if (status) {
            sql += ` AND items.status = '${status.replace(/'/g, "''")}'`;
        }
        if (category) {
            sql += ` AND items.category = '${category.replace(/'/g, "''")}'`;
        }

        sql += ' ORDER BY items.created_at DESC';

        const items = runQuery(db, sql);
        res.json({ items });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single item
router.get('/items/:id', adminAuth, (req, res) => {
    try {
        const db = req.app.get('db');
        const item = runQuery(db, `SELECT * FROM items WHERE id = ${req.params.id}`, false);
        
        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }
        
        res.json({ item });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update item
router.put('/items/:id', adminAuth, (req, res) => {
    try {
        const db = req.app.get('db');
        const { name, category, status, location, description } = req.body;
        const itemId = req.params.id;

        db.run(`
            UPDATE items 
            SET name = '${name.replace(/'/g, "''")}',
                category = '${category.replace(/'/g, "''")}',
                status = '${status.replace(/'/g, "''")}',
                location = '${location.replace(/'/g, "''")}',
                description = '${(description || '').replace(/'/g, "''")}'
            WHERE id = ${itemId}
        `);

        // Log activity
        db.run(`
            INSERT INTO activity_log (type, message, item_id, created_at)
            VALUES ('update', 'Item "${name}" updated by admin', ${itemId}, datetime('now'))
        `);

        saveDatabase(req.app);
        res.json({ message: 'Item updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete item
router.delete('/items/:id', adminAuth, (req, res) => {
    try {
        const db = req.app.get('db');
        const itemId = req.params.id;

        // Get item name for logging
        const item = runQuery(db, `SELECT name FROM items WHERE id = ${itemId}`, false);

        db.run(`DELETE FROM items WHERE id = ${itemId}`);
        db.run(`DELETE FROM claims WHERE item_id = ${itemId}`);

        // Log activity
        if (item) {
            db.run(`
                INSERT INTO activity_log (type, message, created_at)
                VALUES ('delete', 'Item "${item.name}" deleted by admin', datetime('now'))
            `);
        }

        saveDatabase(req.app);
        res.json({ message: 'Item deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
//  Users Management
// ============================================

// Get all users
router.get('/users', adminAuth, (req, res) => {
    try {
        const db = req.app.get('db');
        const { search, limit } = req.query;

        let sql = `
            SELECT users.*, 
                   (SELECT COUNT(*) FROM items WHERE items.user_id = users.id) as itemCount
            FROM users
            WHERE 1=1
        `;

        if (search) {
            sql += ` AND (users.name LIKE '%${search.replace(/'/g, "''")}%' OR users.email LIKE '%${search.replace(/'/g, "''")}%')`;
        }

        sql += ' ORDER BY users.created_at DESC';

        if (limit) {
            sql += ` LIMIT ${parseInt(limit)}`;
        }

        const users = runQuery(db, sql).map(user => ({
            ...user,
            password: undefined
        }));

        res.json({ users });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single user
router.get('/users/:id', adminAuth, (req, res) => {
    try {
        const db = req.app.get('db');
        const user = runQuery(db, `SELECT * FROM users WHERE id = ${req.params.id}`, false);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        delete user.password;
        res.json({ user });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create user
router.post('/users', adminAuth, async (req, res) => {
    try {
        const db = req.app.get('db');
        const { name, email, password, studentId, phone } = req.body;

        // Check if email exists
        const existing = runQuery(db, `SELECT id FROM users WHERE email = '${email.replace(/'/g, "''")}'`, false);
        if (existing) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        db.run(`
            INSERT INTO users (name, email, password, student_id, phone, created_at)
            VALUES (
                '${name.replace(/'/g, "''")}',
                '${email.replace(/'/g, "''")}',
                '${hashedPassword}',
                '${(studentId || '').replace(/'/g, "''")}',
                '${(phone || '').replace(/'/g, "''")}',
                datetime('now')
            )
        `);

        // Log activity
        db.run(`
            INSERT INTO activity_log (type, message, created_at)
            VALUES ('create', 'User "${name}" created by admin', datetime('now'))
        `);

        saveDatabase(req.app);
        res.status(201).json({ message: 'User created successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update user
router.put('/users/:id', adminAuth, upload.single('avatar'), (req, res) => {
    try {
        const db = req.app.get('db');
        const { name, studentId, phone, removeAvatar } = req.body;
        const userId = req.params.id;

        // Get current user to check for existing avatar
        const currentUser = runQuery(db, `SELECT avatar FROM users WHERE id = ${userId}`, false);
        
        let avatarValue = currentUser?.avatar || null;
        
        // Handle avatar upload
        if (req.file) {
            // Delete old avatar if exists
            if (currentUser?.avatar) {
                const oldPath = path.join(__dirname, '../uploads', currentUser.avatar);
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            }
            avatarValue = req.file.filename;
        } else if (removeAvatar === 'true') {
            // Remove avatar
            if (currentUser?.avatar) {
                const oldPath = path.join(__dirname, '../uploads', currentUser.avatar);
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            }
            avatarValue = null;
        }

        db.run(`
            UPDATE users 
            SET name = '${name.replace(/'/g, "''")}',
                student_id = '${(studentId || '').replace(/'/g, "''")}',
                phone = '${(phone || '').replace(/'/g, "''")}',
                avatar = ${avatarValue ? `'${avatarValue}'` : 'NULL'}
            WHERE id = ${userId}
        `);

        saveDatabase(req.app);
        res.json({ message: 'User updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete user
router.delete('/users/:id', adminAuth, (req, res) => {
    try {
        const db = req.app.get('db');
        const userId = req.params.id;

        // Get user name for logging
        const user = runQuery(db, `SELECT name FROM users WHERE id = ${userId}`, false);

        // Delete user's items, claims, and the user
        db.run(`DELETE FROM claims WHERE user_id = ${userId}`);
        db.run(`DELETE FROM items WHERE user_id = ${userId}`);
        db.run(`DELETE FROM notifications WHERE user_id = ${userId}`);
        db.run(`DELETE FROM users WHERE id = ${userId}`);

        // Log activity
        if (user) {
            db.run(`
                INSERT INTO activity_log (type, message, created_at)
                VALUES ('delete', 'User "${user.name}" deleted by admin', datetime('now'))
            `);
        }

        saveDatabase(req.app);
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
//  Claims Management
// ============================================

// Get all claims
router.get('/claims', adminAuth, (req, res) => {
    try {
        const db = req.app.get('db');
        const { search, status } = req.query;

        let sql = `
            SELECT claims.*, 
                   items.name as itemName,
                   claimer.name as claimerName,
                   owner.name as ownerName
            FROM claims
            LEFT JOIN items ON claims.item_id = items.id
            LEFT JOIN users as claimer ON claims.user_id = claimer.id
            LEFT JOIN users as owner ON items.user_id = owner.id
            WHERE 1=1
        `;

        if (search) {
            sql += ` AND (items.name LIKE '%${search.replace(/'/g, "''")}%' OR claimer.name LIKE '%${search.replace(/'/g, "''")}%')`;
        }
        if (status) {
            sql += ` AND claims.status = '${status.replace(/'/g, "''")}'";`;
        }

        sql += ' ORDER BY claims.created_at DESC';

        const claims = runQuery(db, sql);
        res.json({ claims });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update claim status
router.put('/claims/:id', adminAuth, (req, res) => {
    try {
        const db = req.app.get('db');
        const { status } = req.body;
        const claimId = req.params.id;

        db.run(`UPDATE claims SET status = '${status.replace(/'/g, "''")}' WHERE id = ${claimId}`);

        // If approved, update item status
        if (status === 'approved') {
            const claim = runQuery(db, `SELECT item_id FROM claims WHERE id = ${claimId}`, false);
            if (claim) {
                db.run(`UPDATE items SET status = 'claimed' WHERE id = ${claim.item_id}`);
            }
        }

        // Log activity
        db.run(`
            INSERT INTO activity_log (type, message, created_at)
            VALUES ('${status}', 'Claim ${status} by admin', datetime('now'))
        `);

        saveDatabase(req.app);
        res.json({ message: 'Claim status updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete claim
router.delete('/claims/:id', adminAuth, (req, res) => {
    try {
        const db = req.app.get('db');
        db.run(`DELETE FROM claims WHERE id = ${req.params.id}`);
        saveDatabase(req.app);
        res.json({ message: 'Claim deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
//  Messages Management
// ============================================

// Get all messages
router.get('/messages', adminAuth, (req, res) => {
    try {
        const db = req.app.get('db');
        const { search } = req.query;

        let sql = 'SELECT * FROM contact_messages WHERE 1=1';

        if (search) {
            sql += ` AND (name LIKE '%${search.replace(/'/g, "''")}%' OR email LIKE '%${search.replace(/'/g, "''")}%' OR subject LIKE '%${search.replace(/'/g, "''")}%')`;
        }

        sql += ' ORDER BY created_at DESC';

        const messages = runQuery(db, sql);
        res.json({ messages });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single message
router.get('/messages/:id', adminAuth, (req, res) => {
    try {
        const db = req.app.get('db');
        const message = runQuery(db, `SELECT * FROM contact_messages WHERE id = ${req.params.id}`, false);
        
        if (!message) {
            return res.status(404).json({ error: 'Message not found' });
        }
        
        res.json({ message });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete message
router.delete('/messages/:id', adminAuth, (req, res) => {
    try {
        const db = req.app.get('db');
        db.run(`DELETE FROM contact_messages WHERE id = ${req.params.id}`);
        saveDatabase(req.app);
        res.json({ message: 'Message deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
//  Activity Log
// ============================================

router.get('/activity', adminAuth, (req, res) => {
    try {
        const db = req.app.get('db');
        const { search, type, limit } = req.query;

        let sql = `
            SELECT activity_log.*, 
                   users.name as userName,
                   items.name as itemName
            FROM activity_log
            LEFT JOIN users ON activity_log.user_id = users.id
            LEFT JOIN items ON activity_log.item_id = items.id
            WHERE 1=1
        `;

        if (search) {
            sql += ` AND activity_log.message LIKE '%${search.replace(/'/g, "''")}%'`;
        }
        if (type) {
            sql += ` AND activity_log.type = '${type.replace(/'/g, "''")}'";`;
        }

        sql += ' ORDER BY activity_log.created_at DESC';

        if (limit) {
            sql += ` LIMIT ${parseInt(limit)}`;
        }

        const activities = runQuery(db, sql);
        res.json({ activities });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
//  Admin Profile
// ============================================

router.put('/profile', adminAuth, (req, res) => {
    try {
        const db = req.app.get('db');
        const { name } = req.body;

        db.run(`UPDATE admins SET name = '${name.replace(/'/g, "''")}' WHERE id = ${req.admin.id}`);
        saveDatabase(req.app);

        res.json({ message: 'Profile updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/password', adminAuth, async (req, res) => {
    try {
        const db = req.app.get('db');
        const { currentPassword, newPassword } = req.body;

        const isMatch = await bcrypt.compare(currentPassword, req.admin.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Current password is incorrect' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        db.run(`UPDATE admins SET password = '${hashedPassword}' WHERE id = ${req.admin.id}`);
        saveDatabase(req.app);

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
//  Export & Cleanup
// ============================================

router.get('/export', adminAuth, (req, res) => {
    try {
        const db = req.app.get('db');

        const data = {
            exportedAt: new Date().toISOString(),
            users: runQuery(db, 'SELECT id, name, email, studentId, phone, createdAt FROM users'),
            items: runQuery(db, 'SELECT * FROM items'),
            claims: runQuery(db, 'SELECT * FROM claims'),
            messages: runQuery(db, 'SELECT * FROM contact_messages'),
            activity: runQuery(db, 'SELECT * FROM activity_log')
        };

        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/clear-old', adminAuth, (req, res) => {
    try {
        const db = req.app.get('db');

        // Delete items older than 6 months
        db.run("DELETE FROM items WHERE createdAt < datetime('now', '-6 months')");
        db.run("DELETE FROM claims WHERE createdAt < datetime('now', '-6 months')");
        db.run("DELETE FROM activity_log WHERE createdAt < datetime('now', '-6 months')");

        saveDatabase(req.app);
        res.json({ message: 'Old data cleared successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
