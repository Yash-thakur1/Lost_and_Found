const express = require('express');
const { db, saveDatabase } = require('../database');

const router = express.Router();

// Submit contact message
router.post('/', (req, res) => {
    try {
        const { name, email, subject, message } = req.body;

        // Validation
        if (!name || !email || !subject || !message) {
            return res.status(400).json({ error: 'All fields are required.' });
        }

        const result = db.prepare(`
            INSERT INTO contact_messages (name, email, subject, message)
            VALUES (?, ?, ?, ?)
        `).run(name, email, subject, message);
        
        saveDatabase();

        res.status(201).json({
            message: 'Your message has been sent successfully! We will get back to you soon.',
            messageId: result.lastInsertRowid
        });
    } catch (error) {
        console.error('Contact submit error:', error);
        res.status(500).json({ error: 'Failed to send message.' });
    }
});

// Subscribe to newsletter
router.post('/newsletter', (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required.' });
        }

        // Check if already subscribed
        const existing = db.prepare('SELECT * FROM newsletter_subscribers WHERE email = ?').get(email);
        if (existing) {
            return res.status(400).json({ error: 'This email is already subscribed.' });
        }

        db.prepare('INSERT INTO newsletter_subscribers (email) VALUES (?)').run(email);
        
        saveDatabase();

        res.status(201).json({
            message: 'Successfully subscribed to newsletter!'
        });
    } catch (error) {
        console.error('Newsletter subscribe error:', error);
        res.status(500).json({ error: 'Failed to subscribe.' });
    }
});

// Unsubscribe from newsletter
router.delete('/newsletter', (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required.' });
        }

        const result = db.prepare('DELETE FROM newsletter_subscribers WHERE email = ?').run(email);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Email not found in subscribers.' });
        }
        
        saveDatabase();

        res.json({ message: 'Successfully unsubscribed from newsletter.' });
    } catch (error) {
        console.error('Newsletter unsubscribe error:', error);
        res.status(500).json({ error: 'Failed to unsubscribe.' });
    }
});

module.exports = router;
