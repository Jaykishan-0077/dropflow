# ⚡ DropFlow: High-Speed macOS & Android Local File Transfer

> Ultra-fast, zero-cloud, direct peer-to-peer (P2P) local file transfer system built specifically for transferring multi-gigabyte files between MacBooks (Apple Silicon M1/M2/M3/M4) and Android phones.

![macOS Apple Silicon](https://img.shields.io/badge/macOS-Apple%20Silicon%20ARM64-blue?style=for-the-badge&logo=apple)
![Android Compatible](https://img.shields.io/badge/Android-P2P%20Local-green?style=for-the-badge&logo=android)
![Zero 5G Data](https://img.shields.io/badge/Data%20Usage-0%20Bytes%20Cellular-brightgreen?style=for-the-badge)
![Speed](https://img.shields.io/badge/Transfer%20Speed-100%2B%20MB%2Fs-orange?style=for-the-badge)

---

## 📖 Overview

Standard cloud drives force you to upload and download multi-gigabyte files over the internet, consuming time and mobile data. **DropFlow** solves this by establishing a **direct local hardware pipeline** between your MacBook and Android phone using your phone's 5GHz Wi-Fi Hotspot or local network.

### Key Capabilities
- 🚀 **Extreme Local Transfer Speeds**: 60 to 120+ MB/s over 5GHz Wi-Fi / Hotspot.
- 📱 **Zero 5G Data Consumption**: Transfers happen 100% locally across hardware radio waves. Your cellular 5G data allowance is untouched.
- 📦 **2MB Chunked Streaming Engine**: Slice and stream 10GB+ videos, ISOs, and raw photo archives without overloading device RAM.
- 🔄 **Resumable Transfers**: If Wi-Fi connection flickers, transfers automatically resume from the exact byte offset without restarting.
- 📷 **Instant QR Code Pairing**: Scan the automatically generated QR code on your Mac screen to open the phone transfer portal in 2 seconds—no Android app installation required!
- 🍏 **Native Apple Silicon Support**: Native M-series ARM64 execution with near-zero CPU and battery usage.

---

## 🛠️ Installation & Setup Guide

### Prerequisites
- **MacBook**: Apple Silicon (M1/M2/M3/M4) or Intel Mac running macOS 11+.
- **Node.js**: v18+ installed on your Mac (`node -v`).
- **Android Phone**: Any Android device with Wi-Fi / Portable Hotspot capability.

### 1. Clone the Repository
```bash
git clone https://github.com/Jaykishan-0077/dropflow.git
cd dropflow
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Launch DropFlow
You can start DropFlow using any of the following methods:

#### Method A: 1-Click macOS Desktop App (Recommended)
Double-click **`DropFlow.app`** on your Desktop or run:
```bash
./start_mac.sh
```

#### Method B: Command Line Launcher
```bash
npm start
```

---

## 📱 Step-by-Step Usage Guide

### Scenario 1: Using Android 5G Mobile Hotspot (Zero Data Used)

1. **Enable Mobile Hotspot**:
   - On your Android phone, turn on **Portable Hotspot** (select 5GHz band for maximum speed).
2. **Connect MacBook**:
   - Connect your MacBook Wi-Fi to your Android phone's Hotspot network.
3. **Open DropFlow**:
   - Launch `DropFlow.app` on your Mac. It will automatically open `http://localhost:7070` in your web browser.
4. **Scan QR Code**:
   - Use your Android phone camera to scan the **Quick Connect QR Code** displayed on the Mac screen.
5. **Transfer Files**:
   - **Drag & Drop** any large file into the DropFlow window on your Mac or phone to transfer instantly!

---

## 🏗️ Technical Architecture

```
+------------------+     mDNS / QR Code Pair      +--------------------+
|  MacBook (M-chip)| <=========================>  |   Android Phone    |
|   (Sender/Recv)  |                              |   (Sender/Recv)    |
+------------------+                              +--------------------+
         |                                                   |
         +------------- Local Wi-Fi / Hotspot P2P -----------+
                   HTTP/2 & WebSocket Chunk Stream (2MB)
                   [Chunk 1MB] -> [Ack] -> Progress Gauge
```

### Core Engine Details
- **Backend**: Node.js, Express, WebSockets (`ws`), `qrcode`.
- **Frontend**: Glassmorphism CSS3, Vanilla JS, HTML5 Drag-and-Drop API.
- **Range Requests**: Supports HTTP 206 Range headers for streaming media files directly from local storage.

---

## 🔧 Installing as a Permanent macOS Background Service

If you want DropFlow to run automatically in the background whenever your Mac boots up:

```bash
chmod +x install_background_service.sh
./install_background_service.sh
```

To stop the background service:
```bash
launchctl unload ~/Library/LaunchAgents/com.dropflow.daemon.plist
```

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/Jaykishan-0077/dropflow/issues).

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.
