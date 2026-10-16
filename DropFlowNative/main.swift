import Cocoa
import WebKit

class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var serverProcess: Process?
    let targetURL = URL(string: "http://127.0.0.1:7070")!

    func applicationDidFinishLaunching(_ notification: Notification) {
        setupMainMenu()
        setupWindow()
        startServerAndLoad()
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

        // Edit Menu (Allows Copy/Paste in inputs)
        let editMenuItem = NSMenuItem()
        mainMenu.addItem(editMenuItem)
        let editMenu = NSMenu(title: "Edit")
        editMenuItem.submenu = editMenu
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")

        // Window Menu
        let windowMenuItem = NSMenuItem()
        mainMenu.addItem(windowMenuItem)
        let windowMenu = NSMenu(title: "Window")
        windowMenuItem.submenu = windowMenu
        windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")

        NSApp.mainMenu = mainMenu
    }

    func setupWindow() {
        let screenRect = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1200, height: 800)
        let windowWidth: CGFloat = 1000
        let windowHeight: CGFloat = 750
        let xPos = screenRect.origin.x + (screenRect.width - windowWidth) / 2
        let yPos = screenRect.origin.y + (screenRect.height - windowHeight) / 2

        let contentRect = NSRect(x: xPos, y: yPos, width: windowWidth, height: windowHeight)
        window = NSWindow(
            contentRect: contentRect,
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.delegate = self
        window.title = "DropFlow"
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.appearance = NSAppearance(named: .darkAqua)
        window.minSize = NSSize(width: 500, height: 550)

        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        
        webView = WKWebView(frame: window.contentView!.bounds, configuration: config)
        webView.autoresizingMask = [.width, .height]
        webView.setValue(false, forKey: "drawsBackground")
        window.contentView?.addSubview(webView)

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

    func startServerAndLoad() {
        checkServerAlive { [weak self] isAlive in
            guard let self = self else { return }
            if isAlive {
                DispatchQueue.main.async {
                    self.webView.load(URLRequest(url: self.targetURL))
                }
            } else {
                self.spawnServer()
            }
        }
    }

    func spawnServer() {
        guard let nodePath = findNodePath() else {
            showError("Node.js could not be located. Please ensure Node.js is installed on your Mac.")
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
        } catch {
            showError("Failed to launch DropFlow server: \(error.localizedDescription)")
            return
        }

        // Poll until server is ready (up to 4 seconds)
        var attempts = 0
        Timer.scheduledTimer(withTimeInterval: 0.15, repeats: true) { [weak self] timer in
            guard let self = self else {
                timer.invalidate()
                return
            }
            attempts += 1
            self.checkServerAlive { isAlive in
                if isAlive {
                    timer.invalidate()
                    DispatchQueue.main.async {
                        self.webView.load(URLRequest(url: self.targetURL))
                    }
                } else if attempts > 25 {
                    timer.invalidate()
                    DispatchQueue.main.async {
                        self.showError("Server failed to respond on port 7070. Please try again.")
                    }
                }
            }
        }
    }

    func checkServerAlive(completion: @escaping (Bool) -> Void) {
        var req = URLRequest(url: URL(string: "http://127.0.0.1:7070/api/info")!)
        req.timeoutInterval = 0.5
        let task = URLSession.shared.dataTask(with: req) { _, response, _ in
            if let httpRes = response as? HTTPURLResponse, httpRes.statusCode == 200 {
                completion(true)
            } else {
                completion(false)
            }
        }
        task.resume()
    }

    func showError(_ message: String) {
        let alert = NSAlert()
        alert.messageText = "DropFlow"
        alert.informativeText = message
        alert.alertStyle = .critical
        alert.addButton(withTitle: "OK")
        alert.runModal()
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
