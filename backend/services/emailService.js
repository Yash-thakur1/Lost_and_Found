// ============================================
//  Email Service - Campus Lost & Found
// ============================================

const nodemailer = require('nodemailer');
const { db, saveDatabase } = require('../database');

let transporter = null;
let emailSettings = null;

// Get email settings from database
function getEmailSettings() {
    try {
        const settings = {};
        const rows = db.prepare(`SELECT setting_key, setting_value FROM email_settings`).all();
        rows.forEach(row => {
            settings[row.setting_key] = row.setting_value;
        });
        emailSettings = settings;
        return settings;
    } catch (error) {
        console.error('Error getting email settings:', error);
        return {};
    }
}

// Initialize email transporter
function initializeTransporter() {
    const settings = getEmailSettings();
    
    console.log('📧 Email settings:', {
        host: settings.smtp_host,
        port: settings.smtp_port,
        user: settings.smtp_user ? '***set***' : 'not set',
        pass: settings.smtp_pass ? '***set***' : 'not set',
        secure: settings.smtp_secure,
        enabled: settings.email_enabled
    });
    
    if (!settings.smtp_host || !settings.email_enabled || settings.email_enabled !== 'true') {
        console.log('📧 Email service disabled or not configured');
        transporter = null;
        return false;
    }

    try {
        const port = parseInt(settings.smtp_port) || 587;
        // For port 465, use secure: true. For port 587, use secure: false (uses STARTTLS)
        const isSecure = port === 465 || settings.smtp_secure === 'true';
        
        transporter = nodemailer.createTransport({
            host: settings.smtp_host,
            port: port,
            secure: isSecure,
            auth: {
                user: settings.smtp_user,
                pass: settings.smtp_pass
            },
            tls: {
                rejectUnauthorized: false // Allow self-signed certificates
            }
        });

        console.log('📧 Email transporter initialized');
        return true;
    } catch (error) {
        console.error('Error initializing email transporter:', error);
        transporter = null;
        return false;
    }
}

// Verify transporter connection
async function verifyConnection() {
    if (!transporter) {
        return { success: false, message: 'Email transporter not initialized. Check if email is enabled and SMTP settings are configured.' };
    }

    try {
        await transporter.verify();
        return { success: true, message: 'Email connection verified' };
    } catch (error) {
        return { success: false, message: error.message };
    }
}

// Get user email preferences
function getUserEmailPreferences(userId) {
    try {
        const user = db.prepare(`
            SELECT email, email_claims, email_matches, email_expiry, email_newsletter, email_digest
            FROM users WHERE id = ?
        `).get(userId);
        
        return user ? {
            email: user.email,
            claims: user.email_claims === 1,
            matches: user.email_matches === 1,
            expiry: user.email_expiry === 1,
            newsletter: user.email_newsletter === 1,
            digest: user.email_digest || 'instant'
        } : null;
    } catch (error) {
        console.error('Error getting user email preferences:', error);
        return null;
    }
}

// Send email
async function sendEmail(to, subject, html, text = null) {
    const settings = getEmailSettings();
    
    if (!transporter || settings.email_enabled !== 'true') {
        console.log(`📧 Email not sent (disabled): ${subject} -> ${to}`);
        return { success: false, message: 'Email service disabled' };
    }

    try {
        const mailOptions = {
            from: `"${settings.from_name || 'Campus Lost & Found'}" <${settings.from_email || 'noreply@campus-lf.com'}>`,
            to,
            subject,
            html,
            text: text || html.replace(/<[^>]*>/g, '')
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`📧 Email sent: ${subject} -> ${to}`);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending email:', error);
        return { success: false, message: error.message };
    }
}

// Queue email for digest
function queueEmail(userId, emailType, subject, body, scheduledFor = null) {
    try {
        db.prepare(`
            INSERT INTO email_queue (user_id, email_type, subject, body, scheduled_for)
            VALUES (?, ?, ?, ?, ?)
        `).run(userId, emailType, subject, body, scheduledFor);
        saveDatabase();
        return true;
    } catch (error) {
        console.error('Error queuing email:', error);
        return false;
    }
}

// Process email queue (for digest emails)
async function processEmailQueue() {
    try {
        const pendingEmails = db.prepare(`
            SELECT eq.*, u.email 
            FROM email_queue eq
            JOIN users u ON eq.user_id = u.id
            WHERE eq.status = 'pending'
            AND (eq.scheduled_for IS NULL OR eq.scheduled_for <= datetime('now'))
            LIMIT 50
        `).all();

        for (const email of pendingEmails) {
            const result = await sendEmail(email.email, email.subject, email.body);
            
            if (result.success) {
                db.prepare(`
                    UPDATE email_queue 
                    SET status = 'sent', sent_at = datetime('now')
                    WHERE id = ?
                `).run(email.id);
            } else {
                db.prepare(`
                    UPDATE email_queue 
                    SET status = 'failed', error_message = ?
                    WHERE id = ?
                `).run(result.message, email.id);
            }
        }

        if (pendingEmails.length > 0) {
            saveDatabase();
            console.log(`📧 Processed ${pendingEmails.length} queued emails`);
        }
    } catch (error) {
        console.error('Error processing email queue:', error);
    }
}

// ============================================
//  Email Notification Functions
// ============================================

// Send claim notification
async function sendClaimNotification(owner, item, claimer, message) {
    const prefs = getUserEmailPreferences(owner.id);
    if (!prefs || !prefs.claims) return;

    const subject = `New Claim on Your Item: ${item.name}`;
    const html = getEmailTemplate('claim', {
        itemName: item.name,
        claimerName: claimer.name,
        itemId: item.id,
        message: message || '',
        actionUrl: `${getBaseUrl()}/index.html#item-${item.id}`
    });

    if (prefs.digest === 'instant') {
        await sendEmail(prefs.email, subject, html);
    } else {
        queueEmail(owner.id, 'claim', subject, html);
    }
}

// Send claim status update
async function sendClaimStatusUpdate(claimer, item, status) {
    const prefs = getUserEmailPreferences(claimer.id);
    if (!prefs || !prefs.claims) return;

    const subject = `Claim ${status === 'approved' ? 'Approved' : 'Rejected'}: ${item.name}`;
    const html = getEmailTemplate('claim_status', {
        itemName: item.name,
        status,
        itemId: item.id,
        actionUrl: `${getBaseUrl()}/index.html#item-${item.id}`
    });

    if (prefs.digest === 'instant') {
        await sendEmail(prefs.email, subject, html);
    } else {
        queueEmail(claimer.id, 'claim_status', subject, html);
    }
}

// Send match notification
async function sendMatchNotification(userId, matchedItemName, newItemName, newItemId) {
    const prefs = getUserEmailPreferences(userId);
    if (!prefs || !prefs.matches) return;

    const subject = `Potential Match Found for: ${matchedItemName}`;
    const html = getEmailTemplate('match', {
        matchedItemName,
        newItemName,
        itemId: newItemId,
        actionUrl: `${getBaseUrl()}/index.html#item-${newItemId}`
    });

    if (prefs.digest === 'instant') {
        await sendEmail(prefs.email, subject, html);
    } else {
        queueEmail(userId, 'match', subject, html);
    }
}

// Send expiry warning
async function sendExpiryWarning(owner, item, daysLeft) {
    const prefs = getUserEmailPreferences(owner.id);
    if (!prefs || !prefs.expiry) return;

    const subject = `Item Expiring Soon: ${item.name}`;
    const html = getEmailTemplate('expiry', {
        itemName: item.name,
        daysLeft,
        itemId: item.id,
        actionUrl: `${getBaseUrl()}/index.html#profile`
    });

    await sendEmail(prefs.email, subject, html);
}

// Send archived notification
async function sendArchivedNotification(owner, item) {
    const prefs = getUserEmailPreferences(owner.id);
    if (!prefs || !prefs.expiry) return;

    const subject = `Item Archived: ${item.name}`;
    const html = getEmailTemplate('archived', {
        itemName: item.name,
        itemId: item.id,
        actionUrl: `${getBaseUrl()}/index.html#profile`
    });

    await sendEmail(prefs.email, subject, html);
}

// Send newsletter to a single user
async function sendNewsletter(user, subject, content) {
    try {
        // Wrap content in a newsletter template
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
                    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
                    .header { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 30px; text-align: center; }
                    .header h1 { color: #ffffff; margin: 0; font-size: 24px; }
                    .content { padding: 30px; }
                    .content p { color: #4b5563; line-height: 1.6; }
                    .footer { background: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb; }
                    .footer p { color: #6b7280; font-size: 12px; margin: 5px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>📰 Campus Lost & Found Newsletter</h1>
                    </div>
                    <div class="content">
                        <p>Hello ${user.name},</p>
                        ${content}
                    </div>
                    <div class="footer">
                        <p>You received this email because you subscribed to our newsletter.</p>
                        <p><a href="${getBaseUrl()}/api/email/unsubscribe/${user.id}/newsletter">Unsubscribe</a></p>
                        <p>Campus Lost & Found © 2026</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        const result = await sendEmail(user.email, subject, html);
        return result;
    } catch (error) {
        console.error('Error sending newsletter:', error);
        return { success: false, message: error.message };
    }
}

// Send daily/weekly digest
async function sendDigest(digestType = 'daily') {
    try {
        const users = db.prepare(`
            SELECT id, email, name FROM users
            WHERE email_digest = ?
        `).all(digestType);

        for (const user of users) {
            // Get pending notifications for this user
            const notifications = db.prepare(`
                SELECT * FROM notifications
                WHERE user_id = ? AND is_read = 0
                AND created_at >= datetime('now', ?)
                ORDER BY created_at DESC
            `).all(user.id, digestType === 'daily' ? '-1 day' : '-7 days');

            if (notifications.length === 0) continue;

            const subject = `Your ${digestType === 'daily' ? 'Daily' : 'Weekly'} Lost & Found Digest`;
            const html = getEmailTemplate('digest', {
                userName: user.name,
                digestType,
                notifications,
                actionUrl: `${getBaseUrl()}/index.html#notifications`
            });

            await sendEmail(user.email, subject, html);
        }

        console.log(`📧 ${digestType} digest sent to ${users.length} users`);
    } catch (error) {
        console.error('Error sending digest:', error);
    }
}

// ============================================
//  Email Templates
// ============================================

function getBaseUrl() {
    return process.env.BASE_URL || 'http://localhost:3000';
}

function getEmailTemplate(type, data) {
    const baseStyle = `
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 30px; text-align: center; }
        .header h1 { color: #ffffff; margin: 0; font-size: 24px; }
        .header p { color: rgba(255,255,255,0.9); margin: 10px 0 0; }
        .content { padding: 30px; }
        .content h2 { color: #1e1b4b; margin-top: 0; }
        .content p { color: #4b5563; line-height: 1.6; }
        .btn { display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
        .btn:hover { opacity: 0.9; }
        .footer { background: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb; }
        .footer p { color: #6b7280; font-size: 12px; margin: 5px 0; }
        .item-card { background: #f9fafb; border-radius: 8px; padding: 15px; margin: 15px 0; border-left: 4px solid #6366f1; }
        .status-approved { color: #22c55e; font-weight: 600; }
        .status-rejected { color: #ef4444; font-weight: 600; }
        .notification-item { padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
    `;

    const templates = {
        claim: `
            <!DOCTYPE html>
            <html>
            <head><style>${baseStyle}</style></head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🔔 New Claim on Your Item</h1>
                        <p>Campus Lost & Found</p>
                    </div>
                    <div class="content">
                        <h2>Someone has claimed your item!</h2>
                        <div class="item-card">
                            <strong>Item:</strong> ${data.itemName}<br>
                            <strong>Claimed by:</strong> ${data.claimerName}
                        </div>
                        <p>Review the claim and decide whether to approve or reject it.</p>
                        <a href="${data.actionUrl}" class="btn">View Claim Details</a>
                    </div>
                    <div class="footer">
                        <p>You received this email because you have notifications enabled.</p>
                        <p>Campus Lost & Found © 2026</p>
                    </div>
                </div>
            </body>
            </html>
        `,
        claim_status: `
            <!DOCTYPE html>
            <html>
            <head><style>${baseStyle}</style></head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>${data.status === 'approved' ? '✅' : '❌'} Claim ${data.status === 'approved' ? 'Approved' : 'Rejected'}</h1>
                        <p>Campus Lost & Found</p>
                    </div>
                    <div class="content">
                        <h2>Your claim has been ${data.status}!</h2>
                        <div class="item-card">
                            <strong>Item:</strong> ${data.itemName}<br>
                            <strong>Status:</strong> <span class="status-${data.status}">${data.status.toUpperCase()}</span>
                        </div>
                        ${data.status === 'approved' ? 
                            '<p>Congratulations! Please contact the item owner to arrange pickup.</p>' : 
                            '<p>Unfortunately, your claim was not approved. If you believe this is an error, please contact support.</p>'
                        }
                        <a href="${data.actionUrl}" class="btn">View Item</a>
                    </div>
                    <div class="footer">
                        <p>Campus Lost & Found © 2026</p>
                    </div>
                </div>
            </body>
            </html>
        `,
        match: `
            <!DOCTYPE html>
            <html>
            <head><style>${baseStyle}</style></head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🎯 Potential Match Found!</h1>
                        <p>Campus Lost & Found</p>
                    </div>
                    <div class="content">
                        <h2>We found a potential match for your item!</h2>
                        <div class="item-card">
                            <strong>Your Item:</strong> ${data.matchedItemName}<br>
                            <strong>Matched With:</strong> ${data.newItemName}
                        </div>
                        <p>Check if this might be your item and submit a claim if it is!</p>
                        <a href="${data.actionUrl}" class="btn">View Match</a>
                    </div>
                    <div class="footer">
                        <p>Campus Lost & Found © 2026</p>
                    </div>
                </div>
            </body>
            </html>
        `,
        expiry: `
            <!DOCTYPE html>
            <html>
            <head><style>${baseStyle}</style></head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>⏰ Item Expiring Soon</h1>
                        <p>Campus Lost & Found</p>
                    </div>
                    <div class="content">
                        <h2>Your item listing is about to expire!</h2>
                        <div class="item-card">
                            <strong>Item:</strong> ${data.itemName}<br>
                            <strong>Expires in:</strong> ${data.daysLeft} day${data.daysLeft !== 1 ? 's' : ''}
                        </div>
                        <p>Extend your listing to keep it active and visible to others.</p>
                        <a href="${data.actionUrl}" class="btn">Extend Listing</a>
                    </div>
                    <div class="footer">
                        <p>Campus Lost & Found © 2026</p>
                    </div>
                </div>
            </body>
            </html>
        `,
        archived: `
            <!DOCTYPE html>
            <html>
            <head><style>${baseStyle}</style></head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>📦 Item Archived</h1>
                        <p>Campus Lost & Found</p>
                    </div>
                    <div class="content">
                        <h2>Your item has been archived</h2>
                        <div class="item-card">
                            <strong>Item:</strong> ${data.itemName}
                        </div>
                        <p>Your item listing has been automatically archived due to expiration. You can restore it from your profile if needed.</p>
                        <a href="${data.actionUrl}" class="btn">View Archived Items</a>
                    </div>
                    <div class="footer">
                        <p>Campus Lost & Found © 2026</p>
                    </div>
                </div>
            </body>
            </html>
        `,
        digest: `
            <!DOCTYPE html>
            <html>
            <head><style>${baseStyle}</style></head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>📋 Your ${data.digestType === 'daily' ? 'Daily' : 'Weekly'} Digest</h1>
                        <p>Campus Lost & Found</p>
                    </div>
                    <div class="content">
                        <h2>Hello ${data.userName}!</h2>
                        <p>Here's a summary of your recent notifications:</p>
                        ${data.notifications.map(n => `
                            <div class="notification-item">
                                <strong>${n.title}</strong><br>
                                <span style="color: #6b7280;">${n.message}</span>
                            </div>
                        `).join('')}
                        <a href="${data.actionUrl}" class="btn">View All Notifications</a>
                    </div>
                    <div class="footer">
                        <p>Campus Lost & Found © 2026</p>
                    </div>
                </div>
            </body>
            </html>
        `
    };

    return templates[type] || templates.claim;
}

// ============================================
//  Export
// ============================================

module.exports = {
    initializeTransporter,
    verifyConnection,
    getEmailSettings,
    getUserEmailPreferences,
    sendEmail,
    queueEmail,
    processEmailQueue,
    sendClaimNotification,
    sendClaimStatusUpdate,
    sendMatchNotification,
    sendExpiryWarning,
    sendArchivedNotification,
    sendNewsletter,
    sendDigest
};
