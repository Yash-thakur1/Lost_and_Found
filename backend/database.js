const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'database.sqlite');

let db = null;
let SQL = null;

// Helper function to run SQL and return results
function run(sql, params = []) {
    try {
        return db.run(sql, params);
    } catch (error) {
        console.error('SQL Error:', error.message);
        throw error;
    }
}

function exec(sql) {
    try {
        return db.exec(sql);
    } catch (error) {
        // Suppress expected duplicate column errors during migrations
        if (!error.message.includes('duplicate column name')) {
            console.error('SQL Error:', error.message);
        }
        throw error;
    }
}

function prepare(sql) {
    return {
        run: (...params) => {
            db.run(sql, params);
            return { changes: db.getRowsModified(), lastInsertRowid: getLastInsertRowId() };
        },
        get: (...params) => {
            const stmt = db.prepare(sql);
            stmt.bind(params);
            if (stmt.step()) {
                const row = stmt.getAsObject();
                stmt.free();
                return row;
            }
            stmt.free();
            return undefined;
        },
        all: (...params) => {
            const stmt = db.prepare(sql);
            stmt.bind(params);
            const results = [];
            while (stmt.step()) {
                results.push(stmt.getAsObject());
            }
            stmt.free();
            return results;
        }
    };
}

function getLastInsertRowId() {
    const result = db.exec('SELECT last_insert_rowid() as id');
    return result[0]?.values[0]?.[0] || 0;
}

function saveDatabase() {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
}

async function initialize() {
    console.log('📊 Initializing database...');

    SQL = await initSqlJs();
    
    // Load existing database or create new one
    if (fs.existsSync(dbPath)) {
        const fileBuffer = fs.readFileSync(dbPath);
        db = new SQL.Database(fileBuffer);
    } else {
        db = new SQL.Database();
    }

    // Enable foreign keys
    db.run('PRAGMA foreign_keys = ON');

    // Users table
    exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            student_id TEXT UNIQUE,
            phone TEXT,
            avatar TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Items table
    exec(`
        CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            category TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('lost', 'found', 'claimed', 'returned')),
            location TEXT NOT NULL,
            date_lost_found DATE NOT NULL,
            image TEXT,
            user_id INTEGER NOT NULL,
            claimed_by INTEGER,
            reward_amount REAL DEFAULT 0,
            reward_currency TEXT DEFAULT 'INR',
            reward_anonymous INTEGER DEFAULT 0,
            reward_status TEXT DEFAULT 'none' CHECK(reward_status IN ('none', 'offered', 'claimed', 'paid')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (claimed_by) REFERENCES users(id)
        )
    `);

    // Add reward columns to existing items table if they don't exist
    try {
        exec(`ALTER TABLE items ADD COLUMN reward_amount REAL DEFAULT 0`);
    } catch (e) { /* Column already exists - this is expected */ }
    try {
        exec(`ALTER TABLE items ADD COLUMN reward_currency TEXT DEFAULT 'INR'`);
    } catch (e) { /* Column already exists */ }
    try {
        exec(`ALTER TABLE items ADD COLUMN reward_anonymous INTEGER DEFAULT 0`);
    } catch (e) { /* Column already exists */ }
    try {
        exec(`ALTER TABLE items ADD COLUMN reward_status TEXT DEFAULT 'none'`);
    } catch (e) { /* Column already exists */ }

    // Add archive columns for auto-expiry system
    try {
        exec(`ALTER TABLE items ADD COLUMN is_archived INTEGER DEFAULT 0`);
    } catch (e) { /* Column already exists */ }
    try {
        exec(`ALTER TABLE items ADD COLUMN archived_at DATETIME`);
    } catch (e) { /* Column already exists */ }
    try {
        exec(`ALTER TABLE items ADD COLUMN expires_at DATETIME`);
    } catch (e) { /* Column already exists */ }
    try {
        exec(`ALTER TABLE items ADD COLUMN expiry_notified INTEGER DEFAULT 0`);
    } catch (e) { /* Column already exists */ }
    try {
        exec(`ALTER TABLE items ADD COLUMN extension_count INTEGER DEFAULT 0`);
    } catch (e) { /* Column already exists */ }

    // Archive settings table
    exec(`
        CREATE TABLE IF NOT EXISTS archive_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            setting_key TEXT UNIQUE NOT NULL,
            setting_value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Insert default archive settings if not exist
    const defaultSettings = [
        ['auto_archive_days', '30'],
        ['expiry_warning_days', '7'],
        ['max_extensions', '2'],
        ['extension_days', '30']
    ];
    
    defaultSettings.forEach(([key, value]) => {
        try {
            db.run(`INSERT OR IGNORE INTO archive_settings (setting_key, setting_value) VALUES (?, ?)`, [key, value]);
        } catch (e) { /* Already exists */ }
    });

    // Claims table
    exec(`
        CREATE TABLE IF NOT EXISTS claims (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            message TEXT,
            status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (item_id) REFERENCES items(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // Notifications table
    exec(`
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            is_read INTEGER DEFAULT 0,
            related_item_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (related_item_id) REFERENCES items(id)
        )
    `);

    // Contact messages table
    exec(`
        CREATE TABLE IF NOT EXISTS contact_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            subject TEXT NOT NULL,
            message TEXT NOT NULL,
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Activity log table
    exec(`
        CREATE TABLE IF NOT EXISTS activity_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            message TEXT NOT NULL,
            user_id INTEGER,
            item_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (item_id) REFERENCES items(id)
        )
    `);

    // Newsletter subscribers table
    exec(`
        CREATE TABLE IF NOT EXISTS newsletter_subscribers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Search alerts table
    exec(`
        CREATE TABLE IF NOT EXISTS search_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            keywords TEXT NOT NULL,
            category TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // Admins table
    exec(`
        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Insert sample data if tables are empty
    await insertSampleData();

    // Insert default admin if not exists
    await insertDefaultAdmin();
    
    // Save to file
    saveDatabase();

    console.log('✅ Database initialized successfully!');
    
    return { db, prepare, saveDatabase };
}

async function insertSampleData() {
    const result = db.exec('SELECT COUNT(*) as count FROM users');
    const count = result[0]?.values[0]?.[0] || 0;
    
    if (count === 0) {
        console.log('📝 Inserting sample data...');

        const hashedPassword = bcrypt.hashSync('password123', 10);
        
        const users = [
            ['Alex Thompson', 'alex.t@campus.edu', hashedPassword, 'STU2024001', '555-0101'],
            ['Sarah Miller', 'sarah.m@campus.edu', hashedPassword, 'STU2024002', '555-0102'],
            ['James Wilson', 'james.w@campus.edu', hashedPassword, 'STU2024003', '555-0103'],
            ['Emily Chen', 'emily.c@campus.edu', hashedPassword, 'STU2024004', '555-0104'],
            ['Michael Brown', 'michael.b@campus.edu', hashedPassword, 'STU2024005', '555-0105'],
            ['Jessica Lee', 'jessica.l@campus.edu', hashedPassword, 'STU2024006', '555-0106'],
            ['David Kim', 'david.k@campus.edu', hashedPassword, 'STU2024007', '555-0107'],
            ['Amanda Garcia', 'amanda.g@campus.edu', hashedPassword, 'STU2024008', '555-0108']
        ];

        users.forEach(user => {
            db.run(`INSERT INTO users (name, email, password, student_id, phone) VALUES (?, ?, ?, ?, ?)`, user);
        });

        const items = [
            ['iPhone 15 Pro Max', 'Space Black iPhone 15 Pro Max with a clear case. Has a small crack on the screen protector.', 'electronics', 'lost', 'library', '2026-01-20', 1],
            ['Brown Leather Wallet', 'Brown leather wallet found near the coffee counter. Contains several cards and some cash.', 'accessories', 'found', 'cafeteria', '2026-01-21', 2],
            ['MacBook Pro 14"', 'Silver MacBook Pro 14-inch with stickers on the lid including a NASA logo.', 'electronics', 'lost', 'science', '2026-01-19', 3],
            ['Student ID Card', 'Found a student ID card belonging to the Engineering department.', 'documents', 'found', 'gym', '2026-01-22', 4],
            ['AirPods Pro', 'White AirPods Pro in original case. Name engraved on the case.', 'electronics', 'lost', 'arts', '2026-01-21', 5],
            ['Car Keys with Honda Keychain', 'Found car keys with a Honda logo keychain near parking lot B.', 'keys', 'found', 'parking', '2026-01-22', 6],
            ['Blue Denim Jacket', 'Light blue denim jacket with patches on the sleeves.', 'clothing', 'lost', 'cafeteria', '2026-01-18', 7],
            ['North Face Backpack', 'Black North Face backpack found in study room 3. Contains textbooks.', 'bags', 'found', 'library', '2026-01-21', 8],
            ['Prescription Glasses', 'Black rectangular prescription glasses in a brown case.', 'accessories', 'lost', 'engineering', '2026-01-20', 1],
            ['USB Flash Drive 64GB', 'Silver SanDisk 64GB USB flash drive found in the common room.', 'electronics', 'found', 'dormitory', '2026-01-22', 2],
            ['Gold Bracelet', 'Thin gold bracelet with a small heart charm.', 'accessories', 'lost', 'gym', '2026-01-17', 3],
            ['Scientific Calculator', 'Texas Instruments TI-84 Plus calculator found in Chemistry lab.', 'electronics', 'found', 'science', '2026-01-22', 4]
        ];

        items.forEach(item => {
            db.run(`INSERT INTO items (name, description, category, status, location, date_lost_found, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)`, item);
        });

        const activities = [
            ['lost', 'New lost item reported: iPhone 15 Pro Max at Library', 1, 1],
            ['found', 'Wallet found at Cafeteria - looking for owner', 2, 2],
            ['claimed', 'Laptop successfully reunited with owner!', 3, 3],
            ['found', 'Car keys found in Parking Lot B', 6, 6],
            ['lost', 'AirPods Pro lost near Arts Building', 5, 5]
        ];

        activities.forEach(activity => {
            db.run(`INSERT INTO activity_log (type, message, user_id, item_id) VALUES (?, ?, ?, ?)`, activity);
        });

        console.log('✅ Sample data inserted!');
    }
}

async function insertDefaultAdmin() {
    const result = db.exec('SELECT COUNT(*) as count FROM admins');
    const count = result[0]?.values[0]?.[0] || 0;
    
    if (count === 0) {
        console.log('👤 Creating default admin account...');
        
        const hashedPassword = bcrypt.hashSync('admin123', 10);
        
        db.run(`INSERT INTO admins (name, email, password) VALUES (?, ?, ?)`, [
            'Admin',
            'admin@campus.edu',
            hashedPassword
        ]);
        
        console.log('✅ Default admin created!');
        console.log('   Email: admin@campus.edu');
        console.log('   Password: admin123');
    }
}

module.exports = {
    initialize,
    get db() { return { prepare }; },
    getDb: () => db,
    prepare,
    saveDatabase
};
