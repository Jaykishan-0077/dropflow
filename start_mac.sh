#!/bin/bash

echo "================================================================="
echo "  🚀 Starting DropFlow Local File Transfer Engine on macOS"
echo "================================================================="

# Change to app directory
CDIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$CDIR"

# Check Node.js
if ! command -v node &> /dev/null
then
    echo "❌ Node.js is not found. Installing local runtime or dependencies..."
    npm install
fi

# Install dependencies if node_modules missing
if [ ! -d "node_modules" ]; then
    echo "📦 Installing lightweight dependencies (Express, CORS, WS)..."
    npm install --no-audit --no-fund
fi

echo "✨ Starting DropFlow Engine on Apple Silicon M-Series / macOS..."
echo "📱 If using Android 5G Hotspot, turn on Hotspot on your phone now."

# Launch server
node server.js &
SERVER_PID=$!

sleep 2

# Open in default browser or web app window
open "http://localhost:7070"

echo "================================================================="
echo " DropFlow is running!"
echo " Access URL: http://localhost:7070"
echo " Press Ctrl+C to stop the server."
echo "================================================================="

wait $SERVER_PID
