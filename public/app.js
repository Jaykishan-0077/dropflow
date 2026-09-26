// DropFlow High-Speed P2P Transfer Client Engine
const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB Streaming Chunk Size
const SENDER_ID = `peer_${Math.random().toString(36).substr(2, 6)}`;

let socket = null;
let activeTransfers = {}; // Track active transfers by fileId
let allHistoryFiles = [];

document.addEventListener('DOMContentLoaded', () => {
    initMobileTabs();
    initNetworkInfo();
    initWebSocket();
    initDropZone();
    fetchFileList();
});

// Mobile Tab Switcher
function initMobileTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const targetTab = document.getElementById(btn.dataset.tab);
            if (targetTab) targetTab.classList.add('active');
        });
    });
}

// Fetch Server Network & Gateway Info
async function initNetworkInfo() {
    try {
        const res = await fetch('/api/info');
        const data = await res.json();
        
        const ipListEl = document.getElementById('ip-list');
        ipListEl.innerHTML = '';
        
        if (data.ipAddresses.length > 0) {
            data.ipAddresses.forEach((ip) => {
                const url = `http://${ip.address}:${data.port}`;
                const item = document.createElement('div');
                item.className = 'ip-item';
                item.innerHTML = `
                    <span>${ip.type}</span>
                    <a href="${url}" target="_blank" class="ip-address">${ip.address}:${data.port}</a>
                `;
                ipListEl.appendChild(item);
            });
        } else {
            ipListEl.innerHTML = `<div class="ip-item"><span class="ip-address">http://localhost:${data.port}</span></div>`;
        }

        // Display Server-Generated QR Code
        if (data.qrDataUrl) {
            const qrImg = document.getElementById('qrcode');
            if (qrImg) qrImg.src = data.qrDataUrl;
        }
    } catch (err) {
        console.error('Failed to fetch network info:', err);
    }
}

// WebSocket Connection for Bidirectional Real-time Updates (% on both Mobile & Laptop)
function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${window.location.host}`);

    socket.onopen = () => {
        document.getElementById('status-indicator').style.color = '#00e676';
        document.getElementById('status-text').innerText = 'Engine Ready';
    };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'TRANSFER_PROGRESS') {
                handleIncomingProgress(data);
            } else if (data.type === 'TRANSFER_COMPLETE') {
                handleIncomingComplete(data);
            }
        } catch (e) {
            console.error('Error handling WebSocket message:', e);
        }
    };

    socket.onclose = () => {
        document.getElementById('status-indicator').style.color = '#ff5252';
        document.getElementById('status-text').innerText = 'Disconnected - Retrying...';
        setTimeout(initWebSocket, 3000);
    };
}

// Handle Live Bidirectional Progress (% shown on both Laptop & Mobile)
function handleIncomingProgress(data) {
    const { fileId, filename, percent, currentSize, totalSize, senderId } = data;
    
    // Ignore local echoed updates if already tracked manually by sender
    if (senderId === SENDER_ID && activeTransfers[fileId] && activeTransfers[fileId].isLocalSender) {
        return;
    }

    if (!activeTransfers[fileId]) {
        activeTransfers[fileId] = {
            fileId,
            filename,
            totalSize: totalSize || currentSize,
            isIncoming: true,
            startTime: Date.now()
        };
    }

    const transfer = activeTransfers[fileId];
    transfer.currentSize = currentSize;
    transfer.percent = percent || Math.round((currentSize / transfer.totalSize) * 100);

    const elapsedTime = (Date.now() - transfer.startTime) / 1000;
    transfer.speedMB = elapsedTime > 0 ? ((currentSize / (1024 * 1024)) / elapsedTime).toFixed(1) : '0.0';

    renderActiveTransfers();
}

function handleIncomingComplete(data) {
    const { fileId } = data;
    if (activeTransfers[fileId]) {
        delete activeTransfers[fileId];
        renderActiveTransfers();
    }
    fetchFileList();
}

// Render Active Runtime Transfers Panel
function renderActiveTransfers() {
    const listEl = document.getElementById('active-transfers-list');
    const tagEl = document.getElementById('active-count-tag');
    const keys = Object.keys(activeTransfers);

    tagEl.innerText = `${keys.length} Active`;

    if (keys.length === 0) {
        listEl.innerHTML = `<div class="empty-state">No active transfers running. Send a file to get started.</div>`;
        return;
    }

    listEl.innerHTML = keys.map(id => {
        const item = activeTransfers[id];
        const dirText = item.isIncoming ? '⬇ Incoming' : '⬆ Outgoing';
        const dirClass = item.isIncoming ? 'dir-incoming' : 'dir-outgoing';
        
        return `
            <div class="active-item-card">
                <div class="active-meta">
                    <span class="active-filename" title="${escapeHtml(item.filename)}">${escapeHtml(item.filename)}</span>
                    <span class="dir-badge ${dirClass}">${dirText}</span>
                </div>
                <div class="progress-track">
                    <div class="progress-fill" style="width: ${item.percent}%;"></div>
                </div>
                <div class="active-stats">
                    <span class="percent-label">${item.percent}% (${formatBytes(item.currentSize || 0)} / ${formatBytes(item.totalSize || 0)})</span>
                    <span>⚡ ${item.speedMB || '0.0'} MB/s</span>
                </div>
            </div>
        `;
    }).join('');
}

// Drag & Drop Setup
function initDropZone() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('dragover');
        }, false);
    });

    dropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0) handleFiles(files);
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFiles(e.target.files);
    });
}

// Process Upload Files Queue
async function handleFiles(files) {
    for (let i = 0; i < files.length; i++) {
        await uploadFile(files[i]);
    }
}

// High-Performance Chunked Upload Engine
async function uploadFile(file) {
    const fileId = `${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    let startTime = Date.now();
    let uploadedBytes = 0;

    // Register local active transfer
    activeTransfers[fileId] = {
        fileId,
        filename: file.name,
        totalSize: file.size,
        currentSize: 0,
        percent: 0,
        speedMB: '0.0',
        isLocalSender: true,
        isIncoming: false,
        startTime
    };
    renderActiveTransfers();

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        try {
            await uploadChunk(chunk, fileId, file.name, chunkIndex, totalChunks, file.size);
            uploadedBytes += (end - start);

            const elapsedTime = (Date.now() - startTime) / 1000;
            const speedMB = elapsedTime > 0 ? ((uploadedBytes / (1024 * 1024)) / elapsedTime).toFixed(1) : '0.0';
            const percent = Math.min(100, Math.round((uploadedBytes / file.size) * 100));

            // Update local active transfer object
            if (activeTransfers[fileId]) {
                activeTransfers[fileId].currentSize = uploadedBytes;
                activeTransfers[fileId].percent = percent;
                activeTransfers[fileId].speedMB = speedMB;
                renderActiveTransfers();
            }

        } catch (err) {
            console.error(`Error uploading chunk ${chunkIndex}:`, err);
            alert(`Transfer error on ${file.name}. Click OK to retry.`);
            chunkIndex--;
        }
    }

    // Transfer finished: Remove from active transfers and refresh history
    setTimeout(() => {
        if (activeTransfers[fileId]) {
            delete activeTransfers[fileId];
            renderActiveTransfers();
        }
        fetchFileList();
    }, 800);
}

function uploadChunk(chunk, fileId, filename, chunkIndex, totalChunks, totalSize) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/upload/chunk', true);

        xhr.setRequestHeader('x-file-id', fileId);
        xhr.setRequestHeader('x-file-name', encodeURIComponent(filename));
        xhr.setRequestHeader('x-chunk-index', chunkIndex);
        xhr.setRequestHeader('x-total-chunks', totalChunks);
        xhr.setRequestHeader('x-total-size', totalSize);
        xhr.setRequestHeader('x-sender-id', SENDER_ID);
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(JSON.parse(xhr.responseText));
            } else {
                reject(new Error(`Server returned ${xhr.status}`));
            }
        };

        xhr.onerror = () => reject(new Error('Network error during chunk upload'));
        xhr.send(chunk);
    });
}

// Fetch & Render Transferred Files History & Inbox
async function fetchFileList() {
    try {
        const res = await fetch('/api/files');
        allHistoryFiles = await res.json();
        filterAndSortHistoryFiles();
    } catch (err) {
        console.error('Failed to fetch file list:', err);
    }
}

function filterAndSortHistoryFiles() {
    const searchEl = document.getElementById('history-search');
    const sortEl = document.getElementById('history-sort');
    
    const query = searchEl ? searchEl.value.toLowerCase().trim() : '';
    const sortBy = sortEl ? sortEl.value : 'newest';

    let result = allHistoryFiles.filter(f => f.name.toLowerCase().includes(query));

    switch (sortBy) {
        case 'newest':
            result.sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
            break;
        case 'oldest':
            result.sort((a, b) => new Date(a.mtime) - new Date(b.mtime));
            break;
        case 'name_asc':
            result.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
            break;
        case 'name_desc':
            result.sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' }));
            break;
        case 'size_desc':
            result.sort((a, b) => b.size - a.size);
            break;
        case 'size_asc':
            result.sort((a, b) => a.size - b.size);
            break;
        default:
            result.sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
            break;
    }

    renderHistoryList(result);
}

function renderHistoryList(files) {
    const listEl = document.getElementById('file-list');
    const badgeEl = document.getElementById('history-badge-count');
    
    if (badgeEl) badgeEl.innerText = files.length;

    if (files.length === 0) {
        listEl.innerHTML = `<div class="empty-state">No received files yet.</div>`;
        return;
    }

    listEl.innerHTML = files.map(file => `
        <div class="file-item">
            <div class="file-info">
                <div class="file-icon">${getFileIcon(file.name)}</div>
                <div>
                    <div class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
                    <div class="file-size">${formatBytes(file.size)} • ${new Date(file.mtime).toLocaleTimeString()}</div>
                </div>
            </div>
            <a href="${file.downloadUrl}" download="${escapeHtml(file.name)}" class="btn-download">Download</a>
        </div>
    `).join('');
}

// Helper Functions
function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    if (['mp4', 'mkv', 'mov', 'avi'].includes(ext)) return '🎬';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return '🖼️';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '📦';
    if (['pdf', 'doc', 'docx', 'txt'].includes(ext)) return '📄';
    if (['mp3', 'wav', 'flac'].includes(ext)) return '🎵';
    return '📁';
}

function escapeHtml(str) {
    return str.replace(/[&<>"']/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
}
