/* ============================================
   Ayush_Tracker — Main Application (app.js)
   ============================================
   
   This is the main entry point. It handles:
   Step 1: Service worker, theme, tabs, settings, privacy modal, PWA install, toasts
   Step 2: Camera, MediaPipe face detection, calibration, head pose, state machine
   
   Steps 3-6 will add: timer engine with back-dating, alerts,
   dashboard/storage, and polish.
   ============================================ */

'use strict';

// ═══════════════════════════════════════════════
// 0. MEDIAPIPE IMPORTS (loaded dynamically)
// ═══════════════════════════════════════════════
// We load MediaPipe dynamically so the rest of the app
// can work even if the model hasn't downloaded yet.

let FaceLandmarker = null;
let FilesetResolver = null;

/**
 * Dynamically import the MediaPipe vision bundle.
 * We use dynamic import() so the main script doesn't need type="module".
 */
async function loadMediaPipeModule() {
  try {
    const vision = await import('./models/vision_bundle.mjs');
    FaceLandmarker = vision.FaceLandmarker;
    FilesetResolver = vision.FilesetResolver;
    console.log('✅ MediaPipe module loaded');
    return true;
  } catch (err) {
    console.error('❌ Failed to load MediaPipe module:', err);
    showToast('error', 'Face detection unavailable',
      'Could not load the face detection model. Check that the /models/ folder is complete.');
    return false;
  }
}


// ═══════════════════════════════════════════════
// 1. DOM REFERENCES
// ═══════════════════════════════════════════════

const DOM = {
  // Privacy modal
  privacyModal:      document.getElementById('privacy-modal'),
  privacyAcceptBtn:  document.getElementById('privacy-accept-btn'),

  // Calibration
  calibrationOverlay:    document.getElementById('calibration-overlay'),
  calibrationProgressBar: document.getElementById('calibration-progress-bar'),
  calibrationCountdown:  document.getElementById('calibration-countdown'),

  // Header
  cameraIndicator: document.getElementById('camera-indicator'),
  pipBtn:          document.getElementById('pip-btn'),
  themeToggle:     document.getElementById('theme-toggle'),
  settingsBtn:     document.getElementById('settings-btn') || document.getElementById('nav-settings'),

  // Navigation
  navHome:      document.getElementById('nav-home'),
  navHistory:   document.getElementById('nav-history'),
  navSettings:  document.getElementById('nav-settings'),
  tabTimer:     document.getElementById('nav-home') || document.getElementById('tab-timer'),
  tabDashboard: document.getElementById('nav-history') || document.getElementById('tab-dashboard'),

  // Views
  homeView:       document.getElementById('home-view'),
  historyView:    document.getElementById('history-view'),
  timerView:      document.getElementById('home-view') || document.getElementById('timer-view'),
  dashboardView:  document.getElementById('history-view') || document.getElementById('dashboard-view'),

  // Hero Card
  statusChip:     document.getElementById('status-chip'),
  statusText:     document.getElementById('status-text'),
  timerDisplay:   document.getElementById('timer-display'),
  sessionStats:   document.getElementById('session-stats'),
  statFocus:      document.getElementById('stat-focus') || document.getElementById('home-focus'),
  statDistractions: document.getElementById('stat-distractions') || document.getElementById('home-distractions'),
  statSessionTime: document.getElementById('stat-session-time'),
  statPausedTime: document.getElementById('stat-paused-time'),
  startBtn:       document.getElementById('start-btn'),
  endBtn:         document.getElementById('end-btn'),
  cameraPreviewContainer: document.getElementById('camera-preview-container'),
  cameraPreview:  document.getElementById('live-video'),
  alertCard:      document.getElementById('alert-card'),
  alertIcon:      document.getElementById('alert-icon'),
  alertText:      document.getElementById('alert-text'),

  // Home Summary & Progress
  homeStudyTime:      document.getElementById('home-study-time'),
  homeFocus:          document.getElementById('home-focus'),
  homeDistractions:   document.getElementById('home-distractions'),
  goalProgressText:   document.getElementById('goal-progress-text'),
  goalProgressBar:    document.getElementById('goal-progress-bar'),
  homeStreakBadge:    document.getElementById('home-streak-badge'),
  homeRecentEvents:   document.getElementById('home-recent-events'),
  homeRecentSessions: document.getElementById('home-recent-sessions'),

  // History / Dashboard view
  dashStudyTime:   document.getElementById('dash-study-time'),
  dashFocus:       document.getElementById('dash-focus'),
  dashDistractions: document.getElementById('dash-distractions'),
  distLookAway:    document.getElementById('dist-look-away'),
  distAway:        document.getElementById('dist-away'),
  distLid:         document.getElementById('dist-lid'),
  weeklyTotal:     document.getElementById('weekly-total'),
  chartContainer:  document.getElementById('chart-container'),
  dailyGoalDisplay: document.getElementById('daily-goal-display'),
  streakBadge:     document.getElementById('streak-badge') || document.getElementById('home-streak-badge'),
  sessionList:     document.getElementById('session-list'),
  exportCsvBtn:    document.getElementById('export-csv-btn'),
  deleteAllBtn:    document.getElementById('delete-all-btn'),

  // Settings
  settingsOverlay:  document.getElementById('settings-overlay'),
  settingsPanel:    document.getElementById('settings-panel'),
  settingsCloseBtn: document.getElementById('settings-close-btn'),

  // LIVE PANEL
  liveStatusChip: document.getElementById('live-status-chip'),
  liveStatusText: document.getElementById('live-status-text'),
  pipeCam: document.getElementById('pipe-cam'),
  pipeModel: document.getElementById('pipe-model'),
  pipeFace: document.getElementById('pipe-face'),
  pipeFocus: document.getElementById('pipe-focus'),
  pipeWorker: document.getElementById('pipe-worker'),
  liveYaw: document.getElementById('live-yaw'),
  livePitch: document.getElementById('live-pitch'),
  liveFps: document.getElementById('live-fps'),
  liveSinceFace: document.getElementById('live-since-face'),
  liveSession: document.getElementById('live-session'),
  liveStudy: document.getElementById('live-study'),
  livePauses: document.getElementById('live-pauses'),
  livePreviewCb: document.getElementById('live-preview-cb'),
  liveCameraWrapper: document.getElementById('live-camera-wrapper'),
  liveVideo: document.getElementById('live-video'),
  liveCanvas: document.getElementById('live-canvas'),
  liveErrorBanner: document.getElementById('live-error-banner'),
  liveErrorText: document.getElementById('live-error-text'),
  liveEvents: document.getElementById('live-events'),
  focusArc: document.getElementById('focus-arc'),
  focusPctVal: document.getElementById('focus-pct-val'),
  headPosDot: document.getElementById('head-pos-dot'),
  liveFocusThresholdTag: document.getElementById('live-focus-threshold-tag'),
  settingFocusThreshold: document.getElementById('setting-focus-threshold'),
  settingFocusThresholdVal: document.getElementById('setting-focus-threshold-val'),
  recalibrateBtn:       document.getElementById('recalibrate-btn'),
  settingSensitivity:   document.getElementById('setting-sensitivity'),
  settingLookawayTime:  document.getElementById('setting-lookaway-time'),
  settingAwayTime:      document.getElementById('setting-away-time'),
  settingReadingMode:   document.getElementById('setting-reading-mode'),
  settingDailyGoal:     document.getElementById('setting-daily-goal'),
  settingSound:         document.getElementById('setting-sound'),
  settingVolume:        document.getElementById('setting-volume'),
  settingNotifications: document.getElementById('setting-notifications'),
  settingCameraPreview: document.getElementById('setting-camera-preview'),

  // Install prompt
  installPrompt:    document.getElementById('install-prompt'),
  installBtn:       document.getElementById('install-btn'),
  installDismissBtn: document.getElementById('install-dismiss-btn'),

  // Toast
  toastContainer: document.getElementById('toast-container'),
};


// ═══════════════════════════════════════════════
// 2. APP STATE
// ═══════════════════════════════════════════════

const state = {
  // Current operational state
  // 'idle' | 'calibrating' | 'studying' | 'looking-away' | 'away' | 'lid-closed'
  status: 'idle',

  // Theme: 'light' | 'dark'
  theme: 'dark',

  // Active tab: 'timer' | 'dashboard'
  activeTab: 'timer',

  // Settings (loaded from localStorage)
  settings: {
    sensitivity: 'medium',     // 'low' | 'medium' | 'high'
    focusThreshold: 80,        // percentage (50-99): timer stops immediately if focus < focusThreshold
    lookawayTime: 10,          // seconds
    awayTime: 30,              // seconds
    readingMode: false,
    dailyGoal: 4,              // hours
    soundOn: true,
    volume: 50,                // 0-100
    notificationsOn: true,
    cameraPreview: false,
  },

  // ── Camera & Detection (Step 2) ──
  camera: {
    stream: null,              // MediaStream from getUserMedia
    videoTrack: null,          // the video track (for detecting camera loss)
    faceLandmarker: null,      // MediaPipe FaceLandmarker instance
    isDetecting: false,        // is the detection loop running?
    detectionRAF: null,        // requestAnimationFrame ID
    lastDetectionTime: 0,      // for throttling to ~5fps
  },

  // ── Calibration (Step 2) ──
  calibration: {
    isCalibrating: false,
    startTime: 0,
    samples: [],               // array of { yaw, pitch } during calibration
    neutralYaw: 0,             // calibrated neutral yaw angle
    neutralPitch: 0,           // calibrated neutral pitch angle
  },

  // ── Head Pose Tracking (Step 2) ──
  headPose: {
    // Rolling buffer of last 5 readings for smoothing
    buffer: [],
    bufferSize: 5,
    // Current smoothed yaw and pitch
    yaw: 0,
    pitch: 0,
    // Is a face currently detected?
    faceDetected: false,
    // Timestamps for state transitions
    lastFaceSeen: 0,           // when we last saw a face
    lookAwayStart: 0,          // when the user started looking away
    awayStart: 0,              // when the face was last lost
    facingScreenSince: 0,      // when the user started facing the screen again
  },

  // ── Session data ──
  session: {
    active: false,
    id: null,                  // unique id, set on Start so autosave can upsert
    startTime: null,
    studyStartedAt: null,      // wall-clock ms when the current study run began (null when paused)
    accStudyMs: 0,             // study ms accumulated across all completed runs
    studyTime: 0,              // total study ms = accStudyMs + (now − studyStartedAt) live
    sessionTime: 0,
    unverifiedTime: 0,
    distractions: { lookAway: 0, away: 0, lidClosed: 0 },
    pauses: [],                // [{ type, start, end }]
  },

  // ── Worker ──
  worker: null,
  lastTickTimestamp: 0,

  // ── PiP ──
  pipWindow: null,

  // PWA install event
  deferredInstallPrompt: null,
};

// ── Sensitivity thresholds (degrees from neutral angle) ──
const SENSITIVITY = {
  low:    35,
  medium: 25,
  high:   15,
};

// ── Detection interval (ms) — ~5 fps ──
const DETECTION_INTERVAL_MS = 200;

// All pause/resume thresholds come from this config object so there
// are no magic numbers scattered through the code.
const CONFIG = {
  // User must face screen for this long before we resume the timer.
  resumeDelayMs: 2000,
  // A heartbeat gap bigger than this means the laptop was asleep / lid closed.
  lidGapMs: 8000,
  // Cap a single tick at this to avoid huge jumps after a stall.
  maxTickMs: 2000,
  // Detection is considered stalled if no frame arrived in this window.
  stallThresholdMs: 2500,
};


// ═══════════════════════════════════════════════
// 3. SETTINGS — Load & Save
// ═══════════════════════════════════════════════

function loadSettings() {
  try {
    const saved = localStorage.getItem('ayush-tracker-settings') || localStorage.getItem('ai-spectator-settings');
    if (saved) {
      Object.assign(state.settings, JSON.parse(saved));
    }
  } catch (e) {
    console.warn('Could not load settings:', e);
  }

  // Apply to UI controls
  if (state.settings.focusThreshold === undefined || state.settings.focusThreshold === 95) {
    state.settings.focusThreshold = 80;
  }
  if (DOM.settingFocusThreshold) {
    DOM.settingFocusThreshold.value = state.settings.focusThreshold ?? 80;
    if (DOM.settingFocusThresholdVal) {
      DOM.settingFocusThresholdVal.textContent = (state.settings.focusThreshold ?? 80) + '%';
    }
  }
  if (DOM.liveFocusThresholdTag) {
    DOM.liveFocusThresholdTag.textContent = `Cutoff: ${(state.settings.focusThreshold ?? 80)}%`;
  }
  DOM.settingSensitivity.value   = state.settings.sensitivity;
  DOM.settingLookawayTime.value  = state.settings.lookawayTime;
  DOM.settingAwayTime.value      = state.settings.awayTime;
  DOM.settingReadingMode.checked = state.settings.readingMode;
  DOM.settingDailyGoal.value     = state.settings.dailyGoal;
  DOM.settingSound.checked       = state.settings.soundOn;
  DOM.settingVolume.value        = state.settings.volume;
  DOM.settingNotifications.checked = state.settings.notificationsOn;
  DOM.settingCameraPreview.checked = state.settings.cameraPreview;
}

function saveSettings() {
  try {
    localStorage.setItem('ayush-tracker-settings', JSON.stringify(state.settings));
  } catch (e) {
    console.warn('Could not save settings:', e);
  }
}

function initSettingsListeners() {
  if (DOM.settingFocusThreshold) {
    DOM.settingFocusThreshold.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      state.settings.focusThreshold = Math.max(50, Math.min(99, val || 80));
      if (DOM.settingFocusThresholdVal) {
        DOM.settingFocusThresholdVal.textContent = state.settings.focusThreshold + '%';
      }
      if (DOM.liveFocusThresholdTag) {
        DOM.liveFocusThresholdTag.textContent = `Cutoff: ${state.settings.focusThreshold}%`;
      }
      saveSettings();
    });
  }

  if (DOM.recalibrateBtn) {
    DOM.recalibrateBtn.addEventListener('click', async () => {
      closeSettings();
      if (!state.camera.stream) {
        showToast('info', 'Starting Camera', 'Camera is needed to calibrate your neutral position.');
        const ok = await startCamera();
        if (!ok) return;
        startDetectionLoop();
      }
      await runCalibration();
    });
  }

  DOM.settingSensitivity.addEventListener('change', (e) => {
    state.settings.sensitivity = e.target.value;
    saveSettings();
  });

  DOM.settingLookawayTime.addEventListener('change', (e) => {
    state.settings.lookawayTime = Math.max(3, Math.min(60, parseInt(e.target.value) || 10));
    e.target.value = state.settings.lookawayTime;
    saveSettings();
  });

  DOM.settingAwayTime.addEventListener('change', (e) => {
    state.settings.awayTime = Math.max(10, Math.min(120, parseInt(e.target.value) || 30));
    e.target.value = state.settings.awayTime;
    saveSettings();
  });

  DOM.settingReadingMode.addEventListener('change', (e) => {
    state.settings.readingMode = e.target.checked;
    saveSettings();
  });

  DOM.settingDailyGoal.addEventListener('change', (e) => {
    state.settings.dailyGoal = Math.max(0.5, Math.min(16, parseFloat(e.target.value) || 4));
    e.target.value = state.settings.dailyGoal;
    DOM.dailyGoalDisplay.textContent = state.settings.dailyGoal + 'h';
    saveSettings();
  });

  DOM.settingSound.addEventListener('change', (e) => {
    state.settings.soundOn = e.target.checked;
    saveSettings();
  });

  DOM.settingVolume.addEventListener('input', (e) => {
    state.settings.volume = parseInt(e.target.value);
    saveSettings();
  });

  DOM.settingNotifications.addEventListener('change', (e) => {
    state.settings.notificationsOn = e.target.checked;
    if (e.target.checked) requestNotificationPermission();
    saveSettings();
  });

  DOM.settingCameraPreview.addEventListener('change', (e) => {
    state.settings.cameraPreview = e.target.checked;
    if (DOM.cameraPreviewContainer) {
      DOM.cameraPreviewContainer.classList.toggle('visible', e.target.checked);
    }
    saveSettings();
  });
}


// ═══════════════════════════════════════════════
// 4. THEME — Light / Dark toggle
// ═══════════════════════════════════════════════

function initTheme() {
  const saved = localStorage.getItem('ayush-tracker-theme') || localStorage.getItem('ai-spectator-theme');
  if (saved) {
    state.theme = saved;
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    state.theme = prefersDark ? 'dark' : 'light';
  }
  applyTheme();
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  DOM.themeToggle.textContent = state.theme === 'dark' ? '☀️' : '🌙';
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.content = state.theme === 'dark' ? '#080816' : '#f1f5f9';
  }

  if (state.pipWindow) {
    state.pipWindow.document.documentElement.setAttribute('data-theme', state.theme);
  }
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('ayush-tracker-theme', state.theme);
  applyTheme();
}


// ═══════════════════════════════════════════════
// 5. TAB NAVIGATION
// ═══════════════════════════════════════════════

function switchTab(tab) {
  state.activeTab = tab;
  const isHome = (tab === 'home' || tab === 'timer');
  const isHistory = (tab === 'history' || tab === 'dashboard');

  if (DOM.navHome) {
    DOM.navHome.classList.toggle('active', isHome);
    DOM.navHome.setAttribute('aria-selected', isHome);
  }
  if (DOM.navHistory) {
    DOM.navHistory.classList.toggle('active', isHistory);
    DOM.navHistory.setAttribute('aria-selected', isHistory);
  }
  if (DOM.tabTimer && DOM.tabTimer !== DOM.navHome) {
    DOM.tabTimer.classList.toggle('active', isHome);
    DOM.tabTimer.setAttribute('aria-selected', isHome);
  }
  if (DOM.tabDashboard && DOM.tabDashboard !== DOM.navHistory) {
    DOM.tabDashboard.classList.toggle('active', isHistory);
    DOM.tabDashboard.setAttribute('aria-selected', isHistory);
  }

  if (DOM.homeView) DOM.homeView.classList.toggle('hidden', !isHome);
  if (DOM.historyView) DOM.historyView.classList.toggle('hidden', !isHistory);
  if (DOM.timerView && DOM.timerView !== DOM.homeView) DOM.timerView.classList.toggle('hidden', !isHome);
  if (DOM.dashboardView && DOM.dashboardView !== DOM.historyView) DOM.dashboardView.classList.toggle('hidden', !isHistory);

  refreshDashboard();
}


// ═══════════════════════════════════════════════
// 6. SETTINGS PANEL — Open / Close
// ═══════════════════════════════════════════════

function openSettings() {
  DOM.settingsOverlay.classList.add('open');
  DOM.settingsPanel.classList.add('open');
}

function closeSettings() {
  DOM.settingsOverlay.classList.remove('open');
  DOM.settingsPanel.classList.remove('open');
}


// ═══════════════════════════════════════════════
// 7. PRIVACY MODAL — First-run notice
// ═══════════════════════════════════════════════

function initPrivacyModal() {
  const accepted = localStorage.getItem('ayush-tracker-privacy-accepted') || localStorage.getItem('ai-spectator-privacy-accepted');
  if (!accepted) {
    DOM.privacyModal.classList.add('active');
  }
}

function acceptPrivacy() {
  localStorage.setItem('ayush-tracker-privacy-accepted', 'true');
  DOM.privacyModal.classList.remove('active');
  if (state.settings.notificationsOn) requestNotificationPermission();
}


// ═══════════════════════════════════════════════
// 8. PWA INSTALL PROMPT
// ═══════════════════════════════════════════════

function initInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredInstallPrompt = e;
    DOM.installPrompt.classList.add('visible');
  });

  window.addEventListener('appinstalled', () => {
    DOM.installPrompt.classList.remove('visible');
    state.deferredInstallPrompt = null;
    showToast('success', 'Installed!', 'Ayush_Tracker is now a desktop app.');
  });
}

async function installApp() {
  if (!state.deferredInstallPrompt) return;
  state.deferredInstallPrompt.prompt();
  const result = await state.deferredInstallPrompt.userChoice;
  if (result.outcome === 'accepted') console.log('PWA installed');
  state.deferredInstallPrompt = null;
  DOM.installPrompt.classList.remove('visible');
}

function dismissInstall() {
  DOM.installPrompt.classList.remove('visible');
}


// ═══════════════════════════════════════════════
// 9. NOTIFICATION PERMISSION
// ═══════════════════════════════════════════════

async function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') return;
  if (Notification.permission === 'denied') {
    showToast('warning', 'Notifications blocked', 'Enable them in your browser settings to get study nudges.');
    return;
  }
  try {
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      showToast('success', 'Notifications enabled!', 'You\'ll get a gentle nudge when you lose focus.');
    }
  } catch (e) {
    console.warn('Notification permission error:', e);
  }
}


// ═══════════════════════════════════════════════
// 10. TOAST NOTIFICATIONS (in-app)
// ═══════════════════════════════════════════════

function showToast(type, title, message, duration = 5000) {
  const icons = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" aria-label="Close">✕</button>
  `;
  toast.querySelector('.toast-close').addEventListener('click', () => dismissToast(toast));
  DOM.toastContainer.appendChild(toast);
  if (duration > 0) setTimeout(() => dismissToast(toast), duration);
}

function dismissToast(toast) {
  if (!toast || !toast.parentNode) return;
  toast.classList.add('removing');
  toast.addEventListener('animationend', () => toast.remove());
}


// ═══════════════════════════════════════════════
// 11. TIME FORMATTING HELPERS
// ═══════════════════════════════════════════════

/** Format milliseconds as HH:MM:SS */
function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map(n => n.toString().padStart(2, '0')).join(':');
}

/** Format milliseconds as human-readable duration like "2h 34m" */
function formatDuration(ms) {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.floor(ms / 1000)}s`;
}

/** Format a timestamp as a time string like "2:34 PM" */
function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}


// ═══════════════════════════════════════════════
// 12. STATUS DISPLAY
// ═══════════════════════════════════════════════

function setStatus(status, text) {
  state.status = status;
  DOM.statusChip.setAttribute('data-status', status);

  const defaultTexts = {
    'idle':          'Ready to study',
    'calibrating':   'Calibrating…',
    'studying':      'Studying',
    'looking-away':  'Paused: looking away',
    'away':          'Paused: away',
    'lid-closed':    'Paused: lid closed or sleep',
  };
  const displayText = text || defaultTexts[status] || status;
  DOM.statusText.textContent = displayText;

  DOM.liveStatusChip.setAttribute('data-status', status);
  DOM.liveStatusText.textContent = displayText;

  // Timer display styling
  if (status === 'studying') {
    DOM.timerDisplay.classList.add('active');
    DOM.timerDisplay.classList.remove('paused');
  } else if (['looking-away', 'away', 'lid-closed'].includes(status)) {
    DOM.timerDisplay.classList.remove('active');
    DOM.timerDisplay.classList.add('paused');
  } else {
    DOM.timerDisplay.classList.remove('active', 'paused');
  }

  updatePiP();
  logEvent(`Status: ${displayText}`);
}

// ═══════════════════════════════════════════════
// LIVE PANEL HELPERS
// ═══════════════════════════════════════════════

const recentEventsLog = [];

function renderRecentEvents() {
  if (!DOM.homeRecentEvents) return;
  if (recentEventsLog.length === 0) {
    DOM.homeRecentEvents.innerHTML = '<li class="empty-recent-item">No events recorded yet</li>';
    return;
  }
  DOM.homeRecentEvents.innerHTML = recentEventsLog.map(e => `<li>${e}</li>`).join('');
}

function logEvent(msg) {
  const time = new Date().toLocaleTimeString();
  const entry = `[${time}] ${msg}`;
  recentEventsLog.unshift(entry);
  if (recentEventsLog.length > 5) {
    recentEventsLog.pop();
  }
  renderRecentEvents();

  if (DOM.liveEvents) {
    const li = document.createElement('li');
    li.textContent = entry;
    DOM.liveEvents.prepend(li);
    if (DOM.liveEvents.children.length > 10) {
      DOM.liveEvents.lastChild.remove();
    }
  }
}

function showLiveError(msg) {
  DOM.liveErrorBanner.classList.remove('hidden');
  DOM.liveErrorText.textContent = msg;
  logEvent(`ERROR: ${msg}`);
}

function hideLiveError() {
  DOM.liveErrorBanner.classList.add('hidden');
}

function updatePipeline(step, ok) {
  const el = DOM[`pipe${step}`];
  if (el) {
    el.innerHTML = ok ? el.innerHTML.replace('❌', '✅') : el.innerHTML.replace('✅', '❌');
  }
}


// ═══════════════════════════════════════════════
// 13. ALERT DISPLAY (in-app banner)
// ═══════════════════════════════════════════════

function showAlert(type, icon, text) {
  DOM.alertCard.className = `alert-card visible ${type}`;
  DOM.alertIcon.textContent = icon;
  DOM.alertText.innerHTML = text;
}

function hideAlert() {
  DOM.alertCard.classList.remove('visible');
}


// ═══════════════════════════════════════════════
// 13B. ALERT ENGINE — Chimes & Notifications
// ═══════════════════════════════════════════════

let audioCtx = null;
let lastAlertTimestamp = 0;

const ALERT_MESSAGES = {
  lookAway: [
    "Looks like your mind wandered. Come back when you're ready.",
    "Hey, eyes on the prize!",
    "Lost focus? It happens. Let's get back to it.",
    "The screen misses you.",
    "Take a breath, then bring your focus back."
  ],
  away: [
    "Hey, you stepped away. Timer paused. Ready when you are.",
    "Taking a break? Timer is paused for you.",
    "You left your desk. Come back soon!",
    "Timer paused. We'll wait for you to return."
  ]
};

function playSoftChime() {
  if (!state.settings.soundOn || state.settings.volume == 0) return;
  
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const volume = state.settings.volume / 100;
  
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  // Soft bell-like chime
  osc.type = 'sine';
  osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
  osc.frequency.exponentialRampToValueAtTime(659.25, audioCtx.currentTime + 0.1); // E5
  
  gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
  gainNode.gain.linearRampToValueAtTime(volume * 0.4, audioCtx.currentTime + 0.05);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.2);

  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  osc.start();
  osc.stop(audioCtx.currentTime + 1.5);
}

function triggerNudge(type) {
  const now = Date.now();
  
  if (type === 'lookAway' || type === 'away') {
    // Rate limit: max 1 alert per 60 seconds
    if (now - lastAlertTimestamp < 60000) {
      // Still show the quiet banner, just no sound/notification
      const icon = type === 'lookAway' ? '👀' : '🚶';
      showAlert('paused', icon, '<strong>Timer paused.</strong>');
      return;
    }
    
    lastAlertTimestamp = now;
    playSoftChime();
    
    const messages = ALERT_MESSAGES[type];
    const msg = messages[Math.floor(Math.random() * messages.length)];
    const icon = type === 'lookAway' ? '👀' : '🚶';
    
    showAlert('paused', icon, `<strong>Timer paused.</strong> ${msg}`);
    
    if (state.settings.notificationsOn && Notification.permission === 'granted') {
      new Notification("Ayush_Tracker", { body: msg, icon: './icons/icon-192.png' });
    }
  } 
  else if (type === 'resumed') {
    // Quiet resume
    showAlert('resumed', '💪', '<strong>Back on track!</strong> Timer running.');
  }
}


// ═══════════════════════════════════════════════
// 14. CAMERA — Start / Stop
// ═══════════════════════════════════════════════

/**
 * Request camera access and start the video stream.
 * We ask for a small resolution (480p) to keep CPU low.
 * The video element is used by MediaPipe to grab frames.
 */
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: 'user',       // front camera
        frameRate: { ideal: 15 }, // low fps is fine
      },
      audio: false,
    });

    state.camera.stream = stream;
    state.camera.videoTrack = stream.getVideoTracks()[0];

    // Show video in the preview element (even if container is hidden)
    DOM.cameraPreview.srcObject = stream;
    await DOM.cameraPreview.play();

    // Show camera indicator
    DOM.cameraIndicator.classList.add('visible');

    // Show preview if enabled in settings
    if (state.settings.cameraPreview && DOM.cameraPreviewContainer) {
      DOM.cameraPreviewContainer.classList.add('visible');
    }

    // Listen for camera track ending (e.g. user unplugged camera, lid closed)
    state.camera.videoTrack.addEventListener('ended', handleCameraTrackEnded);

    console.log('📷 Camera started:', state.camera.videoTrack.label);
    return true;

  } catch (err) {
    console.error('Camera access denied or failed:', err);
    showToast('error', 'Camera required',
      'Ayush_Tracker needs your webcam to detect focus. Please allow camera access and try again.');
    return false;
  }
}

/**
 * Stop the camera and release all resources.
 */
function stopCamera() {
  if (state.camera.videoTrack) {
    state.camera.videoTrack.removeEventListener('ended', handleCameraTrackEnded);
  }

  if (state.camera.stream) {
    state.camera.stream.getTracks().forEach(track => track.stop());
    state.camera.stream = null;
    state.camera.videoTrack = null;
  }

  if (DOM.cameraPreview) DOM.cameraPreview.srcObject = null;
  if (DOM.cameraIndicator) DOM.cameraIndicator.classList.remove('visible');
  if (DOM.cameraPreviewContainer) DOM.cameraPreviewContainer.classList.remove('visible');

  console.log('📷 Camera stopped');
}

/**
 * Called when the camera track ends unexpectedly.
 * This happens when the user closes the laptop lid, unplugs
 * an external webcam, or revokes camera permission.
 */
function handleCameraTrackEnded() {
  if (state.session.active && state.status !== 'idle' && state.status !== 'lid-closed') {
    const now = Date.now();
    freezeStudyTime(now);
    startPauseEvent('cameraLost', now);
    setStatus('lid-closed');
    showAlert('paused', '💤', '<strong>Camera lost.</strong> Timer paused. Reopen and I\'ll welcome you back.');
    state.session.distractions.lidClosed++;
    updateSessionStatsDisplay();
    autoSaveSession();
  }
}


// ═══════════════════════════════════════════════
// 15. MEDIAPIPE FACE LANDMARKER — Init
// ═══════════════════════════════════════════════

/**
 * Create the MediaPipe FaceLandmarker instance.
 * This loads the WASM runtime and the face landmark model.
 * Both are served locally from /models/ for offline support.
 */
async function initFaceLandmarker() {
  if (!FaceLandmarker || !FilesetResolver) {
    const loaded = await loadMediaPipeModule();
    if (!loaded) return false;
  }

  try {
    showToast('info', 'Loading face detection…', 'This may take a few seconds on first run.');

    // Load the WASM runtime from our local /models/wasm/ directory
    const filesetResolver = await FilesetResolver.forVisionTasks('./models/wasm');

    // Create the FaceLandmarker with our local model file
    state.camera.faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: './models/face_landmarker.task',
      },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: false,
      // We need the transformation matrix for accurate head pose
      outputFacialTransformationMatrixes: true,
    });

    console.log('✅ FaceLandmarker initialised');
    updatePipeline('Model', true);
    return true;

  } catch (err) {
    console.error('❌ FaceLandmarker init failed:', err);
    showToast('error', 'Face detection failed',
      'Could not initialise the face detection model. ' + err.message);
    showLiveError('Model failed to load. Check console.');
    updatePipeline('Model', false);
    return false;
  }
}


// ═══════════════════════════════════════════════
// 16. HEAD POSE — Calculation from landmarks
// ═══════════════════════════════════════════════

/**
 * Calculate head yaw and pitch from face landmarks.
 *
 * HOW IT WORKS:
 * MediaPipe gives us 478 face landmarks, each with x, y, z coordinates.
 * We use key landmarks to figure out which way the head is pointing:
 *
 * - YAW (turning left/right):
 *   Compare the distance from nose to left cheek vs nose to right cheek.
 *   When you turn right, your nose gets closer to your right cheek.
 *
 * - PITCH (looking up/down):
 *   Compare the distance from nose to forehead vs nose to chin.
 *   When you look down, your nose gets closer to your chin.
 *
 * The landmarks used (by index in MediaPipe Face Mesh):
 *   4   = Nose tip
 *   234 = Left cheek (near left ear)
 *   454 = Right cheek (near right ear)
 *   10  = Top of forehead
 *   152 = Bottom of chin
 *
 * @param {Array} landmarks — array of { x, y, z } normalised coordinates
 * @returns {{ yaw: number, pitch: number }} — angles in degrees
 */
function calculateHeadPose(landmarks) {
  if (!landmarks || landmarks.length < 468) {
    return { yaw: 0, pitch: 0 };
  }

  const noseTip     = landmarks[4];
  const rightCheek  = landmarks[234]; // person's right, camera left
  const leftCheek   = landmarks[454]; // person's left, camera right
  const foreheadTop = landmarks[10];
  const chinBottom  = landmarks[152];
  const rightEye    = landmarks[33];
  const leftEye     = landmarks[263];
  const rightMouth  = landmarks[61];
  const leftMouth   = landmarks[291];

  // Face center between outer cheek edges
  const centerX = (rightCheek.x + leftCheek.x) / 2;
  const centerY = (rightCheek.y + leftCheek.y) / 2;

  // Head roll angle — aligning face coordinates eliminates false yaw/pitch when tilting head
  const dx = leftCheek.x - rightCheek.x;
  const dy = leftCheek.y - rightCheek.y;
  const roll = Math.atan2(dy, dx);
  const cos = Math.cos(-roll);
  const sin = Math.sin(-roll);
  const faceWidth = Math.hypot(dx, dy);

  if (faceWidth < 0.001) return { yaw: 0, pitch: 0 };

  // Project nose tip into roll-aligned face coordinates
  const noseRelX = noseTip.x - centerX;
  const noseRelY = noseTip.y - centerY;
  const noseFaceX = noseRelX * cos - noseRelY * sin;
  const noseFaceY = noseRelX * sin + noseRelY * cos;

  // ── YAW (horizontal turn) ──
  // Ratio of nose horizontal position relative to cheek midpoint
  const halfWidth = faceWidth * 0.5;
  const yawRatio = Math.max(-1.0, Math.min(1.0, noseFaceX / halfWidth));
  const yaw2D = yawRatio * 55;
  // Z-depth difference between cheeks reinforces 3D rotation
  const zYaw = (rightCheek.z - leftCheek.z) * 120;
  const yaw = yaw2D * 0.75 + zYaw * 0.25;

  // ── PITCH (vertical tilt) ──
  // In neutral upright human anatomy, the nose tip lies in the vertical center between eye line and mouth line.
  const eyeX = (rightEye.x + leftEye.x) / 2;
  const eyeY = (rightEye.y + leftEye.y) / 2;
  const mouthX = (rightMouth.x + leftMouth.x) / 2;
  const mouthY = (rightMouth.y + leftMouth.y) / 2;

  const eyeFaceY = (eyeX - centerX) * sin + (eyeY - centerY) * cos;
  const mouthFaceY = (mouthX - centerX) * sin + (mouthY - centerY) * cos;

  const vertCenter = (eyeFaceY + mouthFaceY) / 2;
  const vertSpan = Math.abs(mouthFaceY - eyeFaceY) * 0.5;

  let pitch2D = 0;
  if (vertSpan > 0.001) {
    // Positive when tilted down (nose moves towards mouth)
    // Negative when tilted up (nose moves towards eyes)
    const pitchRatio = Math.max(-1.0, Math.min(1.0, (noseFaceY - vertCenter) / vertSpan));
    pitch2D = pitchRatio * 50;
  }

  // Z-depth difference between chin and forehead reinforces vertical tilt
  const zPitch = (chinBottom.z - foreheadTop.z) * 80;
  const pitch = pitch2D * 0.75 + zPitch * 0.25;

  return { yaw, pitch };
}

/**
 * Add a new reading to the rolling buffer and return the smoothed value.
 *
 * WHY SMOOTH?
 * Individual face detection frames can be noisy — a single bad frame
 * might report a wildly wrong angle. By averaging the last 5 readings,
 * we get a stable signal that doesn't jump around. This prevents
 * false "looking away" triggers from momentary detection errors.
 *
 * @param {{ yaw: number, pitch: number }} reading
 * @returns {{ yaw: number, pitch: number }} — smoothed values
 */
function smoothHeadPose(reading) {
  const buf = state.headPose.buffer;
  buf.push(reading);

  // Keep only the last N readings
  while (buf.length > state.headPose.bufferSize) {
    buf.shift();
  }

  // Average all readings in the buffer
  const smoothed = buf.reduce(
    (acc, r) => ({ yaw: acc.yaw + r.yaw, pitch: acc.pitch + r.pitch }),
    { yaw: 0, pitch: 0 }
  );

  smoothed.yaw /= buf.length;
  smoothed.pitch /= buf.length;

  return smoothed;
}


// ═══════════════════════════════════════════════
// 17. CALIBRATION — 5-second neutral pose capture
// ═══════════════════════════════════════════════

/**
 * Run a 5-second calibration to learn the user's neutral head angle.
 *
 * WHY CALIBRATE?
 * Different laptops have their cameras at different heights and angles.
 * A webcam on a monitor points straight at you; a laptop webcam on a desk
 * points upward. Without calibration, the app would think you're always
 * looking "down" on a laptop. Calibration captures your normal angle
 * so we can measure deviations from it.
 *
 * @returns {Promise<boolean>} — true if calibration succeeded
 */
async function runCalibration() {
  return new Promise((resolve) => {
    state.calibration.isCalibrating = true;
    state.calibration.samples = [];
    state.calibration.startTime = Date.now();

    const DURATION_MS = 5000; // 5 seconds

    // Show the calibration overlay
    DOM.calibrationOverlay.classList.add('active');
    setStatus('calibrating');

    // We use the existing detection loop to collect samples.
    // The detection loop checks state.calibration.isCalibrating
    // and adds samples instead of running the state machine.

    const checkInterval = setInterval(() => {
      const elapsed = Date.now() - state.calibration.startTime;
      const progress = Math.min(elapsed / DURATION_MS, 1);

      // Update progress bar
      DOM.calibrationProgressBar.style.width = (progress * 100) + '%';
      const remaining = Math.max(0, Math.ceil((DURATION_MS - elapsed) / 1000));
      DOM.calibrationCountdown.textContent = remaining + 's remaining';

      if (progress >= 1) {
        clearInterval(checkInterval);

        // Calculate the average of all samples as the neutral angle
        const samples = state.calibration.samples;

        if (samples.length < 5) {
          // Not enough samples — face wasn't detected reliably
          DOM.calibrationOverlay.classList.remove('active');
          showToast('warning', 'Calibration failed',
            'Could not detect your face consistently. Please try again in good lighting.');
          state.calibration.isCalibrating = false;
          resolve(false);
          return;
        }

        // Average all samples
        const sum = samples.reduce(
          (acc, s) => ({ yaw: acc.yaw + s.yaw, pitch: acc.pitch + s.pitch }),
          { yaw: 0, pitch: 0 }
        );
        state.calibration.neutralYaw = sum.yaw / samples.length;
        state.calibration.neutralPitch = sum.pitch / samples.length;

        console.log(`🎯 Calibrated: yaw=${state.calibration.neutralYaw.toFixed(1)}°, ` +
                     `pitch=${state.calibration.neutralPitch.toFixed(1)}°, ` +
                     `(${samples.length} samples)`);

        DOM.calibrationOverlay.classList.remove('active');
        state.calibration.isCalibrating = false;

        showToast('success', 'Calibration done!', 'Your neutral angle has been saved. Start studying!');
        resolve(true);
      }
    }, 100); // Check every 100ms for smooth progress bar
  });
}


// ═══════════════════════════════════════════════
// 18. DETECTION LOOP — Runs at ~5 fps
// ═══════════════════════════════════════════════

/**
 * Start the face detection loop.
 * This uses requestAnimationFrame to run at ~5 fps (every 200ms).
 * Lower fps = lower CPU usage. 5 fps is more than enough to
 * detect if someone is looking at the screen.
 */
function startDetectionLoop() {
  state.camera.isDetecting = true;
  // Initialise to 0 so the very first frame is processed immediately
  state.camera.lastDetectionTime = 0;
  state.headPose.buffer = [];

  function loop() {
    if (!state.camera.isDetecting) return;

    // Throttle to ~5 fps using wall-clock time so it matches the stall check
    const now = Date.now();
    if (now - state.camera.lastDetectionTime >= DETECTION_INTERVAL_MS) {
      state.camera.lastDetectionTime = now; // wall-clock ms — same unit as Date.now()
      runDetection();
    }

    state.camera.detectionRAF = requestAnimationFrame(loop);
  }

  state.camera.detectionRAF = requestAnimationFrame(loop);
  console.log('🔍 Detection loop started');
}

/**
 * Stop the face detection loop.
 */
function stopDetectionLoop() {
  state.camera.isDetecting = false;
  if (state.camera.detectionRAF) {
    cancelAnimationFrame(state.camera.detectionRAF);
    state.camera.detectionRAF = null;
  }
  updatePipeline('Cam', false);
  updatePipeline('Face', false);
  updatePipeline('Worker', false);
  console.log('🔍 Detection loop stopped');
}

/**
 * Run a single detection frame.
 * Called ~5 times per second by the detection loop.
 */
let frameCount = 0;
let lastFpsTime = Date.now();

function runDetection() {
  const faceLandmarker = state.camera.faceLandmarker;
  const video = DOM.cameraPreview;

  // Make sure video is ready
  if (!faceLandmarker || !video || video.readyState < 2) return;

  // Run face detection on the current video frame
  const now = performance.now();
  let results;
  try {
    results = faceLandmarker.detectForVideo(video, now);
  } catch (err) {
    // Detection can fail if the video frame is not ready
    return;
  }
  
  // Calculate FPS
  frameCount++;
  const timeNow = Date.now();
  if (timeNow - lastFpsTime >= 1000) {
    DOM.liveFps.textContent = frameCount;
    frameCount = 0;
    lastFpsTime = timeNow;
  }

  const faceFound = results.faceLandmarks && results.faceLandmarks.length > 0;
  updatePipeline('Face', faceFound);
  
  // Draw canvas overlay if checked
  if (DOM.livePreviewCb.checked) {
    const canvas = DOM.liveCanvas;
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (faceFound && results.facialTransformationMatrixes && results.facialTransformationMatrixes.length > 0) {
      // Just draw a simple box using min/max of landmarks for the first face
      const landmarks = results.faceLandmarks[0];
      let minX = 1, minY = 1, maxX = 0, maxY = 0;
      for (const p of landmarks) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 4;
      ctx.strokeRect(minX * canvas.width, minY * canvas.height, (maxX - minX) * canvas.width, (maxY - minY) * canvas.height);
    }
  }

  if (faceFound) {
    // Get the first face's landmarks
    const landmarks = results.faceLandmarks[0];

    // Calculate raw head pose from landmarks
    const rawPose = calculateHeadPose(landmarks);

    // Smooth the signal (rolling average of last 5)
    const smoothed = smoothHeadPose(rawPose);

    state.headPose.yaw = smoothed.yaw;
    state.headPose.pitch = smoothed.pitch;
    state.headPose.faceDetected = true;
    state.headPose.lastFaceSeen = Date.now();
    
    DOM.liveYaw.textContent = Math.round(smoothed.yaw);
    DOM.livePitch.textContent = Math.round(smoothed.pitch);
    DOM.liveSinceFace.textContent = 0;

    // During calibration, just collect samples
    if (state.calibration.isCalibrating) {
      state.calibration.samples.push({ yaw: rawPose.yaw, pitch: rawPose.pitch });
      return;
    }

    // Calculate focus score and screen facing state
    const focusScore = calculateFocusScore(smoothed);
    const cutoff = state.settings.focusThreshold || 80;
    const isFacingScreen = focusScore >= cutoff;

    // ── Update the Focus gauge and head-position dot ──
    updateFocusIndicator(smoothed, focusScore);

    // Update Picture-in-Picture window in real time
    updatePiP(focusScore);

    // Update pipeline indicator for screen focus with live percentage
    if (DOM.pipeFocus) {
      if (isFacingScreen) {
        DOM.pipeFocus.textContent = `✅ Facing Screen (${focusScore}%)`;
        DOM.pipeFocus.classList.add('pipe-ok');
        DOM.pipeFocus.classList.remove('pipe-warn');
      } else {
        DOM.pipeFocus.textContent = `👀 Focus Low (${focusScore}% < ${cutoff}%)`;
        DOM.pipeFocus.classList.remove('pipe-ok');
        DOM.pipeFocus.classList.add('pipe-warn');
      }
    }

    // Update the state machine (stops suddenly if focusScore < cutoff)
    processDetectionResult(true, isFacingScreen, focusScore);

  } else {
    state.headPose.faceDetected = false;
    DOM.liveSinceFace.textContent = Math.round((Date.now() - state.headPose.lastFaceSeen) / 1000);

    // No face — reset focus indicators
    updateFocusIndicator(null, 0);
    updatePiP(0);
    if (DOM.pipeFocus) {
      DOM.pipeFocus.textContent = '❌ Facing Screen (No Face)';
      DOM.pipeFocus.classList.remove('pipe-ok', 'pipe-warn');
    }

    if (state.calibration.isCalibrating) return;

    processDetectionResult(false, false, 0);
  }
}

/**
 * Calculate the screen focus percentage (0–100%) from smoothed head pose.
 *
 * Uses a smooth power curve calibrated to human eye/head gaze:
 * - Micro-movements (0°–3.5°): 95%–100% (sitting and reading screen)
 * - Drifting gaze towards bezel / desk (4°–7°): 85%–94%
 * - Looking away from screen (8°+): drops rapidly to 0%
 *
 * @param {{ yaw: number, pitch: number }|null} pose
 * @returns {number} — percentage integer between 0 and 100
 */
function calculateFocusScore(pose) {
  if (!pose) return 0;

  const threshold = SENSITIVITY[state.settings.sensitivity] || 25;
  const neutralYaw = state.calibration.neutralYaw || 0;
  const neutralPitch = state.calibration.neutralPitch || 0;

  const yawDev = Math.abs(pose.yaw - neutralYaw);
  let pitchDev = Math.abs(pose.pitch - neutralPitch);
  if (state.settings.readingMode && pose.pitch > neutralPitch) {
    pitchDev = 0; // Ignore looking down in reading mode
  }

  // Pitch is slightly less restrictive than yaw since screens have vertical height
  const deviation = Math.hypot(yawDev, pitchDev * 0.85);
  const x = Math.min(1.0, deviation / threshold);

  // Power curve: stays >= 80% in comfortable screen cone, drops sharply once turned away
  const score = Math.max(0, Math.min(100, Math.round(100 * (1 - Math.pow(x, 1.5)))));
  return score;
}

/**
 * Check if the user is facing the screen based on head pose.
 *
 * @param {{ yaw: number, pitch: number }} pose — smoothed head pose
 * @returns {boolean} — true if focus score meets the configured threshold
 */
function isUserFacingScreen(pose) {
  const score = calculateFocusScore(pose);
  const cutoff = state.settings.focusThreshold || 80;
  return score >= cutoff;
}

/**
 * Update the on-screen focus indicator in the Live Tracking panel.
 *
 * @param {{ yaw: number, pitch: number }|null} pose — null when no face
 * @param {number} [focusScore] — precomputed focus percentage (0–100)
 */
function updateFocusIndicator(pose, focusScore) {
  if (!DOM.focusArc || !DOM.focusPctVal || !DOM.headPosDot) return;

  const threshold = SENSITIVITY[state.settings.sensitivity] || 25;
  const neutralYaw = state.calibration.neutralYaw || 0;
  const neutralPitch = state.calibration.neutralPitch || 0;
  const cutoff = state.settings.focusThreshold || 80;
  const CIRCUMFERENCE = 314.16; // 2π × 50

  if (!pose) {
    // No face — gauge at 0%
    DOM.focusArc.style.strokeDashoffset = CIRCUMFERENCE;
    DOM.focusArc.style.stroke = 'var(--danger)';
    DOM.focusPctVal.textContent = '0%';
    DOM.focusPctVal.style.color = 'var(--danger)';
    DOM.headPosDot.style.left = '50%';
    DOM.headPosDot.style.top = '50%';
    DOM.headPosDot.style.background = 'var(--danger)';
    DOM.headPosDot.style.opacity = '0.3';
    return;
  }

  const focusPct = typeof focusScore === 'number' ? focusScore : calculateFocusScore(pose);

  // Arc fill
  const offset = CIRCUMFERENCE - (CIRCUMFERENCE * focusPct / 100);
  DOM.focusArc.style.strokeDashoffset = offset;

  // Colour: green (>= cutoff) → warning/amber (>= 75%) → red (< 75%)
  const arcColour = focusPct >= cutoff
    ? 'var(--success)'
    : focusPct >= Math.max(60, cutoff - 15)
      ? 'var(--warning)'
      : 'var(--danger)';
  DOM.focusArc.style.stroke = arcColour;
  DOM.focusPctVal.textContent = focusPct + '%';
  DOM.focusPctVal.style.color = arcColour;

  // Head-position crosshair dot (50% = center of the grid)
  const xPct = 50 + ((pose.yaw   - neutralYaw)   / threshold) * 45;
  const yPct = 50 + ((pose.pitch - neutralPitch) / threshold) * 45;
  DOM.headPosDot.style.left = Math.min(95, Math.max(5, xPct)) + '%';
  DOM.headPosDot.style.top  = Math.min(95, Math.max(5, yPct)) + '%';
  DOM.headPosDot.style.background = arcColour;
  DOM.headPosDot.style.opacity = '1';
}


// ═══════════════════════════════════════════════
// 19. STATE MACHINE — Process detection results
// ═══════════════════════════════════════════════

/**
 * Process a detection result and update the app state.
 *
 * STATE TRANSITIONS:
 *
 * studying + face + focus >= threshold → stay studying
 * studying + face + focus < threshold → STOP SUDDENLY (looking-away)
 * studying + no face → STOP SUDDENLY (away)
 *
 * looking-away / away + face + focus >= threshold for 1s → resume studying
 *
 * @param {boolean} faceDetected — is a face visible?
 * @param {boolean} facingScreen — is focus >= threshold?
 * @param {number} [focusScore] — live focus percentage (0-100)
 */
function processDetectionResult(faceDetected, facingScreen, focusScore = 0) {
  const now = Date.now();
  const hp = state.headPose;
  const cutoff = state.settings.focusThreshold || 80;
  const isFocused = faceDetected && (focusScore >= cutoff);

  // ── STUDYING ──
  if (state.status === 'studying') {

    if (isFocused) {
      // All good — keep studying
      hp.lookAwayStart = 0;
      hp.awayStart = 0;
      hp.facingScreenSince = hp.facingScreenSince || now;
      return;
    }

    if (faceDetected && !isFocused) {
      // Face visible but focus dropped below cutoff (< 80%) — SUDDEN STOP!
      hp.facingScreenSince = 0;
      hp.lookAwayStart = now;

      freezeStudyTime(now);
      startPauseEvent('lookAway', now);
      setStatus('looking-away');
      state.session.distractions.lookAway++;
      triggerNudge('lookAway');
      updateSessionStatsDisplay();
      autoSaveSession();
      return;
    }

    if (!faceDetected) {
      // Face completely lost — SUDDEN STOP!
      hp.facingScreenSince = 0;
      hp.awayStart = now;
      hp.lookAwayStart = 0;

      freezeStudyTime(now);
      startPauseEvent('away', now);
      setStatus('away');
      state.session.distractions.away++;
      triggerNudge('away');
      updateSessionStatsDisplay();
      autoSaveSession();
      return;
    }
  }

  // ── LOOKING AWAY / AWAY / LID CLOSED — waiting to resume ──
  if (['looking-away', 'away', 'lid-closed'].includes(state.status)) {

    if (isFocused) {
      // User is back and focused on screen — require 1s of steady focus to resume
      if (hp.facingScreenSince === 0) {
        hp.facingScreenSince = now;
      }

      const facingDuration = now - hp.facingScreenSince;
      if (facingDuration >= 1000) {
        hp.lookAwayStart = 0;
        hp.awayStart = 0;
        endPauseEvent(now);
        resumeStudyTime(now);
        setStatus('studying');
        triggerNudge('resumed');
        autoSaveSession();
      }
    } else {
      hp.facingScreenSince = 0;
    }
    return;
  }
}

// ═══════════════════════════════════════════════
// 19B. TIMER ANCHORING — freeze and resume
// ═══════════════════════════════════════════════

/**
 * Freeze the study timer at an exact past timestamp.
 *
 * WHY: Instead of subtracting from studyTime after the fact (which
 * can drift when tick gaps are capped), we compute the exact amount
 * of study time that elapsed before the pause started and store it
 * in accStudyMs. studyStartedAt is cleared to signal "paused".
 *
 * @param {number} pauseAt — wall-clock ms when the pause actually began
 */
function freezeStudyTime(pauseAt) {
  const s = state.session;
  if (s.studyStartedAt === null) return; // already frozen
  s.accStudyMs += Math.max(0, pauseAt - s.studyStartedAt);
  s.studyTime = s.accStudyMs;
  s.studyStartedAt = null;
}

function resumeStudyTime(resumeAt) {
  state.session.studyStartedAt = resumeAt;
}

/**
 * Open a new pause event in the session's pauses list.
 * The event is closed by endPauseEvent when study resumes.
 */
function startPauseEvent(type, timestamp) {
  state.session.pauses.push({ type, start: timestamp, end: null });
}

/**
 * Close the most-recent open pause event.
 */
function endPauseEvent(timestamp) {
  const open = state.session.pauses.slice().reverse().find(p => p.end === null);
  if (open) open.end = timestamp;
}


// ═══════════════════════════════════════════════
// 20. SESSION STATS DISPLAY
// ═══════════════════════════════════════════════

/**
 * Update the quick stats shown during an active session.
 */
function updateSessionStatsDisplay() {
  const s = state.session;
  const totalDistractions = s.distractions.lookAway + s.distractions.away + s.distractions.lidClosed;
  if (DOM.statDistractions) DOM.statDistractions.textContent = totalDistractions;
  if (DOM.homeDistractions) DOM.homeDistractions.textContent = totalDistractions;

  // Focus % = study time / session time
  const focusPercent = s.sessionTime > 0 ? Math.round((s.studyTime / s.sessionTime) * 100) : 100;
  if (DOM.statFocus) DOM.statFocus.textContent = focusPercent + '%';
  if (DOM.homeFocus) DOM.homeFocus.textContent = focusPercent + '%';

  // Hero subtimes: Session time and Paused time
  const pausedMs = Math.max(0, s.sessionTime - s.studyTime - (s.unverifiedTime || 0));
  if (DOM.statSessionTime) DOM.statSessionTime.textContent = formatTime(s.sessionTime);
  if (DOM.statPausedTime) DOM.statPausedTime.textContent = formatTime(pausedMs);
}


// ═══════════════════════════════════════════════
// 21. WORKER — Heartbeat ticker
// ═══════════════════════════════════════════════

/**
 * Start the Web Worker that sends 1-second heartbeat ticks.
 * We use a worker because Chrome throttles setTimeout/setInterval
 * to once per minute when a tab is hidden.
 */
function startWorker() {
  if (state.worker) return;

  state.worker = new Worker('./worker.js');
  state.lastTickTimestamp = Date.now();

  state.worker.onmessage = (e) => {
    if (e.data.type === 'tick') {
      handleTick(e.data);
    }
  };

  state.worker.postMessage('start');
  console.log('⏱ Worker started');
}

/**
 * Stop the Web Worker.
 */
function stopWorker() {
  if (state.worker) {
    state.worker.postMessage('stop');
    state.worker.terminate();
    state.worker = null;
  }
  console.log('⏱ Worker stopped');
}

/**
 * Handle a tick from the worker.
 * This runs every ~1 second. We use it to:
 * - Update the timer display
 * - Detect heartbeat gaps (lid close / sleep)
 * - Update session time counters
 *
 * @param {{ timestamp: number, gap: number }} data
 */
function handleTick(data) {
  const now = data.timestamp;
  const gap = data.gap;
  
  updatePipeline('Worker', true);

  // ── Detect lid close via heartbeat gap ──
  // A gap much bigger than 1 s means the laptop was asleep or the lid was closed.
  if (gap > CONFIG.lidGapMs && state.session.active && state.status !== 'idle') {

    if (state.status !== 'lid-closed') {
      freezeStudyTime(state.lastTickTimestamp);
      startPauseEvent('lidClosed', state.lastTickTimestamp);
      setStatus('lid-closed');
      state.headPose.faceDetected = false;
      state.headPose.facingScreenSince = 0;
      state.session.distractions.lidClosed++;

      const awayMinutes = Math.round(gap / 60000);
      const awayText = awayMinutes >= 1
        ? `${awayMinutes} minute${awayMinutes > 1 ? 's' : ''}`
        : `${Math.round(gap / 1000)} seconds`;

      const msg = `You were away for about ${awayText}. Timer was paused.`;
      showAlert('welcome-back', '👋', `<strong>Welcome back!</strong> ${msg}`);
      playSoftChime();
      if (state.settings.notificationsOn && Notification.permission === 'granted') {
        new Notification('Ayush_Tracker', { body: `Welcome back! ${msg}`, icon: './icons/icon-192.png' });
      }
      updateSessionStatsDisplay();
      autoSaveSession();
    }
  }

  // ── Update timer display ──
  if (state.session.active) {
    state.session.sessionTime = now - state.session.startTime;

    // Recompute studyTime from the wall-clock anchor so there is one source of truth.
    if (state.status === 'studying' && state.session.studyStartedAt !== null) {
      const isStalled = state.camera.isDetecting &&
                        (now - state.camera.lastDetectionTime > CONFIG.stallThresholdMs);

      if (isStalled) {
        // Tab is backgrounded and detection stopped. Freeze the anchor so we
        // don't count unverified time, but track how much was skipped.
        state.session.unverifiedTime += gap;
        // Keep studyStartedAt fixed — do not advance accStudyMs yet.
      } else {
        state.session.studyTime = state.session.accStudyMs +
                                  (now - state.session.studyStartedAt);
      }
    }

    DOM.timerDisplay.textContent = formatTime(state.session.studyTime);
    updateSessionStatsDisplay();
    updatePiP();

    if (DOM.liveSession) DOM.liveSession.textContent = Math.round(state.session.sessionTime / 1000);
    if (DOM.liveStudy) DOM.liveStudy.textContent   = Math.round(state.session.studyTime   / 1000);
    if (DOM.livePauses) DOM.livePauses.textContent  =
      state.session.distractions.lookAway +
      state.session.distractions.away +
      state.session.distractions.lidClosed;
  }

  state.lastTickTimestamp = now;
}


// ═══════════════════════════════════════════════
// 22. SESSION — Start / End
// ═══════════════════════════════════════════════

async function handleStart() {
  DOM.startBtn.disabled = true;
  hideLiveError();
  logEvent('Start button clicked');
  DOM.startBtn.innerHTML = '<span class="btn-icon">⏳</span> Starting…';

  // Unlock AudioContext on user gesture (browsers require this)
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  if (!state.camera.faceLandmarker) {
    DOM.startBtn.innerHTML = '<span class="btn-icon">⏳</span> Loading AI Model…';
    const landmarkerReady = await initFaceLandmarker();
    if (!landmarkerReady) {
      DOM.startBtn.disabled = false;
      DOM.startBtn.innerHTML = '<span class="btn-icon">▶</span> Start Studying';
      return;
    }
  }

  DOM.startBtn.innerHTML = '<span class="btn-icon">⏳</span> Waiting for Camera…';
  const cameraReady = await startCamera();
  if (!cameraReady) {
    DOM.startBtn.disabled = false;
    DOM.startBtn.innerHTML = '<span class="btn-icon">▶</span> Start Studying';
    return;
  }

  startDetectionLoop();

  DOM.startBtn.innerHTML = '<span class="btn-icon">⏳</span> Waiting for Face…';
  await new Promise(r => setTimeout(r, 500));
  const calibrated = await runCalibration();
  if (!calibrated) {
    stopDetectionLoop();
    stopCamera();
    DOM.startBtn.disabled = false;
    DOM.startBtn.innerHTML = '<span class="btn-icon">▶</span> Start Studying';
    return;
  }

  startWorker();

  const now = Date.now();
  state.session = {
    active: true,
    id: 'sess_' + now,         // stable id so every autosave upserts the same row
    startTime: now,
    studyStartedAt: now,
    accStudyMs: 0,
    studyTime: 0,
    sessionTime: 0,
    unverifiedTime: 0,
    distractions: { lookAway: 0, away: 0, lidClosed: 0 },
    pauses: [],
  };

  state.headPose.lookAwayStart = 0;
  state.headPose.awayStart = 0;
  state.headPose.facingScreenSince = now;

  DOM.startBtn.classList.add('hidden');
  DOM.endBtn.classList.remove('hidden');
  if (DOM.sessionStats) DOM.sessionStats.classList.add('visible');
  DOM.timerDisplay.textContent = '00:00:00';
  if (DOM.statSessionTime) DOM.statSessionTime.textContent = '00:00:00';
  if (DOM.statPausedTime) DOM.statPausedTime.textContent = '00:00:00';
  setStatus('studying');
  hideAlert();

  DOM.startBtn.disabled = false;
  DOM.startBtn.innerHTML = '<span class="btn-icon">▶</span> Start Studying';

  // First save creates the row immediately so recovery can find it.
  await autoSaveSession();

  // Autosave every 15 seconds while a session is active.
  state.autoSaveInterval = setInterval(autoSaveSession, 15000);
}

function handleEnd() {
  clearInterval(state.autoSaveInterval);

  // Set session inactive FIRST so no incoming worker ticks or events can advance it
  state.session.active = false;

  stopDetectionLoop();
  stopCamera();
  stopWorker();

  // Freeze at end time so studyTime is final before we read it.
  const endTime = Date.now();
  if (state.status === 'studying') freezeStudyTime(endTime);
  // Close any open pause event.
  endPauseEvent(endTime);

  const finalStudyTime  = state.session.studyTime;
  const finalSessionTime = endTime - state.session.startTime;

  DOM.startBtn.classList.remove('hidden');
  DOM.endBtn.classList.add('hidden');
  if (DOM.sessionStats) DOM.sessionStats.classList.remove('visible');
  if (DOM.statSessionTime) DOM.statSessionTime.textContent = '00:00:00';
  if (DOM.statPausedTime) DOM.statPausedTime.textContent = '00:00:00';
  DOM.timerDisplay.textContent = formatTime(finalStudyTime);
  setStatus('idle');
  hideAlert();

  showToast('info', 'Session ended',
    `You studied for ${formatDuration(finalStudyTime)}. Great work! 🎉`);

  // Final save with endTime set.
  const record = buildSessionRecord(endTime);
  DB.saveSession(record)
    .then(() => refreshDashboard())
    .catch(e => showToast('error', 'Save failed', 'Could not save session: ' + e));
}

// ═══════════════════════════════════════════════
// 22B. SESSION PERSISTENCE HELPERS
// ═══════════════════════════════════════════════

/**
 * Build a plain-object record from live session state.
 * @param {number|null} endTime — if set, this is the final save.
 */
function buildSessionRecord(endTime = null) {
  const s = state.session;
  const now = endTime || Date.now();

  // Compute live studyTime if we are currently studying.
  let studyTime = s.accStudyMs;
  if (s.studyStartedAt !== null) {
    studyTime += Math.max(0, now - s.studyStartedAt);
  }
  const sessionTime = s.startTime ? now - s.startTime : 0;
  const pausedTime  = Math.max(0, sessionTime - studyTime - s.unverifiedTime);

  return {
    id:            s.id,
    startTime:     s.startTime,
    endTime:       endTime,          // null means unfinished
    studyTime,
    sessionTime,
    pausedTime,
    unverifiedTime: s.unverifiedTime,
    distractions:  { ...s.distractions },
    pauses:        s.pauses.map(p => ({ ...p })),
    lastSaved:     Date.now(),
  };
}

/**
 * Upsert the live session into IndexedDB.
 * Shows a toast if storage fails so errors are never silent.
 */
async function autoSaveSession() {
  if (!state.session.active) return;
  try {
    await DB.saveSession(buildSessionRecord());
  } catch (e) {
    showToast('error', 'Auto-save failed',
      'Could not save your session to storage. ' + (e?.message || e));
  }
}

/**
 * On startup, find sessions that have no endTime (the app was closed
 * mid-session). Close them at their lastSaved timestamp so they appear
 * in the history with accurate data rather than disappearing.
 */
async function recoverUnfinishedSessions() {
  try {
    const all = await DB.getAllSessions(true);
    const unfinished = all.filter(s => s.endTime === null);
    if (unfinished.length === 0) return;

    for (const s of unfinished) {
      s.endTime = s.lastSaved || s.startTime;
      s.sessionTime = s.endTime - s.startTime;
      s.pausedTime = Math.max(0, s.sessionTime - s.studyTime - (s.unverifiedTime || 0));
      if (Array.isArray(s.pauses)) {
        s.pauses.forEach(p => {
          if (p.end === null) p.end = s.endTime;
        });
      }
      await DB.saveSession(s);
    }
    showToast('info', `Recovered ${unfinished.length} session${unfinished.length > 1 ? 's' : ''}`,
      'A previous session was closed unexpectedly. It has been saved.');
  } catch (e) {
    showToast('error', 'Recovery failed', 'Could not recover previous session: ' + (e?.message || e));
  }
}


// ═══════════════════════════════════════════════
// 22C. DATABASE (IndexedDB)
// ═══════════════════════════════════════════════

const DB = {
  db: null,
  name: 'ayush-tracker-db',
  version: 1,

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, this.version);
      request.onerror   = (e) => reject('IndexedDB error: ' + e.target.error);
      request.onsuccess = async (e) => {
        this.db = e.target.result;
        try {
          await this.migrateFromOldDb();
        } catch (_) {}
        resolve();
      };
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('sessions')) {
          const store = db.createObjectStore('sessions', { keyPath: 'id' });
          store.createIndex('startTime', 'startTime', { unique: false });
        }
      };
    });
  },

  async migrateFromOldDb() {
    try {
      if (!('databases' in indexedDB)) return;
      const dbs = await indexedDB.databases();
      const oldDbExists = dbs.some(d => d.name === 'ai-spectator-db');
      if (!oldDbExists) return;

      const hasData = await new Promise(res => {
        const tx = this.db.transaction(['sessions'], 'readonly');
        const req = tx.objectStore('sessions').count();
        req.onsuccess = () => res(req.result > 0);
        req.onerror = () => res(false);
      });
      if (hasData) return;

      const openReq = indexedDB.open('ai-spectator-db');
      openReq.onsuccess = (e) => {
        const oldDb = e.target.result;
        if (!oldDb.objectStoreNames.contains('sessions')) {
          oldDb.close();
          return;
        }
        const tx = oldDb.transaction(['sessions'], 'readonly');
        const req = tx.objectStore('sessions').getAll();
        req.onsuccess = () => {
          const oldSessions = req.result || [];
          if (oldSessions.length > 0) {
            const newTx = this.db.transaction(['sessions'], 'readwrite');
            const newStore = newTx.objectStore('sessions');
            oldSessions.forEach(s => newStore.put(s));
          }
          oldDb.close();
        };
        req.onerror = () => oldDb.close();
      };
    } catch (_) {}
  },

  async saveSession(data) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx    = this.db.transaction(['sessions'], 'readwrite');
      const store = tx.objectStore('sessions');
      // put() inserts or replaces, so autosave can overwrite earlier drafts.
      const req   = store.put(data);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  },

  async getAllSessions(includeUnfinished = false) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx    = this.db.transaction(['sessions'], 'readonly');
      const store = tx.objectStore('sessions');
      const req   = store.index('startTime').getAll();
      req.onsuccess = () => {
        let results = req.result;
        if (!includeUnfinished) {
          results = results.filter(s => s.endTime !== null);
        }
        resolve(results.sort((a, b) => b.startTime - a.startTime));
      };
      req.onerror = () => reject(req.error);
    });
  },

  async clearAll() {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx  = this.db.transaction(['sessions'], 'readwrite');
      const req = tx.objectStore('sessions').clear();
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  },
};


// ═══════════════════════════════════════════════
// 23. DASHBOARD — Placeholder
// ═══════════════════════════════════════════════

async function refreshDashboard() {
  DOM.dailyGoalDisplay.textContent = state.settings.dailyGoal + 'h';
  
  try {
    const sessions = await DB.getAllSessions();
    buildDashboardStats(sessions);
    buildChart(sessions);
    buildSessionList(sessions);
  } catch (e) {
    console.error('Failed to load dashboard data:', e);
  }
}

function buildDashboardStats(sessions) {
  // Aggregate today's stats
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  
  let todayStudy = 0;
  let todaySession = 0;
  let todayDist = { lookAway: 0, away: 0, lidClosed: 0 };
  
  // Aggregate this week's stats
  const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1; // 0=Mon, 6=Sun
  const startOfWeek = startOfToday - (dayOfWeek * 86400000);
  let weeklyStudy = 0;

  // Track daily totals for streak calculation
  const dailyTotals = {};

  sessions.forEach(s => {
    // Determine the day string YYYY-MM-DD (local time approximation)
    const dateStr = new Date(s.startTime - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    dailyTotals[dateStr] = (dailyTotals[dateStr] || 0) + s.studyTime;

    if (s.startTime >= startOfToday) {
      todayStudy += s.studyTime;
      todaySession += s.sessionTime;
      todayDist.lookAway += s.distractions.lookAway;
      todayDist.away += s.distractions.away;
      todayDist.lidClosed += s.distractions.lidClosed;
    }
    
    if (s.startTime >= startOfWeek) {
      weeklyStudy += s.studyTime;
    }
  });

  // Update UI Stats
  if (DOM.dashStudyTime) DOM.dashStudyTime.textContent = formatDuration(todayStudy);
  
  const focusPercent = todaySession > 0 ? Math.round((todayStudy / todaySession) * 100) : 100;
  if (DOM.dashFocus) DOM.dashFocus.textContent = focusPercent + '%';
  
  const totalDist = todayDist.lookAway + todayDist.away + todayDist.lidClosed;
  if (DOM.dashDistractions) DOM.dashDistractions.textContent = totalDist;
  
  if (DOM.distLookAway) DOM.distLookAway.textContent = todayDist.lookAway;
  if (DOM.distAway) DOM.distAway.textContent = todayDist.away;
  if (DOM.distLid) DOM.distLid.textContent = todayDist.lidClosed;
  
  if (DOM.weeklyTotal) DOM.weeklyTotal.textContent = formatDuration(weeklyStudy);

  // Update Summary cards on Home
  if (DOM.homeStudyTime) DOM.homeStudyTime.textContent = formatDuration(todayStudy);
  if (DOM.homeFocus) DOM.homeFocus.textContent = focusPercent + '%';
  if (DOM.homeDistractions) DOM.homeDistractions.textContent = totalDist;

  // Calculate Streak
  let streak = 0;
  const goalMs = state.settings.dailyGoal * 3600000;
  
  for (let i = 0; i < 365; i++) {
    const d = new Date(startOfToday - (i * 86400000));
    const dStr = new Date(d.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    const studied = dailyTotals[dStr] || 0;
    
    if (i === 0 && studied < goalMs) {
      continue;
    }
    
    if (studied >= goalMs) {
      streak++;
    } else {
      break;
    }
  }
  
  if (DOM.streakBadge) DOM.streakBadge.textContent = `🔥 ${streak} Day Streak`;
  if (DOM.homeStreakBadge) DOM.homeStreakBadge.textContent = `🔥 ${streak} Day Streak`;

  // Daily goal progress on Home
  const goalPct = Math.min(100, Math.round((todayStudy / goalMs) * 100));
  if (DOM.goalProgressText) {
    DOM.goalProgressText.textContent = `${(todayStudy / 3600000).toFixed(1)}h of ${state.settings.dailyGoal}h (${goalPct}%)`;
  }
  if (DOM.goalProgressBar) {
    DOM.goalProgressBar.style.width = goalPct + '%';
  }

  // Render recent sessions on Home
  renderRecentSessions(sessions);
}

function renderRecentSessions(sessions) {
  if (!DOM.homeRecentSessions) return;
  const recent = sessions.slice(0, 3);
  if (recent.length === 0) {
    DOM.homeRecentSessions.innerHTML = '<div class="empty-recent-item">No sessions completed yet</div>';
    return;
  }
  DOM.homeRecentSessions.innerHTML = recent.map(s => {
    const focusPct = s.sessionTime > 0 ? Math.round((s.studyTime / s.sessionTime) * 100) : 100;
    const totalDist = (s.distractions?.lookAway || 0) + (s.distractions?.away || 0) + (s.distractions?.lidClosed || 0);
    return `
      <div class="recent-session-item">
        <div class="recent-session-info">
          <div class="recent-session-date">${new Date(s.startTime).toLocaleDateString()} &bull; ${formatTimestamp(s.startTime)}</div>
          <div class="recent-session-meta">Focus: ${focusPct}% &bull; ${totalDist} dist.</div>
        </div>
        <div class="recent-session-dur">${formatDuration(s.studyTime)}</div>
      </div>
    `;
  }).join('');
}

function buildChart(sessions) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const currentDayIdx = now.getDay() === 0 ? 6 : now.getDay() - 1; // 0=Mon, 6=Sun
  const startOfWeek = startOfToday - (currentDayIdx * 86400000);

  // Group by day of week
  const weekData = [0, 0, 0, 0, 0, 0, 0];
  
  sessions.forEach(s => {
    if (s.startTime >= startOfWeek && s.startTime < startOfWeek + (7 * 86400000)) {
      const d = new Date(s.startTime);
      const idx = d.getDay() === 0 ? 6 : d.getDay() - 1;
      weekData[idx] += s.studyTime;
    }
  });

  const goalMs = state.settings.dailyGoal * 3600000;

  DOM.chartContainer.innerHTML = '';
  days.forEach((day, i) => {
    const studyMs = weekData[i];
    const studyHours = studyMs / 3600000;
    
    // Cap bar at 150% of goal visually
    const percent = Math.min((studyMs / goalMs) * 100, 150);

    const wrapper = document.createElement('div');
    wrapper.className = 'chart-bar-wrapper';

    const hours = document.createElement('div');
    hours.className = 'chart-hours';
    hours.textContent = studyHours > 0 ? (Math.round(studyHours * 10) / 10) + 'h' : '0h';

    const track = document.createElement('div');
    track.className = 'chart-bar-track';
    const bar = document.createElement('div');
    bar.className = 'chart-bar';
    bar.style.height = percent + '%';
    if (studyMs >= goalMs) bar.style.background = 'var(--success-color)';
    track.appendChild(bar);

    const label = document.createElement('div');
    label.className = `chart-day ${i === currentDayIdx ? 'today' : ''}`;
    label.textContent = day;

    wrapper.appendChild(hours);
    wrapper.appendChild(track);
    wrapper.appendChild(label);
    DOM.chartContainer.appendChild(wrapper);
  });
}

function buildSessionList(sessions) {
  DOM.sessionList.innerHTML = '';

  if (sessions.length === 0) {
    DOM.sessionList.innerHTML =
      '<p style="padding:1rem;color:var(--text-secondary)">No sessions yet. Start studying!</p>';
    return;
  }

  sessions.slice(0, 20).forEach(s => {
    const focusPct  = s.sessionTime > 0
      ? Math.round((s.studyTime / s.sessionTime) * 100) : 100;
    const totalDist = (s.distractions?.lookAway || 0) +
                      (s.distractions?.away      || 0) +
                      (s.distractions?.lidClosed || 0);
    const endStr    = s.endTime ? formatTimestamp(s.endTime) : '?';

    const item = document.createElement('div');
    item.className = 'session-item';
    item.style.cssText = 'display:flex;justify-content:space-between;align-items:center;' +
                         'padding:12px 16px;border-bottom:1px solid var(--border-color)';
    item.innerHTML = `
      <div>
        <div style="font-weight:500">
          ${new Date(s.startTime).toLocaleDateString()}
          &nbsp;– ${formatTimestamp(s.startTime)} – ${endStr}
        </div>
        <div style="font-size:0.82rem;color:var(--text-secondary);margin-top:2px">
          Focus ${focusPct}% &middot;
          ${totalDist} distraction${totalDist !== 1 ? 's' : ''}
        </div>
      </div>
      <div style="font-weight:600;color:var(--primary-color);text-align:right">
        <div>${formatDuration(s.studyTime)}</div>
        <div style="font-size:0.8rem;font-weight:400;color:var(--text-secondary)">
          of ${formatDuration(s.sessionTime)}
        </div>
      </div>`;
    DOM.sessionList.appendChild(item);
  });
}


// ═══════════════════════════════════════════════
// 24. PiP — Document Picture-in-Picture
// ═══════════════════════════════════════════════

function initPiP() {
  if ('documentPictureInPicture' in window) {
    DOM.pipBtn.classList.add('supported');
  }
}

async function togglePiP() {
  if (!('documentPictureInPicture' in window)) return;

  if (state.pipWindow) {
    state.pipWindow.close();
    return;
  }

  try {
    state.pipWindow = await documentPictureInPicture.requestWindow({
      width: 320,
      height: 190,
    });
    
    // Copy parent document stylesheets into the PiP window
    [...document.styleSheets].forEach((styleSheet) => {
      try {
        const cssRules = [...styleSheet.cssRules].map((rule) => rule.cssText).join('');
        const style = document.createElement('style');
        style.textContent = cssRules;
        state.pipWindow.document.head.appendChild(style);
      } catch (e) {
        if (styleSheet.href) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = styleSheet.href;
          state.pipWindow.document.head.appendChild(link);
        }
      }
    });

    // Injected dedicated inline styles for bulletproof PiP color transitions & animations
    const customStyle = document.createElement('style');
    customStyle.textContent = `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        margin: 0; padding: 0; overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        background: #090d16; color: #f1f5f9; user-select: none; height: 100vh;
      }
      .pip-root {
        display: flex; flex-direction: column; justify-content: space-between; align-items: center;
        height: 100vh; padding: 12px 16px; position: relative;
        transition: background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
        border: 3px solid transparent; box-sizing: border-box; overflow: hidden;
      }
      .pip-root[data-status="studying"] {
        background: radial-gradient(circle at center, #0d281e 0%, #061114 100%);
        border-color: #10b981;
        box-shadow: inset 0 0 25px rgba(16, 185, 129, 0.25), 0 0 15px rgba(16, 185, 129, 0.3);
      }
      .pip-root[data-status="studying"] .pip-timer {
        color: #10b981; text-shadow: 0 0 28px rgba(16, 185, 129, 0.6);
      }
      .pip-root[data-status="studying"] .pip-badge {
        background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.5);
      }
      .pip-root[data-status="studying"] .pip-badge-dot {
        background: #10b981; box-shadow: 0 0 8px #10b981;
      }
      .pip-root[data-status="looking-away"] {
        background: radial-gradient(circle at center, #36140b 0%, #170705 100%);
        border-color: #f59e0b;
        box-shadow: inset 0 0 35px rgba(245, 158, 11, 0.45), 0 0 25px rgba(245, 158, 11, 0.5);
        animation: pip-alert-amber 0.9s ease-in-out infinite alternate;
      }
      .pip-root[data-status="looking-away"] .pip-timer {
        color: #f59e0b; text-shadow: 0 0 28px rgba(245, 158, 11, 0.8);
      }
      .pip-root[data-status="looking-away"] .pip-badge {
        background: #f59e0b; color: #000000; font-weight: 700; border: 1px solid #fbbf24;
      }
      .pip-root[data-status="looking-away"] .pip-badge-dot { background: #000000; }
      .pip-root[data-status="looking-away"] .pip-alert-banner {
        display: flex !important; background: rgba(245, 158, 11, 0.25); color: #fbbf24; border-color: rgba(245, 158, 11, 0.5);
      }
      .pip-root[data-status="away"], .pip-root[data-status="lid-closed"] {
        background: radial-gradient(circle at center, #380812 0%, #190308 100%);
        border-color: #ef4444;
        box-shadow: inset 0 0 45px rgba(239, 68, 68, 0.55), 0 0 30px rgba(239, 68, 68, 0.65);
        animation: pip-alert-red 0.8s ease-in-out infinite alternate;
      }
      .pip-root[data-status="away"] .pip-timer, .pip-root[data-status="lid-closed"] .pip-timer {
        color: #ef4444; text-shadow: 0 0 28px rgba(239, 68, 68, 0.9);
      }
      .pip-root[data-status="away"] .pip-badge, .pip-root[data-status="lid-closed"] .pip-badge {
        background: #ef4444; color: #ffffff; font-weight: 700; border: 1px solid #f87171;
      }
      .pip-root[data-status="away"] .pip-badge-dot, .pip-root[data-status="lid-closed"] .pip-badge-dot {
        background: #ffffff; box-shadow: 0 0 8px #ffffff;
      }
      .pip-root[data-status="away"] .pip-alert-banner, .pip-root[data-status="lid-closed"] .pip-alert-banner {
        display: flex !important; background: rgba(239, 68, 68, 0.3); color: #fca5a5; border-color: rgba(239, 68, 68, 0.6);
      }
      .pip-root[data-status="idle"], .pip-root[data-status="calibrating"] {
        background: #0f172a; border-color: #334155;
      }
      .pip-root[data-status="idle"] .pip-timer { color: #94a3b8; }
      .pip-root[data-status="idle"] .pip-badge {
        background: #1e293b; color: #94a3b8; border: 1px solid #334155;
      }
      .pip-header { width: 100%; display: flex; justify-content: space-between; align-items: center; }
      .pip-badge {
        display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 9999px;
        font-size: 0.72rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; transition: all 0.25s ease;
      }
      .pip-badge-dot { width: 7px; height: 7px; border-radius: 50%; }
      .pip-focus-tag {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 0.72rem; color: #94a3b8; font-weight: 600;
      }
      .pip-timer {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 3.2rem; font-weight: 700; letter-spacing: -0.04em; line-height: 1; margin: 4px 0;
        transition: color 0.25s ease, text-shadow 0.25s ease;
      }
      .pip-alert-banner {
        width: 100%; display: none; align-items: center; justify-content: center; gap: 6px;
        padding: 4px 8px; border-radius: 6px; font-size: 0.74rem; font-weight: 700;
        letter-spacing: 0.04em; border: 1px solid transparent;
      }
      @keyframes pip-alert-amber {
        0% { border-color: #f59e0b; box-shadow: inset 0 0 25px rgba(245, 158, 11, 0.3), 0 0 15px rgba(245, 158, 11, 0.4); }
        100% { border-color: #fbbf24; box-shadow: inset 0 0 50px rgba(245, 158, 11, 0.65), 0 0 35px rgba(245, 158, 11, 0.8); }
      }
      @keyframes pip-alert-red {
        0% { border-color: #ef4444; box-shadow: inset 0 0 30px rgba(239, 68, 68, 0.35), 0 0 20px rgba(239, 68, 68, 0.45); }
        100% { border-color: #ff3333; box-shadow: inset 0 0 60px rgba(239, 68, 68, 0.8), 0 0 45px rgba(239, 68, 68, 0.95); }
      }
    `;
    state.pipWindow.document.head.appendChild(customStyle);

    state.pipWindow.document.body.innerHTML = `
      <div id="pip-container" class="pip-root" data-status="${state.status}">
        <div class="pip-header">
          <div id="pip-status-chip" class="pip-badge" data-status="${state.status}">
            <span class="pip-badge-dot"></span>
            <span id="pip-status-text">${DOM.statusText.textContent}</span>
          </div>
          <div id="pip-focus-tag" class="pip-focus-tag">Focus: 100%</div>
        </div>

        <div id="pip-timer" class="pip-timer" data-status="${state.status}">
          ${DOM.timerDisplay.textContent}
        </div>

        <div id="pip-alert-banner" class="pip-alert-banner">
          <span id="pip-alert-icon">⚠️</span>
          <span id="pip-alert-text">TIMER PAUSED — LOOKING AWAY</span>
        </div>
      </div>
    `;

    state.pipWindow.document.documentElement.setAttribute('data-theme', state.theme);

    state.pipWindow.addEventListener('pagehide', () => {
      state.pipWindow = null;
    });

    updatePiP();

  } catch (err) {
    console.error('Failed to enter PiP:', err);
    showToast('error', 'PiP Failed', 'Could not open mini window.');
  }
}

/**
 * Update the floating Picture-in-Picture window with high-contrast status colors and alert banners.
 *
 * @param {number} [focusScore] — live focus percentage (0-100)
 */
function updatePiP(focusScore) {
  if (!state.pipWindow) return;
  const container = state.pipWindow.document.getElementById('pip-container');
  const timerEl = state.pipWindow.document.getElementById('pip-timer');
  const chipEl = state.pipWindow.document.getElementById('pip-status-chip');
  const textEl = state.pipWindow.document.getElementById('pip-status-text');
  const alertEl = state.pipWindow.document.getElementById('pip-alert-banner');
  const alertTextEl = state.pipWindow.document.getElementById('pip-alert-text');
  const alertIconEl = state.pipWindow.document.getElementById('pip-alert-icon');
  const focusTagEl = state.pipWindow.document.getElementById('pip-focus-tag');
  
  const cutoff = state.settings.focusThreshold ?? 80;
  const score = typeof focusScore === 'number'
    ? focusScore
    : (state.headPose.faceDetected ? calculateFocusScore(state.headPose) : 0);

  if (container) container.setAttribute('data-status', state.status);
  if (chipEl) chipEl.setAttribute('data-status', state.status);

  if (timerEl) {
    timerEl.textContent = DOM.timerDisplay.textContent;
    timerEl.setAttribute('data-status', state.status);
  }

  if (textEl) {
    if (state.status === 'studying') textEl.textContent = 'Studying';
    else if (state.status === 'looking-away') textEl.textContent = 'Paused — Looking Away';
    else if (state.status === 'away') textEl.textContent = 'Paused — No Face';
    else if (state.status === 'lid-closed') textEl.textContent = 'Paused — Sleeping';
    else textEl.textContent = DOM.statusText.textContent || 'Idle';
  }

  if (focusTagEl) {
    if (state.headPose.faceDetected) {
      focusTagEl.textContent = `Focus: ${score}%`;
      focusTagEl.style.color = score >= cutoff ? '#34d399' : '#f87171';
    } else {
      focusTagEl.textContent = 'No Face';
      focusTagEl.style.color = '#f87171';
    }
  }

  if (alertEl && alertTextEl) {
    if (state.status === 'looking-away') {
      alertEl.style.display = 'flex';
      if (alertIconEl) alertIconEl.textContent = '👀';
      alertTextEl.textContent = `PAUSED: FOCUS ${score}% < ${cutoff}%`;
    } else if (state.status === 'away') {
      alertEl.style.display = 'flex';
      if (alertIconEl) alertIconEl.textContent = '❌';
      alertTextEl.textContent = 'PAUSED: NO FACE DETECTED';
    } else if (state.status === 'lid-closed') {
      alertEl.style.display = 'flex';
      if (alertIconEl) alertIconEl.textContent = '💤';
      alertTextEl.textContent = 'PAUSED: LAPTOP ASLEEP';
    } else {
      alertEl.style.display = 'none';
    }
  }
}


// ═══════════════════════════════════════════════
// 25. SERVICE WORKER REGISTRATION
// ═══════════════════════════════════════════════

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register('./sw.js');
    console.log('Service worker registered:', registration.scope);
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'activated') {
            showToast('info', 'App updated', 'Ayush_Tracker has been updated. Refresh for the latest version.');
          }
        });
      }
    });
  } catch (error) {
    console.error('Service worker registration failed:', error);
  }
}


// ═══════════════════════════════════════════════
// 26. DASHBOARD DATA ACTIONS — Stubs (Step 5)
// ═══════════════════════════════════════════════

async function handleExportCSV() {
  try {
    const sessions = await DB.getAllSessions();
    if (sessions.length === 0) {
      showToast('warning', 'No Data', 'There is no study data to export.');
      return;
    }
    
    let csv = 'ID,Start Time,End Time,Study Time (ms),Session Time (ms),Unverified Time (ms),Look Aways,Aways,Lid Closed\n';
    
    sessions.forEach(s => {
      csv += `${s.id},`;
      csv += `"${new Date(s.startTime).toISOString()}",`;
      csv += `"${new Date(s.endTime).toISOString()}",`;
      csv += `${s.studyTime},${s.sessionTime},${s.unverifiedTime || 0},`;
      csv += `${s.distractions.lookAway},${s.distractions.away},${s.distractions.lidClosed}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ayush-tracker-data-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('success', 'Exported!', 'Your study data has been downloaded.');
  } catch (e) {
    console.error('Export failed:', e);
    showToast('error', 'Export failed', 'Could not export data.');
  }
}

async function handleDeleteAll() {
  if (confirm('Delete all study data? This cannot be undone.')) {
    try {
      await DB.clearAll();
      showToast('warning', 'Data cleared', 'All study data has been deleted.');
      refreshDashboard();
    } catch (e) {
      console.error('Clear failed:', e);
      showToast('error', 'Clear failed', 'Could not delete data.');
    }
  }
}


// ═══════════════════════════════════════════════
// 27. EVENT LISTENERS
// ═══════════════════════════════════════════════

function attachEventListeners() {
  // Privacy modal
  DOM.privacyAcceptBtn.addEventListener('click', acceptPrivacy);

  // Theme toggle
  DOM.themeToggle.addEventListener('click', toggleTheme);

  // Navigation / Tabs
  if (DOM.navHome) DOM.navHome.addEventListener('click', () => switchTab('home'));
  if (DOM.navHistory) DOM.navHistory.addEventListener('click', () => switchTab('history'));
  if (DOM.navSettings) DOM.navSettings.addEventListener('click', openSettings);
  if (DOM.tabTimer && DOM.tabTimer !== DOM.navHome) {
    DOM.tabTimer.addEventListener('click', () => switchTab('timer'));
  }
  if (DOM.tabDashboard && DOM.tabDashboard !== DOM.navHistory) {
    DOM.tabDashboard.addEventListener('click', () => switchTab('dashboard'));
  }

  // Settings
  if (DOM.settingsBtn) DOM.settingsBtn.addEventListener('click', openSettings);
  if (DOM.settingsCloseBtn) DOM.settingsCloseBtn.addEventListener('click', closeSettings);
  if (DOM.settingsOverlay) DOM.settingsOverlay.addEventListener('click', closeSettings);

  // Live preview toggle
  DOM.livePreviewCb.addEventListener('change', (e) => {
    DOM.liveCameraWrapper.style.display = e.target.checked ? 'block' : 'none';
  });

  // Timer controls
  DOM.startBtn.addEventListener('click', handleStart);
  DOM.endBtn.addEventListener('click', handleEnd);

  // Dashboard actions
  DOM.exportCsvBtn.addEventListener('click', handleExportCSV);
  DOM.deleteAllBtn.addEventListener('click', handleDeleteAll);

  // Install prompt
  DOM.installBtn.addEventListener('click', installApp);
  DOM.installDismissBtn.addEventListener('click', dismissInstall);

  // PiP button
  DOM.pipBtn.addEventListener('click', togglePiP);

  // Keyboard shortcut: Escape to close settings
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSettings();
  });

  // ── Keyboard & mouse as secondary signals ──
  // These only prevent false "away" when the camera briefly fails.
  // They NEVER keep the timer running when the webcam says user is gone.
  document.addEventListener('keydown', handleUserActivity);
  document.addEventListener('mousemove', handleUserActivity);
  document.addEventListener('click', handleUserActivity);
}

/**
 * Track keyboard/mouse activity.
 * This is a SECONDARY signal only — it can prevent a false "away"
 * when the camera briefly loses the face, but it cannot override
 * the camera saying the user is looking away.
 */
let lastActivityTimestamp = 0;

function handleUserActivity() {
  lastActivityTimestamp = Date.now();
}


// ═══════════════════════════════════════════════
// 28. INITIALISE THE APP
// ═══════════════════════════════════════════════

function init() {
  // Purge any old service worker caches immediately
  if ('caches' in window) {
    caches.keys().then((keys) => {
      keys.forEach((k) => {
        if (k !== 'ayush-tracker-v1') caches.delete(k);
      });
    });
  }

  DB.init()
    .then(() => recoverUnfinishedSessions())
    .then(() => refreshDashboard())
    .catch(e => console.error('DB init error:', e));

  initTheme();
  loadSettings();
  initSettingsListeners();
  initPrivacyModal();
  initInstallPrompt();
  initPiP();
  attachEventListeners();
  registerServiceWorker();
  DOM.dailyGoalDisplay.textContent = state.settings.dailyGoal + 'h';

  // Save when the tab is hidden or the window is about to close.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) autoSaveSession();
  });
  window.addEventListener('beforeunload', () => {
    // synchronous best-effort: IndexedDB is async so this may not complete,
    // but the recovery logic on next load will handle any dropped saves.
    autoSaveSession();
  });

  loadMediaPipeModule();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
