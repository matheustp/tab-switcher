/**
 * Configuration & Profile Manager
 * Handles loading, saving, validation, and profile management for Tab Rotator.
 * Runs in standard user space without requiring administrative privileges.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_FILE = path.join(__dirname, 'config.json');
const PROFILES_DIR = path.join(__dirname, 'profiles');

const DEFAULT_CONFIG = {
  version: '1.0.0',
  browser: {
    type: 'auto', // 'auto' | 'chrome' | 'edge' | 'brave' | 'chromium' | 'custom'
    customPath: '',
    windowMode: 'maximized', // 'normal' | 'maximized' | 'fullscreen' | 'kiosk'
    profileMode: 'isolated', // 'isolated' (temporary clean profile) | 'persistent' (saves cookies/logins in local folder)
    customProfilePath: '',
    remoteDebuggingPort: 9222,
    disableWebSecurity: false,
    extraFlags: []
  },
  rotation: {
    defaultIntervalSeconds: 15,
    order: 'sequential', // 'sequential' | 'random'
    loop: true,
    reloadOnSwitch: false,
    reloadIntervalSeconds: 0, // 0 = disabled, or reload tab after N seconds
    pauseOnHover: false
  },
  urls: [
    {
      id: 'url_1',
      title: 'Grafana System Status',
      url: 'https://play.grafana.org',
      enabled: true,
      durationSeconds: null, // null = use defaultIntervalSeconds
      reloadOnSwitch: true
    },
    {
      id: 'url_2',
      title: 'Wikipedia Featured',
      url: 'https://en.wikipedia.org/wiki/Main_Page',
      enabled: true,
      durationSeconds: 10,
      reloadOnSwitch: false
    },
    {
      id: 'url_3',
      title: 'Hacker News Frontpage',
      url: 'https://news.ycombinator.com',
      enabled: true,
      durationSeconds: 20,
      reloadOnSwitch: true
    }
  ]
};

function ensureProfilesDir() {
  if (!fs.existsSync(PROFILES_DIR)) {
    try {
      fs.mkdirSync(PROFILES_DIR, { recursive: true });
    } catch (err) {
      console.error('Warning: could not create profiles directory:', err.message);
    }
  }
}

/**
 * Validates and sanitizes a configuration object
 */
function sanitizeConfig(config) {
  if (!config || typeof config !== 'object') {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }

  const result = {
    version: config.version || DEFAULT_CONFIG.version,
    browser: {
      type: config.browser?.type || 'auto',
      customPath: typeof config.browser?.customPath === 'string' ? config.browser.customPath.trim() : '',
      windowMode: ['normal', 'maximized', 'fullscreen', 'kiosk'].includes(config.browser?.windowMode)
        ? config.browser.windowMode
        : 'maximized',
      profileMode: ['isolated', 'persistent'].includes(config.browser?.profileMode)
        ? config.browser.profileMode
        : 'isolated',
      customProfilePath: typeof config.browser?.customProfilePath === 'string' ? config.browser.customProfilePath : '',
      remoteDebuggingPort: (Number(config.browser?.remoteDebuggingPort) >= 1024 && Number(config.browser?.remoteDebuggingPort) <= 65535)
        ? Number(config.browser?.remoteDebuggingPort)
        : 9222,
      disableWebSecurity: Boolean(config.browser?.disableWebSecurity),
      extraFlags: Array.isArray(config.browser?.extraFlags) ? config.browser.extraFlags : []
    },
    rotation: {
      defaultIntervalSeconds: (Number(config.rotation?.defaultIntervalSeconds) > 0)
        ? Number(config.rotation?.defaultIntervalSeconds)
        : 15,
      order: config.rotation?.order === 'random' ? 'random' : 'sequential',
      loop: config.rotation?.loop !== false,
      reloadOnSwitch: Boolean(config.rotation?.reloadOnSwitch),
      reloadIntervalSeconds: Math.max(0, Number(config.rotation?.reloadIntervalSeconds) || 0),
      pauseOnHover: Boolean(config.rotation?.pauseOnHover)
    },
    urls: []
  };

  if (Array.isArray(config.urls)) {
    result.urls = config.urls
      .filter(item => item && typeof item.url === 'string' && item.url.trim().length > 0)
      .map((item, idx) => {
        let rawUrl = item.url.trim();
        // Add protocol if missing
        if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://') && !rawUrl.startsWith('file://')) {
          rawUrl = 'https://' + rawUrl;
        }

        return {
          id: item.id || `url_${Date.now()}_${idx}`,
          title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : rawUrl,
          url: rawUrl,
          enabled: item.enabled !== false,
          durationSeconds: item.durationSeconds ? Math.max(1, Number(item.durationSeconds)) : null,
          reloadOnSwitch: Boolean(item.reloadOnSwitch)
        };
      });
  }

  // Ensure at least one default URL if empty
  if (result.urls.length === 0) {
    result.urls = JSON.parse(JSON.stringify(DEFAULT_CONFIG.urls));
  }

  return result;
}

/**
 * Loads the active config from disk or returns defaults
 */
function loadConfig() {
  ensureProfilesDir();
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      const parsed = JSON.parse(data);
      return sanitizeConfig(parsed);
    } catch (err) {
      console.error('Error reading config.json, using defaults:', err.message);
    }
  }

  // Save default config
  const initial = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  saveConfig(initial);
  return initial;
}

/**
 * Saves config to disk
 */
function saveConfig(config) {
  const sanitized = sanitizeConfig(config);
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(sanitized, null, 2), 'utf8');
    return sanitized;
  } catch (err) {
    console.error('Failed to save config:', err.message);
    throw err;
  }
}

/**
 * Lists all available saved profiles
 */
function listProfiles() {
  ensureProfilesDir();
  try {
    const files = fs.readdirSync(PROFILES_DIR);
    return files
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const name = path.basename(f, '.json');
        const fullPath = path.join(PROFILES_DIR, f);
        try {
          const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
          return {
            name,
            urlsCount: Array.isArray(content.urls) ? content.urls.length : 0,
            interval: content.rotation?.defaultIntervalSeconds || 15
          };
        } catch {
          return { name, urlsCount: 0, interval: 15 };
        }
      });
  } catch (err) {
    return [];
  }
}

/**
 * Saves a named profile
 */
function saveProfile(name, config) {
  ensureProfilesDir();
  const safeName = name.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim();
  if (!safeName) {
    throw new Error('Invalid profile name. Use alphanumeric characters and spaces only.');
  }

  const sanitized = sanitizeConfig(config);
  const targetPath = path.join(PROFILES_DIR, `${safeName}.json`);
  fs.writeFileSync(targetPath, JSON.stringify(sanitized, null, 2), 'utf8');
  return { name: safeName, success: true };
}

/**
 * Loads a named profile
 */
function loadProfile(name) {
  ensureProfilesDir();
  const safeName = name.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim();
  const targetPath = path.join(PROFILES_DIR, `${safeName}.json`);

  if (!fs.existsSync(targetPath)) {
    throw new Error(`Profile "${name}" not found.`);
  }

  const data = fs.readFileSync(targetPath, 'utf8');
  const parsed = JSON.parse(data);
  const sanitized = sanitizeConfig(parsed);
  saveConfig(sanitized); // set as active config
  return sanitized;
}

/**
 * Deletes a named profile
 */
function deleteProfile(name) {
  ensureProfilesDir();
  const safeName = name.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim();
  const targetPath = path.join(PROFILES_DIR, `${safeName}.json`);

  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
    return { success: true };
  }
  return { success: false, message: 'Profile file did not exist' };
}

module.exports = {
  loadConfig,
  saveConfig,
  listProfiles,
  saveProfile,
  loadProfile,
  deleteProfile,
  sanitizeConfig,
  DEFAULT_CONFIG
};
