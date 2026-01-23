// ============================================
//  Email Routes - Campus Lost & Found
// ============================================

const express = require('express');
const { db, saveDatabase } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const emailService = require('../services/emailService');

const router = express.Router();

// ============================================
//  User Email Preferences
// ============================================

// Get user email preferences
router.get('/preferences', authenticateToken, (req, res) => {
    try {
        const user = db.prepare(`
            SELECT email_claims, email_matches, email_expiry, email_newsletter, email_digest
            FROM users WHERE id = ?
        `).get(req.user.id);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            preferences: {
                claims: user.email_claims === 1,
                matches: user.email_matches === 1,
                expiry: user.email_expiry === 1,
                newsletter: user.email_newsletter === 1,
                digest: user.email_digest || 'instant'
            }
        });
    } catch (error) {
        console.error('Get email preferences error:', error);
        res.status(500).json({ error: 'Failed to get email preferences' });
    }
});

// Update user email preferences
router.put('/preferences', authenticateToken, (req, res) => {
    try {
        const { claims, matches, expiry, newsletter, digest } = req.body;

        db.prepare(`
            UPDATE users 
            SET email_claims = ?,
                email_matches = ?,
                email_expiry = ?,
                email_newsletter = ?,
                email_digest = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            claims ? 1 : 0,
            matches ? 1 : 0,
            expiry ? 1 : 0,
            newsletter ? 1 : 0,
            digest || 'instant',
            req.user.id
        );

        saveDatabase();

        res.json({
            message: 'Email preferences updated successfully',
            preferences: {
                claims: claims === true,
                matches: matches === true,
                expiry: expiry === true,
                newsletter: newsletter === true,
                digest: digest || 'instant'
            }
        });
    } catch (error) {
        console.error('Update email preferences error:', error);
        res.status(500).json({ error: 'Failed to update email preferences' });
    }
});

// ============================================
//  Unsubscribe (no auth needed for email links)
// ============================================

router.get('/unsubscribe/:userId/:type', (req, res) => {
    try {
        const { userId, type } = req.params;
        
        const validTypes = ['claims', 'matches', 'expiry', 'newsletter', 'all'];
        if (!validTypes.includes(type)) {
            return res.status(400).send('Invalid unsubscribe type');
        }

        if (type === 'all') {
            db.prepare(`
                UPDATE users 
                SET email_claims = 0, email_matches = 0, email_expiry = 0, email_newsletter = 0
                WHERE id = ?
            `).run(userId);
        } else {
            db.prepare(`
                UPDATE users 
                SET email_${type} = 0
                WHERE id = ?
            `).run(userId);
        }

        saveDatabase();

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: 'Segoe UI', sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f5f5f5; }
                    .card { background: white; padding: 40px; border-radius: 12px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
                    h1 { color: #22c55e; }
                    p { color: #4b5563; }
                    a { color: #6366f1; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>✅ Unsubscribed Successfully</h1>
                    <p>You have been unsubscribed from ${type === 'all' ? 'all email notifications' : type + ' notifications'}.</p>
                    <p><a href="/">Return to Campus Lost & Found</a></p>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('Unsubscribe error:', error);
        res.status(500).send('Error processing unsubscribe request');
    }
});

// ============================================
//  Test Email (for debugging)
// ============================================

router.post('/test', authenticateToken, async (req, res) => {
    try {
        const user = db.prepare('SELECT email, name FROM users WHERE id = ?').get(req.user.id);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const result = await emailService.sendEmail(
            user.email,
            'Test Email from Campus Lost & Found',
            `
                <div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h1 style="color: #6366f1;">Test Email</h1>
                    <p>Hello ${user.name},</p>
                    <p>This is a test email to verify your email notification settings are working correctly.</p>
                    <p>If you received this email, your notifications are properly configured!</p>
                    <p>Best regards,<br>Campus Lost & Found Team</p>
                </div>
            `
        );

        if (result.success) {
            res.json({ message: 'Test email sent successfully', messageId: result.messageId });
        } else {
            res.status(500).json({ error: result.message || 'Failed to send test email' });
        }
    } catch (error) {
        console.error('Test email error:', error);
        res.status(500).json({ error: 'Failed to send test email' });
    }
});

module.exports = router;
