// DropFlow High-Speed Transfer Client Engine
const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB Streaming Chunk Size

let socket = null;
let currentUpload = null;

document.addEventListener('DOMContentLoaded', () => {
    initNetworkInfo();
    initWebSocket();
    initDropZone();
    fetchFileList();
});

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

// WebSocket Connection for Real-time Progress Broadcast
function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${window.location.host}`);

    socket.onopen = () => {
        document.getElementById('status-indicator').style.color = '#00e676';
        document.getElementById('status-text').innerText = 'Engine Connected';
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'TRANSFER_COMPLETE') {
            fetchFileList();
        }
    };

    socket.onclose = () => {
        document.getElementById('status-indicator').style.color = '#ff5252';
        document.getElementById('status-text').innerText = 'Disconnected - Retrying...';
        setTimeout(initWebSocket, 3000);
    };
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

// Upload Files in Queue
async function handleFiles(files) {
    for (let i = 0; i < files.length; i++) {
        await uploadFile(files[i]);
    }
}

// High-Performance Chunked Upload Engine
async function uploadFile(file) {
    const progressCard = document.getElementById('progress-card');
    const filenameEl = document.getElementById('progress-filename');
    const speedEl = document.getElementById('progress-speed');
    const progressBar = document.getElementById('progress-bar');
    const transferredEl = document.getElementById('progress-transferred');
    const etaEl = document.getElementById('progress-eta');

    progressCard.style.display = 'block';
    filenameEl.innerText = `Sending: ${file.name}`;
    
    const fileId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    
    let startTime = Date.now();
    let uploadedBytes = 0;

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        try {
            await uploadChunk(chunk, fileId, file.name, chunkIndex, totalChunks);
            uploadedBytes += (end - start);

            // Calculate Metrics
            const elapsedTime = (Date.now() - startTime) / 1000;
            const speedMB = (uploadedBytes / (1024 * 1024)) / elapsedTime;
            const progressPercent = Math.round((uploadedBytes / file.size) * 100);
            const remainingBytes = file.size - uploadedBytes;
            const etaSeconds = speedMB > 0 ? Math.round((remainingBytes / (1024 * 1024)) / speedMB) : 0;

            // Update UI
            progressBar.style.width = `${progressPercent}%`;
            speedEl.innerText = `${speedMB.toFixed(1)} MB/s`;
            transferredEl.innerText = `${formatBytes(uploadedBytes)} / ${formatBytes(file.size)} (${progressPercent}%)`;
            etaEl.innerText = `ETA: ${etaSeconds}s remaining`;

        } catch (err) {
            console.error(`Error uploading chunk ${chunkIndex}:`, err);
            alert(`Transfer error on ${file.name}. Click OK to retry.`);
            chunkIndex--; // Retry chunk
        }
    }

    setTimeout(() => {
        progressCard.style.display = 'none';
        fetchFileList();
    }, 1200);
}

function uploadChunk(chunk, fileId, filename, chunkIndex, totalChunks) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/upload/chunk', true);

        xhr.setRequestHeader('x-file-id', fileId);
        xhr.setRequestHeader('x-file-name', encodeURIComponent(filename));
        xhr.setRequestHeader('x-chunk-index', chunkIndex);
        xhr.setRequestHeader('x-total-chunks', totalChunks);
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

// Fetch Files Inbox
async function fetchFileList() {
    try {
        const res = await fetch('/api/files');
        const files = await res.json();
        const listEl = document.getElementById('file-list');
        
        if (files.length === 0) {
            listEl.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px;">No files received yet.</div>`;
            return;
        }

        listEl.innerHTML = files.map(file => `
            <div class="file-item">
                <div class="file-info">
                    <div class="file-icon">${getFileIcon(file.name)}</div>
                    <div>
                        <div class="file-name">${escapeHtml(file.name)}</div>
                        <div class="file-size">${formatBytes(file.size)} • ${new Date(file.mtime).toLocaleTimeString()}</div>
                    </div>
                </div>
                <a href="${file.downloadUrl}" download="${escapeHtml(file.name)}" class="btn-download">Download</a>
            </div>
        `).join('');
    } catch (err) {
        console.error('Failed to fetch file list:', err);
    }
}

// Helper Functions
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
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
