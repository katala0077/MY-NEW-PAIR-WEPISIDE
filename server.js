const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure temporary session folder exists
const tempDir = path.join(__dirname, 'temp_sessions');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

// Clean up old session folders (older than 30 minutes) every hour
setInterval(() => {
    const now = Date.now();
    fs.readdirSync(tempDir).forEach(sessionId => {
        const folder = path.join(tempDir, sessionId);
        const stats = fs.statSync(folder);
        if (now - stats.mtimeMs > 30 * 60 * 1000) {
            fs.rmSync(folder, { recursive: true, force: true });
        }
    });
}, 60 * 60 * 1000);

// Serve the HTML page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Endpoint to request pairing code
app.post('/pair', async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number required' });
    }

    // Clean the number: remove all non-digits
    const cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.length < 10 || cleaned.length > 15) {
        return res.status(400).json({ error: 'Invalid phone number (must be 10-15 digits)' });
    }

    const sessionId = uuidv4();
    const sessionDir = path.join(tempDir, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });

    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' })),
            },
            browser: ['Pair Website', 'Chrome', '1.0'],
        });

        let pairingCode;
        try {
            pairingCode = await sock.requestPairingCode(cleaned);
            pairingCode = pairingCode?.match(/.{1,4}/g)?.join('-') || pairingCode;
        } catch (err) {
            console.error('RequestPairingCode error:', err);
            fs.rmSync(sessionDir, { recursive: true, force: true });
            return res.status(500).json({ error: 'Failed to request pairing code. Check number or try again.' });
        }

        // Send pairing code back to client immediately
        res.json({ pairingCode, sessionId });

        // Wait for authentication
        sock.ev.on('connection.update', async (update) => {
            const { connection } = update;
            if (connection === 'open') {
                const credsPath = path.join(sessionDir, 'creds.json');
                if (fs.existsSync(credsPath)) {
                    const credsData = fs.readFileSync(credsPath, 'utf-8');
                    const base64Session = Buffer.from(credsData).toString('base64');
                    fs.writeFileSync(path.join(sessionDir, 'session.txt'), base64Session);
                }
                sock.end();
            }
        });

        sock.ev.on('creds.update', saveCreds);

    } catch (error) {
        console.error('Server error:', error);
        fs.rmSync(sessionDir, { recursive: true, force: true });
        return res.status(500).json({ error: 'Server error: ' + error.message });
    }
});

// Endpoint to check if session is ready and get base64 string
app.get('/result/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const sessionDir = path.join(tempDir, sessionId);
    const resultFile = path.join(sessionDir, 'session.txt');

    if (!fs.existsSync(resultFile)) {
        return res.status(404).json({ ready: false });
    }

    const base64Session = fs.readFileSync(resultFile, 'utf-8');
    res.json({ ready: true, session: base64Session });
});

// Use the port provided by the platform, or default to 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Pair website running on port ${PORT}`);
});
