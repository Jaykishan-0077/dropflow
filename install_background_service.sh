#!/bin/bash

UID_NUM=$(id -u)
PLIST_PATH="$HOME/Library/LaunchAgents/com.dropflow.daemon.plist"
NODE_BIN="/Users/jk/.nvm/versions/node/v24.14.1/bin/node"

if [ ! -f "$NODE_BIN" ]; then
    NODE_BIN="$(which node)"
fi

mkdir -p "$HOME/Library/LaunchAgents"

cat << EOF > "$PLIST_PATH"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.dropflow.daemon</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_BIN</string>
        <string>/Users/jk/.gemini/antigravity/scratch/dropflow/server.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>5</integer>
    <key>WorkingDirectory</key>
    <string>/Users/jk/.gemini/antigravity/scratch/dropflow</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/Users/jk/.nvm/versions/node/v24.14.1/bin:/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
        <key>HOME</key>
        <string>/Users/jk</string>
    </dict>
    <key>StandardOutPath</key>
    <string>/Users/jk/.gemini/antigravity/scratch/dropflow/daemon_stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/jk/.gemini/antigravity/scratch/dropflow/daemon_stderr.log</string>
</dict>
</plist>
EOF

# Bootstrapping with modern macOS gui domain
launchctl bootout "gui/$UID_NUM/com.dropflow.daemon" 2>/dev/null || true
launchctl bootstrap "gui/$UID_NUM" "$PLIST_PATH" 2>/dev/null || launchctl load "$PLIST_PATH"
launchctl enable "gui/$UID_NUM/com.dropflow.daemon" 2>/dev/null || true

echo "✅ DropFlow background service permanently registered with macOS launchd gui/$UID_NUM domain!"
