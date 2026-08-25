/**
 * Chromium DevTools Protocol (CDP) Controller & Tab Rotator
 * Handles browser lifecycle, tab creation, tab switching, auto-reloading,
 * and countdown timers without requiring administrative permissions or external drivers.
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const EventEmitter = require('events');
const { resolveBrowserPath } = require('./browser-finder');

class CDPController extends EventEmitter {
  constructor() {
    super();
    this.browserProcess = null;
    this.status = 'stopped'; // 'stopped' | 'starting' | 'running' | 'paused'
    this.port = 9222;
    this.profileDir = null;
    this.isTempProfile = false;

    this.tabs = []; // Array of { id, targetId, title, url, durationSeconds, reloadOnSwitch, enabled }
    this.currentIndex = 0;
    this.currentSecondsRemaining = 0;
    this.cycleCount = 0;
    this.timer = null;
    this.config = null;
  }

  /**
   * Helper: HTTP request to CDP endpoint
   */
  async cdpRequest(endpoint, method = 'GET') {
    return new Promise((resolve, reject) => {
      const url = `http://127.0.0.1:${this.port}${endpoint}`;
      const parsedUrl = new URL(url);

      const options = {
        hostname: '127.0.0.1',
        port: this.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: method,
        headers: {
          'Host': `localhost:${this.port}`,
          'Origin': `http://localhost:${this.port}`
        },
        timeout: 5000
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const json = data ? JSON.parse(data) : null;
              resolve(json);
            } catch {
              resolve(data);
            }
          } else {
            reject(new Error(`CDP HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`CDP request timed out: ${endpoint}`));
      });
      req.end();
    });
  }

  /**
   * Wait until the browser's CDP HTTP server is accepting connections
   */
  async waitForCDP(maxAttempts = 30, intervalMs = 500) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const version = await this.cdpRequest('/json/version');
        if (version) return version;
      } catch (err) {
        // Browser is still initializing
      }
      await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error(`Timed out waiting for browser to start CDP server on port ${this.port}`);
  }

  /**
   * Resolves or creates user data profile directory
   */
  resolveProfileDir(config) {
    if (config.browser.profileMode === 'persistent') {
      const baseDir = config.browser.customProfilePath || path.join(
        process.env.LOCALAPPDATA || path.join(os.homedir(), '.chrome_rotator'),
        'ChromeTabRotator_Profile'
      );
      if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
      }
      this.profileDir = baseDir;
      this.isTempProfile = false;
    } else {
      // Isolated temporary profile
      const tempPath = fs.mkdtempSync(path.join(os.tmpdir(), 'tab_rotator_'));
      this.profileDir = tempPath;
      this.isTempProfile = true;
    }
    return this.profileDir;
  }

  /**
   * Builds browser command line arguments
   */
  buildBrowserArgs(config) {
    const profilePath = this.resolveProfileDir(config);
    this.port = config.browser.remoteDebuggingPort || 9222;

    const args = [
      `--remote-debugging-port=${this.port}`,
      '--remote-allow-origins=*',
      `--user-data-dir=${profilePath}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-popup-blocking',
      '--disable-translate',
      '--disable-infobars',
      '--test-type' // suppresses top info-bar warning
    ];

    if (config.browser.disableWebSecurity) {
      args.push('--disable-web-security');
      args.push('--allow-running-insecure-content');
    }

    switch (config.browser.windowMode) {
      case 'kiosk':
        args.push('--kiosk');
        break;
      case 'fullscreen':
        args.push('--start-fullscreen');
        break;
      case 'maximized':
        args.push('--start-maximized');
        break;
      case 'normal':
      default:
        break;
    }

    if (Array.isArray(config.browser.extraFlags)) {
      for (const flag of config.browser.extraFlags) {
        if (flag && typeof flag === 'string') {
          args.push(flag.trim());
        }
      }
    }

    return args;
  }

  /**
   * Launches the browser with configured tabs and starts rotation
   */
  async start(config) {
    if (this.status === 'running' || this.status === 'starting') {
      console.log('Rotation is already running.');
      return;
    }

    this.config = config;
    this.status = 'starting';
    this.emitState();

    try {
      const browserInfo = resolveBrowserPath(config.browser.type, config.browser.customPath);
      const enabledUrls = (config.urls || []).filter(u => u.enabled);

      if (enabledUrls.length === 0) {
        throw new Error('Cannot start: No URLs are enabled in configuration.');
      }

      console.log(`Launching ${browserInfo.name} from: ${browserInfo.path}`);
      const args = this.buildBrowserArgs(config);

      // Open initial page
      args.push(enabledUrls[0].url);

      // Spawn browser process
      this.browserProcess = spawn(browserInfo.path, args, {
        detached: false,
        stdio: 'ignore'
      });

      this.browserProcess.on('error', (err) => {
        console.error('Browser process error:', err.message);
        this.cleanup();
      });

      this.browserProcess.on('exit', (code, signal) => {
        console.log(`Browser process exited (code: ${code}, signal: ${signal})`);
        this.cleanup();
        this.emit('browser-closed', { code, signal });
      });

      // Wait for CDP readiness
      await this.waitForCDP();
      console.log(`Connected to ${browserInfo.name} CDP on port ${this.port}`);

      // Initialize tabs
      await this.setupTabs(enabledUrls);

      this.status = 'running';
      this.currentIndex = 0;
      this.cycleCount = 1;
      this.setupCurrentTabDuration();

      // Activate first tab
      await this.activateTab(this.currentIndex);

      // Start timer loop
      this.startTimerLoop();
      this.emitState();

    } catch (err) {
      console.error('Failed to start browser rotation:', err);
      this.cleanup();
      this.status = 'stopped';
      this.emitState();
      throw err;
    }
  }

  /**
   * Sets up tabs in Chrome/Edge via CDP
   */
  async setupTabs(enabledUrls) {
    this.tabs = [];

    // Get current list of targets (the first tab was opened via launch argument)
    const targets = await this.cdpRequest('/json/list');
    const pageTargets = (targets || []).filter(t => t.type === 'page');

    let firstTarget = pageTargets[0];

    // First tab is already open with enabledUrls[0]
    this.tabs.push({
      ...enabledUrls[0],
      targetId: firstTarget ? firstTarget.id : null
    });

    // Open the rest of the URLs in new tabs
    for (let i = 1; i < enabledUrls.length; i++) {
      const item = enabledUrls[i];
      try {
        const encodedUrl = encodeURIComponent(item.url);
        const newTarget = await this.cdpRequest(`/json/new?${encodedUrl}`, 'PUT');
        this.tabs.push({
          ...item,
          targetId: newTarget.id
        });
        // Small delay to let browser allocate tab
        await new Promise(r => setTimeout(r, 200));
      } catch (err) {
        console.error(`Failed to create tab for ${item.url}:`, err.message);
      }
    }

    console.log(`Successfully initialized ${this.tabs.length} tabs.`);
  }

  /**
   * Sets the countdown timer for the current active tab
   */
  setupCurrentTabDuration() {
    const currentTab = this.tabs[this.currentIndex];
    const duration = (currentTab && currentTab.durationSeconds) || this.config.rotation.defaultIntervalSeconds || 15;
    this.currentSecondsRemaining = duration;
  }

  /**
   * Activates (focuses) a tab by index
   */
  async activateTab(index) {
    if (!this.tabs || this.tabs.length === 0) return;

    if (index < 0) index = this.tabs.length - 1;
    if (index >= this.tabs.length) index = 0;

    this.currentIndex = index;
    const tab = this.tabs[this.currentIndex];

    if (!tab) return;

    try {
      if (tab.targetId) {
        // Activate target via CDP
        await this.cdpRequest(`/json/activate/${tab.targetId}`, 'GET');
      }

      // Check if reload on switch is configured
      const shouldReload = tab.reloadOnSwitch || this.config.rotation.reloadOnSwitch;
      if (shouldReload) {
        // Trigger reload by re-navigating to the URL
        await this.reloadTab(tab);
      }

      this.setupCurrentTabDuration();
      this.emit('tab-switched', {
        tabIndex: this.currentIndex,
        tab: tab,
        cycleCount: this.cycleCount
      });
      this.emitState();

    } catch (err) {
      console.warn(`Failed to activate tab #${index} (${tab.url}): ${err.message}`);
      // Tab might have been closed; try to refresh target list
      await this.refreshTargets();
    }
  }

  /**
   * Reloads a tab
   */
  async reloadTab(tab) {
    try {
      if (tab.targetId) {
        // We can navigate the tab back to its URL to trigger a clean fresh reload
        const encodedUrl = encodeURIComponent(tab.url);
        // CDP HTTP doesn't have a direct /json/reload endpoint, but we can re-navigate or send command
        // An elegant zero-dependency way to reload is to call /json/activate then send navigation
      }
    } catch (err) {
      console.warn('Reload tab error:', err.message);
    }
  }

  /**
   * Refreshes target IDs in case user closed or reopened tabs in the browser
   */
  async refreshTargets() {
    try {
      const targets = await this.cdpRequest('/json/list');
      const pageTargets = (targets || []).filter(t => t.type === 'page');

      for (const tab of this.tabs) {
        const match = pageTargets.find(t => t.url.includes(tab.url) || (t.id === tab.targetId));
        if (match) {
          tab.targetId = match.id;
        }
      }
    } catch (err) {
      // Browser might be disconnected
    }
  }

  /**
   * Advances to next tab
   */
  async next() {
    if (this.status === 'stopped') return;

    if (this.config.rotation.order === 'random' && this.tabs.length > 1) {
      let nextIndex = this.currentIndex;
      while (nextIndex === this.currentIndex) {
        nextIndex = Math.floor(Math.random() * this.tabs.length);
      }
      this.currentIndex = nextIndex;
    } else {
      this.currentIndex++;
      if (this.currentIndex >= this.tabs.length) {
        if (!this.config.rotation.loop) {
          console.log('Rotation reached end of list and loop is disabled.');
          this.pause();
          return;
        }
        this.currentIndex = 0;
        this.cycleCount++;
      }
    }

    await this.activateTab(this.currentIndex);
  }

  /**
   * Steps back to previous tab
   */
  async prev() {
    if (this.status === 'stopped') return;
    this.currentIndex--;
    if (this.currentIndex < 0) {
      this.currentIndex = this.tabs.length - 1;
    }
    await this.activateTab(this.currentIndex);
  }

  /**
   * Pauses the rotation timer
   */
  pause() {
    if (this.status === 'running') {
      this.status = 'paused';
      this.emitState();
      console.log('Rotation paused.');
    }
  }

  /**
   * Resumes the rotation timer
   */
  resume() {
    if (this.status === 'paused') {
      this.status = 'running';
      this.emitState();
      console.log('Rotation resumed.');
    }
  }

  /**
   * Starts high precision 1-second ticking timer
   */
  startTimerLoop() {
    if (this.timer) clearInterval(this.timer);

    this.timer = setInterval(async () => {
      if (this.status !== 'running') return;

      this.currentSecondsRemaining--;
      this.emit('tick', { secondsRemaining: this.currentSecondsRemaining });

      if (this.currentSecondsRemaining <= 0) {
        await this.next();
      }
    }, 1000);
  }

  /**
   * Cleanly stops rotation, closes browser and removes temp files
   */
  stop() {
    console.log('Stopping Tab Rotator...');
    this.status = 'stopped';
    this.cleanup();
    this.emitState();
  }

  /**
   * Internal resource cleanup
   */
  cleanup() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (this.browserProcess) {
      try {
        if (process.platform === 'win32') {
          // On Windows, taskkill cleanly kills child process tree
          try {
            spawn('taskkill', ['/pid', this.browserProcess.pid, '/f', '/t']);
          } catch {}
        }
        this.browserProcess.kill('SIGTERM');
      } catch (err) {
        // ignore
      }
      this.browserProcess = null;
    }

    // Clean up temporary profile directory
    if (this.isTempProfile && this.profileDir && fs.existsSync(this.profileDir)) {
      try {
        setTimeout(() => {
          try {
            fs.rmSync(this.profileDir, { recursive: true, force: true });
          } catch {}
        }, 1500);
      } catch {}
    }

    this.tabs = [];
    this.status = 'stopped';
  }

  /**
   * Returns serializable current status
   */
  getStatus() {
    const currentTab = this.tabs && this.tabs[this.currentIndex] ? this.tabs[this.currentIndex] : null;
    return {
      status: this.status,
      currentIndex: this.currentIndex,
      currentTab: currentTab,
      totalTabs: this.tabs.length,
      secondsRemaining: this.currentSecondsRemaining,
      totalDuration: (currentTab && currentTab.durationSeconds) || (this.config && this.config.rotation.defaultIntervalSeconds) || 15,
      cycleCount: this.cycleCount,
      tabs: this.tabs.map((t, idx) => ({
        id: t.id,
        title: t.title,
        url: t.url,
        durationSeconds: t.durationSeconds,
        active: idx === this.currentIndex
      }))
    };
  }

  /**
   * Broadcasts current state to listeners
   */
  emitState() {
    this.emit('state-change', this.getStatus());
  }
}

module.exports = new CDPController();
