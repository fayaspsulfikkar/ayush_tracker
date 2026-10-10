/* ============================================
   AI Spectator — Main Application (app.js)
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
  settingsBtn:     document.getElementById('settings-btn'),

  // Tabs
  tabTimer:     document.getElementById('tab-timer'),
  tabDashboard: document.getElementById('tab-dashboard'),

  // Timer view
  timerView:      document.getElementById('timer-view'),
  statusChip:     document.getElementById('status-chip'),
  statusText:     document.getElementById('status-text'),
  timerDisplay:   document.getElementById('timer-display'),
  sessionStats:   document.getElementById('session-stats'),
  statFocus:      document.getElementById('stat-focus'),
  statDistractions: document.getElementById('stat-distractions'),
  statSessionTime: document.getElementById('stat-session-time'),
  startBtn:       document.getElementById('start-btn'),
  endBtn:         document.getElementById('end-btn'),
  cameraPreviewContainer: document.getElementById('camera-preview-container'),
  cameraPreview:  document.getElementById('live-video'),
  alertCard:      document.getElementById('alert-card'),
  alertIcon:      document.getElementById('alert-icon'),
  alertText:      document.getElementById('alert-text'),

  // Dashboard view
  dashboardView:   document.getElementById('dashboard-view'),
  dashStudyTime:   document.getElementById('dash-study-time'),
  dashFocus:       document.getElementById('dash-focus'),
  dashDistractions: document.getElementById('dash-distractions'),
  distLookAway:    document.getElementById('dist-look-away'),
  distAway:        document.getElementById('dist-away'),
  distLid:         document.getElementById('dist-lid'),
  weeklyTotal:     document.getElementById('weekly-total'),
  chartContainer:  document.getElementById('chart-container'),
  dailyGoalDisplay: document.getElementById('daily-goal-display'),
  streakBadge:     document.getElementById('streak-badge'),
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
    startTime: null,           // wall-clock ms when session started
    studyTime: 0,              // accumulated study time in ms
    sessionTime: 0,            // total session duration in ms
    unverifiedTime: 0,         // time spent in background where detection couldn't run
    distractions: {
      lookAway: 0,
      away: 0,
      lidClosed: 0,
    },
    pauses: [],                // array of { start, end, type }
    lastStudyTimestamp: null,   // last wall-clock moment we were studying
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

// ── Resume requires facing screen for this many ms ──
const RESUME_FACE_DURATION_MS = 2000;


// ═══════════════════════════════════════════════
// 3. SETTINGS — Load & Save
// ═══════════════════════════════════════════════

function loadSettings() {
  try {
    const saved = localStorage.getItem('ai-spectator-settings');
    if (saved) {
      Object.assign(state.settings, JSON.parse(saved));
    }
  } catch (e) {
    console.warn('Could not load settings:', e);
  }

  // Apply to UI controls
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
    localStorage.setItem('ai-spectator-settings', JSON.stringify(state.settings));
  } catch (e) {
    console.warn('Could not save settings:', e);
  }
}

function initSettingsListeners() {
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
    DOM.cameraPreviewContainer.classList.toggle('visible', e.target.checked);
    saveSettings();
  });
}


// ═══════════════════════════════════════════════
// 4. THEME — Light / Dark toggle
// ═══════════════════════════════════════════════

function initTheme() {
  const saved = localStorage.getItem('ai-spectator-theme');
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
  localStorage.setItem('ai-spectator-theme', state.theme);
  applyTheme();
}


// ═══════════════════════════════════════════════
// 5. TAB NAVIGATION
// ═══════════════════════════════════════════════

function switchTab(tab) {
  state.activeTab = tab;
  DOM.tabTimer.classList.toggle('active', tab === 'timer');
  DOM.tabDashboard.classList.toggle('active', tab === 'dashboard');
  DOM.tabTimer.setAttribute('aria-selected', tab === 'timer');
  DOM.tabDashboard.setAttribute('aria-selected', tab === 'dashboard');
  DOM.timerView.classList.toggle('hidden', tab !== 'timer');
  DOM.dashboardView.classList.toggle('hidden', tab !== 'dashboard');
  if (tab === 'dashboard') refreshDashboard();
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
  const accepted = localStorage.getItem('ai-spectator-privacy-accepted');
  if (!accepted) {
    DOM.privacyModal.classList.add('active');
  }
}

function acceptPrivacy() {
  localStorage.setItem('ai-spectator-privacy-accepted', 'true');
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
    showToast('success', 'Installed!', 'AI Spectator is now a desktop app.');
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
    'looking-away':  'Looking away',
    'away':          'Away',
    'lid-closed':    'Lid closed',
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

  updatePiP(); // Sync to PiP window if open
  logEvent(`Status changed to ${status}`);
}

// ═══════════════════════════════════════════════
// LIVE PANEL HELPERS
// ═══════════════════════════════════════════════

function logEvent(msg) {
  const time = new Date().toLocaleTimeString();
  const li = document.createElement('li');
  li.textContent = `[${time}] ${msg}`;
  DOM.liveEvents.prepend(li);
  if (DOM.liveEvents.children.length > 10) {
    DOM.liveEvents.lastChild.remove();
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
      new Notification("AI Spectator", { body: msg, icon: './icons/icon-192.png' });
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
    if (state.settings.cameraPreview) {
      DOM.cameraPreviewContainer.classList.add('visible');
    }

    // Listen for camera track ending (e.g. user unplugged camera, lid closed)
    state.camera.videoTrack.addEventListener('ended', handleCameraTrackEnded);

    console.log('📷 Camera started:', state.camera.videoTrack.label);
    return true;

  } catch (err) {
    console.error('Camera access denied or failed:', err);
    showToast('error', 'Camera required',
      'AI Spectator needs your webcam to detect focus. Please allow camera access and try again.');
    return false;
  }
}

/**
 * Stop the camera and release all resources.
 */
function stopCamera() {
  if (state.camera.stream) {
    state.camera.stream.getTracks().forEach(track => track.stop());
    state.camera.stream = null;
    state.camera.videoTrack = null;
  }

  DOM.cameraPreview.srcObject = null;
  DOM.cameraIndicator.classList.remove('visible');
  DOM.cameraPreviewContainer.classList.remove('visible');

  console.log('📷 Camera stopped');
}

/**
 * Called when the camera track ends unexpectedly.
 * This happens when the user closes the laptop lid, unplugs
 * an external webcam, or revokes camera permission.
 */
function handleCameraTrackEnded() {
  console.log('📷 Camera track ended (lid closed / camera lost)');

  if (state.session.active && state.status !== 'idle') {
    // Back-date the pause to when camera was last working
    const now = Date.now();
    state.headPose.faceDetected = false;
    setStatus('lid-closed');
    showAlert('paused', '💤', '<strong>Camera lost.</strong> Timer paused. Reopen and I\'ll welcome you back.');

    // Distraction count
    state.session.distractions.lidClosed++;
    updateSessionStatsDisplay();
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
  const noseTip     = landmarks[4];
  const leftCheek   = landmarks[234];
  const rightCheek  = landmarks[454];
  const foreheadTop = landmarks[10];
  const chinBottom  = landmarks[152];

  // ── YAW (left/right) ──
  // Distance from nose to each side of the face
  const dLeft = Math.hypot(
    noseTip.x - leftCheek.x,
    noseTip.y - leftCheek.y,
    noseTip.z - leftCheek.z
  );
  const dRight = Math.hypot(
    noseTip.x - rightCheek.x,
    noseTip.y - rightCheek.y,
    noseTip.z - rightCheek.z
  );
  // Ratio: positive = turned left, negative = turned right
  const yawRatio = (dLeft - dRight) / (dLeft + dRight);
  // Map to degrees. The ratio tops out at about ±0.5 for a ~45° turn.
  // So we multiply by ~90 to get approximate degrees.
  const yaw = yawRatio * 90;

  // ── PITCH (up/down) ──
  const dForehead = Math.hypot(
    noseTip.x - foreheadTop.x,
    noseTip.y - foreheadTop.y,
    noseTip.z - foreheadTop.z
  );
  const dChin = Math.hypot(
    noseTip.x - chinBottom.x,
    noseTip.y - chinBottom.y,
    noseTip.z - chinBottom.z
  );
  // Positive = looking down, negative = looking up
  const pitchRatio = (dForehead - dChin) / (dForehead + dChin);
  const pitch = pitchRatio * 90;

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

    // Check if user is facing the screen
    const isFacingScreen = isUserFacingScreen(smoothed);

    // Update the state machine
    processDetectionResult(true, isFacingScreen);

  } else {
    state.headPose.faceDetected = false;
    DOM.liveSinceFace.textContent = Math.round((Date.now() - state.headPose.lastFaceSeen) / 1000);

    if (state.calibration.isCalibrating) return;

    processDetectionResult(false, false);
  }
}

/**
 * Check if the user is facing the screen based on head pose.
 *
 * Compares current yaw and pitch to the calibrated neutral angle.
 * If the deviation exceeds the sensitivity threshold, the user
 * is considered to be "looking away".
 *
 * @param {{ yaw: number, pitch: number }} pose — smoothed head pose
 * @returns {boolean} — true if user is facing the screen
 */
function isUserFacingScreen(pose) {
  const threshold = SENSITIVITY[state.settings.sensitivity] || 25;
  const neutralYaw = state.calibration.neutralYaw;
  const neutralPitch = state.calibration.neutralPitch;

  // Deviation from calibrated neutral angle
  const yawDev = Math.abs(pose.yaw - neutralYaw);

  // For pitch, if reading mode is on, ignore looking DOWN
  // (pitch > neutral means looking down)
  let pitchDev = Math.abs(pose.pitch - neutralPitch);
  if (state.settings.readingMode && pose.pitch > neutralPitch) {
    // Looking down — ignore it in reading mode
    pitchDev = 0;
  }

  // User is facing screen if both yaw and pitch are within threshold
  return yawDev < threshold && pitchDev < threshold;
}


// ═══════════════════════════════════════════════
// 19. STATE MACHINE — Process detection results
// ═══════════════════════════════════════════════

/**
 * Process a detection result and update the app state.
 *
 * STATE TRANSITIONS:
 *
 * studying + face + facing screen → stay studying
 * studying + face + NOT facing screen → start lookaway timer
 *   if timer > lookawayTime → transition to looking-away
 * studying + no face → start away timer
 *   if timer > awayTime → transition to away
 *
 * looking-away + face + facing screen for 2s → resume studying
 * away + face + facing screen for 2s → resume studying
 * lid-closed + face + facing screen for 2s → resume studying
 *
 * @param {boolean} faceDetected — is a face visible?
 * @param {boolean} facingScreen — is the face pointing at the screen?
 */
function processDetectionResult(faceDetected, facingScreen) {
  const now = Date.now();
  const hp = state.headPose;

  // ── STUDYING ──
  if (state.status === 'studying') {

    if (faceDetected && facingScreen) {
      // All good — keep studying
      hp.lookAwayStart = 0;
      hp.awayStart = 0;
      hp.facingScreenSince = hp.facingScreenSince || now;
      return;
    }

    if (faceDetected && !facingScreen) {
      // Face visible but not looking at screen — start lookaway timer
      if (hp.lookAwayStart === 0) {
        hp.lookAwayStart = now;
      }
      hp.facingScreenSince = 0;

      const lookawayDuration = (now - hp.lookAwayStart) / 1000;
      if (lookawayDuration >= state.settings.lookawayTime) {
        // Transition to looking-away
        setStatus('looking-away');
        state.session.distractions.lookAway++;
        
        // BACK-DATE: Subtract the waiting time so the pause starts exactly when you looked away
        state.session.studyTime = Math.max(0, state.session.studyTime - (now - hp.lookAwayStart));
        
        triggerNudge('lookAway');
        updateSessionStatsDisplay();
      }
      return;
    }

    if (!faceDetected) {
      // No face — start away timer
      if (hp.awayStart === 0) {
        hp.awayStart = now;
      }
      hp.facingScreenSince = 0;
      hp.lookAwayStart = 0;

      const awayDuration = (now - hp.awayStart) / 1000;
      if (awayDuration >= state.settings.awayTime) {
        // Transition to away
        setStatus('away');
        state.session.distractions.away++;
        
        // BACK-DATE: Subtract the waiting time
        state.session.studyTime = Math.max(0, state.session.studyTime - (now - hp.awayStart));
        
        triggerNudge('away');
        updateSessionStatsDisplay();
      }
      return;
    }
  }

  // ── LOOKING AWAY / AWAY / LID CLOSED — waiting to resume ──
  if (['looking-away', 'away', 'lid-closed'].includes(state.status)) {

    if (faceDetected && facingScreen) {
      // User is back and facing screen — start the 2-second resume timer
      if (hp.facingScreenSince === 0) {
        hp.facingScreenSince = now;
      }

      const facingDuration = now - hp.facingScreenSince;
      if (facingDuration >= RESUME_FACE_DURATION_MS) {
        // Resume studying!
        hp.lookAwayStart = 0;
        hp.awayStart = 0;
        setStatus('studying');
        triggerNudge('resumed');
      }
    } else {
      // Not facing screen yet — reset the resume timer
      hp.facingScreenSince = 0;
    }
    return;
  }
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
  DOM.statDistractions.textContent = totalDistractions;

  // Focus % = study time / session time
  if (s.sessionTime > 0) {
    const focusPercent = Math.round((s.studyTime / s.sessionTime) * 100);
    DOM.statFocus.textContent = focusPercent + '%';
  } else {
    DOM.statFocus.textContent = '100%';
  }

  // Session duration
  DOM.statSessionTime.textContent = formatDuration(s.sessionTime);
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
  // If the gap between ticks is > 8 seconds, the laptop was probably asleep.
  // (Normal gap is ~1000ms. Sleep/lid close causes much longer gaps.)
  if (gap > 8000 && state.session.active && state.status !== 'idle') {
    console.log(`⚡ Heartbeat gap detected: ${gap}ms (lid closed / sleep)`);

    if (state.status !== 'lid-closed') {
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
        new Notification("AI Spectator", { body: `Welcome back! ${msg}`, icon: './icons/icon-192.png' });
      }
      
      updateSessionStatsDisplay();
    }
  }

  // ── Update timer display ──
  if (state.session.active) {
    const sessionElapsed = now - state.session.startTime;
    state.session.sessionTime = sessionElapsed;

    // Check if detection loop has stalled (e.g., tab backgrounded without PiP)
    // If we haven't seen a detection frame in 2.5 seconds, we are stalled.
    const isStalled = state.camera.isDetecting && (now - state.camera.lastDetectionTime > 2500);

    // Only count study time when status is 'studying'
    if (state.status === 'studying') {
      // Add the time since last tick (wall-clock)
      const tickDuration = Math.min(gap, 2000); // cap at 2s to avoid jumps
      
      if (isStalled) {
        // Unverified time: backgrounded and Chrome throttled our detection loop
        state.session.unverifiedTime += tickDuration;
      } else {
        state.session.studyTime += tickDuration;
      }
      state.session.lastStudyTimestamp = now;
    }

    // Update the display
    DOM.timerDisplay.textContent = formatTime(state.session.studyTime);
    updateSessionStatsDisplay();
    updatePiP(); // Sync to PiP window if open
    
    // Live Panel Updates
    DOM.liveSession.textContent = Math.round(state.session.sessionTime / 1000);
    DOM.liveStudy.textContent = Math.round(state.session.studyTime / 1000);
    DOM.livePauses.textContent = state.session.distractions.lookAway + state.session.distractions.away + state.session.distractions.lidClosed;
  }

  state.lastTickTimestamp = now;
}


// ═══════════════════════════════════════════════
// 22. SESSION — Start / End
// ═══════════════════════════════════════════════

/**
 * Start a study session.
 * This is the main flow when the user clicks "Start Studying":
 * 1. Load MediaPipe (first time only)
 * 2. Start camera
 * 3. Run calibration
 * 4. Start detection loop & worker
 * 5. Set status to studying
 */
async function handleStart() {
  DOM.startBtn.disabled = true;
  hideLiveError();
  logEvent('Start button clicked');
  DOM.startBtn.innerHTML = '<span class="btn-icon">⏳</span> Starting…';

  // 0. Initialise AudioContext on user gesture
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  // 1. Load MediaPipe module (first time)
  if (!state.camera.faceLandmarker) {
    DOM.startBtn.innerHTML = '<span class="btn-icon">⏳</span> Loading AI Model…';
    const landmarkerReady = await initFaceLandmarker();
    if (!landmarkerReady) {
      DOM.startBtn.disabled = false;
      DOM.startBtn.innerHTML = '<span class="btn-icon">▶</span> Start Studying';
      return;
    }
  }

  // 2. Start camera
  DOM.startBtn.innerHTML = '<span class="btn-icon">⏳</span> Waiting for Camera…';
  const cameraReady = await startCamera();
  if (!cameraReady) {
    DOM.startBtn.disabled = false;
    DOM.startBtn.innerHTML = '<span class="btn-icon">▶</span> Start Studying';
    return;
  }

  // 3. Start detection loop (needs to run during calibration)
  startDetectionLoop();

  // 4. Wait a moment for the video to stabilise, then calibrate
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

  // 5. Start the worker heartbeat
  startWorker();

  // 6. Initialise session data
  const now = Date.now();
  state.session = {
    active: true,
    startTime: now,
    studyTime: 0,
    sessionTime: 0,
    unverifiedTime: 0,
    distractions: { lookAway: 0, away: 0, lidClosed: 0 },
    pauses: [],
    lastStudyTimestamp: now,
  };

  // 7. Reset head pose tracking
  state.headPose.lookAwayStart = 0;
  state.headPose.awayStart = 0;
  state.headPose.facingScreenSince = now;

  // 8. Update UI
  DOM.startBtn.classList.add('hidden');
  DOM.endBtn.classList.remove('hidden');
  DOM.sessionStats.classList.add('visible');
  DOM.timerDisplay.textContent = '00:00:00';
  setStatus('studying');
  hideAlert();

  DOM.startBtn.disabled = false;
  DOM.startBtn.innerHTML = '<span class="btn-icon">▶</span> Start Studying';
}

/**
 * End the current study session.
 */
function handleEnd() {
  // Stop everything
  stopDetectionLoop();
  stopCamera();
  stopWorker();

  // Mark session as ended
  state.session.active = false;
  const finalStudyTime = state.session.studyTime;
  const finalSessionTime = state.session.sessionTime;

  console.log(`📚 Session ended: studied ${formatDuration(finalStudyTime)} ` +
              `out of ${formatDuration(finalSessionTime)}`);

  // Update UI
  DOM.startBtn.classList.remove('hidden');
  DOM.endBtn.classList.add('hidden');
  DOM.sessionStats.classList.remove('visible');
  setStatus('idle');
  hideAlert();

  showToast('info', 'Session ended',
    `You studied for ${formatDuration(finalStudyTime)}. Great work! 🎉`);

  // Save to IndexedDB
  const sessionRecord = {
    id: 'sess_' + Date.now(),
    startTime: state.session.startTime,
    endTime: Date.now(),
    studyTime: finalStudyTime,
    sessionTime: finalSessionTime,
    unverifiedTime: state.session.unverifiedTime,
    distractions: { ...state.session.distractions }
  };
  
  DB.saveSession(sessionRecord).then(() => {
    if (state.activeTab === 'dashboard') refreshDashboard();
  }).catch(e => console.error('Failed to save session:', e));
}

// ═══════════════════════════════════════════════
// 22B. DATABASE (IndexedDB)
// ═══════════════════════════════════════════════

const DB = {
  db: null,
  name: 'ai-spectator-db',
  version: 1,

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, this.version);
      
      request.onerror = (event) => reject('IndexedDB error: ' + event.target.error);
      
      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('sessions')) {
          const store = db.createObjectStore('sessions', { keyPath: 'id' });
          store.createIndex('startTime', 'startTime', { unique: false });
        }
      };
    });
  },

  async saveSession(sessionData) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['sessions'], 'readwrite');
      const store = transaction.objectStore('sessions');
      const request = store.add(sessionData);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async getAllSessions() {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['sessions'], 'readonly');
      const store = transaction.objectStore('sessions');
      const index = store.index('startTime');
      const request = index.getAll();
      request.onsuccess = () => {
        // Sort descending
        resolve(request.result.sort((a, b) => b.startTime - a.startTime));
      };
      request.onerror = () => reject(request.error);
    });
  },

  async clearAll() {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['sessions'], 'readwrite');
      const store = transaction.objectStore('sessions');
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
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
  DOM.dashStudyTime.textContent = formatDuration(todayStudy);
  
  const focusPercent = todaySession > 0 ? Math.round((todayStudy / todaySession) * 100) : 100;
  DOM.dashFocus.textContent = focusPercent + '%';
  
  const totalDist = todayDist.lookAway + todayDist.away + todayDist.lidClosed;
  DOM.dashDistractions.textContent = totalDist;
  
  DOM.distLookAway.textContent = todayDist.lookAway;
  DOM.distAway.textContent = todayDist.away;
  DOM.distLid.textContent = todayDist.lidClosed;
  
  DOM.weeklyTotal.textContent = formatDuration(weeklyStudy);

  // Calculate Streak
  let streak = 0;
  const goalMs = state.settings.dailyGoal * 3600000;
  
  for (let i = 0; i < 365; i++) {
    const d = new Date(startOfToday - (i * 86400000));
    const dStr = new Date(d.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    const studied = dailyTotals[dStr] || 0;
    
    if (i === 0 && studied < goalMs) {
      // It's today, maybe they just haven't met the goal yet.
      // Don't break the streak if they still have time today,
      // just ignore today for streak counting if unmet.
      continue;
    }
    
    if (studied >= goalMs) {
      streak++;
    } else {
      break;
    }
  }
  
  DOM.streakBadge.textContent = `🔥 ${streak} Day Streak`;
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
    DOM.sessionList.innerHTML = '<p class="text-secondary" style="padding: 1rem;">No sessions yet. Start studying!</p>';
    return;
  }

  // Show top 20 recent sessions
  sessions.slice(0, 20).forEach(s => {
    const item = document.createElement('div');
    item.className = 'session-item';
    item.style.display = 'flex';
    item.style.justifyContent = 'space-between';
    item.style.padding = '12px 16px';
    item.style.borderBottom = '1px solid var(--border-color)';
    
    const date = new Date(s.startTime).toLocaleDateString();
    const time = formatTimestamp(s.startTime);
    const duration = formatDuration(s.studyTime);
    
    item.innerHTML = `
      <div>
        <div style="font-weight: 500">${date} at ${time}</div>
        <div style="font-size: 0.85rem; color: var(--text-secondary)">
          Session: ${formatDuration(s.sessionTime)}
        </div>
      </div>
      <div style="font-weight: 600; color: var(--primary-color)">
        ${duration}
      </div>
    `;
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
      height: 180,
    });
    
    // Copy stylesheets
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

    state.pipWindow.document.body.innerHTML = `
      <div style="padding: 24px; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: var(--bg-primary); color: var(--text-primary); font-family: var(--font-sans);">
        <div id="pip-status-chip" class="status-chip" data-status="${state.status}">
          <span class="status-dot"></span>
          <span id="pip-status-text">${DOM.statusText.textContent}</span>
        </div>
        <div id="pip-timer" class="${DOM.timerDisplay.className}" style="font-size: 3rem; padding: 16px 0;">
          ${DOM.timerDisplay.textContent}
        </div>
      </div>
    `;

    state.pipWindow.document.documentElement.setAttribute('data-theme', state.theme);

    state.pipWindow.addEventListener('pagehide', () => {
      state.pipWindow = null;
    });

  } catch (err) {
    console.error('Failed to enter PiP:', err);
    showToast('error', 'PiP Failed', 'Could not open mini window.');
  }
}

function updatePiP() {
  if (!state.pipWindow) return;
  const timerEl = state.pipWindow.document.getElementById('pip-timer');
  const chipEl = state.pipWindow.document.getElementById('pip-status-chip');
  const textEl = state.pipWindow.document.getElementById('pip-status-text');
  
  if (timerEl) {
    timerEl.textContent = DOM.timerDisplay.textContent;
    timerEl.className = DOM.timerDisplay.className;
  }
  if (chipEl) chipEl.setAttribute('data-status', state.status);
  if (textEl) textEl.textContent = DOM.statusText.textContent;
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
            showToast('info', 'App updated', 'AI Spectator has been updated. Refresh for the latest version.');
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
    a.download = `ai-spectator-data-${new Date().toISOString().split('T')[0]}.csv`;
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

  // Tabs
  DOM.tabTimer.addEventListener('click', () => switchTab('timer'));
  DOM.tabDashboard.addEventListener('click', () => switchTab('dashboard'));

  // Settings
  DOM.settingsBtn.addEventListener('click', openSettings);
  DOM.settingsCloseBtn.addEventListener('click', closeSettings);
  DOM.settingsOverlay.addEventListener('click', closeSettings);

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
  console.log('🎯 AI Spectator — initialising...');

  // Init DB first
  DB.init().catch(e => console.error(e));

  initTheme();
  loadSettings();
  initSettingsListeners();
  initPrivacyModal();
  initInstallPrompt();
  initPiP();
  attachEventListeners();
  registerServiceWorker();
  refreshDashboard();
  DOM.dailyGoalDisplay.textContent = state.settings.dailyGoal + 'h';

  // Pre-load MediaPipe in the background so first "Start" is faster
  loadMediaPipeModule().then((loaded) => {
    if (loaded) console.log('MediaPipe pre-loaded and ready');
  });

  console.log('✅ AI Spectator — ready!');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
