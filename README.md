# 🔄 Chrome & Edge Auto Tab Rotator

An automated tab carousel and rotating dashboard manager for **Google Chrome** and **Microsoft Edge** on Windows. 

It launches the browser with your configured URLs/tabs and automatically cycles through them based on a timer.

Designed for **Windows 10 / 11**, runs completely in **standard user space**, and **does NOT require administrative privileges or external browser drivers**.

---

## 🌟 Key Features

- 🚀 **Zero Admin Permissions**: Runs entirely in standard user space without UAC prompts or installation.
- ⚡ **Zero External Driver Setup**: Communicates directly with Chrome/Edge via native **Chromium DevTools Protocol (CDP)**. No brittle `chromedriver.exe` or `msedgedriver.exe` downloads needed.
- 📦 **Zero External NPM Dependencies**: Built using standard Node.js built-in modules (`http`, `child_process`, `fs`, `path`). Just double-click `start.bat`!
- ⏱️ **Flexible Timers & Custom Durations**:
  - Global rotation interval (e.g., 5s, 15s, 30s, 1m, 5m, or custom).
  - Per-tab duration overrides (e.g. Tab 1 for 30s, Tab 2 for 10s).
- 🖥️ **Display Modes**:
  - **Maximized**: Standard browser window.
  - **Kiosk Mode**: Hides address bar, tabs, and window borders (perfect for TV monitors & NOC dashboards).
  - **Fullscreen**: Fullscreen mode (F11).
- 🌐 **Browser Support**: Auto-detects Google Chrome, Microsoft Edge, Brave, and Chromium on Windows.
- 🔄 **Auto-Reload**: Automatically refreshes pages when switching to keep metrics and dashboards live.
- 📁 **Named Profiles**: Save and switch between different tab configurations (e.g., `Sales_TV.json`, `NOC_Monitors.json`).
- 🤖 **Unattended / Autostart**: Can auto-launch browser rotation on Windows startup without opening the control panel.

---

## 🚀 Quick Start (Windows)

### Prerequisites
- Windows 10 or 11
- **Node.js** (v16 or newer) installed. Check with `node -v` in Command Prompt.
- Google Chrome or Microsoft Edge installed.

### Running the Application

1. Open the project folder.
2. Double-click **`start.bat`**.
3. Your default browser will open the **Tab Rotator Control Panel** at `http://localhost:3000`.
4. Configure your desired URLs and timer.
5. Click **Launch & Start**!

---

## 💻 Visual Control Panel Interface

The Control Panel provides a real-time dark-mode dashboard:

```
+-------------------------------------------------------------------------+
|  🔄 Tab Rotator (Windows / Chrome & Edge)          Profile: [Default ▾] |
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
|  [✓] #3 Hacker News        [20s] [▲][▼] | Window: [ Kiosk Mode ▾ ]      |
|                                         | Browser: [ Auto-Detect ▾ ]    |
|  [+ Add Tab]   [📋 Bulk Import]         | Profile: [ Isolated Clean ▾ ] |
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
- **Session / Profile Mode**:
  - `Isolated`: Starts a temporary clean session that won't interfere with your personal Chrome windows.
  - `Persistent`: Keeps logins, cookies, and session data across restarts.

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
   "C:\path\to\chrome-auto\start.bat" --autostart --no-open
   ```
4. Click **Next**, name it `Chrome Tab Rotator`, and click **Finish**.

Now, whenever you log in to Windows, Chrome/Edge will automatically open with your configured URLs and rotate seamlessly in the background!

---

## ⌨️ Command Line Options

You can launch Tab Rotator with various CLI arguments:

```bash
# Start server and automatically begin rotating immediately
node server.js --autostart

# Start with a specific named profile
node server.js --profile=NOC_Monitors --autostart

# Run on a custom port
node server.js --port=4000

# Run without opening the Control Panel in default browser
node server.js --no-open
```

---

## 📁 Project Structure

```
chrome-auto/
├── server.js               # Lightweight backend server (REST API & SSE stream)
├── cdp-controller.js       # Chromium DevTools Protocol rotation & timer engine
├── browser-finder.js       # Windows/macOS/Linux browser path auto-discovery
├── config-manager.js       # Config persistence & named profiles
├── public/                 # Modern Web Control Panel UI
│   ├── index.html          # Dashboard HTML
│   ├── styles.css          # Glassmorphism dark-theme CSS
│   └── app.js              # Real-time state synchronization & UI logic
├── start.bat               # Windows double-click launcher
├── start-kiosk.bat         # Windows kiosk shortcut
├── start.sh                # macOS/Linux launcher script
├── config.json             # Active configuration file
├── profiles/               # Saved profile configurations
├── test/
│   └── test-all.js         # Automated test suite
└── package.json            # Project manifest
```

---

## ❓ FAQ & Troubleshooting

#### Q: Do I need administrative permissions on Windows?
**No.** All components run within standard Windows user privileges (`%LOCALAPPDATA%` and `%TEMP%`).

#### Q: Why is no ChromeDriver needed?
The application communicates directly with Google Chrome and Microsoft Edge using the native **Chromium DevTools Protocol (CDP)** built into the browser engine. This means browser updates will never break the automation.

#### Q: Can I run this with Microsoft Edge instead of Chrome?
**Yes.** In the Browser dropdown, select **Microsoft Edge** (or leave it on Auto-Detect).

#### Q: How do I stop rotation?
Click the red **Stop** button in the Control Panel, or close the terminal/command prompt window running `start.bat`.
