import Cocoa
import WebKit

class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var serverProcess: Process?
    let targetURL = URL(string: "http://127.0.0.1:7070")!
    var loadRetries = 0

    func applicationDidFinishLaunching(_ notification: Notification) {
        setupMainMenu()
        setupWindow()
        launchServerAndLoad()
    }

    func setupMainMenu() {
        let mainMenu = NSMenu()
        
        // App Menu
        let appMenuItem = NSMenuItem()
        mainMenu.addItem(appMenuItem)
        let appMenu = NSMenu()
        appMenuItem.submenu = appMenu
        appMenu.addItem(withTitle: "About DropFlow", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Hide DropFlow", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let hideOthers = appMenu.addItem(withTitle: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(withTitle: "Show All", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Quit DropFlow", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

        // Edit Menu
        let editMenuItem = NSMenuItem()
        mainMenu.addItem(editMenuItem)
        let editMenu = NSMenu(title: "Edit")
        editMenuItem.submenu = editMenu
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")

        // View Menu (Reload)
        let viewMenuItem = NSMenuItem()
        mainMenu.addItem(viewMenuItem)
        let viewMenu = NSMenu(title: "View")
        viewMenuItem.submenu = viewMenu
        let reloadItem = viewMenu.addItem(withTitle: "Reload", action: #selector(reloadWebView), keyEquivalent: "r")
        reloadItem.target = self

        // Window Menu
        let windowMenuItem = NSMenuItem()
        mainMenu.addItem(windowMenuItem)
        let windowMenu = NSMenu(title: "Window")
        windowMenuItem.submenu = windowMenu
        windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")

        NSApp.mainMenu = mainMenu
    }

    @objc func reloadWebView() {
        loadRetries = 0
        webView?.load(URLRequest(url: targetURL))
    }

    func setupWindow() {
        let screenRect = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1200, height: 800)
        let windowWidth: CGFloat = 1020
        let windowHeight: CGFloat = 760
        let xPos = screenRect.origin.x + (screenRect.width - windowWidth) / 2
        let yPos = screenRect.origin.y + (screenRect.height - windowHeight) / 2

        let contentRect = NSRect(x: xPos, y: yPos, width: windowWidth, height: windowHeight)
        window = NSWindow(
            contentRect: contentRect,
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.delegate = self
        window.title = "DropFlow - High-Speed P2P Transfer"
        window.appearance = NSAppearance(named: .darkAqua)
        window.minSize = NSSize(width: 500, height: 550)

        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        
        webView = WKWebView(frame: contentRect, configuration: config)
        webView.autoresizingMask = [.width, .height]
        webView.navigationDelegate = self
        window.contentView = webView

        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func findNodePath() -> String? {
        let candidates = [
            "/Users/jk/.nvm/versions/node/v24.14.1/bin/node",
            "/opt/homebrew/bin/node",
            "/usr/local/bin/node",
            "/usr/bin/node"
        ]
        for path in candidates {
            if FileManager.default.isExecutableFile(atPath: path) {
                return path
            }
        }
        
        let whichProcess = Process()
        whichProcess.executableURL = URL(fileURLWithPath: "/usr/bin/which")
        whichProcess.arguments = ["node"]
        let pipe = Pipe()
        whichProcess.standardOutput = pipe
        do {
            try whichProcess.run()
            whichProcess.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            if let output = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines), !output.isEmpty {
                if FileManager.default.isExecutableFile(atPath: output) {
                    return output
                }
            }
        } catch {}
        return nil
    }

    func launchServerAndLoad() {
        // First spawn server if not running
        spawnServerIfNeeded()

        // Give server 250ms head start and load URL on main thread
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in
            guard let self = self else { return }
            self.loadRetries = 0
            self.webView.load(URLRequest(url: self.targetURL))
        }
    }

    func spawnServerIfNeeded() {
        // Quick check if port 7070 already responding
        let sem = DispatchSemaphore(value: 0)
        var isRunning = false
        var req = URLRequest(url: URL(string: "http://127.0.0.1:7070/api/info")!)
        req.timeoutInterval = 0.3
        URLSession.shared.dataTask(with: req) { _, response, _ in
            if let httpRes = response as? HTTPURLResponse, httpRes.statusCode == 200 {
                isRunning = true
            }
            sem.signal()
        }.resume()
        _ = sem.wait(timeout: .now() + 0.4)

        if isRunning {
            print("[DropFlow] Server is already running on port 7070.")
            return
        }

        guard let nodePath = findNodePath() else {
            showError("Node.js was not found. Please ensure Node.js is installed on your Mac.")
            return
        }

        let resourcePath = Bundle.main.resourcePath ?? ""
        var serverScript = "\(resourcePath)/server.js"
        if !FileManager.default.fileExists(atPath: serverScript) {
            serverScript = "/Users/jk/.gemini/antigravity/scratch/dropflow/server.js"
        }

        let workingDirectory = (serverScript as NSString).deletingLastPathComponent

        let process = Process()
        process.executableURL = URL(fileURLWithPath: nodePath)
        process.arguments = [serverScript]
        process.currentDirectoryURL = URL(fileURLWithPath: workingDirectory)

        var env = ProcessInfo.processInfo.environment
        env["PATH"] = "/Users/jk/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
        process.environment = env

        self.serverProcess = process

        do {
            try process.run()
            print("[DropFlow] Spawned server successfully.")
        } catch {
            showError("Failed to launch DropFlow server: \(error.localizedDescription)")
        }
    }

    // WKNavigationDelegate
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        print("[DropFlow] Webview finished loading successfully.")
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        print("[DropFlow] Provisional navigation failed: \(error.localizedDescription). Retrying...")
        if loadRetries < 20 {
            loadRetries += 1
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
                guard let self = self else { return }
                self.webView.load(URLRequest(url: self.targetURL))
            }
        } else {
            showError("Could not connect to DropFlow engine on port 7070.")
        }
    }

    func showError(_ message: String) {
        DispatchQueue.main.async {
            let alert = NSAlert()
            alert.messageText = "DropFlow"
            alert.informativeText = message
            alert.alertStyle = .critical
            alert.addButton(withTitle: "OK")
            alert.runModal()
        }
    }

    func windowWillClose(_ notification: Notification) {
        NSApp.terminate(nil)
    }

    func applicationWillTerminate(_ notification: Notification) {
        serverProcess?.terminate()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
