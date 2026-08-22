const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const os = require('os');
const cors = require('cors');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 7070;
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
const TEMP_DIR = path.join(__dirname, 'temp_chunks');

// Ensure directories exist
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/downloads', express.static(DOWNLOADS_DIR));

// Helper: Get local network IPv4 addresses
function getLocalIpAddresses() {
    const interfaces = os.networkInterfaces();
    const addresses = [];
    for (const k in interfaces) {
        for (const k2 of interfaces[k]) {
            if (k2.family === 'IPv4' && !k2.internal) {
                let type = 'Wi-Fi / LAN';
                if (k.toLowerCase().includes('bridge') || k.toLowerCase().includes('ap') || k2.address.startsWith('192.168.43.')) {
                    type = 'Mobile Hotspot';
                }
                addresses.push({
                    interface: k,
                    address: k2.address,
                    type: type
                });
            }
        }
    }
    return addresses;
}

// WebSocket broadcast for transfer progress & peer updates
function broadcast(data) {
    const message = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'CONNECTED', message: 'Connected to DropFlow Engine' }));
});

// API: Get Network Info & QR Code
app.get('/api/info', async (req, res) => {
    const ips = getLocalIpAddresses();
    const primaryIp = ips.length > 0 ? ips[0].address : 'localhost';
    const primaryUrl = `http://${primaryIp}:${PORT}`;
    
    let qrDataUrl = '';
    try {
        qrDataUrl = await QRCode.toDataURL(primaryUrl, {
            margin: 2,
            width: 240,
            color: {
                dark: '#000000',
                light: '#ffffff'
            }
        });
    } catch (err) {
        console.error('Failed to generate QR Code:', err);
    }

    res.json({
        port: PORT,
        ipAddresses: ips,
        downloadsDir: DOWNLOADS_DIR,
        hostName: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        primaryUrl: primaryUrl,
        qrDataUrl: qrDataUrl
    });
});

// API: List Available Download Files
app.get('/api/files', (req, res) => {
    fs.readdir(DOWNLOADS_DIR, (err, files) => {
        if (err) return res.status(500).json({ error: 'Failed to list files' });
        
        const fileList = files
            .filter(f => !f.startsWith('.'))
            .map(filename => {
                const filePath = path.join(DOWNLOADS_DIR, filename);
                const stats = fs.statSync(filePath);
                return {
                    name: filename,
                    size: stats.size,
                    mtime: stats.mtime,
                    downloadUrl: `/api/download/${encodeURIComponent(filename)}`
                };
            });
        res.json(fileList);
    });
});

// API: Init Chunked Upload (Support Resumable Transfers)
app.post('/api/upload/init', (req, res) => {
    const { filename, totalSize, fileId } = req.body;
    if (!filename || !totalSize || !fileId) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }

    const safeFilename = path.basename(filename);
    const targetPath = path.join(DOWNLOADS_DIR, safeFilename);
    
    // Check if partial file exists for resume
    let existingSize = 0;
    if (fs.existsSync(targetPath)) {
        existingSize = fs.statSync(targetPath).size;
    }

    res.json({
        fileId,
        safeFilename,
        receivedBytes: existingSize,
        canResume: existingSize < totalSize
    });
});

// API: Receive File Chunk (Raw Binary Stream for Max Performance)
app.post('/api/upload/chunk', (req, res) => {
    const fileId = req.headers['x-file-id'];
    const filename = req.headers['x-file-name'];
    const chunkIndex = parseInt(req.headers['x-chunk-index'] || '0', 10);
    const totalChunks = parseInt(req.headers['x-total-chunks'] || '1', 10);

    if (!filename) {
        return res.status(400).json({ error: 'Missing x-file-name header' });
    }

    const safeFilename = path.basename(decodeURIComponent(filename));
    const targetPath = path.join(DOWNLOADS_DIR, safeFilename);

    const writeStream = fs.createWriteStream(targetPath, { flags: chunkIndex === 0 ? 'w' : 'a' });

    req.pipe(writeStream);

    writeStream.on('finish', () => {
        const stats = fs.statSync(targetPath);
        
        broadcast({
            type: 'TRANSFER_PROGRESS',
            fileId,
            filename: safeFilename,
            chunkIndex,
            totalChunks,
            currentSize: stats.size
        });

        if (chunkIndex + 1 === totalChunks) {
            broadcast({
                type: 'TRANSFER_COMPLETE',
                fileId,
                filename: safeFilename,
                totalSize: stats.size
            });
        }

        res.json({ success: true, currentSize: stats.size });
    });

    writeStream.on('error', (err) => {
        console.error('Chunk write error:', err);
        res.status(500).json({ error: 'Failed to write chunk' });
    });
});

// API: File Download with Range Support (HTTP 206)
app.get('/api/download/:filename', (req, res) => {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(DOWNLOADS_DIR, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found');
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(filePath, { start, end });
        const head = {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`
        };
        res.writeHead(206, head);
        file.pipe(res);
    } else {
        const head = {
            'Content-Length': fileSize,
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`
        };
        res.writeHead(200, head);
        fs.createReadStream(filePath).pipe(res);
    }
});

// Start Server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(` DropFlow Local High-Speed Transfer Engine Started`);
    console.log(` Port: ${PORT}`);
    console.log(` Local Storage: ${DOWNLOADS_DIR}`);
    console.log(`====================================================`);
    const ips = getLocalIpAddresses();
    if (ips.length === 0) {
        console.log(` Access URL: http://localhost:${PORT}`);
    } else {
        ips.forEach(ip => {
            console.log(` [${ip.type}] http://${ip.address}:${PORT}`);
        });
    }
    console.log(`====================================================`);
});
