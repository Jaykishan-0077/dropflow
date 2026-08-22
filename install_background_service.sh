#!/bin/bash

PLIST_PATH="$HOME/Library/LaunchAgents/com.dropflow.daemon.plist"

cat << EOF > "$PLIST_PATH"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.dropflow.daemon</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/jk/.nvm/versions/node/v24.14.1/bin/node</string>
        <string>/Users/jk/.gemini/antigravity/scratch/dropflow/server.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>/Users/jk/.gemini/antigravity/scratch/dropflow</string>
    <key>StandardOutPath</key>
    <string>/tmp/dropflow_daemon.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/dropflow_daemon_err.log</string>
</dict>
</plist>
EOF

launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"

echo "✅ DropFlow background service reloaded successfully!"
