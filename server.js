/**
 * Chrome & Edge Auto Tab Rotator - Local Backend Server
 * Built with pure Node.js (zero external npm dependencies required).
 * Provides REST API, Server-Sent Events (SSE) for real-time UI synchronization,
 * and static file serving.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { exec } = require('child_process');

const configManager = require('./config-manager');
const cdpController = require('./cdp-controller');
const browserFinder = require('./browser-finder');

const PORT = parseInt(process.env.PORT || '3000', 10);
const PUBLIC_DIR = path.join(__dirname, 'public');

// MIME types for static asset serving
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

// Connected SSE clients for live updates
const sseClients = new Set();

function broadcastSSE(eventType, data) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

// Hook CDP controller events to SSE broadcaster
cdpController.on('state-change', (state) => broadcastSSE('state-change', state));
cdpController.on('tick', (tick) => broadcastSSE('tick', tick));
cdpController.on('tab-switched', (info) => broadcastSSE('tab-switched', info));
cdpController.on('browser-closed', (info) => broadcastSSE('browser-closed', info));

/**
 * Helper: Parse JSON request body
 */
async function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', (err) => reject(err));
  });
}

/**
 * Helper: Send JSON response
 */
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache'
  });
  res.end(JSON.stringify(data));
}

/**
 * Helper: Send Error response
 */
function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message, success: false });
}

/**
 * Helper: Serve static files
 */
function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? path.join(PUBLIC_DIR, 'index.html') : path.join(PUBLIC_DIR, pathname);

  // Security: prevent directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500);
      res.end('Error loading asset');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
}

/**
 * Main HTTP Server Request Handler
 */
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  try {
    // -------------------------------------------------------------
    // SSE Realtime Stream
    // -------------------------------------------------------------
    if (pathname === '/api/events' && method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      res.write(`event: state-change\ndata: ${JSON.stringify(cdpController.getStatus())}\n\n`);
      sseClients.add(res);

      req.on('close', () => {
        sseClients.delete(res);
      });
      return;
    }

    // -------------------------------------------------------------
    // API Endpoints
    // -------------------------------------------------------------

    // GET /api/status - Current rotation state
    if (pathname === '/api/status' && method === 'GET') {
      return sendJson(res, 200, cdpController.getStatus());
    }

    // GET /api/config - Get current saved configuration
    if (pathname === '/api/config' && method === 'GET') {
      const cfg = configManager.loadConfig();
      return sendJson(res, 200, cfg);
    }

    // POST /api/config - Save configuration
    if (pathname === '/api/config' && method === 'POST') {
      const body = await parseJsonBody(req);
      const saved = configManager.saveConfig(body);
      return sendJson(res, 200, { success: true, config: saved });
    }

    // GET /api/browsers - Detect available browsers
    if (pathname === '/api/browsers' && method === 'GET') {
      const browsers = browserFinder.detectBrowsers();
      return sendJson(res, 200, { browsers });
    }

    // GET /api/profiles - List profiles
    if (pathname === '/api/profiles' && method === 'GET') {
      const list = configManager.listProfiles();
      return sendJson(res, 200, { profiles: list });
    }

    // POST /api/profiles/save - Save profile
    if (pathname === '/api/profiles/save' && method === 'POST') {
      const body = await parseJsonBody(req);
      if (!body.name) return sendError(res, 400, 'Profile name is required');
      const result = configManager.saveProfile(body.name, body.config);
      return sendJson(res, 200, result);
    }

    // POST /api/profiles/load - Load profile
    if (pathname === '/api/profiles/load' && method === 'POST') {
      const body = await parseJsonBody(req);
      if (!body.name) return sendError(res, 400, 'Profile name is required');
      const loaded = configManager.loadProfile(body.name);
      return sendJson(res, 200, { success: true, config: loaded });
    }

    // DELETE /api/profiles/:name - Delete profile
    if (pathname.startsWith('/api/profiles/') && method === 'DELETE') {
      const profileName = decodeURIComponent(pathname.replace('/api/profiles/', ''));
      const result = configManager.deleteProfile(profileName);
      return sendJson(res, 200, result);
    }

    // -------------------------------------------------------------
    // Controls: Start, Pause, Resume, Next, Prev, Stop, Activate
    // -------------------------------------------------------------

    // POST /api/control/start - Launch & start rotation
    if (pathname === '/api/control/start' && method === 'POST') {
      const body = await parseJsonBody(req);
      const config = body.config ? configManager.saveConfig(body.config) : configManager.loadConfig();

      try {
        await cdpController.start(config);
        return sendJson(res, 200, { success: true, status: cdpController.getStatus() });
      } catch (err) {
        return sendError(res, 500, err.message || 'Failed to start browser rotation');
      }
    }

    // POST /api/control/pause
    if (pathname === '/api/control/pause' && method === 'POST') {
      cdpController.pause();
      return sendJson(res, 200, { success: true, status: cdpController.getStatus() });
    }

    // POST /api/control/resume
    if (pathname === '/api/control/resume' && method === 'POST') {
      cdpController.resume();
      return sendJson(res, 200, { success: true, status: cdpController.getStatus() });
    }

    // POST /api/control/next
    if (pathname === '/api/control/next' && method === 'POST') {
      await cdpController.next();
      return sendJson(res, 200, { success: true, status: cdpController.getStatus() });
    }

    // POST /api/control/prev
    if (pathname === '/api/control/prev' && method === 'POST') {
      await cdpController.prev();
      return sendJson(res, 200, { success: true, status: cdpController.getStatus() });
    }

    // POST /api/control/stop
    if (pathname === '/api/control/stop' && method === 'POST') {
      cdpController.stop();
      return sendJson(res, 200, { success: true, status: cdpController.getStatus() });
    }

    // POST /api/control/activate
    if (pathname === '/api/control/activate' && method === 'POST') {
      const body = await parseJsonBody(req);
      const index = parseInt(body.index, 10);
      if (isNaN(index)) return sendError(res, 400, 'Invalid tab index');
      await cdpController.activateTab(index);
      return sendJson(res, 200, { success: true, status: cdpController.getStatus() });
    }

    // -------------------------------------------------------------
    // Static Files (Frontend UI)
    // -------------------------------------------------------------
    serveStatic(req, res, pathname);

  } catch (err) {
    console.error('Unhandled server error:', err);
    sendError(res, 500, err.message || 'Internal server error');
  }
});

/**
 * Opens a URL in the default user browser (cross-platform)
 */
function openInBrowser(targetUrl) {
  const platform = process.platform;
  let cmd;
  if (platform === 'win32') {
    cmd = `start "" "${targetUrl}"`;
  } else if (platform === 'darwin') {
    cmd = `open "${targetUrl}"`;
  } else {
    cmd = `xdg-open "${targetUrl}"`;
  }
  exec(cmd, (err) => {
    if (err) console.warn('Could not auto-open browser:', err.message);
  });
}

/**
 * Parse CLI Arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    port: PORT,
    autostart: false,
    profile: null,
    noOpen: false
  };

  for (const arg of args) {
    if (arg.startsWith('--port=')) {
      options.port = parseInt(arg.split('=')[1], 10) || PORT;
    } else if (arg === '--autostart') {
      options.autostart = true;
    } else if (arg.startsWith('--profile=')) {
      options.profile = arg.split('=')[1];
    } else if (arg === '--no-open') {
      options.noOpen = true;
    }
  }

  return options;
}

// Start Server
const options = parseArgs();
server.listen(options.port, '127.0.0.1', async () => {
  const serverUrl = `http://localhost:${options.port}`;
  console.log('====================================================');
  console.log('🚀 Chrome & Edge Auto Tab Rotator is running!');
  console.log(`🌐 Control Panel: ${serverUrl}`);
  console.log('⚡ Ready to rotate tabs (No admin rights required)');
  console.log('====================================================');

  if (options.profile) {
    try {
      console.log(`Loading profile: ${options.profile}...`);
      configManager.loadProfile(options.profile);
    } catch (err) {
      console.error(`Failed to load profile ${options.profile}:`, err.message);
    }
  }

  if (options.autostart) {
    console.log('Autostart enabled. Launching browser rotation...');
    try {
      const cfg = configManager.loadConfig();
      await cdpController.start(cfg);
    } catch (err) {
      console.error('Autostart failed:', err.message);
    }
  } else if (!options.noOpen) {
    // Open control panel
    openInBrowser(serverUrl);
  }
});

// Graceful process exit
process.on('SIGINT', () => {
  console.log('\nShutting down Tab Rotator...');
  cdpController.stop();
  server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
  cdpController.stop();
  server.close(() => process.exit(0));
});
