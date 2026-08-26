# 🔄 Chrome & Edge Auto Tab Rotator

An automated tab carousel and rotating dashboard manager for **Google Chrome** and **Microsoft Edge** on Windows. 

It launches the browser with your configured URLs/tabs and automatically cycles through them based on a timer.

Designed for **Windows 10 / 11**, runs completely in **standard user space**, and **does NOT require administrative privileges or external browser drivers**.

---

## 🌟 Key Features

- 🚀 **Zero Admin Permissions**: Runs entirely in standard user space without UAC prompts or installation.
- ⚡ **Zero External Driver Setup**: Communicates directly with Chrome/Edge via native **Chromium DevTools Protocol (CDP)**. No brittle `chromedriver.exe` or `msedgedriver.exe` downloads needed.
- 📦 **Zero External NPM Dependencies**: Built using standard Node.js built-in modules (`http`, `child_process`, `fs`, `path`). Just double-click `start.bat`!
- 🖥️ **Multi-Screen & Multi-Instance Support**:
  - Run multiple independent browser windows on multiple monitors simultaneously without port or session conflicts.
  - Automatically allocates free web server and DevTools debugging ports (3000, 3001, 3002... / 9222, 9223, 9224...).
  - Configure target screen coordinates (`0,0` for Screen 1, `1920,0` for Screen 2, etc.).
- ⏱️ **Flexible Timers & Custom Durations**:
  - Global rotation interval (e.g., 5s, 15s, 30s, 1m, 5m, or custom).
  - Per-tab duration overrides (e.g. Tab 1 for 30s, Tab 2 for 10s).
- 🔄 **Auto-Reload on Switch**: Automatically refreshes pages when switching to keep metrics and dashboards live.
- 📺 **Display Modes**:
  - **Maximized**: Standard browser window.
  - **Kiosk Mode**: Hides address bar, tabs, and window borders (perfect for TV monitors & NOC dashboards).
  - **Fullscreen**: Fullscreen mode (F11).
- 🌐 **Browser Support**: Auto-detects Google Chrome, Microsoft Edge, Brave, and Chromium on Windows.
- 📁 **Named Profiles**: Save and switch between different tab configurations (e.g., `Screen1.json`, `Screen2.json`, `Sales_TV.json`, `NOC_Monitors.json`).
- 🤖 **Unattended / Autostart**: Can auto-launch browser rotation on Windows startup without opening the control panel.

---

## 🚀 Quick Start (Windows)

### Prerequisites
- Windows 10 or 11
- **Node.js** (v16 or newer) installed. Check with `node -v` in Command Prompt.
- Google Chrome or Microsoft Edge installed.

### Running a Single Instance

1. Open the project folder.
2. Double-click **`start.bat`**.
3. Your default browser will open the **Tab Rotator Control Panel** at `http://localhost:3000`.
4. Configure your desired URLs and timer.
5. Click **Launch & Start**!

---

## 🖥️🖥️ Multi-Screen / Multi-Monitor Automation

You can run multiple independent browser windows across different monitors simultaneously!

### Method 1: Just Double-Click `start.bat` Again
1. Double-click **`start.bat`** for Screen 1 (runs on `http://localhost:3000`).
2. Double-click **`start.bat`** a second time for Screen 2.
3. The application will automatically detect that port 3000 is occupied and open a second instance on `http://localhost:3001`!
4. In the second instance, select or create your **Screen 2** profile and set **Target Screen / Monitor Position** to `Screen 2 / Right (1920, 0)`.
5. Click **Launch & Start** on both instances — each will control its own browser window on its designated screen!

### Method 2: One-Click Dual-Screen Launcher (`start-multi-screen.bat`)
Double-click **`start-multi-screen.bat`**. It will automatically:
- Launch Instance 1 (Profile: `Screen1`, Port: 3000) on your primary monitor.
- Launch Instance 2 (Profile: `Screen2`, Port: 3001) on your secondary monitor.
- Begin tab rotation on both screens immediately!

---

## 💻 Visual Control Panel Interface

The Control Panel provides a real-time dark-mode dashboard:

```
+-------------------------------------------------------------------------+
|  🔄 Tab Rotator [Chrome & Edge] [Port :3000]       Profile: [Screen1 ▾] |
+-------------------------------------------------------------------------+
|                                                                         |
|   ( 15s )   ACTIVE TAB #1: Grafana System Status                        |
|   [ RING ]  https://play.grafana.org                                    |
|             Cycle: 1  |  Total Tabs: 3                                  |
|                                                                         |
|   [ ▶ Launch & Start ]   [ ⏸ Pause ]   [ ◀ Prev ] [ Next ▶ ]  [ ⏹ Stop ]  |
+-------------------------------------------------------------------------+
|  Configured Tabs & URLs                 | Rotation & Browser Settings   |
|  -------------------------------------  | ----------------------------  |
|  [✓] #1 Grafana Status     [15s] [▲][▼] | Default Interval: [ 15 ] sec  |
|  [✓] #2 Wikipedia Featured [10s] [▲][▼] | Mode: Sequential (1→2→3→1)    |
|  [✓] #3 Hacker News        [20s] [▲][▼] | Auto-Refresh: [ ON ]          |
|                                         | Target Screen: [ Screen 1 ▾ ] |
|  [+ Add Tab]   [📋 Bulk Import]         | Window Mode: [ Kiosk Mode ▾ ] |
+-------------------------------------------------------------------------+
```

---

## 🛠️ Configuration & Controls

### 1. Tab & URL Management
- **Add Tab**: Click `➕ Add Tab` to add a new URL to the list.
- **Bulk Import**: Click `📋 Bulk Import` to paste a list of URLs (one per line). You can also include titles (`Title | URL`).
- **Enable / Disable**: Toggle the switch next to any tab to temporarily include or exclude it from rotation.
- **Custom Duration**: Set a custom seconds value in the `sec` box to override the global timer for that specific tab.
- **Reorder**: Use the `▲` / `▼` buttons to reorder tabs.
- **Jump to Tab**: Click the `▶` jump icon next to any tab to immediately focus that tab in the active browser window.

### 2. Display & Browser Modes
- **Window Mode**:
  - `Maximized`: Normal browser with tabs visible.
  - `Kiosk Mode`: Completely hides all browser controls, toolbars, and tab bars. Ideal for office display monitors and TVs.
  - `Fullscreen`: Standard browser fullscreen.
- **Target Screen / Monitor Position**:
  - `Auto`: Opens on default/active screen.
  - `Screen 1 / Primary (0, 0)`: Places window at primary display.
  - `Screen 2 / Right (1920, 0)`: Places window at secondary 1080p display on the right.
  - `Screen 2 / Left (-1920, 0)`: Places window at secondary 1080p display on the left.
  - `Custom Coordinates (X,Y)`: Specify exact pixel coordinates.
- **Session / Profile Mode**:
  - `Isolated`: Starts a temporary clean session that won't interfere with your personal Chrome windows.
  - `Persistent`: Keeps logins, cookies, and session data across restarts for this specific profile.

---

## 📺 Kiosk Mode for TV / Digital Signage

To run in standalone Kiosk mode on a dedicated display or TV:

1. In the Control Panel, set **Display / Window Mode** to **Kiosk Mode**.
2. Or simply double-click **`start-kiosk.bat`**.

---

## ⏰ Windows Autostart on Boot (No Admin Needed)

To make Tab Rotator start automatically when Windows boots:

1. Press `Win + R`, type **`shell:startup`**, and press `Enter`. This opens your personal user Startup folder.
2. Right-click inside the folder, choose **New → Shortcut**.
3. Set the target location to:
   ```cmd
   "C:\path\to\chrome-auto\start-multi-screen.bat"
   ```
   *(or `"C:\path\to\chrome-auto\start.bat" --profile=Screen1 --autostart --no-open` for a single screen)*
4. Click **Next**, name it `Chrome Tab Rotator`, and click **Finish**.

Now, whenever you log in to Windows, Chrome/Edge will automatically open with your configured URLs across your monitors and rotate seamlessly in the background!

---

## ⌨️ Command Line Options

You can launch Tab Rotator with various CLI arguments:

```bash
# Start server and automatically begin rotating immediately
node server.js --autostart

# Start with a specific named profile
node server.js --profile=Screen2 --port=3001 --autostart

# Run on a custom port
node server.js --port=4000

# Run without opening the Control Panel in default browser
node server.js --no-open
```

---

## 📁 Project Structure

```
chrome-auto/
├── server.js                 # Backend server (REST API, SSE & dynamic port allocation)
├── cdp-controller.js         # CDP browser automation & multi-monitor positioning
├── browser-finder.js         # Windows/macOS/Linux browser path auto-discovery
├── config-manager.js         # Config persistence & named profiles
├── public/                   # Modern Web Control Panel UI
│   ├── index.html            # Dashboard HTML
│   ├── styles.css            # Glassmorphism dark-theme CSS
│   └── app.js                # Real-time state synchronization & UI logic
├── start.bat                 # Windows double-click launcher (auto-increments ports)
├── start-multi-screen.bat    # One-click dual-screen launcher
├── start-kiosk.bat           # Windows kiosk shortcut
├── start.ps1                 # PowerShell launcher
├── start.sh                  # macOS/Linux launcher script
├── config.json               # Default configuration
├── profiles/                 # Saved profile configurations (Screen1.json, Screen2.json)
├── test/
│   └── test-all.js           # Automated test suite
└── package.json              # Project manifest
```

---

## ❓ FAQ & Troubleshooting

#### Q: Can I run multiple windows on different screens at the same time?
**Yes!** Simply double-click `start.bat` again (or run `start-multi-screen.bat`). Each instance automatically uses its own port (`3000`, `3001`, etc.) and DevTools port (`9222`, `9223`, etc.) with its own independent browser profile so they will never interfere with each other.

#### Q: Do I need administrative permissions on Windows?
**No.** All components run within standard Windows user privileges (`%LOCALAPPDATA%` and `%TEMP%`).

#### Q: Why is no ChromeDriver needed?
The application communicates directly with Google Chrome and Microsoft Edge using the native **Chromium DevTools Protocol (CDP)** built into the browser engine. This means browser updates will never break the automation.
