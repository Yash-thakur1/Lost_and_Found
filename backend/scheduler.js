// ============================================
//  Archive Scheduler - Auto-Expiry System
// ============================================

const { db, saveDatabase } = require('./database');
const emailService = require('./services/emailService');

// Get archive settings from database
function getArchiveSettings() {
    try {
        const settings = {};
        const rows = db.prepare(`SELECT setting_key, setting_value FROM archive_settings`).all();
        rows.forEach(row => {
            settings[row.setting_key] = parseInt(row.setting_value) || row.setting_value;
        });
        return settings;
    } catch (error) {
        console.error('Error getting archive settings:', error);
        return {
            auto_archive_days: 30,
            expiry_warning_days: 7,
            max_extensions: 2,
            extension_days: 30
        };
    }
}

// Initialize expiry dates for items without one
function initializeExpiryDates() {
    try {
        const settings = getArchiveSettings();
        const autoArchiveDays = settings.auto_archive_days || 30;

        // Get items without expiry dates that are not archived
        const items = db.prepare(`
            SELECT id, created_at FROM items 
            WHERE expires_at IS NULL AND is_archived = 0
        `).all();

        if (items.length > 0) {
            console.log(`📅 Initializing expiry dates for ${items.length} items...`);
            
            items.forEach(item => {
                const createdAt = new Date(item.created_at);
                const expiresAt = new Date(createdAt);
                expiresAt.setDate(expiresAt.getDate() + autoArchiveDays);

                // If already past expiry, set to today + archive days (give grace period)
                if (expiresAt < new Date()) {
                    const newExpiry = new Date();
                    newExpiry.setDate(newExpiry.getDate() + autoArchiveDays);
                    db.prepare('UPDATE items SET expires_at = ? WHERE id = ?').run(newExpiry.toISOString(), item.id);
                } else {
                    db.prepare('UPDATE items SET expires_at = ? WHERE id = ?').run(expiresAt.toISOString(), item.id);
                }
            });

            saveDatabase();
            console.log('✅ Expiry dates initialized!');
        }
    } catch (error) {
        console.error('Error initializing expiry dates:', error);
    }
}

// Auto-archive expired items
async function autoArchiveExpiredItems() {
    try {
        const now = new Date().toISOString();

        // Get items that have expired and are not already archived
        const expiredItems = db.prepare(`
            SELECT i.id, i.name, i.user_id, u.name as owner_name, u.email as owner_email
            FROM items i
            JOIN users u ON i.user_id = u.id
            WHERE i.expires_at IS NOT NULL 
            AND i.expires_at < ?
            AND i.is_archived = 0
            AND i.status NOT IN ('claimed', 'returned')
        `).all(now);

        if (expiredItems.length > 0) {
            console.log(`📦 Auto-archiving ${expiredItems.length} expired items...`);
            
            for (const item of expiredItems) {
                // Archive the item
                db.prepare(`
                    UPDATE items 
                    SET is_archived = 1,
                        archived_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(item.id);

                // Create notification for item owner
                db.prepare(`
                    INSERT INTO notifications (user_id, type, title, message, related_item_id)
                    VALUES (?, ?, ?, ?, ?)
                `).run(
                    item.user_id,
                    'archived',
                    'Item Automatically Archived',
                    `Your item "${item.name}" has been automatically archived due to expiration. You can restore it from your profile.`,
                    item.id
                );

                // Send email notification
                const owner = { id: item.user_id, name: item.owner_name, email: item.owner_email };
                await emailService.sendArchivedNotification(owner, { id: item.id, name: item.name });

                // Log activity
                db.prepare(`
                    INSERT INTO activity_log (type, message, user_id, item_id)
                    VALUES (?, ?, ?, ?)
                `).run('auto_archived', `Item auto-archived: ${item.name}`, item.user_id, item.id);
            }

            saveDatabase();
            console.log(`✅ Auto-archived ${expiredItems.length} items!`);
        }

        return expiredItems.length;
    } catch (error) {
        console.error('Error auto-archiving items:', error);
        return 0;
    }
}

// Send expiry warning notifications
async function sendExpiryWarnings() {
    try {
        const settings = getArchiveSettings();
        const warningDays = settings.expiry_warning_days || 7;

        // Get items expiring soon that haven't been notified
        const expiringItems = db.prepare(`
            SELECT i.id, i.name, i.user_id, i.expires_at,
                   julianday(i.expires_at) - julianday('now') as days_until_expiry,
                   u.name as owner_name, u.email as owner_email
            FROM items i
            JOIN users u ON i.user_id = u.id
            WHERE i.expires_at IS NOT NULL 
            AND julianday(i.expires_at) - julianday('now') <= ?
            AND julianday(i.expires_at) - julianday('now') > 0
            AND i.is_archived = 0
            AND i.expiry_notified = 0
            AND i.status NOT IN ('claimed', 'returned')
        `).all(warningDays);

        if (expiringItems.length > 0) {
            console.log(`⚠️ Sending expiry warnings for ${expiringItems.length} items...`);
            
            for (const item of expiringItems) {
                const daysLeft = Math.ceil(item.days_until_expiry);

                // Create notification for item owner
                db.prepare(`
                    INSERT INTO notifications (user_id, type, title, message, related_item_id)
                    VALUES (?, ?, ?, ?, ?)
                `).run(
                    item.user_id,
                    'expiry_warning',
                    'Item Expiring Soon',
                    `Your item "${item.name}" will be archived in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Extend the listing to keep it active.`,
                    item.id
                );

                // Send email notification
                const owner = { id: item.user_id, name: item.owner_name, email: item.owner_email };
                const itemData = { id: item.id, name: item.name, expires_at: item.expires_at };
                await emailService.sendExpiryWarning(owner, itemData, daysLeft);

                // Mark as notified
                db.prepare('UPDATE items SET expiry_notified = 1 WHERE id = ?').run(item.id);
            }

            saveDatabase();
            console.log(`✅ Sent ${expiringItems.length} expiry warnings!`);
        }

        return expiringItems.length;
    } catch (error) {
        console.error('Error sending expiry warnings:', error);
        return 0;
    }
}

// Run all scheduled tasks
async function runScheduledTasks() {
    console.log('🕐 Running scheduled archive tasks...');
    
    const archived = await autoArchiveExpiredItems();
    const warnings = await sendExpiryWarnings();
    
    // Process email queue for digest emails
    await emailService.processEmailQueue();
    
    console.log(`📊 Scheduled tasks complete: ${archived} archived, ${warnings} warnings sent`);
    
    return { archived, warnings };
}

// Start the scheduler
let schedulerInterval = null;

function startScheduler(intervalMinutes = 60) {
    // Initialize expiry dates on startup
    setTimeout(() => {
        initializeExpiryDates();
        runScheduledTasks();
    }, 5000); // Wait 5 seconds for database to be fully ready

    // Run every hour by default
    schedulerInterval = setInterval(() => {
        runScheduledTasks();
    }, intervalMinutes * 60 * 1000);

    console.log(`⏰ Archive scheduler started (runs every ${intervalMinutes} minutes)`);
}

function stopScheduler() {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        console.log('⏹️ Archive scheduler stopped');
    }
}

module.exports = {
    getArchiveSettings,
    initializeExpiryDates,
    autoArchiveExpiredItems,
    sendExpiryWarnings,
    runScheduledTasks,
    startScheduler,
    stopScheduler
};
