// ============================================
//  Admin Email Routes - Campus Lost & Found
// ============================================

const express = require('express');
const jwt = require('jsonwebtoken');
const { db, saveDatabase } = require('../database');
const emailService = require('../services/emailService');

const router = express.Router();

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
        const dbInstance = req.app.get('db');
        const result = dbInstance.exec(`SELECT * FROM admins WHERE id = ${decoded.adminId}`);
        
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

// ============================================
//  Email Settings
// ============================================

// Get email settings (admin only)
router.get('/email-settings', adminAuth, (req, res) => {
    try {
        const settings = {};
        const rows = db.prepare('SELECT setting_key, setting_value FROM email_settings').all();
        
        rows.forEach(row => {
            // Don't expose password
            if (row.setting_key === 'smtp_pass') {
                settings[row.setting_key] = row.setting_value ? '********' : '';
            } else if (row.setting_key === 'smtp_secure' || row.setting_key === 'email_enabled') {
                settings[row.setting_key] = row.setting_value === 'true' || row.setting_value === '1';
            } else if (row.setting_key === 'smtp_port') {
                settings[row.setting_key] = parseInt(row.setting_value) || 587;
            } else {
                settings[row.setting_key] = row.setting_value;
            }
        });

        res.json({ settings });
    } catch (error) {
        console.error('Get email settings error:', error);
        res.status(500).json({ error: 'Failed to get email settings' });
    }
});

// Update email settings (admin only)
router.put('/email-settings', adminAuth, async (req, res) => {
    try {
        const { 
            smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure,
            from_email, from_name, email_enabled, digest_time, digest_day
        } = req.body;

        const updates = {
            smtp_host,
            smtp_port: smtp_port?.toString(),
            smtp_user,
            smtp_secure: smtp_secure ? 'true' : 'false',
            from_email,
            from_name,
            email_enabled: email_enabled ? 'true' : 'false',
            digest_time,
            digest_day
        };

        // Only update password if a new one is provided (not asterisks)
        if (smtp_pass && !smtp_pass.includes('*')) {
            updates.smtp_pass = smtp_pass;
        }

        const updateStmt = db.prepare(`
            INSERT OR REPLACE INTO email_settings (setting_key, setting_value)
            VALUES (?, ?)
        `);

        for (const [key, value] of Object.entries(updates)) {
            if (value !== undefined) {
                updateStmt.run(key, value);
            }
        }

        saveDatabase();

        // Reinitialize email transporter with new settings
        await emailService.initializeTransporter();

        res.json({ message: 'Email settings updated successfully' });
    } catch (error) {
        console.error('Update email settings error:', error);
        res.status(500).json({ error: 'Failed to update email settings' });
    }
});

// Test email connection (admin only)
router.post('/test-email', adminAuth, async (req, res) => {
    try {
        const { test_email } = req.body;
        
        // Reinitialize transporter with latest settings before testing
        emailService.initializeTransporter();
        
        // Verify connection
        const verifyResult = await emailService.verifyConnection();
        
        if (!verifyResult.success) {
            return res.status(400).json({ 
                error: 'Email connection failed', 
                details: verifyResult.message 
            });
        }

        // Use admin's email for test or provided email
        const targetEmail = test_email || req.admin.email;
        const adminName = req.admin.name || 'Admin';

        // Send test email
        const result = await emailService.sendEmail(
            targetEmail,
            '🔧 Test Email - Campus Lost & Found',
            `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8fafc; border-radius: 12px;">
                    <div style="text-align: center; margin-bottom: 24px;">
                        <h1 style="color: #6366f1; margin: 0;">✅ Email Configuration Working!</h1>
                    </div>
                    <div style="background: white; padding: 24px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                        <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                            Hello ${adminName},
                        </p>
                        <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                            This test email confirms that your SMTP configuration for Campus Lost & Found is working correctly.
                        </p>
                        <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                            Email notifications are now ready to be sent to users for:
                        </p>
                        <ul style="color: #374151; font-size: 16px; line-height: 1.8;">
                            <li>🔔 New claim notifications</li>
                            <li>📬 Claim status updates</li>
                            <li>🎯 Matching item alerts</li>
                            <li>⚠️ Item expiry warnings</li>
                            <li>📰 Newsletter broadcasts</li>
                        </ul>
                        <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
                            Sent at: ${new Date().toLocaleString()}
                        </p>
                    </div>
                </div>
            `
        );

        if (result.success) {
            res.json({ 
                message: 'Test email sent successfully!', 
                recipient: targetEmail,
                messageId: result.messageId 
            });
        } else {
            res.status(500).json({ 
                error: 'Failed to send test email', 
                details: result.message 
            });
        }
    } catch (error) {
        console.error('Test email error:', error);
        res.status(500).json({ error: 'Failed to send test email', details: error.message });
    }
});

// ============================================
//  Newsletter
// ============================================

// Send newsletter (admin only)
router.post('/send-newsletter', adminAuth, async (req, res) => {
    try {
        const { subject, content } = req.body;

        if (!subject || !content) {
            return res.status(400).json({ error: 'Subject and content are required' });
        }

        // Get all users who have newsletter enabled
        const subscribers = db.prepare(`
            SELECT id, email, name FROM users 
            WHERE email_newsletter = 1
        `).all();

        if (subscribers.length === 0) {
            return res.json({ message: 'No subscribers found', sent: 0 });
        }

        // Send newsletters
        let sentCount = 0;
        let failedCount = 0;
        const errors = [];

        for (const user of subscribers) {
            const result = await emailService.sendNewsletter(user, subject, content);
            if (result.success) {
                sentCount++;
            } else {
                failedCount++;
                errors.push({ email: user.email, error: result.message });
            }
        }

        res.json({
            message: `Newsletter sent to ${sentCount} subscribers`,
            sent: sentCount,
            failed: failedCount,
            totalSubscribers: subscribers.length,
            errors: failedCount > 0 ? errors : undefined
        });
    } catch (error) {
        console.error('Send newsletter error:', error);
        res.status(500).json({ error: 'Failed to send newsletter' });
    }
});

// Get subscriber stats
router.get('/subscriber-stats', adminAuth, (req, res) => {
    try {
        const stats = db.prepare(`
            SELECT 
                COUNT(CASE WHEN email_newsletter = 1 THEN 1 END) as newsletter_subscribers,
                COUNT(CASE WHEN email_claims = 1 THEN 1 END) as claims_subscribers,
                COUNT(CASE WHEN email_matches = 1 THEN 1 END) as matches_subscribers,
                COUNT(CASE WHEN email_expiry = 1 THEN 1 END) as expiry_subscribers,
                COUNT(CASE WHEN email_digest = 'instant' THEN 1 END) as instant_digest,
                COUNT(CASE WHEN email_digest = 'daily' THEN 1 END) as daily_digest,
                COUNT(CASE WHEN email_digest = 'weekly' THEN 1 END) as weekly_digest,
                COUNT(*) as total_users
            FROM users
        `).get();

        res.json({ stats });
    } catch (error) {
        console.error('Get subscriber stats error:', error);
        res.status(500).json({ error: 'Failed to get subscriber stats' });
    }
});

// Get email queue status
router.get('/email-queue', adminAuth, (req, res) => {
    try {
        const queue = db.prepare(`
            SELECT 
                eq.*,
                u.name as user_name,
                u.email as user_email
            FROM email_queue eq
            JOIN users u ON eq.user_id = u.id
            ORDER BY eq.created_at DESC
            LIMIT 100
        `).all();

        const stats = db.prepare(`
            SELECT 
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
                COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
                COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
                COUNT(*) as total
            FROM email_queue
        `).get();

        res.json({ queue, stats });
    } catch (error) {
        console.error('Get email queue error:', error);
        res.status(500).json({ error: 'Failed to get email queue' });
    }
});

// Process email queue manually
router.post('/process-queue', adminAuth, async (req, res) => {
    try {
        const result = await emailService.processEmailQueue();
        res.json(result);
    } catch (error) {
        console.error('Process queue error:', error);
        res.status(500).json({ error: 'Failed to process email queue' });
    }
});

// Clear email queue
router.delete('/email-queue', adminAuth, (req, res) => {
    try {
        const { status } = req.query; // 'sent', 'failed', or 'all'

        if (status === 'all') {
            db.prepare('DELETE FROM email_queue').run();
        } else if (status === 'sent' || status === 'failed') {
            db.prepare('DELETE FROM email_queue WHERE status = ?').run(status);
        } else {
            return res.status(400).json({ error: 'Invalid status parameter' });
        }

        saveDatabase();
        res.json({ message: `Cleared ${status} emails from queue` });
    } catch (error) {
        console.error('Clear queue error:', error);
        res.status(500).json({ error: 'Failed to clear email queue' });
    }
});

module.exports = router;
