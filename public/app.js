/**
 * Chrome & Edge Tab Rotator - Frontend Application Logic
 * Handles real-time SSE stream, live countdown ring, interactive URL table,
 * browser controls, and profile management.
 */

// State
let currentConfig = null;
let currentStatus = {
  status: 'stopped',
  currentIndex: 0,
  currentTab: null,
  totalTabs: 0,
  secondsRemaining: 0,
  totalDuration: 15,
  cycleCount: 0,
  tabs: []
};

// DOM Elements
const el = {
  statusDot: document.getElementById('statusDot'),
  statusText: document.getElementById('statusText'),
  countdownSeconds: document.getElementById('countdownSeconds'),
  progressRing: document.getElementById('progressRing'),
  activeTabIndex: document.getElementById('activeTabIndex'),
  activeTabTitle: document.getElementById('activeTabTitle'),
  activeTabUrl: document.getElementById('activeTabUrl'),
  cycleCount: document.getElementById('cycleCount'),
  totalTabsCount: document.getElementById('totalTabsCount'),
  
  // Controls
  btnStart: document.getElementById('btnStart'),
  btnPause: document.getElementById('btnPause'),
  btnResume: document.getElementById('btnResume'),
  btnPrev: document.getElementById('btnPrev'),
  btnNext: document.getElementById('btnNext'),
  btnStop: document.getElementById('btnStop'),
  
  // URL Manager
  urlListContainer: document.getElementById('urlListContainer'),
  btnAddUrl: document.getElementById('btnAddUrl'),
  btnBulkImport: document.getElementById('btnBulkImport'),
  btnSaveConfig: document.getElementById('btnSaveConfig'),
  enabledUrlsCountText: document.getElementById('enabledUrlsCountText'),

  // Rotation Settings
  intervalSlider: document.getElementById('intervalSlider'),
  defaultInterval: document.getElementById('defaultInterval'),
  rotationOrder: document.getElementById('rotationOrder'),
  chkLoop: document.getElementById('chkLoop'),
  chkReloadOnSwitch: document.getElementById('chkReloadOnSwitch'),

  // Browser Settings
  browserType: document.getElementById('browserType'),
  customPathGroup: document.getElementById('customPathGroup'),
  customBrowserPath: document.getElementById('customBrowserPath'),
  windowMode: document.getElementById('windowMode'),
  profileMode: document.getElementById('profileMode'),
  debugPort: document.getElementById('debugPort'),
  detectedBrowserNote: document.getElementById('detectedBrowserNote'),

  // Profiles
  profileSelect: document.getElementById('profileSelect'),
  btnSaveProfile: document.getElementById('btnSaveProfile'),

  // Modals
  bulkModal: document.getElementById('bulkModal'),
  btnCloseBulkModal: document.getElementById('btnCloseBulkModal'),
  btnCancelBulk: document.getElementById('btnCancelBulk'),
  btnApplyBulk: document.getElementById('btnApplyBulk'),
  bulkInput: document.getElementById('bulkInput'),

  profileModal: document.getElementById('profileModal'),
  btnCloseProfileModal: document.getElementById('btnCloseProfileModal'),
  btnCancelProfile: document.getElementById('btnCancelProfile'),
  btnConfirmSaveProfile: document.getElementById('btnConfirmSaveProfile'),
  newProfileName: document.getElementById('newProfileName'),

  toastContainer: document.getElementById('toastContainer')
};

const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * 42; // ~263.89

// =========================================================
// API Helpers
// =========================================================

async function fetchJson(url, options = {}) {
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    console.error(`API Error (${url}):`, err.message);
    showToast(err.message, 'error');
    throw err;
  }
}

// =========================================================
// Initialization
// =========================================================

async function init() {
  await loadDetectedBrowsers();
  await loadProfilesList();
  await loadActiveConfig();
  setupEventListeners();
  initEventSource();
}

/**
 * Connect to SSE real-time stream
 */
function initEventSource() {
  const evtSource = new EventSource('/api/events');

  evtSource.addEventListener('state-change', (e) => {
    try {
      const data = JSON.parse(e.data);
      updateStatusUI(data);
    } catch {}
  });

  evtSource.addEventListener('tick', (e) => {
    try {
      const data = JSON.parse(e.data);
      currentStatus.secondsRemaining = data.secondsRemaining;
      updateCountdownUI();
    } catch {}
  });

  evtSource.addEventListener('tab-switched', (e) => {
    try {
      const data = JSON.parse(e.data);
      currentStatus.currentIndex = data.tabIndex;
      currentStatus.currentTab = data.tab;
      currentStatus.cycleCount = data.cycleCount;
      updateActiveTabUI();
    } catch {}
  });

  evtSource.addEventListener('browser-closed', () => {
    showToast('Browser window was closed', 'info');
    currentStatus.status = 'stopped';
    updateStatusUI({ ...currentStatus, status: 'stopped' });
  });

  evtSource.onerror = () => {
    console.warn('SSE connection lost, reconnecting...');
  };
}

// =========================================================
// Config & Browser Loading
// =========================================================

async function loadDetectedBrowsers() {
  try {
    const data = await fetchJson('/api/browsers');
    if (data.browsers) {
      const available = data.browsers.filter(b => b.available);
      if (available.length > 0) {
        el.detectedBrowserNote.innerHTML = `Detected: <strong>${available.map(b => b.name).join(', ')}</strong>`;
      } else {
        el.detectedBrowserNote.innerHTML = '<span style="color:#f59e0b">No standard browser found in default paths. You can specify a custom path below.</span>';
      }
    }
  } catch {}
}

async function loadProfilesList() {
  try {
    const data = await fetchJson('/api/profiles');
    el.profileSelect.innerHTML = '<option value="default">Default Profile</option>';
    if (data.profiles && Array.isArray(data.profiles)) {
      for (const p of data.profiles) {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = `${p.name} (${p.urlsCount} tabs)`;
        el.profileSelect.appendChild(opt);
      }
    }
  } catch {}
}

async function loadActiveConfig() {
  try {
    const cfg = await fetchJson('/api/config');
    currentConfig = cfg;
    populateFormFromConfig(cfg);
    renderUrlList();
  } catch {}
}

function populateFormFromConfig(cfg) {
  if (!cfg) return;

  // Rotation
  el.defaultInterval.value = cfg.rotation.defaultIntervalSeconds || 15;
  el.intervalSlider.value = cfg.rotation.defaultIntervalSeconds || 15;
  el.rotationOrder.value = cfg.rotation.order || 'sequential';
  el.chkLoop.checked = cfg.rotation.loop !== false;
  el.chkReloadOnSwitch.checked = Boolean(cfg.rotation.reloadOnSwitch);
  updatePresetPills(cfg.rotation.defaultIntervalSeconds || 15);

  // Browser
  el.browserType.value = cfg.browser.type || 'auto';
  el.customBrowserPath.value = cfg.browser.customPath || '';
  el.customPathGroup.style.display = cfg.browser.type === 'custom' ? 'block' : 'none';
  el.windowMode.value = cfg.browser.windowMode || 'maximized';
  el.profileMode.value = cfg.browser.profileMode || 'isolated';
  el.debugPort.value = cfg.browser.remoteDebuggingPort || 9222;
}

function readConfigFromForm() {
  return {
    ...currentConfig,
    browser: {
      ...currentConfig.browser,
      type: el.browserType.value,
      customPath: el.customBrowserPath.value.trim(),
      windowMode: el.windowMode.value,
      profileMode: el.profileMode.value,
      remoteDebuggingPort: parseInt(el.debugPort.value, 10) || 9222
    },
    rotation: {
      ...currentConfig.rotation,
      defaultIntervalSeconds: parseInt(el.defaultInterval.value, 10) || 15,
      order: el.rotationOrder.value,
      loop: el.chkLoop.checked,
      reloadOnSwitch: el.chkReloadOnSwitch.checked
    },
    urls: currentConfig.urls || []
  };
}

async function saveCurrentConfig(silent = false) {
  const newConfig = readConfigFromForm();
  currentConfig = newConfig;
  try {
    await fetchJson('/api/config', {
      method: 'POST',
      body: JSON.stringify(newConfig)
    });
    if (!silent) showToast('Configuration saved', 'success');
  } catch (err) {
    if (!silent) showToast('Failed to save config: ' + err.message, 'error');
  }
}

// =========================================================
// UI Rendering: Status & Active Tab
// =========================================================

function updateStatusUI(status) {
  currentStatus = { ...currentStatus, ...status };

  // Status Badge
  el.statusDot.className = `status-dot status-${status.status}`;
  el.statusText.textContent = status.status.toUpperCase();

  // Control Buttons
  const isRunning = status.status === 'running';
  const isPaused = status.status === 'paused';
  const isStarting = status.status === 'starting';

  el.btnStart.style.display = (isRunning || isPaused || isStarting) ? 'none' : 'inline-flex';
  el.btnPause.style.display = isRunning ? 'inline-flex' : 'none';
  el.btnResume.style.display = isPaused ? 'inline-flex' : 'none';

  el.btnPrev.disabled = !isRunning && !isPaused;
  el.btnNext.disabled = !isRunning && !isPaused;
  el.btnStop.disabled = status.status === 'stopped';

  // Counters
  el.cycleCount.textContent = status.cycleCount || 0;
  el.totalTabsCount.textContent = status.totalTabs || (currentConfig ? currentConfig.urls.filter(u => u.enabled).length : 0);

  updateActiveTabUI();
  updateCountdownUI();
  highlightActiveTabInList();
}

function updateActiveTabUI() {
  if (currentStatus.status === 'stopped') {
    el.activeTabIndex.textContent = '#--';
    el.activeTabTitle.textContent = 'No browser active';
    el.activeTabUrl.textContent = 'Click Launch & Start to begin tab rotation';
    return;
  }

  const tab = currentStatus.currentTab;
  if (tab) {
    el.activeTabIndex.textContent = `#${currentStatus.currentIndex + 1}`;
    el.activeTabTitle.textContent = tab.title || tab.url;
    el.activeTabUrl.textContent = tab.url;
  }
}

function updateCountdownUI() {
  const sec = Math.max(0, currentStatus.secondsRemaining);
  const total = Math.max(1, currentStatus.totalDuration || (currentConfig?.rotation?.defaultIntervalSeconds || 15));

  el.countdownSeconds.textContent = currentStatus.status === 'stopped' ? '--' : sec;

  // Ring animation
  if (currentStatus.status === 'stopped') {
    el.progressRing.style.strokeDashoffset = '0';
    el.progressRing.style.stroke = 'var(--emerald)';
  } else {
    const fraction = sec / total;
    const offset = CIRCLE_CIRCUMFERENCE * (1 - fraction);
    el.progressRing.style.strokeDashoffset = offset.toString();

    // Color transition near expiry
    if (sec <= 3) {
      el.progressRing.style.stroke = 'var(--amber)';
    } else {
      el.progressRing.style.stroke = 'var(--emerald)';
    }
  }
}

// =========================================================
// UI Rendering: URL List Manager
// =========================================================

function renderUrlList() {
  el.urlListContainer.innerHTML = '';
  const urls = currentConfig?.urls || [];

  const enabledCount = urls.filter(u => u.enabled).length;
  el.enabledUrlsCountText.textContent = `${enabledCount} of ${urls.length} tabs active`;

  urls.forEach((item, index) => {
    const itemCard = document.createElement('div');
    itemCard.className = `url-item-card ${!item.enabled ? 'is-disabled' : ''}`;
    itemCard.id = `tabCard_${index}`;

    itemCard.innerHTML = `
      <div class="tab-index-badge">#${index + 1}</div>

      <div class="checkbox-row" style="margin: 0;">
        <label class="switch-label" title="Enable/Disable Tab">
          <input type="checkbox" class="tab-enable-chk" data-index="${index}" ${item.enabled ? 'checked' : ''}>
          <span class="slider-switch switch-sm"></span>
        </label>
      </div>

      <div class="tab-info-block">
        <input type="text" class="tab-title-input" data-index="${index}" value="${escapeHtml(item.title || '')}" placeholder="Tab Label / Name">
        <div class="tab-url-row">
          <input type="text" class="tab-url-input" data-index="${index}" value="${escapeHtml(item.url || '')}" placeholder="https://...">
          <a href="${escapeHtml(item.url || '#')}" target="_blank" class="tab-preview-link" title="Test open URL in new tab">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </a>
        </div>
      </div>

      <div class="tab-duration-override" title="Custom duration for this tab (leave empty to use global default)">
        <input type="number" class="tab-duration-input" data-index="${index}" min="1" max="3600" value="${item.durationSeconds || ''}" placeholder="Def">
        <span class="tab-duration-label">sec</span>
      </div>

      <div class="tab-item-actions">
        <button class="action-icon-btn btn-jump" data-index="${index}" title="Activate this tab immediately in browser">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor"/></svg>
        </button>
        <button class="action-icon-btn btn-up" data-index="${index}" title="Move Up" ${index === 0 ? 'disabled' : ''}>
          ▲
        </button>
        <button class="action-icon-btn btn-down" data-index="${index}" title="Move Down" ${index === urls.length - 1 ? 'disabled' : ''}>
          ▼
        </button>
        <button class="action-icon-btn btn-delete" data-index="${index}" title="Delete tab">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    `;

    el.urlListContainer.appendChild(itemCard);
  });

  highlightActiveTabInList();
}

function highlightActiveTabInList() {
  if (!currentConfig) return;
  const cards = el.urlListContainer.querySelectorAll('.url-item-card');
  cards.forEach((card, idx) => {
    if (currentStatus.status !== 'stopped' && idx === currentStatus.currentIndex) {
      card.classList.add('is-active-tab');
    } else {
      card.classList.remove('is-active-tab');
    }
  });
}

function updatePresetPills(seconds) {
  document.querySelectorAll('.preset-pill').forEach(pill => {
    if (parseInt(pill.getAttribute('data-seconds'), 10) === seconds) {
      pill.classList.add('active');
    } else {
      pill.classList.remove('active');
    }
  });
}

function escapeHtml(str) {
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}

// =========================================================
// Event Listeners
// =========================================================

function setupEventListeners() {
  // Master Rotation Controls
  el.btnStart.addEventListener('click', async () => {
    try {
      showToast('Launching browser and setting up tabs...', 'info');
      await saveCurrentConfig(true);
      await fetchJson('/api/control/start', {
        method: 'POST',
        body: JSON.stringify({ config: currentConfig })
      });
    } catch (err) {
      showToast('Failed to start: ' + err.message, 'error');
    }
  });

  el.btnPause.addEventListener('click', async () => {
    await fetchJson('/api/control/pause', { method: 'POST' });
  });

  el.btnResume.addEventListener('click', async () => {
    await fetchJson('/api/control/resume', { method: 'POST' });
  });

  el.btnPrev.addEventListener('click', async () => {
    await fetchJson('/api/control/prev', { method: 'POST' });
  });

  el.btnNext.addEventListener('click', async () => {
    await fetchJson('/api/control/next', { method: 'POST' });
  });

  el.btnStop.addEventListener('click', async () => {
    await fetchJson('/api/control/stop', { method: 'POST' });
    showToast('Browser closed and rotation stopped', 'info');
  });

  // URL List Management Actions (Delegation)
  el.urlListContainer.addEventListener('click', async (e) => {
    const target = e.target.closest('button, input');
    if (!target) return;

    const index = parseInt(target.getAttribute('data-index'), 10);
    if (isNaN(index)) return;

    // Toggle Enable
    if (target.classList.contains('tab-enable-chk')) {
      currentConfig.urls[index].enabled = target.checked;
      renderUrlList();
      saveCurrentConfig(true);
    }

    // Move Up
    if (target.classList.contains('btn-up') && index > 0) {
      const temp = currentConfig.urls[index];
      currentConfig.urls[index] = currentConfig.urls[index - 1];
      currentConfig.urls[index - 1] = temp;
      renderUrlList();
      saveCurrentConfig(true);
    }

    // Move Down
    if (target.classList.contains('btn-down') && index < currentConfig.urls.length - 1) {
      const temp = currentConfig.urls[index];
      currentConfig.urls[index] = currentConfig.urls[index + 1];
      currentConfig.urls[index + 1] = temp;
      renderUrlList();
      saveCurrentConfig(true);
    }

    // Delete
    if (target.classList.contains('btn-delete')) {
      currentConfig.urls.splice(index, 1);
      renderUrlList();
      saveCurrentConfig(true);
      showToast('Tab removed', 'info');
    }

    // Jump / Activate tab directly
    if (target.classList.contains('btn-jump')) {
      try {
        await fetchJson('/api/control/activate', {
          method: 'POST',
          body: JSON.stringify({ index })
        });
      } catch {}
    }
  });

  // URL item input change listeners
  el.urlListContainer.addEventListener('change', (e) => {
    const target = e.target;
    const index = parseInt(target.getAttribute('data-index'), 10);
    if (isNaN(index) || !currentConfig.urls[index]) return;

    if (target.classList.contains('tab-title-input')) {
      currentConfig.urls[index].title = target.value.trim();
      saveCurrentConfig(true);
    } else if (target.classList.contains('tab-url-input')) {
      currentConfig.urls[index].url = target.value.trim();
      saveCurrentConfig(true);
    } else if (target.classList.contains('tab-duration-input')) {
      const val = parseInt(target.value, 10);
      currentConfig.urls[index].durationSeconds = val > 0 ? val : null;
      saveCurrentConfig(true);
    }
  });

  // Add new tab
  el.btnAddUrl.addEventListener('click', () => {
    currentConfig.urls.push({
      id: `url_${Date.now()}`,
      title: 'New Dashboard',
      url: 'https://',
      enabled: true,
      durationSeconds: null,
      reloadOnSwitch: false
    });
    renderUrlList();
    saveCurrentConfig(true);
    // Focus new url input
    setTimeout(() => {
      const lastInput = el.urlListContainer.querySelector('.url-item-card:last-child .tab-url-input');
      if (lastInput) lastInput.focus();
    }, 100);
  });

  // Save Config Button
  el.btnSaveConfig.addEventListener('click', () => saveCurrentConfig(false));

  // Interval slider and input bidirectional sync
  el.intervalSlider.addEventListener('input', () => {
    el.defaultInterval.value = el.intervalSlider.value;
    updatePresetPills(parseInt(el.intervalSlider.value, 10));
    saveCurrentConfig(true);
  });

  el.defaultInterval.addEventListener('change', () => {
    el.intervalSlider.value = el.defaultInterval.value;
    updatePresetPills(parseInt(el.defaultInterval.value, 10));
    saveCurrentConfig(true);
  });

  // Preset pills
  document.querySelectorAll('.preset-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const sec = parseInt(pill.getAttribute('data-seconds'), 10);
      el.defaultInterval.value = sec;
      el.intervalSlider.value = sec;
      updatePresetPills(sec);
      saveCurrentConfig(true);
    });
  });

  // Form controls change auto-save
  [el.rotationOrder, el.chkLoop, el.chkReloadOnSwitch, el.browserType, el.customBrowserPath, el.windowMode, el.profileMode, el.debugPort].forEach(input => {
    input.addEventListener('change', () => {
      el.customPathGroup.style.display = el.browserType.value === 'custom' ? 'block' : 'none';
      saveCurrentConfig(true);
    });
  });

  // Bulk Import Modal
  el.btnBulkImport.addEventListener('click', () => {
    el.bulkModal.style.display = 'flex';
    el.bulkInput.focus();
  });
  el.btnCloseBulkModal.addEventListener('click', () => el.bulkModal.style.display = 'none');
  el.btnCancelBulk.addEventListener('click', () => el.bulkModal.style.display = 'none');
  
  el.btnApplyBulk.addEventListener('click', () => {
    const raw = el.bulkInput.value.trim();
    if (!raw) return;

    const lines = raw.split('\n');
    const imported = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let title = '';
      let url = trimmed;

      if (trimmed.includes('|')) {
        const parts = trimmed.split('|');
        title = parts[0].trim();
        url = parts.slice(1).join('|').trim();
      }

      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }

      imported.push({
        id: `url_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        title: title || url,
        url: url,
        enabled: true,
        durationSeconds: null,
        reloadOnSwitch: false
      });
    }

    if (imported.length > 0) {
      currentConfig.urls.push(...imported);
      renderUrlList();
      saveCurrentConfig(true);
      showToast(`Imported ${imported.length} tabs successfully`, 'success');
      el.bulkInput.value = '';
      el.bulkModal.style.display = 'none';
    }
  });

  // Profiles
  el.btnSaveProfile.addEventListener('click', () => {
    el.profileModal.style.display = 'flex';
    el.newProfileName.focus();
  });
  el.btnCloseProfileModal.addEventListener('click', () => el.profileModal.style.display = 'none');
  el.btnCancelProfile.addEventListener('click', () => el.profileModal.style.display = 'none');

  el.btnConfirmSaveProfile.addEventListener('click', async () => {
    const name = el.newProfileName.value.trim();
    if (!name) return;

    try {
      await fetchJson('/api/profiles/save', {
        method: 'POST',
        body: JSON.stringify({ name, config: readConfigFromForm() })
      });
      showToast(`Profile "${name}" saved`, 'success');
      el.profileModal.style.display = 'none';
      el.newProfileName.value = '';
      await loadProfilesList();
      el.profileSelect.value = name;
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  el.profileSelect.addEventListener('change', async () => {
    const selected = el.profileSelect.value;
    if (selected === 'default') {
      await loadActiveConfig();
    } else {
      try {
        const res = await fetchJson('/api/profiles/load', {
          method: 'POST',
          body: JSON.stringify({ name: selected })
        });
        currentConfig = res.config;
        populateFormFromConfig(res.config);
        renderUrlList();
        showToast(`Profile "${selected}" loaded`, 'info');
      } catch {}
    }
  });
}

// =========================================================
// Toast Manager
// =========================================================

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '⚠️';

  toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(message)}</span>`;
  el.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s, transform 0.3s';
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Boot
document.addEventListener('DOMContentLoaded', init);
