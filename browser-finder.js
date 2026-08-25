/**
 * Browser Finder
 * Automatically locates Google Chrome, Microsoft Edge, Brave, and Chromium executables
 * across Windows, macOS, and Linux without requiring administrative privileges.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

function fileExists(p) {
  if (!p) return false;
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile();
  } catch (err) {
    return false;
  }
}

/**
 * Searches for a binary on Windows in standard installation folders
 */
function getWindowsCandidates() {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

  return {
    chrome: [
      path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ],
    edge: [
      path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ],
    brave: [
      path.join(programFiles, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
      path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
      path.join(programFilesX86, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
    ],
    chromium: [
      path.join(localAppData, 'Chromium', 'Application', 'chrome.exe'),
      path.join(programFiles, 'Chromium', 'Application', 'chrome.exe'),
      path.join(programFilesX86, 'Chromium', 'Application', 'chrome.exe'),
    ]
  };
}

/**
 * Searches for standard macOS applications
 */
function getMacCandidates() {
  return {
    chrome: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    ],
    edge: [
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      path.join(os.homedir(), 'Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge')
    ],
    brave: [
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      path.join(os.homedir(), 'Applications/Brave Browser.app/Contents/MacOS/Brave Browser')
    ],
    chromium: [
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      path.join(os.homedir(), 'Applications/Chromium.app/Contents/MacOS/Chromium')
    ]
  };
}

/**
 * Searches for Linux binaries in PATH
 */
function getLinuxCandidates() {
  const findInPath = (cmd) => {
    try {
      const out = execSync(`which ${cmd} 2>/dev/null`, { encoding: 'utf8' }).trim();
      return out && fs.existsSync(out) ? out : null;
    } catch {
      return null;
    }
  };

  const chromePath = findInPath('google-chrome') || findInPath('google-chrome-stable');
  const edgePath = findInPath('microsoft-edge') || findInPath('microsoft-edge-stable');
  const bravePath = findInPath('brave-browser') || findInPath('brave');
  const chromiumPath = findInPath('chromium') || findInPath('chromium-browser');

  return {
    chrome: chromePath ? [chromePath] : [],
    edge: edgePath ? [edgePath] : [],
    brave: bravePath ? [bravePath] : [],
    chromium: chromiumPath ? [chromiumPath] : []
  };
}

/**
 * Discovers all available browsers on the system
 * @returns {Array<{id: string, name: string, path: string, available: boolean}>}
 */
function detectBrowsers() {
  const platform = process.platform;
  let candidates;

  if (platform === 'win32') {
    candidates = getWindowsCandidates();
  } else if (platform === 'darwin') {
    candidates = getMacCandidates();
  } else {
    candidates = getLinuxCandidates();
  }

  const findFirstExisting = (paths) => {
    for (const p of paths) {
      if (fileExists(p)) return p;
    }
    return null;
  };

  const results = [
    {
      id: 'chrome',
      name: 'Google Chrome',
      path: findFirstExisting(candidates.chrome) || null,
      available: false
    },
    {
      id: 'edge',
      name: 'Microsoft Edge',
      path: findFirstExisting(candidates.edge) || null,
      available: false
    },
    {
      id: 'brave',
      name: 'Brave Browser',
      path: findFirstExisting(candidates.brave) || null,
      available: false
    },
    {
      id: 'chromium',
      name: 'Chromium',
      path: findFirstExisting(candidates.chromium) || null,
      available: false
    }
  ];

  for (const b of results) {
    b.available = Boolean(b.path);
  }

  return results;
}

/**
 * Resolves the path to the requested browser executable
 * @param {string} browserType 'auto' | 'chrome' | 'edge' | 'brave' | 'chromium' | 'custom'
 * @param {string} [customPath] User-provided custom path if browserType === 'custom'
 * @returns {{ path: string, name: string, id: string }}
 */
function resolveBrowserPath(browserType = 'auto', customPath = '') {
  if (browserType === 'custom' && customPath) {
    if (fileExists(customPath)) {
      return { path: customPath, name: 'Custom Browser', id: 'custom' };
    }
    throw new Error(`Custom browser path does not exist or is not a file: ${customPath}`);
  }

  const detected = detectBrowsers();

  if (browserType && browserType !== 'auto') {
    const found = detected.find(b => b.id === browserType && b.available);
    if (found) {
      return { path: found.path, name: found.name, id: found.id };
    }
  }

  // Auto mode: Chrome -> Edge -> Brave -> Chromium
  const preferred = ['chrome', 'edge', 'brave', 'chromium'];
  for (const id of preferred) {
    const found = detected.find(b => b.id === id && b.available);
    if (found) {
      return { path: found.path, name: found.name, id: found.id };
    }
  }

  throw new Error(
    'No supported browser (Google Chrome, Microsoft Edge, Brave, or Chromium) was found in standard installation paths. ' +
    'Please install Google Chrome or Microsoft Edge, or specify a custom browser path in settings.'
  );
}

module.exports = {
  detectBrowsers,
  resolveBrowserPath
};
