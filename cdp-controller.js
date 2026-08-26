/**
 * Chromium DevTools Protocol (CDP) Controller & Tab Rotator
 * Handles browser lifecycle, tab creation, tab switching, auto-reloading,
 * and countdown timers without requiring administrative permissions or external drivers.
 */

const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const EventEmitter = require('events');
const { resolveBrowserPath } = require('./browser-finder');

/**
 * Finds an available TCP port starting from the given port number
 */
function getAvailablePort(startingPort) {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(getAvailablePort(startingPort + 1));
      } else {
        reject(err);
      }
    });
    srv.listen(startingPort, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/**
 * Sends a CDP command over WebSocket to a specific tab target
 */
async function sendCDPCommand(wsUrl, method, params = {}) {
  if (!wsUrl) throw new Error('Missing webSocketDebuggerUrl');

  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000) + 1;
    const msg = JSON.stringify({ id, method, params });

    // Node 21+ built-in WebSocket
    if (typeof globalThis.WebSocket !== 'undefined') {
      let ws;
      try {
        ws = new globalThis.WebSocket(wsUrl);
      } catch (err) {
        return reject(err);
      }

      const timer = setTimeout(() => {
        try { ws.close(); } catch {}
        reject(new Error(`CDP WebSocket command timed out: ${method}`));
      }, 3500);

      ws.onopen = () => {
        try {
          ws.send(msg);
        } catch (err) {
          clearTimeout(timer);
          reject(err);
        }
      };

      ws.onmessage = (event) => {
        clearTimeout(timer);
        try {
          const res = JSON.parse(event.data);
          try { ws.close(); } catch {}
          resolve(res);
        } catch {
          try { ws.close(); } catch {}
          resolve(event.data);
        }
      };

      ws.onerror = (err) => {
        clearTimeout(timer);
        reject(err);
      };
      return;
    }

    // Node 16/18/20 fallback using standard http upgrade
    const parsed = new URL(wsUrl);
    const key = crypto.randomBytes(16).toString('base64');
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      headers: {
        'Connection': 'Upgrade',
        'Upgrade': 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': key,
        'Host': parsed.host,
        'Origin': 'http://' + parsed.host
      },
      timeout: 3500
    });

    req.on('upgrade', (res, socket) => {
      const payload = Buffer.from(msg);
      const mask = crypto.randomBytes(4);
      let header;
      if (payload.length < 126) {
        header = Buffer.alloc(6);
        header[0] = 0x81;
        header[1] = 0x80 | payload.length;
        mask.copy(header, 2);
      } else if (payload.length < 65536) {
        header = Buffer.alloc(8);
        header[0] = 0x81;
        header[1] = 0x80 | 126;
        header.writeUInt16BE(payload.length, 2);
        mask.copy(header, 4);
      } else {
        header = Buffer.alloc(14);
        header[0] = 0x81;
        header[1] = 0x80 | 127;
        header.writeBigUInt64BE(BigInt(payload.length), 2);
        mask.copy(header, 10);
      }

      const maskedPayload = Buffer.alloc(payload.length);
      for (let i = 0; i < payload.length; i++) {
        maskedPayload[i] = payload[i] ^ mask[i % 4];
      }

      socket.write(Buffer.concat([header, maskedPayload]));

      const timeoutTimer = setTimeout(() => {
        socket.destroy();
        resolve({ success: true, timedOut: true });
      }, 2000);

      socket.on('data', () => {
        clearTimeout(timeoutTimer);
        socket.destroy();
        resolve({ success: true });
      });

      socket.on('error', (err) => {
        clearTimeout(timeoutTimer);
        reject(err);
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`HTTP Upgrade timed out for ${method}`));
    });
    req.end();
  });
}

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
   * Resolves or creates user data profile directory (isolated per profile name)
   */
  resolveProfileDir(config, profileName = 'default') {
    const safeProfile = (profileName || 'default').replace(/[^a-zA-Z0-9_\-]/g, '_');

    if (config.browser.profileMode === 'persistent') {
      const baseDir = config.browser.customProfilePath || path.join(
        process.env.LOCALAPPDATA || path.join(os.homedir(), '.chrome_rotator'),
        'ChromeTabRotator_Profiles',
        `Profile_${safeProfile}`
      );
      if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
      }
      this.profileDir = baseDir;
      this.isTempProfile = false;
    } else {
      // Isolated temporary profile uniquely named
      const tempPath = fs.mkdtempSync(path.join(os.tmpdir(), `tab_rotator_${safeProfile}_`));
      this.profileDir = tempPath;
      this.isTempProfile = true;
    }
    return this.profileDir;
  }

  /**
   * Builds browser command line arguments (with auto-assigned debug port & monitor positioning)
   */
  async buildBrowserArgs(config, profileName = 'default') {
    const profilePath = this.resolveProfileDir(config, profileName);
    const basePort = config.browser.remoteDebuggingPort || 9222;
    this.port = await getAvailablePort(basePort);

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

    // Monitor / Window positioning
    if (config.browser.windowPosition && config.browser.windowPosition !== 'auto') {
      args.push(`--window-position=${config.browser.windowPosition}`);
    }

    // Window size
    if (config.browser.windowSize && config.browser.windowSize !== 'auto') {
      args.push(`--window-size=${config.browser.windowSize}`);
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
  async start(config, profileName = 'default') {
    if (this.status === 'running' || this.status === 'starting') {
      console.log('Rotation is already running.');
      return;
    }

    this.config = config;
    this.activeProfileName = profileName || 'default';
    this.status = 'starting';
    this.emitState();

    try {
      const browserInfo = resolveBrowserPath(config.browser.type, config.browser.customPath);
      const enabledUrls = (config.urls || []).filter(u => u.enabled);

      if (enabledUrls.length === 0) {
        throw new Error('Cannot start: No URLs are enabled in configuration.');
      }

      console.log(`[Launch] Starting ${browserInfo.name} for profile "${this.activeProfileName}"`);
      const args = await this.buildBrowserArgs(config, this.activeProfileName);

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
      targetId: firstTarget ? firstTarget.id : null,
      webSocketDebuggerUrl: firstTarget ? firstTarget.webSocketDebuggerUrl : null
    });

    // Open the rest of the URLs in new tabs
    for (let i = 1; i < enabledUrls.length; i++) {
      const item = enabledUrls[i];
      try {
        const encodedUrl = encodeURIComponent(item.url);
        const newTarget = await this.cdpRequest(`/json/new?${encodedUrl}`, 'PUT');
        this.tabs.push({
          ...item,
          targetId: newTarget.id,
          webSocketDebuggerUrl: newTarget.webSocketDebuggerUrl
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
   * Updates configuration dynamically while running
   */
  updateConfig(newConfig) {
    this.config = newConfig;
    if (Array.isArray(newConfig.urls)) {
      for (const tab of this.tabs) {
        const updatedUrl = newConfig.urls.find(u => u.id === tab.id || u.url === tab.url);
        if (updatedUrl) {
          tab.reloadOnSwitch = Boolean(updatedUrl.reloadOnSwitch);
          tab.durationSeconds = updatedUrl.durationSeconds;
          tab.title = updatedUrl.title;
        }
      }
    }
    console.log(`[Config] Live config updated. Auto-Reload on switch is: ${this.config?.rotation?.reloadOnSwitch ? 'ON' : 'OFF'}`);
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

      // Check if reload on switch is configured (either per-tab or globally)
      const shouldReload = Boolean(tab.reloadOnSwitch) || Boolean(this.config?.rotation?.reloadOnSwitch);
      if (shouldReload) {
        // Trigger reload asynchronously with a slight delay so tab activation completes first
        setTimeout(() => {
          this.reloadTab(tab).catch(err => {
            console.warn('[Auto-Reload] Error executing tab reload:', err.message);
          });
        }, 200);
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
   * Reloads a tab via CDP
   */
  async reloadTab(tab) {
    if (!tab) return;

    try {
      if (!tab.webSocketDebuggerUrl) {
        await this.refreshTargets();
      }

      console.log(`[Auto-Reload] Refreshing tab #${this.currentIndex + 1}: "${tab.title || tab.url}"`);

      if (tab.webSocketDebuggerUrl) {
        try {
          await sendCDPCommand(tab.webSocketDebuggerUrl, 'Page.reload', { ignoreCache: false });
          console.log(`[Auto-Reload] Successfully refreshed: "${tab.title || tab.url}"`);
          return;
        } catch (wsErr) {
          console.warn(`[Auto-Reload] Page.reload failed, trying fallback: ${wsErr.message}`);
          await sendCDPCommand(tab.webSocketDebuggerUrl, 'Runtime.evaluate', {
            expression: 'window.location.reload(true)'
          });
          console.log(`[Auto-Reload] Fallback reload executed.`);
          return;
        }
      }

      // Fallback: If no WebSocket debugger URL, activate tab
      if (tab.targetId) {
        await this.cdpRequest(`/json/activate/${tab.targetId}`, 'GET');
      }
    } catch (err) {
      console.warn(`[Auto-Reload] Failed to reload tab (${tab.url}):`, err.message);
      await this.refreshTargets();
    }
  }

  /**
   * Refreshes target IDs and WebSocket URLs in case user closed or reopened tabs in browser
   */
  async refreshTargets() {
    try {
      const targets = await this.cdpRequest('/json/list');
      const pageTargets = (targets || []).filter(t => t.type === 'page');

      for (let i = 0; i < this.tabs.length; i++) {
        const tab = this.tabs[i];
        const match = pageTargets.find(t => t.id === tab.targetId) ||
                      pageTargets.find(t => t.url && tab.url && t.url.startsWith(tab.url)) ||
                      pageTargets[i];
        if (match) {
          tab.targetId = match.id;
          tab.webSocketDebuggerUrl = match.webSocketDebuggerUrl;
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
      activeProfileName: this.activeProfileName || 'default',
      cdpPort: this.port,
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
