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

const _getEl = (id) => (typeof document !== 'undefined' ? document.getElementById(id) : null);

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
  privacyModal: document.getElementById('privacy-modal'),
  privacyAcceptBtn: document.getElementById('privacy-accept-btn'),

  // Calibration (Inline Optical Viewfinder HUD)
  calibrationOverlay: _getEl('calibration-overlay'),
  calibrationProgressBar: _getEl('calibration-progress-bar'),
  calibrationCountdown: _getEl('calibration-countdown'),
  calibrationSubstatus: _getEl('calibration-substatus'),
  calibrationCancelBtn: _getEl('calibration-cancel-btn'),
  calibrationArc: _getEl('calibration-arc'),

  // Instrument Hardware Controls
  homeInstrument: _getEl('home-instrument'),
  signalBars: _getEl('signal-bars'),
  horizonGroup: _getEl('hud-horizon-group'),
  calHwBtn: _getEl('cal-hw-btn'),
  thresholdDial: _getEl('threshold-dial'),
  dialCutoffLabel: _getEl('dial-cutoff-label'),
  coneSwitch: _getEl('cone-switch'),
  hwReadingBtn: _getEl('hw-reading-btn'),
  hwSoundBtn: _getEl('hw-sound-btn'),
  hwPipBtn: _getEl('hw-pip-btn'),
  hudLiveFocus: _getEl('hud-live-focus'),
  hudLiveDistractions: _getEl('hud-live-distractions'),
  goalDecBtn: _getEl('goal-dec-btn'),
  goalIncBtn: _getEl('goal-inc-btn'),
  hwGoalVal: _getEl('hw-goal-val'),
  goalSegments: _getEl('goal-segments'),
  goalPctBadge: _getEl('goal-pct-badge'),
  shortcutAnalyticsBtn: _getEl('shortcut-analytics-btn'),
  secondaryAuditDrawer: _getEl('secondary-audit-drawer'),

  // Header
  cameraIndicator: document.getElementById('camera-indicator'),
  pipBtn: document.getElementById('pip-btn'),
  themeToggle: document.getElementById('theme-toggle'),
  settingsBtn: document.getElementById('settings-btn') || document.getElementById('nav-settings'),

  // Navigation
  navHome: document.getElementById('nav-home'),
  navHistory: document.getElementById('nav-history'),
  navSettings: document.getElementById('nav-settings'),
  tabTimer: document.getElementById('nav-home') || document.getElementById('tab-timer'),
  tabDashboard: document.getElementById('nav-history') || document.getElementById('tab-dashboard'),

  // Views
  homeView: document.getElementById('home-view'),
  historyView: document.getElementById('history-view'),
  timerView: document.getElementById('home-view') || document.getElementById('timer-view'),
  dashboardView: document.getElementById('history-view') || document.getElementById('dashboard-view'),

  // Hero Card
  statusChip: document.getElementById('status-chip'),
  statusText: document.getElementById('status-text'),
  timerDisplay: document.getElementById('timer-display'),
  sessionStats: document.getElementById('session-stats'),
  statFocus: document.getElementById('stat-focus') || document.getElementById('home-focus'),
  statDistractions: document.getElementById('stat-distractions') || document.getElementById('home-distractions'),
  statSessionTime: document.getElementById('stat-session-time'),
  statPausedTime: document.getElementById('stat-paused-time'),
  startBtn: document.getElementById('start-btn'),
  endBtn: document.getElementById('end-btn'),
  cameraPreviewContainer: document.getElementById('camera-preview-container'),
  cameraPreview: document.getElementById('live-video'),
  alertCard: document.getElementById('alert-card'),
  alertIcon: document.getElementById('alert-icon'),
  alertText: document.getElementById('alert-text'),

  // Home Summary & Progress
  homeStudyTime: document.getElementById('home-study-time'),
  homeFocus: document.getElementById('home-focus'),
  homeDistractions: document.getElementById('home-distractions'),
  goalProgressText: document.getElementById('goal-progress-text'),
  goalProgressBar: document.getElementById('goal-progress-bar'),
  homeStreakBadge: document.getElementById('home-streak-badge'),
  homeRecentEvents: document.getElementById('home-recent-events'),
  homeRecentSessions: document.getElementById('home-recent-sessions'),

  // History / Dashboard view
  dashStudyTime: document.getElementById('dash-study-time'),
  dashFocus: document.getElementById('dash-focus'),
  dashDistractions: document.getElementById('dash-distractions'),
  distLookAway: document.getElementById('dist-look-away'),
  distAway: document.getElementById('dist-away'),
  distLid: document.getElementById('dist-lid'),
  weeklyTotal: document.getElementById('weekly-total'),
  chartContainer: document.getElementById('chart-container'),
  dailyGoalDisplay: document.getElementById('daily-goal-display'),
  streakBadge: document.getElementById('streak-badge') || document.getElementById('home-streak-badge'),
  sessionList: document.getElementById('session-list'),
  exportCsvBtn: document.getElementById('export-csv-btn'),
  deleteAllBtn: document.getElementById('delete-all-btn'),

  // Settings
  settingsOverlay: document.getElementById('settings-overlay'),
  settingsPanel: document.getElementById('settings-panel'),
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
  recalibrateBtn: document.getElementById('recalibrate-btn'),
  settingSensitivity: document.getElementById('setting-sensitivity'),
  settingLookawayTime: document.getElementById('setting-lookaway-time'),
  settingAwayTime: document.getElementById('setting-away-time'),
  settingReadingMode: document.getElementById('setting-reading-mode'),
  settingDailyGoal: document.getElementById('setting-daily-goal'),
  settingSound: document.getElementById('setting-sound'),
  settingVolume: document.getElementById('setting-volume'),
  settingNotifications: document.getElementById('setting-notifications'),
  settingCameraPreview: document.getElementById('setting-camera-preview'),

  // Install prompt
  installPrompt: document.getElementById('install-prompt'),
  installBtn: document.getElementById('install-btn'),
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
  theme: 'light',

  // Active tab: 'timer' | 'dashboard'
  activeTab: 'timer',

  // Settings (loaded from localStorage)
  settings: {
    settingsVersion: 2,
    sensitivity: 'low',        // 'low' | 'medium' | 'high'
    focusThreshold: 50,        // percentage (50-99): timer pauses if focus < focusThreshold
    lookawayTime: 3,           // seconds
    awayTime: 10,              // seconds
    readingMode: false,
    dailyGoal: 6,              // hours
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
    lastAttemptTime: 0,        // wall-clock ms of last detection attempt
    lastFrameTime: 0,          // wall-clock ms of last successful detectForVideo frame
    lastFaceTime: 0,           // wall-clock ms of last valid face-detection result
    lastAttemptMonotonic: null, // monotonic ms of last detection attempt
    lastFrameMonotonic: null,  // monotonic ms of last successful frame
    lastFaceMonotonic: null,   // monotonic ms of last valid face result
    lastDetectionTime: 0,      // legacy alias kept in sync ONLY with lastFrameTime
    frameSeq: 0,               // increments on every successful frame processing
    _lastLoopTime: 0,          // internal ~5fps throttle timestamp (never implies health)
    _lastTickFrameSeq: 0,      // frameSeq observed on last worker tick
    _msSinceLastFrame: 0,      // monotonic elapsed ms since last successful frame
    _suspensionDetected: false, // set if inter-frame camera blackout exceeded lidGapMs
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
    lookAwayStartMono: null,   // monotonic ms when lookAway began
    awayStart: 0,              // when the face was last lost
    awayStartMono: null,       // monotonic ms when away began
    facingScreenSince: 0,      // when the user started facing the screen again
    facingScreenSinceMono: null,
  },

  // ── Session data (Daily Cumulative) ──
  session: {
    active: false,
    id: null,                  // 'day_' + dateStr (e.g. 'day_2026-10-13')
    dateStr: null,             // 'YYYY-MM-DD'
    startTime: null,
    endTime: null,
    studyStartedAt: null,      // wall-clock ms when the current study run began (null when paused or stalled)
    studyCursorMono: null,     // monotonic ms cursor for current studying run
    sessionStartedAt: null,    // wall-clock ms when current tracking segment began
    unverifiedStartedAt: null, // wall-clock ms when current stall/unverified interval began
    unverifiedCursorMono: null,// monotonic ms cursor for current unverified run
    accStudyMs: 0,             // study ms accumulated for today before current active run
    accSessionMs: 0,           // legacy field kept for backward compatibility
    accUnverifiedMs: 0,        // unverified ms accumulated for today before current stall
    studyRunMs: 0,             // monotonic ms accumulated in the current active studying run
    unverifiedRunMs: 0,        // monotonic ms accumulated in the current active unverified run
    studyTime: 0,              // total study ms today
    sessionTime: 0,            // total active tracking ms today (studyTime + unverifiedTime)
    unverifiedTime: 0,         // total unverified ms today
    pausedTime: 0,             // total paused ms today
    distractions: { lookAway: 0, away: 0, lidClosed: 0 },
    pauses: [],                // [{ type, start, end }]
    lastSaved: null,
    schemaVersion: 2,
  },

  // ── Worker ──
  worker: null,
  lastTickTimestamp: 0,
  lastTickMonotonic: null,

  // ── PiP ──
  pipWindow: null,

  // PWA install event
  deferredInstallPrompt: null,
};

// ── Sensitivity thresholds (degrees from neutral angle) ──
const SENSITIVITY = {
  low: 35,
  medium: 25,
  high: 15,
};

// ── Detection interval (ms) — ~5 fps ──
const DETECTION_INTERVAL_MS = 200;

// All pause/resume thresholds come from this config object so there
// are no magic numbers scattered through the code.
const CONFIG = {
  // User must face screen for this long before we resume the timer.
  resumeDelayMs: 2000,
  // A heartbeat gap bigger than this (when camera isn't continuously running) means sleep / lid closed.
  lidGapMs: 8000,
  // Long suspension threshold: gaps above this are treated as suspension regardless of camera wake timing.
  suspensionGapMs: 60000,
  // Cap a single tick at this to avoid huge jumps after a stall.
  maxTickMs: 2000,
  // Detection is considered stalled if no frame arrived in this window.
  stallThresholdMs: 2500,
};


// ═══════════════════════════════════════════════
// 3. SETTINGS — Load & Save
// ═══════════════════════════════════════════════

function setCameraPreviewEnabled(enabled, persist = true) {
  const isEnabled = Boolean(enabled);
  state.settings.cameraPreview = isEnabled;
  if (DOM.settingCameraPreview) DOM.settingCameraPreview.checked = isEnabled;
  if (DOM.livePreviewCb) DOM.livePreviewCb.checked = isEnabled;
  if (DOM.liveCameraWrapper) {
    DOM.liveCameraWrapper.style.display = isEnabled ? 'block' : 'none';
  }
  if (!isEnabled && DOM.liveCanvas && typeof DOM.liveCanvas.getContext === 'function') {
    const ctx = DOM.liveCanvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, DOM.liveCanvas.width || 0, DOM.liveCanvas.height || 0);
  }
  if (persist) saveSettings();
}

function loadSettings() {
  let migratedFromLegacy = false;
  try {
    const saved = localStorage.getItem('ayush-tracker-settings') || localStorage.getItem('ai-spectator-settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      // One-time migration for unversioned v1 legacy defaults; preserve deliberate user edits thereafter
      if (parsed && parsed.settingsVersion !== 2) {
        if (parsed.focusThreshold === 80 || parsed.focusThreshold === 95) parsed.focusThreshold = 50;
        if (parsed.sensitivity === 'medium') parsed.sensitivity = 'low';
        if (parsed.lookawayTime === 10) parsed.lookawayTime = 3;
        if (parsed.awayTime === 30) parsed.awayTime = 10;
        if (parsed.dailyGoal === 4) parsed.dailyGoal = 6;
        migratedFromLegacy = true;
      }
      if (parsed && typeof parsed === 'object') {
        Object.assign(state.settings, parsed);
      }
      state.settings.settingsVersion = 2;
    }
  } catch (e) {
    console.warn('Could not load settings:', e);
  }

  state.settings.settingsVersion = 2;
  if (typeof state.settings.focusThreshold !== 'number' || !Number.isFinite(state.settings.focusThreshold)) {
    state.settings.focusThreshold = 50;
  }
  state.settings.focusThreshold = Math.max(50, Math.min(99, state.settings.focusThreshold));

  if (migratedFromLegacy) {
    saveSettings();
  }

  // Apply to UI controls
  if (DOM.settingFocusThreshold) {
    DOM.settingFocusThreshold.value = state.settings.focusThreshold;
    if (DOM.settingFocusThresholdVal) {
      DOM.settingFocusThresholdVal.textContent = state.settings.focusThreshold + '%';
    }
  }
  if (DOM.liveFocusThresholdTag) {
    DOM.liveFocusThresholdTag.textContent = `Cutoff: ${state.settings.focusThreshold}%`;
  }
  DOM.settingSensitivity.value = state.settings.sensitivity;
  syncThresholdDial();
  syncConeSwitch();
  DOM.settingLookawayTime.value = state.settings.lookawayTime;
  DOM.settingAwayTime.value = state.settings.awayTime;
  DOM.settingReadingMode.checked = state.settings.readingMode;
  DOM.settingDailyGoal.value = state.settings.dailyGoal;
  DOM.settingSound.checked = state.settings.soundOn;
  DOM.settingVolume.value = state.settings.volume;
  DOM.settingNotifications.checked = state.settings.notificationsOn;
  syncAuxHardwareToggles();
  setCameraPreviewEnabled(Boolean(state.settings.cameraPreview), false);
}

function syncThresholdDial() {
  const val = Math.max(50, Math.min(99, Number(state.settings.focusThreshold) || 50));
  state.settings.focusThreshold = val;
  // Map 50..99% across a -135deg .. +135deg potentiometer arc
  const ratio = (val - 50) / 49;
  const deg = -135 + ratio * 270;
  if (DOM.thresholdDial) {
    DOM.thresholdDial.style.transform = `rotate(${deg.toFixed(1)}deg)`;
    DOM.thresholdDial.setAttribute('aria-valuenow', String(val));
    DOM.thresholdDial.setAttribute('aria-valuetext', `${val}%`);
  }
  const dialArc = document.getElementById('threshold-dial-arc');
  if (dialArc && dialArc.style) {
    const totalArcLen = 146.08;
    dialArc.style.strokeDashoffset = (totalArcLen * (1 - ratio)).toFixed(2);
  }
  if (DOM.dialCutoffLabel) {
    DOM.dialCutoffLabel.textContent = `${val}%`;
  }
  if (DOM.settingFocusThreshold) {
    DOM.settingFocusThreshold.value = val;
  }
  if (DOM.settingFocusThresholdVal) {
    DOM.settingFocusThresholdVal.textContent = `${val}%`;
  }
  if (DOM.liveFocusThresholdTag) {
    DOM.liveFocusThresholdTag.textContent = `Min Focus: ${val}%`;
  }
}

function setFocusThreshold(val, notify = false, persist = true) {
  const clamped = Math.max(50, Math.min(99, Math.round(Number(val) || 50)));
  state.settings.focusThreshold = clamped;
  syncThresholdDial();
  if (persist) {
    saveSettings();
  }
  if (notify) {
    showToast('info', 'Min Focus Updated', `Minimum focus threshold set to ${clamped}%.`, 1800);
  }
}

function attachThresholdDialControls(dial) {
  let dragState = null;

  dial.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    const rect = dial.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
    dragState = {
      pointerId: e.pointerId,
      cx,
      cy,
      lastAngle: startAngle,
      lastY: e.clientY,
      startVal: Number(state.settings.focusThreshold) || 50,
      accumDeg: 0,
    };
    dial.classList.add('dragging');
    try { dial.setPointerCapture(e.pointerId); } catch (_) { }
  });

  dial.addEventListener('pointermove', (e) => {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    const dx = e.clientX - dragState.cx;
    const dy = e.clientY - dragState.cy;
    const dist = Math.hypot(dx, dy);
    let deltaDeg = 0;

    if (dist >= 12) {
      const angle = Math.atan2(dy, dx);
      let deltaRad = angle - dragState.lastAngle;
      if (deltaRad > Math.PI) deltaRad -= Math.PI * 2;
      if (deltaRad < -Math.PI) deltaRad += Math.PI * 2;
      deltaDeg = deltaRad * (180 / Math.PI);
      dragState.lastAngle = angle;
    } else {
      deltaDeg = (dragState.lastY - e.clientY) * 1.8;
    }

    dragState.lastY = e.clientY;
    dragState.accumDeg += deltaDeg;

    const nextVal = dragState.startVal + dragState.accumDeg * (49 / 270);
    setFocusThreshold(nextVal, false, false);
  });

  const finishDrag = (e) => {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    const changed = state.settings.focusThreshold !== dragState.startVal;
    dial.classList.remove('dragging');
    try { dial.releasePointerCapture(e.pointerId); } catch (_) { }
    dragState = null;
    if (changed) {
      saveSettings();
      showToast('info', 'Min Focus Updated', `Minimum focus threshold set to ${state.settings.focusThreshold}%.`, 1800);
    }
  };

  dial.addEventListener('pointerup', finishDrag);
  dial.addEventListener('pointercancel', finishDrag);

  dial.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 2 : -2;
    setFocusThreshold((Number(state.settings.focusThreshold) || 50) + delta, true);
  }, { passive: false });

  dial.addEventListener('keydown', (e) => {
    const cur = Number(state.settings.focusThreshold) || 50;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault();
      setFocusThreshold(cur + 1, true);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setFocusThreshold(cur - 1, true);
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      setFocusThreshold(cur + 5, true);
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      setFocusThreshold(cur - 5, true);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setFocusThreshold(50, true);
    } else if (e.key === 'End') {
      e.preventDefault();
      setFocusThreshold(99, true);
    }
  });
}

function syncConeSwitch() {
  const mode = state.settings.sensitivity || 'low';
  if (DOM.coneSwitch && typeof DOM.coneSwitch.querySelectorAll === 'function') {
    const btns = DOM.coneSwitch.querySelectorAll('[data-cone]');
    btns.forEach((btn) => {
      const active = btn.getAttribute('data-cone') === mode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-checked', active ? 'true' : 'false');
    });
  }
  if (DOM.settingSensitivity) {
    DOM.settingSensitivity.value = mode;
  }
}

function setSensitivityCone(mode, notify = false) {
  const valid = ['low', 'medium', 'high'].includes(mode) ? mode : 'low';
  state.settings.sensitivity = valid;
  syncConeSwitch();
  saveSettings();
  if (notify) {
    showToast('info', 'Angle Cone Updated', `Tolerance set to ${valid.toUpperCase()} (${SENSITIVITY[valid]}°).`, 1800);
  }
}

function syncAuxHardwareToggles() {
  if (DOM.hwReadingBtn) {
    const reading = Boolean(state.settings.readingMode);
    DOM.hwReadingBtn.classList.toggle('active', reading);
    DOM.hwReadingBtn.setAttribute('aria-pressed', reading ? 'true' : 'false');
  }
  if (DOM.hwSoundBtn) {
    const sound = Boolean(state.settings.soundOn);
    DOM.hwSoundBtn.classList.toggle('active', sound);
    DOM.hwSoundBtn.setAttribute('aria-pressed', sound ? 'true' : 'false');
  }
  if (DOM.hwGoalVal) {
    DOM.hwGoalVal.textContent = `${Number(state.settings.dailyGoal || 6).toFixed(1)}h`;
  }
  if (DOM.hwPipBtn) {
    DOM.hwPipBtn.classList.toggle('hidden', !('documentPictureInPicture' in window));
    DOM.hwPipBtn.classList.toggle('active', Boolean(state.pipWindow));
  }
}

function adjustDailyGoal(deltaHours) {
  const cur = Number(state.settings.dailyGoal) || 6;
  const next = Math.max(0.5, Math.min(16, Math.round((cur + deltaHours) * 2) / 2));
  if (next === cur) return;
  state.settings.dailyGoal = next;
  if (DOM.settingDailyGoal) DOM.settingDailyGoal.value = next;
  if (DOM.dailyGoalDisplay) DOM.dailyGoalDisplay.textContent = `${next}h`;
  syncAuxHardwareToggles();
  saveSettings();
  refreshDashboard();
  showToast('info', 'Daily Target Updated', `Target set to ${next.toFixed(1)} hours.`, 1800);
}

let isRecalibratingLock = false;

async function triggerRecalibrateFlow() {
  if (state.calibration.isCalibrating) {
    cancelCalibration();
    return;
  }
  if (isRecalibratingLock) return;
  isRecalibratingLock = true;
  try {
    if (!state.camera.faceLandmarker) {
      await initFaceLandmarker();
    }
    if (!state.camera.stream) {
      showToast('info', 'Starting Camera', 'Camera is needed to calibrate your neutral position.', 2500);
      const ok = await startCamera();
      if (!ok) return;
      startDetectionLoop();
    }
    const ok = await runCalibration();
    if (ok && state.session.active) {
      setStatus(state.status);
    }
  } finally {
    isRecalibratingLock = false;
  }
}

function saveSettings() {
  try {
    state.settings.settingsVersion = 2;
    localStorage.setItem('ayush-tracker-settings', JSON.stringify(state.settings));
  } catch (e) {
    console.warn('Could not save settings:', e);
  }
}

function initSettingsListeners() {
  if (DOM.settingFocusThreshold) {
    DOM.settingFocusThreshold.addEventListener('input', (e) => {
      setFocusThreshold(parseInt(e.target.value, 10), false);
    });
  }

  if (DOM.recalibrateBtn) {
    DOM.recalibrateBtn.addEventListener('click', triggerRecalibrateFlow);
  }

  DOM.settingSensitivity.addEventListener('change', (e) => {
    setSensitivityCone(e.target.value, false);
  });

  DOM.settingLookawayTime.addEventListener('change', (e) => {
    state.settings.lookawayTime = Math.max(1, Math.min(60, parseInt(e.target.value) || 3));
    e.target.value = state.settings.lookawayTime;
    saveSettings();
  });

  DOM.settingAwayTime.addEventListener('change', (e) => {
    state.settings.awayTime = Math.max(5, Math.min(120, parseInt(e.target.value) || 10));
    e.target.value = state.settings.awayTime;
    saveSettings();
  });

  DOM.settingReadingMode.addEventListener('change', (e) => {
    state.settings.readingMode = e.target.checked;
    syncAuxHardwareToggles();
    saveSettings();
  });

  DOM.settingDailyGoal.addEventListener('change', (e) => {
    state.settings.dailyGoal = Math.max(0.5, Math.min(16, parseFloat(e.target.value) || 6));
    e.target.value = state.settings.dailyGoal;
    DOM.dailyGoalDisplay.textContent = state.settings.dailyGoal + 'h';
    syncAuxHardwareToggles();
    saveSettings();
    refreshDashboard();
  });

  DOM.settingSound.addEventListener('change', (e) => {
    state.settings.soundOn = e.target.checked;
    syncAuxHardwareToggles();
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

  if (DOM.settingCameraPreview) {
    DOM.settingCameraPreview.addEventListener('change', (e) => {
      setCameraPreviewEnabled(e.target.checked, true);
    });
  }
}


// ═══════════════════════════════════════════════
// 4. THEME — Light / Dark toggle
// ═══════════════════════════════════════════════

function initTheme() {
  const params = new URLSearchParams(window.location.search);
  const paramTheme = params.get('theme');
  const saved = localStorage.getItem('ayush-tracker-theme') || localStorage.getItem('ai-spectator-theme');
  if (paramTheme && (paramTheme === 'light' || paramTheme === 'dark')) {
    state.theme = paramTheme;
  } else if (saved) {
    state.theme = saved;
  } else {
    state.theme = 'light';
  }
  applyTheme();
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  if (DOM.themeToggle) {
    DOM.themeToggle.innerHTML = state.theme === 'dark'
      ? `<svg class="tool-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8"></circle><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" stroke="none"></path></svg>`
      : `<svg class="tool-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8"></circle><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"></path></svg>`;
  }
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.content = state.theme === 'dark' ? '#141513' : '#ECECE7';
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

let lastFocusedBeforeSettings = null;

function openSettings() {
  lastFocusedBeforeSettings = (typeof document !== 'undefined' && document.activeElement) ? document.activeElement : null;
  DOM.settingsOverlay.classList.add('open');
  DOM.settingsOverlay.setAttribute('aria-hidden', 'false');
  DOM.settingsPanel.classList.add('open');
  DOM.settingsPanel.setAttribute('aria-hidden', 'false');
  if (typeof DOM.settingsPanel.removeAttribute === 'function') {
    DOM.settingsPanel.removeAttribute('inert');
  }
  if (DOM.settingsCloseBtn && typeof DOM.settingsCloseBtn.focus === 'function') {
    DOM.settingsCloseBtn.focus();
  }
}

function closeSettings() {
  DOM.settingsOverlay.classList.remove('open');
  DOM.settingsOverlay.setAttribute('aria-hidden', 'true');
  DOM.settingsPanel.classList.remove('open');
  DOM.settingsPanel.setAttribute('aria-hidden', 'true');
  if (typeof DOM.settingsPanel.setAttribute === 'function') {
    DOM.settingsPanel.setAttribute('inert', '');
  }
  if (lastFocusedBeforeSettings && typeof lastFocusedBeforeSettings.focus === 'function') {
    lastFocusedBeforeSettings.focus();
    lastFocusedBeforeSettings = null;
  }
}


// ═══════════════════════════════════════════════
// 7. PRIVACY MODAL — First-run notice
// ═══════════════════════════════════════════════

function initPrivacyModal() {
  const params = new URLSearchParams(window.location.search);
  const accepted = params.has('skipPrivacy') || localStorage.getItem('ayush-tracker-privacy-accepted') || localStorage.getItem('ai-spectator-privacy-accepted');
  if (!accepted) {
    DOM.privacyModal.classList.add('active');
    DOM.privacyModal.setAttribute('aria-hidden', 'false');
    if (DOM.privacyAcceptBtn && typeof DOM.privacyAcceptBtn.focus === 'function') {
      DOM.privacyAcceptBtn.focus();
    }
  } else {
    DOM.privacyModal.setAttribute('aria-hidden', 'true');
  }
}

function acceptPrivacy() {
  localStorage.setItem('ayush-tracker-privacy-accepted', 'true');
  DOM.privacyModal.classList.remove('active');
  DOM.privacyModal.setAttribute('aria-hidden', 'true');
  if (DOM.startBtn && typeof DOM.startBtn.focus === 'function') {
    DOM.startBtn.focus();
  }
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

const MAX_VISIBLE_TOASTS = 2;

function showToast(type, title, message, duration = 3500) {
  if (!DOM.toastContainer) return;
  const icons = {
    info: `<svg class="icon-svg-sm text-accent" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>`,
    success: `<svg class="icon-svg-sm text-success" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>`,
    warning: `<svg class="icon-svg-sm text-warning" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>`,
    error: `<svg class="icon-svg-sm text-danger" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>`
  };

  // Replace existing toast with the same title so rapid dial/toggle changes don't stack duplicates
  const existingChildren = Array.from(DOM.toastContainer.children || []);
  for (const existing of existingChildren) {
    if (existing.getAttribute && existing.getAttribute('data-toast-title') === String(title)) {
      if (existing._autoHideTimer) clearTimeout(existing._autoHideTimer);
      if (DOM.toastContainer.removeChild) DOM.toastContainer.removeChild(existing);
      else if (existing.remove) existing.remove();
    }
  }

  // Enforce max visible toast cap by evicting oldest toasts immediately
  let evictGuard = 0;
  while ((DOM.toastContainer.children || []).length >= MAX_VISIBLE_TOASTS && evictGuard++ < 10) {
    const oldest = DOM.toastContainer.firstChild;
    if (!oldest) break;
    if (oldest._autoHideTimer) clearTimeout(oldest._autoHideTimer);
    if (DOM.toastContainer.removeChild) DOM.toastContainer.removeChild(oldest);
    else if (oldest.remove) oldest.remove();
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('data-toast-title', String(title));
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <div class="toast-content">
      <div class="toast-title">${escapeHtml(title)}</div>
      <div class="toast-message">${escapeHtml(message)}</div>
    </div>
    <button class="toast-close" aria-label="Close">✕</button>
  `;
  toast.querySelector('.toast-close').addEventListener('click', () => dismissToast(toast));
  DOM.toastContainer.appendChild(toast);
  if (duration > 0) {
    toast._autoHideTimer = setTimeout(() => dismissToast(toast), duration);
    if (toast._autoHideTimer && typeof toast._autoHideTimer.unref === 'function') {
      toast._autoHideTimer.unref();
    }
  }
}

function dismissToast(toast) {
  if (!toast || (!toast.parentNode && (!DOM.toastContainer || !Array.from(DOM.toastContainer.children || []).includes(toast)))) return;
  if (toast._autoHideTimer) {
    clearTimeout(toast._autoHideTimer);
    toast._autoHideTimer = null;
  }
  toast.classList.add('removing');
  // Always remove via timeout fallback even if CSS animation is absent or reduced-motion is enabled
  const removeTimer = setTimeout(() => {
    if (toast && toast.parentNode && toast.parentNode.removeChild) {
      toast.parentNode.removeChild(toast);
    } else if (toast && toast.remove) {
      toast.remove();
    }
  }, 220);
  if (removeTimer && typeof removeTimer.unref === 'function') {
    removeTimer.unref();
  }
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

/**
 * Format a focus percentage from study time and total session tracking time.
 * Returns '—' when session duration is zero (empty state),
 * or 'X%' when session tracking data exists.
 *
 * @param {number} studyMs — verified study time in ms
 * @param {number} sessionMs — total session duration in ms
 * @returns {string}
 */
function formatFocusPercentage(studyMs, sessionMs) {
  if (!sessionMs || sessionMs <= 0) return '—';
  return Math.round((Math.max(0, studyMs) / sessionMs) * 100) + '%';
}

/** Format a timestamp as a time string like "2:34 PM" */
function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Return local date string formatted as YYYY-MM-DD */
function getLocalDateString(timestamp = Date.now()) {
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Update the Start button label based on accumulated time today */
function updateStartButtonLabel() {
  if (!DOM.startBtn) return;
  const hasTime = (state.session.studyTime || state.session.accStudyMs || 0) > 0;
  DOM.startBtn.innerHTML = `<svg class="btn-icon-svg" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> <span class="btn-text">${hasTime ? 'Continue Studying' : 'Start Studying'}</span>`;
}


// ═══════════════════════════════════════════════
// 12. STATUS DISPLAY
// ═══════════════════════════════════════════════

function setStatus(status, text) {
  state.status = status;
  if (DOM.statusChip) DOM.statusChip.setAttribute('data-status', status);
  if (DOM.homeInstrument) DOM.homeInstrument.setAttribute('data-status', status);
  if (typeof document !== 'undefined' && document.body && typeof document.body.setAttribute === 'function') {
    document.body.setAttribute('data-session-active', state.session?.active ? 'true' : 'false');
  }

  const defaultTexts = {
    'idle': (state.session && (state.session.studyTime || state.session.accStudyMs || 0) > 0)
      ? 'READY TO CONTINUE' : 'READY TO STUDY',
    'calibrating': 'CALIBRATING…',
    'studying': 'LOCKED IN',
    'looking-away': 'PAUSED: LOOKING AWAY',
    'away': 'PAUSED: AWAY',
    'lid-closed': 'PAUSED: SLEEP',
  };
  const displayText = text || defaultTexts[status] || status;
  DOM.statusText.textContent = displayText;

  if (DOM.liveStatusChip) DOM.liveStatusChip.setAttribute('data-status', status);
  if (DOM.liveStatusText) DOM.liveStatusText.textContent = displayText;

  // Timer display styling
  if (status === 'studying') {
    DOM.timerDisplay.classList.add('active');
    DOM.timerDisplay.classList.remove('paused');
  } else if (['looking-away', 'away', 'lid-closed'].includes(status)) {
    DOM.timerDisplay.classList.remove('active');
    DOM.timerDisplay.classList.add('paused');
    if (DOM.signalBars) DOM.signalBars.setAttribute('data-level', '1');
  } else {
    DOM.timerDisplay.classList.remove('active', 'paused');
    if (DOM.signalBars) DOM.signalBars.setAttribute('data-level', '0');
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
  DOM.homeRecentEvents.innerHTML = recentEventsLog.map(e => `<li>${escapeHtml(e)}</li>`).join('');
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

/**
 * Update a pipeline health indicator in the Vision Telemetry panel.
 *
 * @param {'Cam'|'Model'|'Face'|'Focus'|'Worker'} step - Pipeline stage
 * @param {'active'|'loading'|'inactive'|'warn'|'error'|boolean} status - Operational state
 * @param {string} [customText] - Optional custom message to display
 */
function updatePipeline(step, status, customText) {
  const el = DOM[`pipe${step}`];
  if (!el) return;

  el.classList.remove('pipe-ok', 'pipe-warn', 'pipe-err');

  let normStatus = status;
  if (status === true) normStatus = 'active';
  if (status === false) normStatus = 'inactive';

  const shortNames = {
    Cam: 'Cam',
    Model: 'Model',
    Face: 'Face',
    Focus: 'Screen',
    Worker: 'Worker',
  };
  const baseLabel = shortNames[step] || step;

  switch (normStatus) {
    case 'active':
      el.classList.add('pipe-ok');
      el.textContent = baseLabel;
      el.title = customText || `${baseLabel}: Active`;
      break;

    case 'loading':
      el.textContent = `${baseLabel}…`;
      el.title = customText || `${baseLabel}: Initializing`;
      break;

    case 'warn':
      el.classList.add('pipe-warn');
      el.textContent = baseLabel;
      el.title = customText || `${baseLabel}: Warning`;
      break;

    case 'error':
      el.classList.add('pipe-err');
      el.textContent = baseLabel;
      el.title = customText || `${baseLabel}: Error`;
      break;

    case 'inactive':
    default:
      el.textContent = baseLabel;
      el.title = customText || `${baseLabel}: Standby`;
      break;
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
  const AudioCtx = (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext));
  if (!AudioCtx) return;
  try {
    if (!audioCtx) {
      audioCtx = new AudioCtx();
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
  } catch (_) { }
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

    if (state.settings.notificationsOn && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
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
  updatePipeline('Cam', 'loading', '⏳ Camera Starting…');
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
    if (DOM.cameraIndicator) {
      DOM.cameraIndicator.classList.add('visible');
      const lbl = typeof DOM.cameraIndicator.querySelector === 'function'
        ? DOM.cameraIndicator.querySelector('.camera-status-label') : null;
      if (lbl) lbl.textContent = 'Sensor Active';
    }

    // Show preview if enabled in settings
    setCameraPreviewEnabled(Boolean(state.settings.cameraPreview), false);

    // Listen for camera track ending (e.g. user unplugged camera, lid closed)
    state.camera.videoTrack.addEventListener('ended', handleCameraTrackEnded);

    console.log('📷 Camera started:', state.camera.videoTrack.label);
    updatePipeline('Cam', 'active', '✅ Camera Active');
    return true;

  } catch (err) {
    console.error('Camera access denied or failed:', err);
    showToast('error', 'Camera required',
      'Ayush_Tracker needs your webcam to detect focus. Please allow camera access and try again.');
    const isDenied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError';
    updatePipeline('Cam', 'error', isDenied ? '❌ Camera Denied' : '❌ Camera Error');
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
  if (DOM.cameraIndicator) {
    DOM.cameraIndicator.classList.remove('visible');
    const lbl = typeof DOM.cameraIndicator.querySelector === 'function'
      ? DOM.cameraIndicator.querySelector('.camera-status-label') : null;
    if (lbl) lbl.textContent = 'Sensor Standby';
  }
  if (DOM.liveCameraWrapper && !state.settings.cameraPreview) {
    DOM.liveCameraWrapper.style.display = 'none';
  }

  updatePipeline('Cam', 'inactive');
  console.log('📷 Camera stopped');
}

/**
 * Called when the camera track ends unexpectedly.
 * This happens when the user closes the laptop lid, unplugs
 * an external webcam, or revokes camera permission.
 */
function getMonotonicNow() {
  return (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();
}

function handleCameraTrackEnded(wallNow = Date.now(), monoNow = getMonotonicNow()) {
  updatePipeline('Cam', 'error', '❌ Camera Lost');
  if (state.session.active && state.status !== 'idle' && state.status !== 'lid-closed') {
    freezeStudyTime(wallNow, monoNow);
    if (state.session.unverifiedStartedAt !== null) {
      if (state.lastTickMonotonic !== null) {
        const cursor = typeof state.session.unverifiedCursorMono === 'number'
          ? state.session.unverifiedCursorMono
          : state.lastTickMonotonic;
        const extraMono = (typeof monoNow === 'number' && typeof cursor === 'number' && monoNow >= cursor)
          ? (monoNow - cursor)
          : 0;
        state.session.accUnverifiedMs = Math.max(
          state.session.unverifiedTime || 0,
          (state.session.accUnverifiedMs || 0) + (state.session.unverifiedRunMs || 0)
        ) + extraMono;
      } else {
        state.session.accUnverifiedMs = (state.session.accUnverifiedMs || 0) +
          Math.max(0, wallNow - state.session.unverifiedStartedAt);
      }
      state.session.unverifiedTime = Math.max(state.session.unverifiedTime || 0, state.session.accUnverifiedMs);
      state.session.unverifiedRunMs = 0;
      state.session.unverifiedCursorMono = null;
      state.session.unverifiedStartedAt = null;
    }
    state.session.sessionTime = (state.session.studyTime || 0) + (state.session.unverifiedTime || 0);
    startPauseEvent('cameraLost', wallNow, monoNow);
    state.session.pausedTime = calculateTotalPausedTime(state.session.pauses, wallNow);
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
  updatePipeline('Model', 'loading', '⏳ Model Loading…');
  if (!FaceLandmarker || !FilesetResolver) {
    const loaded = await loadMediaPipeModule();
    if (!loaded) {
      updatePipeline('Model', 'error', '❌ Model Unavailable');
      return false;
    }
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
      outputFacialTransformationMatrixes: false,
    });

    console.log('✅ FaceLandmarker initialised');
    updatePipeline('Model', 'active', '✅ Model Loaded');
    return true;

  } catch (err) {
    console.error('❌ FaceLandmarker init failed:', err);
    showToast('error', 'Face detection failed',
      'Could not initialise the face detection model. ' + err.message);
    showLiveError('Model failed to load. Check console.');
    updatePipeline('Model', 'error', '❌ Model Failed');
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

  const noseTip = landmarks[4];
  const rightCheek = landmarks[234]; // person's right, camera left
  const leftCheek = landmarks[454]; // person's left, camera right
  const foreheadTop = landmarks[10];
  const chinBottom = landmarks[152];
  const rightEye = landmarks[33];
  const leftEye = landmarks[263];
  const rightMouth = landmarks[61];
  const leftMouth = landmarks[291];

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
function setCalibrationUiState(active, progress = 0) {
  if (DOM.homeInstrument) {
    DOM.homeInstrument.setAttribute('data-calibrating', active ? 'true' : 'false');
  }
  if (DOM.calibrationOverlay) {
    DOM.calibrationOverlay.classList.toggle('active', active);
    DOM.calibrationOverlay.setAttribute('aria-hidden', active ? 'false' : 'true');
  }
  if (DOM.calibrationArc) {
    const CAL_CIRC = 804.25;
    DOM.calibrationArc.style.strokeDashoffset = active
      ? (CAL_CIRC * (1 - Math.max(0, Math.min(1, progress))))
      : CAL_CIRC;
  }
}

function cancelCalibration() {
  if (!state.calibration.isCalibrating) return false;
  if (state.calibration._intervalId) {
    clearInterval(state.calibration._intervalId);
    state.calibration._intervalId = null;
  }
  state.calibration.isCalibrating = false;
  state.calibration.cancelled = true;
  setCalibrationUiState(false, 0);
  setStatus('idle');
  if (typeof state.calibration._resolve === 'function') {
    const res = state.calibration._resolve;
    state.calibration._resolve = null;
    res(false);
  }
  return true;
}

async function runCalibration() {
  return new Promise((resolve) => {
    state.calibration.isCalibrating = true;
    state.calibration.cancelled = false;
    state.calibration._resolve = resolve;
    state.calibration.samples = [];
    state.calibration.startTime = getMonotonicNow();

    const DURATION_MS = 5000; // 5 seconds

    // Reset progress and notice UI immediately inside Optical Viewfinder
    if (DOM.calibrationProgressBar) DOM.calibrationProgressBar.style.width = '0%';
    if (DOM.calibrationCountdown) DOM.calibrationCountdown.textContent = '5s';
    if (DOM.calibrationSubstatus) {
      DOM.calibrationSubstatus.textContent = 'Hold steady facing screen…';
    }

    setCalibrationUiState(true, 0);
    if (DOM.calibrationCancelBtn && typeof DOM.calibrationCancelBtn.focus === 'function') {
      DOM.calibrationCancelBtn.focus();
    }
    setStatus('calibrating');

    const checkInterval = setInterval(() => {
      if (state.calibration.cancelled || !state.calibration.isCalibrating) {
        clearInterval(checkInterval);
        return;
      }
      const elapsed = getMonotonicNow() - state.calibration.startTime;
      const progress = Math.min(elapsed / DURATION_MS, 1);

      if (DOM.calibrationProgressBar) {
        DOM.calibrationProgressBar.style.width = (progress * 100) + '%';
      }
      setCalibrationUiState(true, progress);

      const remaining = Math.max(0, Math.ceil((DURATION_MS - elapsed) / 1000));
      if (DOM.calibrationCountdown) DOM.calibrationCountdown.textContent = remaining + 's';

      if (DOM.calibrationSubstatus) {
        if (remaining >= 4) {
          DOM.calibrationSubstatus.textContent = 'Hold steady in study posture…';
        } else if (remaining === 3) {
          DOM.calibrationSubstatus.textContent = 'Sampling neutral pitch & yaw…';
        } else if (remaining === 2) {
          DOM.calibrationSubstatus.textContent = 'Aligning optical horizon…';
        } else if (remaining === 1) {
          DOM.calibrationSubstatus.textContent = 'Finalizing baseline…';
        } else {
          DOM.calibrationSubstatus.textContent = 'Calibration locked';
        }
      }

      if (progress >= 1) {
        clearInterval(checkInterval);
        state.calibration._intervalId = null;

        const samples = state.calibration.samples;

        if (samples.length < 5) {
          setCalibrationUiState(false, 0);
          showToast('warning', 'Calibration failed',
            'Could not detect your face consistently. Sit facing the camera in good lighting and try again.');
          state.calibration.isCalibrating = false;
          setStatus('idle');
          state.calibration._resolve = null;
          resolve(false);
          return;
        }

        const sum = samples.reduce(
          (acc, s) => ({ yaw: acc.yaw + s.yaw, pitch: acc.pitch + s.pitch }),
          { yaw: 0, pitch: 0 }
        );
        state.calibration.neutralYaw = sum.yaw / samples.length;
        state.calibration.neutralPitch = sum.pitch / samples.length;

        console.log(`🎯 Calibrated: yaw=${state.calibration.neutralYaw.toFixed(1)}°, ` +
          `pitch=${state.calibration.neutralPitch.toFixed(1)}°, ` +
          `(${samples.length} samples)`);

        setCalibrationUiState(false, 0);
        state.calibration.isCalibrating = false;
        state.calibration._resolve = null;

        showToast('success', 'Calibration Done', 'Neutral optical baseline locked.');
        resolve(true);
      }
    }, 100);
    state.calibration._intervalId = checkInterval;
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
  // Reset health & attempt timestamps; never mark frames as processed until detectForVideo succeeds
  state.camera._lastLoopTime = 0;
  state.camera.lastAttemptTime = 0;
  state.camera.lastFrameTime = 0;
  state.camera.lastFaceTime = 0;
  state.camera.lastAttemptMonotonic = null;
  state.camera.lastFrameMonotonic = null;
  state.camera.lastFaceMonotonic = null;
  state.camera.lastDetectionTime = 0;
  state.camera.frameSeq = 0;
  state.camera._lastTickFrameSeq = 0;
  state.camera._msSinceLastFrame = 0;
  state.headPose.buffer = [];
  updatePipeline('Face', 'loading', '⏳ Face Searching…');

  function loop() {
    if (!state.camera.isDetecting) return;

    // Throttle to ~5 fps using internal monotonic/wall loop timer (NOT camera health timestamps)
    const loopNow = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (loopNow - (state.camera._lastLoopTime || 0) >= DETECTION_INTERVAL_MS) {
      state.camera._lastLoopTime = loopNow;
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
  updatePipeline('Face', 'inactive');
  updatePipeline('Focus', 'inactive');
  console.log('🔍 Detection loop stopped');
}

/**
 * Run a single detection frame.
 * Called ~5 times per second by the detection loop.
 */
let frameCount = 0;
let lastFpsTime = Date.now();

function runDetection(wallNowOverride, monotonicOverride) {
  const faceLandmarker = state.camera.faceLandmarker;
  const video = DOM.cameraPreview;
  const wallNow = typeof wallNowOverride === 'number' ? wallNowOverride : Date.now();
  const monoNow = typeof monotonicOverride === 'number'
    ? monotonicOverride
    : (typeof performance !== 'undefined' ? performance.now() : wallNow);

  // Record detection attempt time (distinct from successful frame & valid face times)
  state.camera.lastAttemptTime = wallNow;
  state.camera.lastAttemptMonotonic = monoNow;

  // Video-not-ready conditions must NOT update lastFrameTime, lastFaceTime, or appear healthy
  if (!faceLandmarker || !video || video.readyState < 2) {
    updatePipeline('Face', 'warn', '⚠️ Video Not Ready');
    return;
  }

  // Run face detection on the current video frame
  let results;
  try {
    results = faceLandmarker.detectForVideo(video, monoNow);
  } catch (err) {
    // Detection failed: do NOT update lastFrameTime or lastFaceTime
    return;
  }

  if (!results || typeof results !== 'object') {
    return;
  }

  // Frame processing succeeded
  const prevFrameMono = state.camera.lastFrameMonotonic;
  const prevFrameWall = state.camera.lastFrameTime || state.camera.lastDetectionTime || 0;
  if (state.camera.isDetecting && state.session.active) {
    if (typeof prevFrameMono === 'number' && Number.isFinite(prevFrameMono)) {
      if ((monoNow - prevFrameMono) > CONFIG.lidGapMs) {
        state.camera._suspensionDetected = true;
      }
    } else if (prevFrameWall > 0 && (wallNow - prevFrameWall) > CONFIG.lidGapMs) {
      state.camera._suspensionDetected = true;
    }
  }
  state.camera.lastFrameTime = wallNow;
  state.camera.lastFrameMonotonic = monoNow;
  state.camera.lastDetectionTime = wallNow;
  state.camera.frameSeq = (state.camera.frameSeq || 0) + 1;
  state.camera._msSinceLastFrame = 0;

  // Calculate FPS
  frameCount++;
  const timeNow = wallNow;
  if (timeNow - lastFpsTime >= 1000) {
    DOM.liveFps.textContent = frameCount;
    frameCount = 0;
    lastFpsTime = timeNow;
  }

  const faceFound = Boolean(results.faceLandmarks && results.faceLandmarks.length > 0);
  if (faceFound) {
    state.camera.lastFaceTime = wallNow;
    state.camera.lastFaceMonotonic = monoNow;
    updatePipeline('Face', 'active', '✅ Face Detected');
  } else {
    updatePipeline('Face', 'warn', '👀 No Face');
  }

  // Draw canvas overlay if checked & main tab is active (saves CPU/GPU headroom in background)
  if (DOM.livePreviewCb.checked && !document.hidden && DOM.liveCanvas && typeof DOM.liveCanvas.getContext === 'function') {
    const canvas = DOM.liveCanvas;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const targetW = video.videoWidth || 640;
      const targetH = video.videoHeight || 480;
      if (canvas.width !== targetW) canvas.width = targetW;
      if (canvas.height !== targetH) canvas.height = targetH;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (faceFound) {
        const landmarks = results.faceLandmarks[0];
        let minX = 1, minY = 1, maxX = 0, maxY = 0;
        for (const p of landmarks) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }
        const meshColor = state.theme === 'dark' ? '#A3AD91' : '#258564';
        ctx.strokeStyle = meshColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(minX * canvas.width, minY * canvas.height, (maxX - minX) * canvas.width, (maxY - minY) * canvas.height);

        // Draw subtle landmark mesh points (sampling every 3rd point for clean visual & low overhead)
        ctx.fillStyle = meshColor;
        for (let i = 0; i < landmarks.length; i += 3) {
          const p = landmarks[i];
          ctx.fillRect(p.x * canvas.width - 1, p.y * canvas.height - 1, 2, 2);
        }
      }
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
    state.headPose.lastFaceSeen = wallNow;

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
    const cutoff = state.settings.focusThreshold || 50;
    const isFacingScreen = focusScore >= cutoff;

    // ── Update the Focus gauge only when tab is visible to minimize background headroom ──
    if (!document.hidden) {
      updateFocusIndicator(smoothed, focusScore);

      // Update pipeline indicator for screen focus with live percentage
      if (DOM.pipeFocus) {
        if (isFacingScreen) {
          updatePipeline('Focus', 'active', `✅ Facing Screen (${focusScore}%)`);
        } else {
          updatePipeline('Focus', 'warn', `👀 Focus Low (${focusScore}% < ${cutoff}%)`);
        }
      }
    }

    // Update Picture-in-Picture window in real time (always active)
    updatePiP(focusScore);

    // Update the state machine (stops suddenly if focusScore < cutoff)
    processDetectionResult(true, isFacingScreen, focusScore, wallNow, monoNow);

  } else {
    state.headPose.faceDetected = false;
    DOM.liveSinceFace.textContent = state.headPose.lastFaceSeen > 0
      ? Math.max(0, Math.round((wallNow - state.headPose.lastFaceSeen) / 1000))
      : '—';

    // No face — reset focus indicators
    updateFocusIndicator(null, 0);
    updatePiP(0);
    updatePipeline('Face', 'warn', '👀 No Face');
    if (DOM.pipeFocus) {
      updatePipeline('Focus', 'warn', '❌ Screen (No Face)');
    }

    if (state.calibration.isCalibrating) return;

    processDetectionResult(false, false, 0, wallNow, monoNow);
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
function calculateFocusScore(pose, neutralOverride, thresholdOverride, readingModeOverride) {
  if (!pose) return 0;

  const threshold = thresholdOverride ?? (SENSITIVITY[state?.settings?.sensitivity] || 25);
  const neutralYaw = neutralOverride?.yaw ?? (state?.calibration?.neutralYaw || 0);
  const neutralPitch = neutralOverride?.pitch ?? (state?.calibration?.neutralPitch || 0);
  const readingMode = readingModeOverride ?? (state?.settings?.readingMode || false);

  const yawDev = Math.abs(pose.yaw - neutralYaw);
  let pitchDev = Math.abs(pose.pitch - neutralPitch);
  if (readingMode && pose.pitch > neutralPitch) {
    pitchDev = 0; // Ignore looking down in reading mode
  }

  // Pitch is slightly less restrictive than yaw since screens have vertical height
  const deviation = Math.hypot(yawDev, pitchDev * 0.85);
  const x = Math.min(1.0, deviation / threshold);

  // Power curve: stays >= 80% in comfortable screen cone, drops sharply once turned away
  const score = Math.max(0, Math.min(100, Math.round(100 * (1 - Math.pow(x, 1.5)))));
  return score;
}

function calculateYaw(noseX, leftCheekX, rightCheekX) {
  const dLeft = Math.abs(noseX - leftCheekX);
  const dRight = Math.abs(noseX - rightCheekX);
  if (dLeft + dRight === 0) return 0;
  const yawRatio = (dLeft - dRight) / (dLeft + dRight);
  return yawRatio * 90;
}

function calculatePitch(noseY, foreheadY, chinY) {
  const dTop = Math.abs(noseY - foreheadY);
  const dBottom = Math.abs(noseY - chinY);
  if (dTop + dBottom === 0) return 0;
  const pitchRatio = (dTop - dBottom) / (dTop + dBottom);
  return pitchRatio * 90;
}

function calculateGoalProgress(studyMs, goalHours) {
  const goalMs = (goalHours || 4) * 3600000;
  if (goalMs <= 0) return 0;
  return Math.min(100, Math.round((Math.max(0, studyMs) / goalMs) * 100));
}

function calculateBackdatedStudyTime(recordedStudyTime, pauseDelayMs) {
  return Math.max(0, recordedStudyTime - pauseDelayMs);
}

/**
 * Check if the user is facing the screen based on head pose.
 *
 * @param {{ yaw: number, pitch: number }} pose — smoothed head pose
 * @returns {boolean} — true if focus score meets the configured threshold
 */
function isUserFacingScreen(pose) {
  const score = calculateFocusScore(pose);
  const cutoff = state.settings.focusThreshold || 50;
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
  const cutoff = state.settings.focusThreshold || 50;
  const CIRCUMFERENCE = 804.25; // 2π × 128

  if (!pose) {
    DOM.focusArc.style.strokeDashoffset = CIRCUMFERENCE;
    DOM.focusArc.style.stroke = 'var(--signal-orange-hud)';
    DOM.focusPctVal.textContent = '0%';
    DOM.focusPctVal.style.color = 'var(--signal-orange-hud)';
    DOM.headPosDot.style.left = '50%';
    DOM.headPosDot.style.top = '50%';
    DOM.headPosDot.style.background = 'var(--signal-orange-hud)';
    DOM.headPosDot.style.opacity = '0.35';
    if (DOM.horizonGroup) {
      DOM.horizonGroup.style.transform = 'translateY(0px) rotate(0deg)';
    }
    if (DOM.signalBars) {
      DOM.signalBars.setAttribute('data-level', '0');
    }
    return;
  }

  const focusPct = typeof focusScore === 'number' ? focusScore : calculateFocusScore(pose);

  // Arc fill around Optical Viewfinder circumference
  const offset = CIRCUMFERENCE - (CIRCUMFERENCE * focusPct / 100);
  DOM.focusArc.style.strokeDashoffset = offset;

  const arcColour = focusPct >= cutoff
    ? 'var(--optical-sage-hud)'
    : 'var(--signal-orange-hud)';
  DOM.focusArc.style.stroke = arcColour;
  DOM.focusPctVal.textContent = focusPct + '%';
  DOM.focusPctVal.style.color = arcColour;

  // Signal bars (3 = strong lock, 2 = focused, 1 = off-cone)
  if (DOM.signalBars) {
    const level = focusPct >= 80 ? '3' : focusPct >= cutoff ? '2' : '1';
    DOM.signalBars.setAttribute('data-level', level);
  }

  // Live percentage readout in Chronometer status bar while studying
  if (state.status === 'studying' && DOM.statusText) {
    DOM.statusText.textContent = `LOCKED IN (${focusPct}%)`;
  }

  // Artificial horizon responds to calibrated yaw & pitch
  const yawDelta = pose.yaw - neutralYaw;
  const pitchDelta = pose.pitch - neutralPitch;
  if (DOM.horizonGroup) {
    const rollDeg = Math.max(-18, Math.min(18, yawDelta * 0.45));
    const pitchPx = Math.max(-28, Math.min(28, pitchDelta * 1.1));
    DOM.horizonGroup.style.transform = `translateY(${pitchPx.toFixed(1)}px) rotate(${rollDeg.toFixed(1)}deg)`;
  }

  // Head-position crosshair dot (50% = center of the lens)
  const xPct = 50 + (yawDelta / threshold) * 32;
  const yPct = 50 + (pitchDelta / threshold) * 32;
  DOM.headPosDot.style.left = Math.min(86, Math.max(14, xPct)) + '%';
  DOM.headPosDot.style.top = Math.min(86, Math.max(14, yPct)) + '%';
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
function processDetectionResult(faceDetected, facingScreen, focusScore = 0, timestamp = Date.now(), monotonicNow = null) {
  if (typeof faceDetected === 'object' && faceDetected !== null) {
    const opts = faceDetected;
    faceDetected = !!opts.faceDetected;
    facingScreen = opts.isFacingScreen ?? opts.facingScreen ?? true;
    focusScore = opts.focusScore ?? (opts.isFacingScreen !== false ? 100 : 0);
    timestamp = opts.timestamp || Date.now();
    monotonicNow = typeof opts.monotonic === 'number' ? opts.monotonic : null;
  }
  const now = timestamp;
  const monoNow = typeof monotonicNow === 'number' && Number.isFinite(monotonicNow) ? monotonicNow : null;
  const hp = state.headPose;
  const cutoff = state.settings.focusThreshold || 50;
  const isFocused = faceDetected && (focusScore >= cutoff);
  const lookawayLimit = (state.settings.lookawayTime || 3) * 1000;
  const awayLimit = (state.settings.awayTime || 10) * 1000;

  // ── STUDYING ──
  if (state.status === 'studying') {

    if (isFocused) {
      // All good — keep studying
      hp.lookAwayStart = 0;
      hp.lookAwayStartMono = null;
      hp.awayStart = 0;
      hp.awayStartMono = null;
      hp.facingScreenSince = hp.facingScreenSince || now;
      if (monoNow !== null && hp.facingScreenSinceMono === null) hp.facingScreenSinceMono = monoNow;
      return;
    }

    if (faceDetected && !isFocused) {
      // Face visible but focus dropped below cutoff — wait lookawayTime before pausing
      if (hp.lookAwayStart === 0) {
        hp.lookAwayStart = now;
        hp.lookAwayStartMono = monoNow;
      }
      hp.facingScreenSince = 0;
      hp.facingScreenSinceMono = null;

      const lookawayElapsed = (monoNow !== null && hp.lookAwayStartMono !== null)
        ? (monoNow - hp.lookAwayStartMono)
        : (now - hp.lookAwayStart);
      if (lookawayElapsed >= lookawayLimit) {
        // Freeze back-dated to when the user actually looked away (monotonic + wall)
        freezeStudyTime(hp.lookAwayStart, hp.lookAwayStartMono);
        startPauseEvent('lookAway', hp.lookAwayStart, hp.lookAwayStartMono);
        setStatus('looking-away');
        state.session.distractions.lookAway++;
        triggerNudge('lookAway');
        updateSessionStatsDisplay();
        autoSaveSession();
      }
      return;
    }

    if (!faceDetected) {
      // Face completely lost — wait awayTime (time pause when face gone) before pausing
      if (hp.awayStart === 0) {
        hp.awayStart = now;
        hp.awayStartMono = monoNow;
      }
      hp.facingScreenSince = 0;
      hp.facingScreenSinceMono = null;
      hp.lookAwayStart = 0;
      hp.lookAwayStartMono = null;

      const awayElapsed = (monoNow !== null && hp.awayStartMono !== null)
        ? (monoNow - hp.awayStartMono)
        : (now - hp.awayStart);
      if (awayElapsed >= awayLimit) {
        // Freeze back-dated to when the face was lost (monotonic + wall)
        freezeStudyTime(hp.awayStart, hp.awayStartMono);
        startPauseEvent('away', hp.awayStart, hp.awayStartMono);
        setStatus('away');
        state.session.distractions.away++;
        triggerNudge('away');
        updateSessionStatsDisplay();
        autoSaveSession();
      }
      return;
    }
  }

  // ── LOOKING AWAY / AWAY / LID CLOSED — waiting to resume ──
  if (['looking-away', 'away', 'lid-closed'].includes(state.status)) {

    if (isFocused) {
      // User is back and focused on screen — require configured steady focus to resume
      if (hp.facingScreenSince === 0) {
        hp.facingScreenSince = now;
        hp.facingScreenSinceMono = monoNow;
      }

      const facingDuration = (monoNow !== null && hp.facingScreenSinceMono !== null)
        ? (monoNow - hp.facingScreenSinceMono)
        : (now - hp.facingScreenSince);
      if (facingDuration >= (CONFIG.resumeDelayMs || 2000)) {
        hp.lookAwayStart = 0;
        hp.lookAwayStartMono = null;
        hp.awayStart = 0;
        hp.awayStartMono = null;
        hp.facingScreenSince = 0;
        hp.facingScreenSinceMono = null;
        endPauseEvent(now, monoNow);
        resumeStudyTime(now, monoNow);
        if (state.session.sessionStartedAt === null) {
          state.session.sessionStartedAt = now;
        }
        setStatus('studying');
        triggerNudge('resumed');
        autoSaveSession();
      }
    } else {
      hp.facingScreenSince = 0;
      hp.facingScreenSinceMono = null;
    }
    return;
  }
}

// ═══════════════════════════════════════════════
// 19B. TIMER ANCHORING — freeze and resume
// ═══════════════════════════════════════════════

/**
 * Calculate total paused time from the pauses array.
 * Merges overlapping/duplicate pause intervals so durations are never
 * negative or double-counted. If a pause is unclosed, spans up to relativeTo.
 */
function calculateTotalPausedTime(pauses = [], relativeTo = Date.now()) {
  if (!Array.isArray(pauses) || pauses.length === 0) return 0;
  const monoMap = new Map();
  const wallIntervals = [];

  for (const p of pauses) {
    if (!p || typeof p.start !== 'number' || !Number.isFinite(p.start)) continue;
    const key = `${p.type || 'pause'}_${p.start}`;
    if (typeof p.end === 'number' && typeof p.durationMs === 'number' && Number.isFinite(p.durationMs)) {
      const prev = monoMap.get(key) || 0;
      monoMap.set(key, Math.max(prev, Math.max(0, p.durationMs)));
      continue;
    }
    if (p.end === null && typeof p.monoDurationMs === 'number' && Number.isFinite(p.monoDurationMs)) {
      const prev = monoMap.get(key) || 0;
      monoMap.set(key, Math.max(prev, Math.max(0, p.monoDurationMs)));
      continue;
    }
    const rawEnd = (typeof p.end === 'number' && Number.isFinite(p.end)) ? p.end : relativeTo;
    const end = Math.max(p.start, rawEnd);
    if (end > p.start) {
      wallIntervals.push([p.start, end]);
    }
  }

  let monoTotal = 0;
  for (const dur of monoMap.values()) {
    monoTotal += dur;
  }

  let wallTotal = 0;
  if (wallIntervals.length > 0) {
    wallIntervals.sort((a, b) => a[0] - b[0]);
    let curStart = wallIntervals[0][0];
    let curEnd = wallIntervals[0][1];
    for (let i = 1; i < wallIntervals.length; i++) {
      const [s, e] = wallIntervals[i];
      if (s <= curEnd) {
        curEnd = Math.max(curEnd, e);
      } else {
        wallTotal += (curEnd - curStart);
        curStart = s;
        curEnd = e;
      }
    }
    wallTotal += (curEnd - curStart);
  }
  return Math.max(0, monoTotal + wallTotal);
}

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
function freezeStudyTime(pauseAt = Date.now(), pauseMonotonic = null) {
  const s = state.session;
  if (s.studyStartedAt === null) return; // already frozen
  const hasExplicitMono = typeof pauseMonotonic === 'number' && Number.isFinite(pauseMonotonic);
  const cursor = typeof s.studyCursorMono === 'number' ? s.studyCursorMono : state.lastTickMonotonic;

  if (hasExplicitMono && typeof cursor === 'number' && Number.isFinite(cursor)) {
    if (pauseMonotonic >= cursor) {
      const extraMono = pauseMonotonic - cursor;
      s.accStudyMs = Math.max(s.studyTime || 0, (s.accStudyMs || 0) + (s.studyRunMs || 0)) + extraMono;
    } else {
      // Back-dated pause started before cursor
      const backdate = cursor - pauseMonotonic;
      const runCredit = Math.max(0, (s.studyRunMs || 0) - backdate);
      s.accStudyMs = (s.accStudyMs || 0) + runCredit;
    }
  } else if (state.lastTickMonotonic !== null) {
    const refTime = state.lastTickTimestamp || pauseAt;
    const backdate = (pauseAt < refTime && (refTime - pauseAt) <= 60000) ? (refTime - pauseAt) : 0;
    const subTick = (pauseAt > refTime && (pauseAt - refTime) <= CONFIG.maxTickMs) ? (pauseAt - refTime) : 0;
    const runCredit = Math.max(0, (s.studyRunMs || 0) - backdate + subTick);
    s.accStudyMs = (s.accStudyMs || 0) + runCredit;
  } else {
    s.accStudyMs = (s.accStudyMs || 0) + Math.max(0, pauseAt - s.studyStartedAt);
  }
  s.studyTime = Math.max(0, s.accStudyMs);
  s.studyRunMs = 0;
  s.studyStartedAt = null;
  s.studyCursorMono = null;
  saveTodayToLocalStorage(pauseAt);
}

function resumeStudyTime(resumeAt = Date.now(), resumeMonotonic = null) {
  state.session.studyRunMs = 0;
  state.session.studyStartedAt = resumeAt;
  state.session.studyCursorMono = (typeof resumeMonotonic === 'number' && Number.isFinite(resumeMonotonic))
    ? resumeMonotonic
    : state.lastTickMonotonic;
}

/**
 * Open a new pause event in the session's pauses list.
 * Captures monotonic boundaries so mid-tick pauses never double-count intervals.
 */
function startPauseEvent(type, timestamp = Date.now(), monotonicNow = null) {
  if (!Array.isArray(state.session.pauses)) {
    state.session.pauses = [];
  }
  const hasExplicitMono = typeof monotonicNow === 'number' && Number.isFinite(monotonicNow);
  endPauseEvent(timestamp, hasExplicitMono ? monotonicNow : null);

  const pauseObj = { type, start: timestamp, end: null };
  if (hasExplicitMono) {
    pauseObj.monoStart = monotonicNow;
    pauseObj.monoCursor = monotonicNow;
    pauseObj.monoDurationMs = 0;
  } else if (state.lastTickMonotonic !== null) {
    const refTime = state.lastTickTimestamp || timestamp;
    const backdateMs = (timestamp < refTime && (refTime - timestamp) <= 60000)
      ? (refTime - timestamp)
      : 0;
    pauseObj.monoStart = state.lastTickMonotonic - backdateMs;
    pauseObj.monoCursor = state.lastTickMonotonic;
    pauseObj.monoDurationMs = Math.max(0, backdateMs);
  }
  state.session.pauses.push(pauseObj);
}

/**
 * Close any unclosed pause events (clamped to non-negative duration).
 * Preserves exact monotonic elapsed duration when closed mid-tick or across clock jumps.
 */
function endPauseEvent(timestamp = Date.now(), monotonicNow = null) {
  if (!Array.isArray(state.session.pauses)) return;
  const hasExplicitMono = typeof monotonicNow === 'number' && Number.isFinite(monotonicNow);
  for (const p of state.session.pauses) {
    if (p && p.end === null) {
      p.end = Math.max(p.start, timestamp);
      if (hasExplicitMono) {
        const cursor = typeof p.monoCursor === 'number'
          ? p.monoCursor
          : (typeof p.monoStart === 'number' ? p.monoStart : null);
        const extraMono = (cursor !== null && Number.isFinite(cursor))
          ? Math.max(0, monotonicNow - cursor)
          : 0;
        p.monoDurationMs = Math.max(0, (p.monoDurationMs || 0) + extraMono);
        p.monoCursor = monotonicNow;
        p.durationMs = p.monoDurationMs;
      } else if (typeof p.monoDurationMs === 'number' && Number.isFinite(p.monoDurationMs)) {
        const refTime = state.lastTickTimestamp || timestamp;
        const subTick = (state.lastTickMonotonic !== null && timestamp > refTime && (timestamp - refTime) <= CONFIG.maxTickMs)
          ? (timestamp - refTime)
          : 0;
        p.durationMs = Math.max(0, p.monoDurationMs + subTick);
      }
    }
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
  const totalDistractions = (s.distractions?.lookAway || 0) + (s.distractions?.away || 0) + (s.distractions?.lidClosed || 0);
  if (DOM.statDistractions) DOM.statDistractions.textContent = totalDistractions;
  if (DOM.homeDistractions) DOM.homeDistractions.textContent = totalDistractions;
  if (DOM.hudLiveDistractions) DOM.hudLiveDistractions.textContent = totalDistractions;

  // Focus % = study time / total tracking span (active session + paused time)
  const totalTrackingSpan = (s.sessionTime || 0) + (s.pausedTime || 0);
  const focusDisplay = formatFocusPercentage(s.studyTime, totalTrackingSpan);
  if (DOM.statFocus) DOM.statFocus.textContent = focusDisplay;
  if (DOM.homeFocus) DOM.homeFocus.textContent = focusDisplay;
  if (DOM.hudLiveFocus) DOM.hudLiveFocus.textContent = focusDisplay;

  // Hero subtimes: Active today (sessionTime) and Paused time (pausedTime)
  if (DOM.statSessionTime) DOM.statSessionTime.textContent = formatTime(s.sessionTime || 0);
  if (DOM.statPausedTime) DOM.statPausedTime.textContent = formatTime(s.pausedTime || 0);
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

  updatePipeline('Worker', 'loading', '⏳ Worker Starting…');

  state.worker = new Worker('./worker.js');
  state.lastTickTimestamp = Date.now();
  state.lastTickMonotonic = null;

  state.worker.onmessage = (e) => {
    if (e.data.type === 'tick') {
      // Unify worker tick monotonic timestamp onto main thread performance.now() origin
      // so pauses triggered by main-thread events share one monotonic timeline.
      const mainMono = getMonotonicNow();
      // Keep CV inference alive at 1 Hz when tab is hidden (rAF is suspended in background tabs)
      if (
        typeof document !== 'undefined' &&
        document.hidden &&
        state.camera.isDetecting &&
        state.camera.stream &&
        state.camera.faceLandmarker
      ) {
        runDetection(e.data.timestamp, mainMono);
      }
      handleTick({
        ...e.data,
        workerMonotonic: e.data.monotonic,
        monotonic: mainMono,
      });
    }
  };

  state.worker.onerror = (err) => {
    console.error('Worker error:', err);
    updatePipeline('Worker', 'error', '❌ Worker Error');
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
  state.lastTickMonotonic = null;
  updatePipeline('Worker', 'inactive');
  console.log('⏱ Worker stopped');
}

/**
 * Compute camera detection health metrics without relying solely on mutable wall clock.
 * Separates detection attempts from successful frame processing and valid face detection.
 */
function evaluateCameraHealth(now, hasMonotonic, monotonicDelta) {
  const cam = state.camera;
  const latestFrameWall = Math.max(cam.lastFrameTime || 0, cam.lastDetectionTime || 0);
  const hasHealthyFrame = latestFrameWall > 0;

  if (!cam.isDetecting) {
    return { isCameraActive: false, isStalled: false, latestFrameWall };
  }

  if (!hasHealthyFrame) {
    // Detection started (attempts may be occurring) but no frame has ever succeeded
    return { isCameraActive: false, isStalled: true, latestFrameWall: 0 };
  }

  const prevTickWall = state.lastTickTimestamp || 0;
  const frameArrived =
    ((cam.frameSeq || 0) !== (cam._lastTickFrameSeq || 0)) ||
    (prevTickWall > 0 && latestFrameWall > prevTickWall) ||
    (latestFrameWall === now);

  if (frameArrived) {
    cam._lastTickFrameSeq = cam.frameSeq || 0;
    const wallSinceFrame = now - latestFrameWall;
    if (wallSinceFrame >= 0 && wallSinceFrame <= CONFIG.stallThresholdMs) {
      cam._msSinceLastFrame = wallSinceFrame;
    } else {
      cam._msSinceLastFrame = 0;
    }
  } else if (hasMonotonic) {
    cam._msSinceLastFrame = (cam._msSinceLastFrame || 0) + Math.max(0, monotonicDelta);
  } else {
    cam._msSinceLastFrame = Math.max(0, now - latestFrameWall);
  }

  const msSinceFrame = cam._msSinceLastFrame || 0;
  const isStalled = msSinceFrame > CONFIG.stallThresholdMs;
  const isCameraActive = !isStalled;
  return { isCameraActive, isStalled, latestFrameWall };
}

/**
 * Handle a tick from the worker.
 * This runs every ~1 second. We use it to:
 * - Progress active/stalled timers monotonically using performance.now()
 * - Use wall-clock timestamps only for calendar boundaries and record metadata
 * - Detect heartbeat gaps (lid close / sleep / runtime restart)
 * - Update session time counters safely across clock jumps
 *
 * @param {{ timestamp: number, gap?: number, monotonic?: number }} data
 */
function handleTick(data) {
  const now = data.timestamp;
  const hasMonotonic = typeof data.monotonic === 'number' && Number.isFinite(data.monotonic);
  const monotonicNow = hasMonotonic ? data.monotonic : null;
  const lastTick = state.lastTickTimestamp || (now - (typeof data.gap === 'number' ? data.gap : 0));

  let monotonicDelta = 0;
  let isRuntimeRestart = false;

  if (hasMonotonic) {
    if (state.lastTickMonotonic === null || state.lastTickMonotonic === undefined) {
      monotonicDelta = (typeof data.gap === 'number' && data.gap > 0 && data.gap <= CONFIG.maxTickMs)
        ? data.gap
        : 0;
    } else if (monotonicNow < state.lastTickMonotonic) {
      // Monotonic clock went backward: worker or runtime restarted
      isRuntimeRestart = true;
      monotonicDelta = 0;
    } else {
      monotonicDelta = monotonicNow - state.lastTickMonotonic;
    }
  } else {
    const legacyGap = typeof data.gap === 'number' ? data.gap : (now - (state.lastTickTimestamp || now));
    if (legacyGap < 0) {
      // Legacy non-monotonic backward wall-clock jump: preserve counters without decrementing
      state.lastTickTimestamp = now;
      if (state.session.studyStartedAt !== null && state.session.studyStartedAt > now) {
        state.session.accStudyMs = Math.max(state.session.studyTime || 0, state.session.accStudyMs || 0);
        state.session.studyStartedAt = now;
      }
      return;
    }
    monotonicDelta = legacyGap;
  }

  // Handle runtime/worker restart safely without counting uncertain downtime
  if (isRuntimeRestart) {
    state.session.accStudyMs = Math.max(state.session.studyTime || 0, state.session.accStudyMs || 0);
    state.session.studyRunMs = 0;
    if (state.session.studyStartedAt !== null) {
      state.session.studyStartedAt = now;
      state.session.studyCursorMono = monotonicNow;
    } else {
      state.session.studyCursorMono = null;
    }
    state.session.accUnverifiedMs = Math.max(state.session.unverifiedTime || 0, state.session.accUnverifiedMs || 0);
    state.session.unverifiedRunMs = 0;
    if (state.session.unverifiedStartedAt !== null) {
      state.session.unverifiedStartedAt = now;
      state.session.unverifiedCursorMono = monotonicNow;
    } else {
      state.session.unverifiedCursorMono = null;
    }
    if (Array.isArray(state.session.pauses)) {
      for (const p of state.session.pauses) {
        if (p && p.end === null) {
          p.monoCursor = monotonicNow;
          if (typeof p.monoDurationMs !== 'number') p.monoDurationMs = 0;
        }
      }
    }

    const restartDayStr = getLocalDateString(now);
    if (state.session.active && state.session.dateStr && state.session.dateStr !== restartDayStr) {
      handleMidnightRollover(now, restartDayStr, state.lastTickTimestamp || now);
      state.lastTickTimestamp = now;
      state.lastTickMonotonic = monotonicNow;
      return;
    }

    if (state.session.active) {
      state.session.sessionTime = (state.session.studyTime || 0) + (state.session.unverifiedTime || 0);
      state.session.pausedTime = Math.max(
        state.session.pausedTime || 0,
        calculateTotalPausedTime(state.session.pauses, now)
      );
      DOM.timerDisplay.textContent = formatTime(state.session.studyTime);
      updateSessionStatsDisplay();
      updatePiP();
      saveTodayToLocalStorage(now);
    }

    state.lastTickTimestamp = now;
    state.lastTickMonotonic = monotonicNow;
    return;
  }

  const effectiveGap = hasMonotonic
    ? monotonicDelta
    : (typeof data.gap === 'number' ? data.gap : (now - (state.lastTickTimestamp || now)));

  const { isCameraActive, isStalled, latestFrameWall } = evaluateCameraHealth(
    now,
    hasMonotonic,
    monotonicDelta
  );
  const cameraSawSuspension = Boolean(state.camera._suspensionDetected);
  state.camera._suspensionDetected = false;
  const pageLifecycleSuspended = Boolean(state._lifecycleSuspended);
  state._lifecycleSuspended = false;

  // Distinguish browser worker delays (continuous camera verification healthy)
  // from true suspension / sleep (camera frames interrupted or page lifecycle suspended).
  const isSleepGap =
    pageLifecycleSuspended ||
    (effectiveGap > CONFIG.lidGapMs && (!isCameraActive || cameraSawSuspension));

  if (isSleepGap) {
    updatePipeline('Worker', 'warn', '⚠️ Worker Gap');
  } else {
    updatePipeline('Worker', 'active', '✅ Worker Active');
  }

  // ── Detect midnight rollover (uses wall-clock calendar date) ──
  const currentDayStr = getLocalDateString(now);
  if (state.session.active && state.session.dateStr && state.session.dateStr !== currentDayStr) {
    const rolloverIsSleep = isSleepGap || (lastTick && (now - lastTick) > CONFIG.lidGapMs);
    handleMidnightRollover(now, currentDayStr, rolloverIsSleep ? lastTick : null, { isStalled, latestFrameWall });
    state.lastTickTimestamp = now;
    if (hasMonotonic) state.lastTickMonotonic = monotonicNow;
    return;
  }

  // ── Detect lid close via heartbeat gap (sleep / hibernation) ──
  if (isSleepGap && state.session.active && state.status !== 'idle') {
    // 1. Freeze study time before sleep gap without crediting sleep duration
    if (state.status === 'studying') {
      if (hasMonotonic) {
        state.session.accStudyMs = Math.max(
          state.session.studyTime || 0,
          (state.session.accStudyMs || 0) + (state.session.studyRunMs || 0)
        );
        state.session.studyTime = state.session.accStudyMs;
        state.session.studyRunMs = 0;
        state.session.studyStartedAt = null;
        state.session.studyCursorMono = null;
        saveTodayToLocalStorage(lastTick);
      } else {
        freezeStudyTime(lastTick);
      }
    }
    state.session.sessionStartedAt = null;
    // 2. Close any ongoing unverified interval before sleep without crediting sleep duration
    if (state.session.unverifiedStartedAt !== null) {
      if (hasMonotonic) {
        state.session.accUnverifiedMs = Math.max(
          state.session.unverifiedTime || 0,
          (state.session.accUnverifiedMs || 0) + (state.session.unverifiedRunMs || 0)
        );
      } else {
        state.session.accUnverifiedMs = (state.session.accUnverifiedMs || 0) +
          Math.max(0, lastTick - state.session.unverifiedStartedAt);
      }
      state.session.unverifiedTime = Math.max(state.session.unverifiedTime || 0, state.session.accUnverifiedMs);
      state.session.unverifiedRunMs = 0;
      state.session.unverifiedCursorMono = null;
      state.session.unverifiedStartedAt = null;
    }

    if (state.status !== 'lid-closed') {
      // Close any pre-sleep pause at lastTick/lastTickMonotonic so sleep gap is never counted as pausedTime
      endPauseEvent(lastTick, state.lastTickMonotonic);
      startPauseEvent('lidClosed', now, monotonicNow);
      setStatus('lid-closed');
      state.headPose.faceDetected = false;
      state.headPose.facingScreenSince = 0;
      state.headPose.facingScreenSinceMono = null;
      state.session.distractions.lidClosed++;

      const awayMinutes = Math.round(effectiveGap / 60000);
      const awayText = awayMinutes >= 1
        ? `${awayMinutes} minute${awayMinutes > 1 ? 's' : ''}`
        : `${Math.round(effectiveGap / 1000)} seconds`;

      const msg = `You were away for about ${awayText}. Timer was paused.`;
      showAlert('welcome-back', '👋', `<strong>Welcome back!</strong> ${msg}`);
      playSoftChime();
      if (state.settings.notificationsOn && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('Ayush_Tracker', { body: `Welcome back! ${msg}`, icon: './icons/icon-192.png' });
      }
      updateSessionStatsDisplay();
      autoSaveSession();
    }
  }

  // ── Update timer display & active counters ──
  if (state.session.active) {
    if (state.status === 'studying') {
      if (isStalled) {
        // Camera stalled / video not ready / failing frames: freeze verified study and accrue unverified time
        if (state.session.studyStartedAt !== null) {
          if (hasMonotonic) {
            state.session.accStudyMs = Math.max(
              state.session.studyTime || 0,
              (state.session.accStudyMs || 0) + (state.session.studyRunMs || 0)
            );
            state.session.studyTime = state.session.accStudyMs;
            state.session.studyRunMs = 0;
            state.session.studyStartedAt = null;
            state.session.studyCursorMono = null;
            if (state.session.unverifiedStartedAt === null) {
              state.session.unverifiedStartedAt = state.lastTickTimestamp || now;
              state.session.unverifiedCursorMono = state.lastTickMonotonic;
              state.session.unverifiedRunMs = 0;
            }
          } else {
            const stallStart = Math.max(state.session.studyStartedAt, latestFrameWall || lastTick);
            state.session.accStudyMs = (state.session.accStudyMs || 0) + Math.max(0, stallStart - state.session.studyStartedAt);
            state.session.studyTime = Math.max(state.session.studyTime || 0, state.session.accStudyMs);
            state.session.studyStartedAt = null;
            if (state.session.unverifiedStartedAt === null) {
              state.session.unverifiedStartedAt = stallStart;
            }
          }
        }
        if (state.session.unverifiedStartedAt === null) {
          state.session.unverifiedStartedAt = now;
          state.session.unverifiedCursorMono = state.lastTickMonotonic;
          state.session.unverifiedRunMs = 0;
        }
        if (hasMonotonic) {
          const uCursor = typeof state.session.unverifiedCursorMono === 'number'
            ? state.session.unverifiedCursorMono
            : state.lastTickMonotonic;
          const uStep = (uCursor !== null && uCursor !== undefined)
            ? Math.max(0, monotonicNow - uCursor)
            : monotonicDelta;
          state.session.unverifiedRunMs = (state.session.unverifiedRunMs || 0) + uStep;
          state.session.unverifiedCursorMono = monotonicNow;
          state.session.unverifiedTime = Math.max(
            state.session.unverifiedTime || 0,
            (state.session.accUnverifiedMs || 0) + state.session.unverifiedRunMs
          );
        } else {
          const elapsedUnverified = Math.max(0, now - state.session.unverifiedStartedAt);
          state.session.unverifiedTime = Math.max(
            state.session.unverifiedTime || 0,
            (state.session.accUnverifiedMs || 0) + elapsedUnverified
          );
        }
      } else {
        // Camera healthy: if recovering from stall, finalize unverified interval cleanly WITHOUT retroactive study credit
        if (state.session.unverifiedStartedAt !== null) {
          if (hasMonotonic) {
            const uCursor = typeof state.session.unverifiedCursorMono === 'number'
              ? state.session.unverifiedCursorMono
              : state.lastTickMonotonic;
            const uStep = (uCursor !== null && uCursor !== undefined)
              ? Math.max(0, monotonicNow - uCursor)
              : monotonicDelta;
            state.session.unverifiedRunMs = (state.session.unverifiedRunMs || 0) + uStep;
            state.session.accUnverifiedMs = Math.max(
              state.session.unverifiedTime || 0,
              (state.session.accUnverifiedMs || 0) + state.session.unverifiedRunMs
            );
          } else {
            state.session.accUnverifiedMs = (state.session.accUnverifiedMs || 0) +
              Math.max(0, now - state.session.unverifiedStartedAt);
          }
          state.session.unverifiedTime = Math.max(state.session.unverifiedTime || 0, state.session.accUnverifiedMs);
          state.session.unverifiedRunMs = 0;
          state.session.unverifiedCursorMono = null;
          state.session.unverifiedStartedAt = null;
          state.session.studyRunMs = 0;
          state.session.studyStartedAt = now;
          state.session.studyCursorMono = monotonicNow;
        } else {
          if (state.session.studyStartedAt === null) {
            state.session.studyRunMs = 0;
            state.session.studyStartedAt = now;
            state.session.studyCursorMono = state.lastTickMonotonic ?? (hasMonotonic ? monotonicNow - monotonicDelta : null);
          }
          if (hasMonotonic) {
            const sCursor = typeof state.session.studyCursorMono === 'number'
              ? state.session.studyCursorMono
              : state.lastTickMonotonic;
            const studyStep = (sCursor !== null && sCursor !== undefined)
              ? Math.max(0, monotonicNow - sCursor)
              : monotonicDelta;
            state.session.studyRunMs = (state.session.studyRunMs || 0) + studyStep;
            state.session.studyCursorMono = monotonicNow;
            state.session.studyTime = Math.max(
              state.session.studyTime || 0,
              (state.session.accStudyMs || 0) + state.session.studyRunMs
            );
          } else {
            const elapsedStudy = Math.max(0, now - state.session.studyStartedAt);
            state.session.studyTime = Math.max(
              state.session.studyTime || 0,
              (state.session.accStudyMs || 0) + elapsedStudy
            );
          }
        }
      }
    } else {
      // Paused: close any open unverified interval cleanly
      if (state.session.unverifiedStartedAt !== null) {
        if (hasMonotonic) {
          state.session.accUnverifiedMs = Math.max(
            state.session.unverifiedTime || 0,
            (state.session.accUnverifiedMs || 0) + (state.session.unverifiedRunMs || 0)
          );
        } else {
          state.session.accUnverifiedMs = (state.session.accUnverifiedMs || 0) +
            Math.max(0, now - state.session.unverifiedStartedAt);
        }
        state.session.unverifiedTime = Math.max(state.session.unverifiedTime || 0, state.session.accUnverifiedMs);
        state.session.unverifiedRunMs = 0;
        state.session.unverifiedCursorMono = null;
        state.session.unverifiedStartedAt = null;
      }
    }

    // Advance any active open pause monotonically using exact cursor boundary
    // so mid-tick pauses never count the same sub-tick interval as both study & pause
    if (hasMonotonic && !isSleepGap && Array.isArray(state.session.pauses)) {
      for (const p of state.session.pauses) {
        if (p && p.end === null) {
          const pCursor = typeof p.monoCursor === 'number'
            ? p.monoCursor
            : (typeof p.monoStart === 'number' ? p.monoStart : state.lastTickMonotonic);
          const pauseStep = (pCursor !== null && pCursor !== undefined)
            ? Math.max(0, monotonicNow - pCursor)
            : Math.max(0, monotonicDelta);
          p.monoDurationMs = Math.max(0, (typeof p.monoDurationMs === 'number' && Number.isFinite(p.monoDurationMs)
            ? p.monoDurationMs
            : 0) + pauseStep);
          p.monoCursor = monotonicNow;
        }
      }
    }

    // Active tracking session time = verified study + unverified active intervals (paused time excluded)
    state.session.sessionTime = (state.session.studyTime || 0) + (state.session.unverifiedTime || 0);
    // Recover paused time from pause intervals; guard monotonicity against backward wall-clock jumps
    const computedPaused = calculateTotalPausedTime(state.session.pauses, now);
    state.session.pausedTime = Math.max(state.session.pausedTime || 0, computedPaused);

    DOM.timerDisplay.textContent = formatTime(state.session.studyTime);
    updateSessionStatsDisplay();
    updatePiP();
    refreshTabLock();
    saveTodayToLocalStorage(now);

    if (DOM.liveSession) DOM.liveSession.textContent = Math.round(state.session.sessionTime / 1000);
    if (DOM.liveStudy) DOM.liveStudy.textContent = Math.round(state.session.studyTime / 1000);
    if (DOM.livePauses) DOM.livePauses.textContent =
      (state.session.distractions?.lookAway || 0) +
      (state.session.distractions?.away || 0) +
      (state.session.distractions?.lidClosed || 0);
  }

  state.lastTickTimestamp = now;
  if (hasMonotonic) {
    state.lastTickMonotonic = monotonicNow;
  }
}

/**
 * Handle day boundary crossing at midnight.
 * Splits study, unverified, and paused intervals cleanly at 00:00:00 without
 * converting unverified stall intervals to verified study time or crediting sleep.
 */
function handleMidnightRollover(now, newDateStr, sleepAnchor = null, stallContext = null) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const boundaryTime = d.getTime();
  const prevTickTime = state.lastTickTimestamp || boundaryTime;
  // Reject multi-hour post-midnight rollover credits when no sleep anchor was supplied
  const staleCrossing = !sleepAnchor && ((now - boundaryTime) > 3600000 || (prevTickTime && (now - prevTickTime) > 3600000));
  const isSleep = Boolean(sleepAnchor) || staleCrossing;
  const yesterdayLimit = sleepAnchor ? Math.min(boundaryTime, sleepAnchor) : boundaryTime;
  const stallDetected = Boolean(
    (stallContext && stallContext.isStalled) ||
    state.session.unverifiedStartedAt !== null ||
    (state.camera.isDetecting && state.camera.frameSeq === 0 && (state.camera.lastFrameTime || state.camera.lastDetectionTime || 0) === 0)
  );

  // 1. Finalize yesterday's verified study time
  if (state.status === 'studying' && state.session.studyStartedAt !== null) {
    if (state.lastTickMonotonic !== null) {
      const committedUpToTick = (state.session.accStudyMs || 0) + (state.session.studyRunMs || 0);
      if (stallDetected) {
        // Camera stalled before/at rollover: do not add post-tick stall time as study
        state.session.accStudyMs = Math.max(state.session.studyTime || 0, committedUpToTick);
      } else {
        const deltaBeforeMidnight = Math.max(0, yesterdayLimit - prevTickTime);
        state.session.accStudyMs = Math.max(state.session.studyTime || 0, committedUpToTick) + deltaBeforeMidnight;
      }
    } else {
      const studyCutoff = stallDetected
        ? Math.min(yesterdayLimit, Math.max(state.session.studyStartedAt, stallContext?.latestFrameWall || prevTickTime))
        : yesterdayLimit;
      const yesterdayStudy = Math.max(0, studyCutoff - state.session.studyStartedAt);
      state.session.accStudyMs = (state.session.accStudyMs || 0) + yesterdayStudy;
    }
    state.session.studyTime = Math.max(0, state.session.accStudyMs);
    state.session.studyRunMs = 0;
    state.session.studyStartedAt = null;
  }

  // 2. Finalize yesterday's unverified time WITHOUT double-counting
  let yesterdayUnverified = 0;
  if (state.session.unverifiedStartedAt !== null) {
    if (state.lastTickMonotonic !== null) {
      const runSoFar = (state.session.accUnverifiedMs || 0) + (state.session.unverifiedRunMs || 0);
      const deltaBeforeMidnight = isSleep ? 0 : Math.max(0, yesterdayLimit - prevTickTime);
      yesterdayUnverified = Math.max(state.session.unverifiedTime || 0, runSoFar) + deltaBeforeMidnight;
    } else {
      yesterdayUnverified = (state.session.accUnverifiedMs || 0) +
        Math.max(0, yesterdayLimit - state.session.unverifiedStartedAt);
    }
  } else if (state.status === 'studying' && stallDetected && !isSleep) {
    // Stall discovered right at the midnight rollover tick
    const stallStart = Math.min(yesterdayLimit, stallContext?.latestFrameWall || prevTickTime);
    yesterdayUnverified = Math.max(state.session.unverifiedTime || 0, state.session.accUnverifiedMs || 0) +
      Math.max(0, yesterdayLimit - stallStart);
  } else {
    yesterdayUnverified = Math.max(state.session.unverifiedTime || 0, state.session.accUnverifiedMs || 0);
  }
  state.session.sessionStartedAt = null;

  // 3. Preserve paused intervals split at yesterdayLimit (excluding post-sleep downtime)
  const existingPauses = Array.isArray(state.session.pauses) ? state.session.pauses : [];
  const openPause = existingPauses.find(p => p && p.end === null) || null;
  const yesterdayPauses = existingPauses.map(p => {
    if (!p || p.end !== null) return p;
    const closed = { ...p, end: Math.max(p.start, yesterdayLimit) };
    if (typeof p.monoDurationMs === 'number' && Number.isFinite(p.monoDurationMs)) {
      closed.durationMs = Math.max(0, p.monoDurationMs);
    }
    return closed;
  });

  const yesterdayPaused = calculateTotalPausedTime(yesterdayPauses, yesterdayLimit);
  const yesterdaySession = (state.session.studyTime || 0) + yesterdayUnverified;

  const yesterdayRecord = {
    id: state.session.id,
    date: state.session.dateStr,
    startTime: state.session.startTime || (boundaryTime - (yesterdaySession + yesterdayPaused)),
    endTime: boundaryTime,
    studyTime: state.session.studyTime || 0,
    sessionTime: yesterdaySession,
    pausedTime: yesterdayPaused,
    unverifiedTime: yesterdayUnverified,
    distractions: { ...(state.session.distractions || { lookAway: 0, away: 0, lidClosed: 0 }) },
    pauses: yesterdayPauses,
    lastSaved: boundaryTime,
    schemaVersion: 2,
    tabId: TAB_ID,
  };

  DB.saveSession(yesterdayRecord).catch(e => console.warn('Could not archive yesterday record:', e));

  // 4. Initialize new day's record starting cleanly at 00:00:00, preserving stall/pause classifications
  const wasStudying = state.status === 'studying';
  const postMidnightMs = Math.max(0, now - boundaryTime);

  let todayStudy = 0;
  let todayUnverified = 0;
  let todaySession = 0;
  let todayPaused = 0;
  let todayPauses = [];
  let todayStudyStartedAt = null;
  let todayUnverifiedStartedAt = null;

  if (isSleep) {
    setStatus('lid-closed');
    todayPauses = [{
      type: 'lidClosed',
      start: now,
      end: null,
      ...(state.lastTickMonotonic !== null ? { monoDurationMs: 0 } : {}),
    }];
    todayPaused = 0;
  } else if (wasStudying && stallDetected) {
    // Camera is stalled across midnight: today's portion stays UNVERIFIED, never converted to study!
    todayStudy = 0;
    todayUnverified = postMidnightMs;
    todaySession = todayUnverified;
    todayStudyStartedAt = null;
    todayUnverifiedStartedAt = (state.lastTickMonotonic !== null) ? now : boundaryTime;
  } else if (wasStudying) {
    todayStudy = postMidnightMs;
    todaySession = todayStudy;
    todayStudyStartedAt = (state.lastTickMonotonic !== null) ? now : boundaryTime;
  } else {
    const pauseType = openPause?.type || state.status || 'away';
    const nextPause = { type: pauseType, start: boundaryTime, end: null };
    if (state.lastTickMonotonic !== null) {
      nextPause.monoDurationMs = postMidnightMs;
    }
    todayPauses = [nextPause];
    todayPaused = calculateTotalPausedTime(todayPauses, now);
  }

  state.session = {
    active: true,
    id: 'day_' + newDateStr,
    dateStr: newDateStr,
    startTime: boundaryTime,
    sessionStartedAt: isSleep ? now : boundaryTime,
    studyStartedAt: todayStudyStartedAt,
    unverifiedStartedAt: todayUnverifiedStartedAt,
    accStudyMs: (state.lastTickMonotonic !== null) ? todayStudy : 0,
    accSessionMs: 0,
    accUnverifiedMs: (state.lastTickMonotonic !== null) ? todayUnverified : 0,
    studyRunMs: 0,
    unverifiedRunMs: 0,
    studyTime: todayStudy,
    sessionTime: todaySession,
    unverifiedTime: todayUnverified,
    pausedTime: todayPaused,
    distractions: { lookAway: 0, away: 0, lidClosed: isSleep ? 1 : 0 },
    pauses: todayPauses,
    lastSaved: now,
    schemaVersion: 2,
  };

  DOM.timerDisplay.textContent = formatTime(state.session.studyTime);
  updateSessionStatsDisplay();
  saveTodayToLocalStorage(now);
  autoSaveSession();
  refreshDashboard();

  showToast('info', 'New Day Started 🌅',
    'Yesterday\'s study time has been saved. Today\'s timer reset to 00:00:00.');
}


// ═══════════════════════════════════════════════
// 22. SESSION — Start / End & Multi-Tab Conflict Guard
// ═══════════════════════════════════════════════

const TAB_ID = 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
const ACTIVE_TAB_LOCK_KEY = 'ayush_tracker_active_tab';
const ACTIVE_TAB_LOCK_TTL_MS = 15000;
const WEB_LOCK_NAME = 'ayush_tracker_session_lock';
const _webLockReleasers = new Map();

function readTabLock() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(ACTIVE_TAB_LOCK_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function writeTabLockMirror(lockObj) {
  try {
    if (typeof localStorage !== 'undefined') {
      if (lockObj) {
        localStorage.setItem(ACTIVE_TAB_LOCK_KEY, JSON.stringify(lockObj));
      } else {
        localStorage.removeItem(ACTIVE_TAB_LOCK_KEY);
      }
    }
  } catch (_) { }
}

function isLockConflicting(lock, now, dateStr, tabId, monotonicNow = null) {
  if (!lock || !lock.tabId) return false;
  if (lock.tabId === tabId) return false;
  if (lock.dateStr && dateStr && lock.dateStr !== dateStr) return false;
  if (typeof monotonicNow === 'number' && Number.isFinite(monotonicNow) &&
      typeof lock.updatedMono === 'number' && Number.isFinite(lock.updatedMono)) {
    const monoAge = monotonicNow - lock.updatedMono;
    return monoAge < ACTIVE_TAB_LOCK_TTL_MS;
  }
  const age = now - (lock.updatedAt || 0);
  // Backward wall-clock jumps (age < 0) must NEVER expire or steal another tab's active lock
  if (age < 0) return true;
  return age < ACTIVE_TAB_LOCK_TTL_MS;
}

/**
 * Fast synchronous check against the localStorage lock mirror.
 */
function checkTabConflict(now = Date.now(), dateStr = getLocalDateString(now), tabId = TAB_ID, monotonicNow = null) {
  return isLockConflicting(readTabLock(), now, dateStr, tabId, monotonicNow);
}

function tryAcquireWebLock(tabId = TAB_ID, lockName = WEB_LOCK_NAME) {
  if (typeof navigator === 'undefined' || !navigator.locks || typeof navigator.locks.request !== 'function') {
    return Promise.resolve(null); // Web Locks API unavailable — use IndexedDB atomic fallback
  }
  if (_webLockReleasers.has(tabId)) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    let settled = false;
    try {
      navigator.locks.request(lockName, { ifAvailable: true }, (lock) => {
        if (!lock) {
          settled = true;
          resolve(false);
          return;
        }
        return new Promise((releaseHold) => {
          _webLockReleasers.set(tabId, () => {
            _webLockReleasers.delete(tabId);
            releaseHold();
          });
          settled = true;
          resolve(true);
        });
      }).catch(() => {
        if (!settled) resolve(null);
      });
    } catch (_) {
      resolve(null);
    }
  });
}

function releaseWebLock(tabId = TAB_ID) {
  const releaser = _webLockReleasers.get(tabId);
  if (typeof releaser === 'function') {
    releaser();
  }
}

/**
 * Race-safe, fail-closed tracking lock acquisition:
 * 1. Prefers the browser Web Locks API (`navigator.locks.request` with `ifAvailable: true`).
 * 2. Uses an atomic IndexedDB `readwrite` transaction on `'locks'` as serialized fallback.
 * 3. Never treats non-atomic `localStorage` check-then-write as a successful lock: if BOTH
 *    Web Locks and IndexedDB locking fail/are unavailable, returns `false` safely.
 */
async function acquireTabLock(now = Date.now(), dateStr = getLocalDateString(now), tabId = TAB_ID, monotonicNow = null) {
  // Fast hint rejection if mirror clearly indicates another live tab
  if (checkTabConflict(now, dateStr, tabId, monotonicNow)) {
    return false;
  }

  const webLockResult = await tryAcquireWebLock(tabId);
  if (webLockResult === false) {
    return false;
  }

  try {
    const idbResult = await DB.atomicAcquireLock({
      tabId,
      dateStr,
      now,
      ttlMs: ACTIVE_TAB_LOCK_TTL_MS,
      monotonicNow,
    });
    if (!idbResult.acquired) {
      releaseWebLock(tabId);
      return false;
    }
    writeTabLockMirror(idbResult.lock);
    return true;
  } catch (_) {
    // Only consider lock acquired if Web Locks API is actively held by this tab
    if (webLockResult === true && _webLockReleasers.has(tabId)) {
      writeTabLockMirror({
        tabId,
        dateStr,
        startedAt: now,
        updatedAt: now,
        ...(typeof monotonicNow === 'number' ? { updatedMono: monotonicNow } : {}),
      });
      return true;
    }
    // Fail-safe: refuse simultaneous tracking when neither Web Locks nor atomic IDB succeeded
    releaseWebLock(tabId);
    return false;
  }
}

/**
 * Atomically refresh active tab lock heartbeat.
 * Fails closed (`false`) if ownership cannot be verified or lock is missing/stolen.
 */
async function refreshTabLock(now = Date.now(), dateStr = state.session.dateStr || getLocalDateString(now), tabId = TAB_ID, monotonicNow = null) {
  if (checkTabConflict(now, dateStr, tabId, monotonicNow)) {
    return false;
  }
  try {
    const res = await DB.atomicRefreshLock({
      tabId,
      dateStr,
      now,
      ttlMs: ACTIVE_TAB_LOCK_TTL_MS,
      monotonicNow,
    });
    if (!res.ok) {
      return false;
    }
    if (res.lock) writeTabLockMirror(res.lock);
    return true;
  } catch (_) {
    // Never claim successful refresh unless Web Locks is actively held by this tab
    if (_webLockReleasers.has(tabId)) {
      return true;
    }
    return false;
  }
}

/**
 * Release the tracking lock ONLY if owned by `tabId`.
 * Releasing from another tab cannot release this tab's lock.
 */
async function releaseTabLock(tabId = TAB_ID) {
  releaseWebLock(tabId);
  try {
    const localLock = readTabLock();
    if (!localLock || localLock.tabId === tabId) {
      writeTabLockMirror(null);
    }
  } catch (_) { }
  try {
    await DB.atomicReleaseLock(tabId);
  } catch (_) { }
}

async function handleStart() {
  if (initPromise) {
    try { await initPromise; } catch (_) { }
  }

  const preStartNow = Date.now();
  const preStartDate = getLocalDateString(preStartNow);
  if (checkTabConflict(preStartNow, preStartDate) || !(await acquireTabLock(preStartNow, preStartDate))) {
    showToast('warning', 'Session active in another tab',
      'Another browser tab is already tracking today\'s session. End it there before starting here to avoid data conflicts.');
    showLiveError('Another tab is actively tracking. Close or end that tab first.');
    DOM.startBtn.disabled = false;
    updateStartButtonLabel();
    return false;
  }

  DOM.startBtn.disabled = true;
  hideLiveError();
  logEvent('Start button clicked');
  DOM.startBtn.innerHTML = '<span class="btn-icon">⏳</span> Starting…';

  // Unlock AudioContext on user gesture (browsers require this)
  try {
    const AudioCtx = (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext));
    if (AudioCtx) {
      if (!audioCtx) audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
  } catch (_) { }

  if (!state.camera.faceLandmarker) {
    DOM.startBtn.innerHTML = '<span class="btn-icon">⏳</span> Loading AI Model…';
    const landmarkerReady = await initFaceLandmarker();
    if (!landmarkerReady) {
      await releaseTabLock();
      DOM.startBtn.disabled = false;
      updateStartButtonLabel();
      return false;
    }
  } else {
    updatePipeline('Model', 'active', '✅ Model Loaded');
  }

  DOM.startBtn.innerHTML = '<span class="btn-icon">⏳</span> Waiting for Camera…';
  const cameraReady = await startCamera();
  if (!cameraReady) {
    await releaseTabLock();
    DOM.startBtn.disabled = false;
    updateStartButtonLabel();
    return false;
  }

  startDetectionLoop();

  DOM.startBtn.innerHTML = '<span class="btn-icon">⏳</span> Waiting for Face…';
  await new Promise(r => setTimeout(r, 500));
  const calibrated = await runCalibration();
  if (!calibrated) {
    stopDetectionLoop();
    stopCamera();
    await releaseTabLock();
    DOM.startBtn.disabled = false;
    updateStartButtonLabel();
    return false;
  }

  const now = Date.now();
  const dateStr = getLocalDateString(now);
  if (!(await refreshTabLock(now, dateStr))) {
    stopDetectionLoop();
    stopCamera();
    await releaseTabLock();
    showToast('warning', 'Session active in another tab',
      'Another browser tab holds the active session lock.');
    DOM.startBtn.disabled = false;
    updateStartButtonLabel();
    return false;
  }

  startWorker();

  const dayId = 'day_' + dateStr;

  // If calendar day changed since last run, reset
  if (state.session.dateStr && state.session.dateStr !== dateStr) {
    state.session.accStudyMs = 0;
    state.session.studyTime = 0;
    state.session.accSessionMs = 0;
    state.session.sessionTime = 0;
    state.session.accUnverifiedMs = 0;
    state.session.unverifiedTime = 0;
    state.session.studyRunMs = 0;
    state.session.unverifiedRunMs = 0;
    state.session.pausedTime = 0;
    state.session.distractions = { lookAway: 0, away: 0, lidClosed: 0 };
    state.session.pauses = [];
  }

  const baseStudyMs = state.session.studyTime || state.session.accStudyMs || 0;
  const baseUnverifiedMs = state.session.unverifiedTime || state.session.accUnverifiedMs || 0;
  const baseSessionMs = baseStudyMs + baseUnverifiedMs;

  state.session.active = true;
  state.session.id = dayId;
  state.session.dateStr = dateStr;
  state.session.startTime = state.session.startTime || now;
  state.session.studyStartedAt = now;
  state.session.studyCursorMono = getMonotonicNow();
  state.session.sessionStartedAt = null;
  state.session.unverifiedStartedAt = null;
  state.session.unverifiedCursorMono = null;
  state.session.accStudyMs = baseStudyMs;
  state.session.accSessionMs = baseSessionMs;
  state.session.accUnverifiedMs = baseUnverifiedMs;
  state.session.studyRunMs = 0;
  state.session.unverifiedRunMs = 0;
  state.session.studyTime = baseStudyMs;
  state.session.unverifiedTime = baseUnverifiedMs;
  state.session.sessionTime = baseSessionMs;
  if (!state.session.distractions) {
    state.session.distractions = { lookAway: 0, away: 0, lidClosed: 0 };
  }
  if (!state.session.pauses) {
    state.session.pauses = [];
  }
  state.session.pausedTime = calculateTotalPausedTime(state.session.pauses, now);
  state.session.schemaVersion = 2;

  state.headPose.lookAwayStart = 0;
  state.headPose.awayStart = 0;
  state.headPose.facingScreenSince = now;

  DOM.startBtn.classList.add('hidden');
  DOM.endBtn.classList.remove('hidden');
  if (DOM.sessionStats) DOM.sessionStats.classList.add('visible');
  DOM.timerDisplay.textContent = formatTime(state.session.studyTime);
  if (DOM.statSessionTime) DOM.statSessionTime.textContent = formatTime(state.session.sessionTime);
  if (DOM.statPausedTime) DOM.statPausedTime.textContent = formatTime(state.session.pausedTime);
  setStatus('studying');
  hideAlert();

  DOM.startBtn.disabled = false;
  updateStartButtonLabel();

  // Save current progress immediately to localStorage & IndexedDB
  saveTodayToLocalStorage(now);
  await autoSaveSession();

  // Autosave every 15 seconds while a session is active
  if (state.autoSaveInterval) clearInterval(state.autoSaveInterval);
  state.autoSaveInterval = setInterval(autoSaveSession, 15000);
  return true;
}

function handleEnd(endTime = Date.now(), endMonotonic = null) {
  if (state.autoSaveInterval) {
    clearInterval(state.autoSaveInterval);
    state.autoSaveInterval = null;
  }

  // Set session inactive FIRST so no incoming worker ticks or events can advance it
  state.session.active = false;
  const resolvedMono = (typeof endMonotonic === 'number' && Number.isFinite(endMonotonic))
    ? endMonotonic
    : (state.worker ? getMonotonicNow() : null);

  // Finalize intervals BEFORE resetting monotonic anchors
  if (state.status === 'studying') {
    freezeStudyTime(endTime, resolvedMono);
  }
  // Close any open pause event at endTime/resolvedMono
  endPauseEvent(endTime, resolvedMono);

  // Close any ongoing unverified interval
  if (state.session.unverifiedStartedAt !== null) {
    if (resolvedMono !== null && typeof state.session.unverifiedCursorMono === 'number') {
      const extraMono = Math.max(0, resolvedMono - state.session.unverifiedCursorMono);
      state.session.accUnverifiedMs = Math.max(
        state.session.unverifiedTime || 0,
        (state.session.accUnverifiedMs || 0) + (state.session.unverifiedRunMs || 0)
      ) + extraMono;
    } else if (state.lastTickMonotonic !== null) {
      const refTime = state.lastTickTimestamp || endTime;
      const subTick = (endTime > refTime && (endTime - refTime) <= CONFIG.maxTickMs) ? (endTime - refTime) : 0;
      state.session.accUnverifiedMs = Math.max(
        state.session.unverifiedTime || 0,
        (state.session.accUnverifiedMs || 0) + (state.session.unverifiedRunMs || 0)
      ) + subTick;
    } else {
      state.session.accUnverifiedMs = (state.session.accUnverifiedMs || 0) +
        Math.max(0, endTime - state.session.unverifiedStartedAt);
    }
    state.session.unverifiedTime = Math.max(0, state.session.accUnverifiedMs);
    state.session.unverifiedRunMs = 0;
    state.session.unverifiedCursorMono = null;
    state.session.unverifiedStartedAt = null;
  }

  stopDetectionLoop();
  stopCamera();
  stopWorker();
  releaseTabLock();

  state.session.sessionStartedAt = null;
  const finalStudyTime = Math.max(0, state.session.studyTime || 0);
  const finalUnverifiedTime = Math.max(0, state.session.unverifiedTime || 0);
  // Authoritative session time = verified study + unverified active time (paused time strictly excluded)
  const finalSessionTime = finalStudyTime + finalUnverifiedTime;
  const finalPausedTime = calculateTotalPausedTime(state.session.pauses, endTime);

  state.session.studyTime = finalStudyTime;
  state.session.unverifiedTime = finalUnverifiedTime;
  state.session.sessionTime = finalSessionTime;
  state.session.pausedTime = finalPausedTime;
  state.session.endTime = endTime;
  state.session.schemaVersion = 2;

  DOM.startBtn.classList.remove('hidden');
  DOM.endBtn.classList.add('hidden');
  if (DOM.sessionStats) DOM.sessionStats.classList.remove('visible');
  if (DOM.statSessionTime) DOM.statSessionTime.textContent = formatTime(finalSessionTime);
  if (DOM.statPausedTime) DOM.statPausedTime.textContent = formatTime(finalPausedTime);
  DOM.timerDisplay.textContent = formatTime(finalStudyTime);
  setStatus('idle');
  hideAlert();
  updateStartButtonLabel();

  showToast('info', 'Session saved',
    `Today's total learned time: ${formatDuration(finalStudyTime)}. Ready to continue whenever you are! 🎉`);

  // Build and persist identical authoritative final record to both localStorage and IndexedDB
  const record = buildSessionRecord(endTime);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('ayush_tracker_today', JSON.stringify(record));
    } catch (_) { }
  }
  DB.saveSession(record)
    .then(() => refreshDashboard())
    .catch(e => showToast('error', 'Save failed', 'Could not save session: ' + e));
  return record;
}

// ═══════════════════════════════════════════════
// 22B. SESSION PERSISTENCE HELPERS
// ═══════════════════════════════════════════════

/**
 * Normalize a persisted or legacy session record to the authoritative accounting model:
 * - studyTime >= 0 (preserved)
 * - pausedTime recovered from actual pause intervals when available (or preserved non-negatively)
 * - unverifiedTime preserved (for legacy records missing unverifiedTime, preserves unaccounted active residual)
 * - sessionTime = studyTime + unverifiedTime (paused time strictly excluded)
 * - Idempotent across repeated calls without mutating source objects.
 */
function normalizeSessionRecord(record) {
  if (!record || typeof record !== 'object') return null;
  const closeRef = record.endTime || record.lastSaved || record.startTime || Date.now();
  const dateStr = record.date || getLocalDateString(record.startTime || closeRef);

  let hadUnclosedPauses = false;
  const pauses = Array.isArray(record.pauses)
    ? record.pauses
      .filter(p => p && typeof p.start === 'number' && Number.isFinite(p.start))
      .map(p => {
        if (p.end === null) hadUnclosedPauses = true;
        const endVal = (typeof p.end === 'number' && Number.isFinite(p.end))
          ? Math.max(p.start, p.end)
          : (record.endTime != null ? Math.max(p.start, closeRef) : null);
        const next = { ...p, end: endVal };
        // Preserve monotonic duration without inventing wall elapsed time across reloads/restarts
        if (p.end === null && endVal !== null &&
          typeof p.monoDurationMs === 'number' && Number.isFinite(p.monoDurationMs)) {
          next.durationMs = Math.max(0, p.monoDurationMs);
        }
        return next;
      })
    : [];

  const studyTime = Math.max(0, Number(record.studyTime) || 0);
  const pausedFromIntervals = calculateTotalPausedTime(pauses, closeRef);
  const hasStoredPaused = typeof record.pausedTime === 'number' && Number.isFinite(record.pausedTime) && record.pausedTime >= 0;
  const storedPaused = hasStoredPaused ? record.pausedTime : 0;
  // Recover pausedTime from actual pause intervals when missing, unclosed, or previously wiped in legacy schema
  const pausedTime = (!hasStoredPaused || hadUnclosedPauses || (storedPaused === 0 && pausedFromIntervals > 0 && !record.schemaVersion))
    ? pausedFromIntervals
    : storedPaused;

  let unverifiedTime = 0;
  if (typeof record.unverifiedTime === 'number' && Number.isFinite(record.unverifiedTime)) {
    unverifiedTime = Math.max(0, record.unverifiedTime);
  } else if (typeof record.sessionTime === 'number' && Number.isFinite(record.sessionTime)) {
    // Legacy record written before unverifiedTime was tracked explicitly:
    // preserve non-paused unaccounted active span as unverifiedTime so sessionTime doesn't drop.
    unverifiedTime = Math.max(0, record.sessionTime - studyTime - pausedTime);
  }

  // Canonical invariant: Session Time = Study Time + Unverified Time (Paused Time excluded)
  const sessionTime = studyTime + unverifiedTime;

  return {
    ...record,
    id: record.id || ('day_' + dateStr),
    date: dateStr,
    startTime: record.startTime || closeRef,
    endTime: record.endTime ?? null,
    studyTime,
    sessionTime,
    pausedTime,
    unverifiedTime,
    distractions: {
      lookAway: Math.max(0, Number(record.distractions?.lookAway) || 0),
      away: Math.max(0, Number(record.distractions?.away) || 0),
      lidClosed: Math.max(0, Number(record.distractions?.lidClosed) || 0),
    },
    pauses,
    lastSaved: record.lastSaved || closeRef,
    schemaVersion: 2,
  };
}

/**
 * Build a plain-object record from live session state for today.
 * @param {number|null} endTime — if set, timestamp when stopped/saved.
 * @param {number|null} referenceNow — optional clock reference for pause evaluation.
 */
function buildSessionRecord(endTime = null, referenceNow = null) {
  const s = state.session;
  const evalNow = endTime || referenceNow || (
    state.lastTickMonotonic !== null && state.lastTickTimestamp
      ? state.lastTickTimestamp
      : (s.lastSaved || Date.now())
  );
  const now = endTime || referenceNow || Date.now();
  const dateStr = s.dateStr || getLocalDateString(evalNow);

  let studyTime = s.studyTime || s.accStudyMs || 0;
  let unverifiedTime = s.unverifiedTime || s.accUnverifiedMs || 0;

  // Only extrapolate via wall clock when monotonic ticker is NOT active
  if (state.lastTickMonotonic === null) {
    if (s.active && state.status === 'studying' && s.studyStartedAt !== null) {
      studyTime = Math.max(studyTime, (s.accStudyMs || 0) + Math.max(0, evalNow - s.studyStartedAt));
    }
    if (s.active && s.unverifiedStartedAt !== null) {
      unverifiedTime = Math.max(unverifiedTime, (s.accUnverifiedMs || 0) + Math.max(0, evalNow - s.unverifiedStartedAt));
    }
  } else {
    studyTime = Math.max(studyTime, (s.accStudyMs || 0) + (s.studyRunMs || 0));
    unverifiedTime = Math.max(unverifiedTime, (s.accUnverifiedMs || 0) + (s.unverifiedRunMs || 0));
  }

  // Session time includes active tracking intervals only (study + unverified)
  // Explicitly paused time is excluded from session time
  const sessionTime = studyTime + unverifiedTime;
  const pauseEvalTime = endTime || referenceNow || (
    state.lastTickTimestamp && s.active ? state.lastTickTimestamp : (s.lastSaved || now)
  );
  const calculatedPaused = calculateTotalPausedTime(s.pauses, pauseEvalTime);
  const pausedTime = (Array.isArray(s.pauses) && s.pauses.length > 0)
    ? Math.max(s.pausedTime || 0, calculatedPaused)
    : Math.max(0, s.pausedTime || 0);

  return {
    id: s.id || ('day_' + dateStr),
    date: dateStr,
    startTime: s.startTime || evalNow,
    endTime: endTime,
    studyTime,
    sessionTime,
    pausedTime,
    unverifiedTime,
    distractions: { ...(s.distractions || { lookAway: 0, away: 0, lidClosed: 0 }) },
    pauses: Array.isArray(s.pauses) ? s.pauses.map(p => ({ ...p })) : [],
    lastSaved: endTime || referenceNow || Date.now(),
    schemaVersion: 2,
    tabId: TAB_ID,
  };
}

/**
 * Detect whether two records are duplicate/in-progress snapshots of the same session/day
 * or two independent sessions that occurred on the same day.
 */
function isSameSessionOrSnapshot(recA, recB) {
  if (!recA || !recB) return false;
  // If both have explicit IDs and they differ (and neither is a daily rollup),
  // they represent distinct independent sessions — never deduplicate them!
  if (recA.id && recB.id && recA.id !== recB.id) {
    const isDayA = typeof recA.id === 'string' && recA.id.startsWith('day_');
    const isDayB = typeof recB.id === 'string' && recB.id.startsWith('day_');
    if (!isDayA && !isDayB) {
      return false; // Distinct independent sessions (e.g. sess_1 and sess_2)
    }
  }
  // Identical record ID -> duplicate snapshot of the same session
  if (recA.id && recB.id && recA.id === recB.id) return true;
  // If BOTH are daily rollup records ('day_YYYY-MM-DD') for this date, they are daily snapshots
  const isDayA = typeof recA.id === 'string' && recA.id.startsWith('day_');
  const isDayB = typeof recB.id === 'string' && recB.id.startsWith('day_');
  if (isDayA && isDayB && (recA.date === recB.date)) return true;
  // If one record has no ID, or neither has an ID, and dates match and start times are identical (within 2s)
  if (recA.date && recB.date && recA.date === recB.date) {
    if (recA.startTime && recB.startTime && Math.abs(recA.startTime - recB.startTime) < 2000) return true;
    if (!recA.id || !recB.id) {
      return true;
    }
  }
  return false;
}

/**
 * Authoritatively reconcile two session records for the same day.
 * - If they are duplicate snapshots of the same session: merges taking max verified times and deduplicating pauses.
 * - If they are distinct independent sessions: safely sums active times and merges intervals.
 */
function reconcileSessionRecords(rawA, rawB) {
  if (!rawA && !rawB) return null;
  const recA = rawA ? normalizeSessionRecord(rawA) : null;
  const recB = rawB ? normalizeSessionRecord(rawB) : null;
  if (!recA) return { ...recB };
  if (!recB) return { ...recA };

  const isDuplicateSnapshot = isSameSessionOrSnapshot(recA, recB);

  let studyTime = 0;
  let sessionTime = 0;
  let unverifiedTime = 0;
  let pausedTime = 0;
  let distractions = { lookAway: 0, away: 0, lidClosed: 0 };

  if (isDuplicateSnapshot) {
    studyTime = Math.max(recA.studyTime || 0, recB.studyTime || 0);
    unverifiedTime = Math.max(recA.unverifiedTime || 0, recB.unverifiedTime || 0);
    sessionTime = studyTime + unverifiedTime;
    pausedTime = Math.max(recA.pausedTime || 0, recB.pausedTime || 0);

    distractions = {
      lookAway: Math.max(recA.distractions?.lookAway || 0, recB.distractions?.lookAway || 0),
      away: Math.max(recA.distractions?.away || 0, recB.distractions?.away || 0),
      lidClosed: Math.max(recA.distractions?.lidClosed || 0, recB.distractions?.lidClosed || 0),
    };
  } else {
    // Independent sessions on the same date: sum time and distractions
    studyTime = (recA.studyTime || 0) + (recB.studyTime || 0);
    unverifiedTime = (recA.unverifiedTime || 0) + (recB.unverifiedTime || 0);
    sessionTime = studyTime + unverifiedTime;
    pausedTime = (recA.pausedTime || 0) + (recB.pausedTime || 0);

    distractions = {
      lookAway: (recA.distractions?.lookAway || 0) + (recB.distractions?.lookAway || 0),
      away: (recA.distractions?.away || 0) + (recB.distractions?.away || 0),
      lidClosed: (recA.distractions?.lidClosed || 0) + (recB.distractions?.lidClosed || 0),
    };
  }

  const pausesMap = new Map();
  [...(recA.pauses || []), ...(recB.pauses || [])].forEach(p => {
    if (!p || typeof p.start !== 'number') return;
    const key = `${p.type || 'pause'}_${p.start}`;
    const existing = pausesMap.get(key);
    if (!existing || (existing.end === null && typeof p.end === 'number')) {
      pausesMap.set(key, { ...p });
    }
  });
  const pauses = Array.from(pausesMap.values()).sort((a, b) => a.start - b.start);

  const startTime = (recA.startTime && recB.startTime)
    ? Math.min(recA.startTime, recB.startTime)
    : (recA.startTime || recB.startTime || Date.now());

  const endTime = recA.endTime && recB.endTime
    ? Math.max(recA.endTime, recB.endTime)
    : (recA.endTime || recB.endTime || null);

  const lastSaved = Math.max(recA.lastSaved || 0, recB.lastSaved || 0) || Date.now();

  return {
    id: (isDuplicateSnapshot && (recA.id === recB.id))
      ? recA.id
      : ('day_' + (recA.date || recB.date)),
    date: recA.date || recB.date,
    startTime,
    endTime,
    studyTime,
    sessionTime,
    pausedTime,
    unverifiedTime,
    distractions,
    pauses,
    lastSaved,
    schemaVersion: 2,
  };
}

/**
 * Synchronously persist today's state into localStorage so restarts,
 * reloads, or sudden browser exits never lose a single second.
 * Reconciles rather than silently overwriting progress saved by another tab.
 */
function saveTodayToLocalStorage(referenceNow = null) {
  try {
    let record = buildSessionRecord(null, referenceNow);
    if (typeof localStorage !== 'undefined') {
      const existingRaw = localStorage.getItem('ayush_tracker_today');
      if (existingRaw) {
        try {
          const existing = JSON.parse(existingRaw);
          if (existing && existing.date === record.date && existing.tabId && existing.tabId !== TAB_ID) {
            // Reconcile cross-tab draft instead of clobbering higher progress
            record = reconcileSessionRecords(existing, record);
            record.tabId = TAB_ID;
          }
        } catch (_) { }
      }
      localStorage.setItem('ayush_tracker_today', JSON.stringify(record));
    }
    return record;
  } catch (e) {
    return null;
  }
}

/**
 * Synchronously load today's accumulated progress on startup.
 * Normalizes legacy records and recovers pausedTime from actual pause events.
 */
function loadTodayState() {
  const todayStr = getLocalDateString();
  let loaded = false;

  try {
    const raw = (typeof localStorage !== 'undefined') ? localStorage.getItem('ayush_tracker_today') : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.date === todayStr) {
        // Close dangling open pauses at lastSaved before normalizing
        const closeTime = parsed.lastSaved || parsed.endTime || parsed.startTime || Date.now();
        const rawWithClosedPauses = {
          ...parsed,
          pauses: (Array.isArray(parsed.pauses) ? parsed.pauses : []).map(p => {
            if (!p || p.end !== null) return p;
            const closed = { ...p, end: Math.max(p.start, closeTime) };
            if (typeof p.monoDurationMs === 'number' && Number.isFinite(p.monoDurationMs)) {
              closed.durationMs = Math.max(0, p.monoDurationMs);
            }
            return closed;
          }),
        };
        const data = normalizeSessionRecord(rawWithClosedPauses);

        state.session.id = data.id || ('day_' + todayStr);
        state.session.dateStr = todayStr;
        state.session.startTime = data.startTime || Date.now();
        state.session.endTime = data.endTime ?? null;
        state.session.accStudyMs = data.studyTime;
        state.session.studyTime = data.studyTime;
        state.session.accSessionMs = data.sessionTime;
        state.session.sessionTime = data.sessionTime;
        state.session.accUnverifiedMs = data.unverifiedTime;
        state.session.unverifiedTime = data.unverifiedTime;
        state.session.studyRunMs = 0;
        state.session.unverifiedRunMs = 0;
        state.session.pauses = data.pauses;
        state.session.pausedTime = data.pauses.length > 0
          ? calculateTotalPausedTime(data.pauses, closeTime)
          : data.pausedTime;
        state.session.distractions = data.distractions;
        state.session.lastSaved = data.lastSaved || Date.now();
        state.session.studyStartedAt = null;
        state.session.sessionStartedAt = null;
        state.session.unverifiedStartedAt = null;
        state.session.schemaVersion = 2;

        DOM.timerDisplay.textContent = formatTime(state.session.studyTime);
        if (DOM.statSessionTime) DOM.statSessionTime.textContent = formatTime(state.session.sessionTime || 0);
        if (DOM.statPausedTime) DOM.statPausedTime.textContent = formatTime(state.session.pausedTime || 0);
        updateStartButtonLabel();
        updateSessionStatsDisplay();
        loaded = true;
      } else {
        // From an earlier day: purge today cache
        if (typeof localStorage !== 'undefined') localStorage.removeItem('ayush_tracker_today');
      }
    }
  } catch (e) {
    console.warn('LocalStorage load error:', e);
  }

  if (!loaded) {
    state.session.id = 'day_' + todayStr;
    state.session.dateStr = todayStr;
    state.session.startTime = null;
    state.session.endTime = null;
    state.session.studyStartedAt = null;
    state.session.sessionStartedAt = null;
    state.session.unverifiedStartedAt = null;
    state.session.accStudyMs = 0;
    state.session.studyTime = 0;
    state.session.accSessionMs = 0;
    state.session.sessionTime = 0;
    state.session.accUnverifiedMs = 0;
    state.session.unverifiedTime = 0;
    state.session.studyRunMs = 0;
    state.session.unverifiedRunMs = 0;
    state.session.pausedTime = 0;
    state.session.distractions = { lookAway: 0, away: 0, lidClosed: 0 };
    state.session.pauses = [];
    state.session.schemaVersion = 2;
    DOM.timerDisplay.textContent = '00:00:00';
    if (DOM.statSessionTime) DOM.statSessionTime.textContent = '00:00:00';
    if (DOM.statPausedTime) DOM.statPausedTime.textContent = '00:00:00';
    updateStartButtonLabel();
  }
}

/**
 * Upsert the live session into IndexedDB and localStorage.
 */
async function autoSaveSession() {
  if (!state.session.active && (state.session.studyTime || 0) === 0) return;
  if (state.session.active && checkTabConflict()) {
    console.warn('Concurrent tab conflict detected during autosave — skipping overwrite');
    return;
  }
  try {
    const record = saveTodayToLocalStorage();
    if (record) {
      await DB.saveSession(record).catch(e => {
        console.warn('IndexedDB auto-save warning:', e);
      });
    }
  } catch (e) {
    showToast('error', 'Auto-save failed',
      'Could not save your study record to storage. ' + (e?.message || e));
  }
}

/**
 * On startup, finalize any unclosed sessions from previous days.
 * Recovers pausedTime from actual pause intervals and normalizes records safely.
 */
async function recoverUnfinishedSessions() {
  try {
    if (!DB.db) await DB.init();
    const todayStr = getLocalDateString();
    const all = await new Promise((res, rej) => {
      const tx = DB.db.transaction(['sessions'], 'readwrite');
      const store = tx.objectStore('sessions');
      const req = store.getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => rej(req.error);
    });

    const tx = DB.db.transaction(['sessions'], 'readwrite');
    const store = tx.objectStore('sessions');
    let pastRecoveredCount = 0;

    for (const raw of all) {
      const dStr = raw.date || getLocalDateString(raw.startTime || Date.now());
      if (dStr < todayStr && raw.endTime === null) {
        const endTime = raw.lastSaved || raw.startTime || Date.now();
        const closedPauses = Array.isArray(raw.pauses)
          ? raw.pauses.map(p => (p && p.end === null ? { ...p, end: Math.max(p.start, endTime) } : p))
          : [];
        const normalized = normalizeSessionRecord({
          ...raw,
          endTime,
          pauses: closedPauses,
        });
        store.put(normalized);
        pastRecoveredCount++;
      }
    }

    if (pastRecoveredCount > 0) {
      await new Promise((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      });
      showToast('info', 'Past session saved',
        `Previous study session from before today has been finalized and archived.`);
    }
  } catch (e) {
    console.warn('Recovery check error:', e);
  }
}


// ═══════════════════════════════════════════════
// 22C. DATABASE (IndexedDB)
// ═══════════════════════════════════════════════

let storageEpoch = 0;
let saveQueue = Promise.resolve();

function queueStorageOperation(fn) {
  const currentEpoch = storageEpoch;
  saveQueue = saveQueue.then(async () => {
    if (storageEpoch !== currentEpoch) return null;
    return fn();
  }).catch(err => {
    console.warn('Storage operation failed:', err);
    return null;
  });
  return saveQueue;
}

const DB = {
  db: null,
  name: 'ayush-tracker-db',
  version: 2,

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, this.version);
      request.onerror = (e) => reject('IndexedDB error: ' + e.target.error);
      request.onsuccess = async (e) => {
        this.db = e.target.result;
        try {
          await this.migrateFromOldDb();
        } catch (_) { }
        resolve();
      };
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('sessions')) {
          const store = db.createObjectStore('sessions', { keyPath: 'id' });
          store.createIndex('startTime', 'startTime', { unique: false });
        }
        if (!db.objectStoreNames.contains('locks')) {
          db.createObjectStore('locks', { keyPath: 'id' });
        }
      };
    });
  },

  async atomicAcquireLock({ tabId, dateStr, now = Date.now(), ttlMs = ACTIVE_TAB_LOCK_TTL_MS, monotonicNow = null }) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction(['locks'], 'readwrite');
        const store = tx.objectStore('locks');
        let acquired = false;
        let lockOut = null;
        const getReq = store.get('active_session_lock');
        getReq.onsuccess = () => {
          const existing = getReq.result || null;
          if (isLockConflicting(existing, now, dateStr, tabId, monotonicNow)) {
            acquired = false;
            lockOut = existing;
            return;
          }
          lockOut = {
            id: 'active_session_lock',
            tabId,
            dateStr,
            startedAt: (existing && existing.tabId === tabId) ? (existing.startedAt || now) : now,
            updatedAt: now,
            ...(typeof monotonicNow === 'number' && Number.isFinite(monotonicNow) ? { updatedMono: monotonicNow } : {}),
          };
          store.put(lockOut);
          acquired = true;
        };
        getReq.onerror = () => {
          acquired = false;
        };
        tx.oncomplete = () => resolve({ acquired, lock: lockOut });
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(new Error('Transaction aborted'));
      } catch (e) {
        reject(e);
      }
    });
  },

  async atomicRefreshLock({ tabId, dateStr, now = Date.now(), ttlMs = ACTIVE_TAB_LOCK_TTL_MS, monotonicNow = null }) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction(['locks'], 'readwrite');
        const store = tx.objectStore('locks');
        let ok = false;
        let lockOut = null;
        const getReq = store.get('active_session_lock');
        getReq.onsuccess = () => {
          const existing = getReq.result || null;
          // Strict ownership verification: must exist AND be owned by this tabId
          if (!existing || existing.tabId !== tabId || isLockConflicting(existing, now, dateStr, tabId, monotonicNow)) {
            ok = false;
            lockOut = existing;
            return;
          }
          lockOut = {
            id: 'active_session_lock',
            tabId,
            dateStr,
            startedAt: existing.startedAt || now,
            updatedAt: now,
            ...(typeof monotonicNow === 'number' && Number.isFinite(monotonicNow) ? { updatedMono: monotonicNow } : {}),
          };
          store.put(lockOut);
          ok = true;
        };
        getReq.onerror = () => {
          ok = false;
        };
        tx.oncomplete = () => resolve({ ok, lock: lockOut });
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(new Error('Transaction aborted'));
      } catch (e) {
        reject(e);
      }
    });
  },

  async atomicReleaseLock(tabId) {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(['locks'], 'readwrite');
        const store = tx.objectStore('locks');
        let released = false;
        const getReq = store.get('active_session_lock');
        getReq.onsuccess = () => {
          const existing = getReq.result || null;
          if (existing && existing.tabId === tabId) {
            store.delete('active_session_lock');
            released = true;
          }
        };
        tx.oncomplete = () => resolve(released);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch (_) {
        resolve(false);
      }
    });
  },

  async getActiveLock() {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(['locks'], 'readonly');
        const req = tx.objectStore('locks').get('active_session_lock');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  },

  async migrateFromOldDb() {
    return new Promise(async (resolve) => {
      try {
        if (typeof indexedDB === 'undefined' || !('databases' in indexedDB)) {
          return resolve();
        }
        const dbs = await indexedDB.databases();
        const oldDbExists = dbs.some(d => d.name === 'ai-spectator-db');
        if (!oldDbExists) return resolve();

        const hasData = await new Promise(res => {
          const tx = this.db.transaction(['sessions'], 'readonly');
          const req = tx.objectStore('sessions').count();
          req.onsuccess = () => res(req.result > 0);
          req.onerror = () => res(false);
        });
        if (hasData) return resolve();

        const openReq = indexedDB.open('ai-spectator-db');
        openReq.onsuccess = (e) => {
          const oldDb = e.target.result;
          if (!oldDb.objectStoreNames.contains('sessions')) {
            oldDb.close();
            return resolve();
          }
          const tx = oldDb.transaction(['sessions'], 'readonly');
          const req = tx.objectStore('sessions').getAll();
          req.onsuccess = () => {
            const oldSessions = req.result || [];
            if (oldSessions.length > 0) {
              const newTx = this.db.transaction(['sessions'], 'readwrite');
              const newStore = newTx.objectStore('sessions');
              oldSessions.forEach(s => newStore.put(s));
              newTx.oncomplete = () => {
                oldDb.close();
                resolve();
              };
              newTx.onerror = () => {
                oldDb.close();
                resolve();
              };
            } else {
              oldDb.close();
              resolve();
            }
          };
          req.onerror = () => {
            oldDb.close();
            resolve();
          };
        };
        openReq.onerror = () => resolve();
      } catch (_) {
        resolve();
      }
    });
  },

  async saveSession(data) {
    if (!this.db) await this.init();
    const epochAtCall = storageEpoch;
    return queueStorageOperation(async () => {
      if (storageEpoch !== epochAtCall) {
        return;
      }

      // Check active tab lock before writing shared day records
      const nowLockCheck = Date.now();
      const activeLock = await this.getActiveLock().catch(() => null);
      if (isLockConflicting(activeLock, nowLockCheck, data.date, data.tabId || TAB_ID) && data.endTime === null) {
        // Another live tab owns the active tracking lock; refuse stale non-owning write
        return;
      }

      // Guard against concurrent tab overwrites on shared day_YYYY-MM-DD keys
      let existing = null;
      try {
        existing = await new Promise((resolve) => {
          const tx = this.db.transaction(['sessions'], 'readonly');
          const req = tx.objectStore('sessions').get(data.id);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        });
      } catch (_) { }

      if (storageEpoch !== epochAtCall) {
        return;
      }

      let recordToPut = data;
      if (existing) {
        const fromDifferentTab = Boolean(existing.tabId && data.tabId && existing.tabId !== data.tabId);
        const wouldRegress = (existing.studyTime || 0) > (data.studyTime || 0);
        if (fromDifferentTab || wouldRegress) {
          recordToPut = reconcileSessionRecords(existing, data);
          if (data.tabId) recordToPut.tabId = data.tabId;
        }
      }

      return new Promise((resolve, reject) => {
        try {
          if (storageEpoch !== epochAtCall) return resolve();
          const tx = this.db.transaction(['sessions'], 'readwrite');
          const store = tx.objectStore('sessions');
          store.put(recordToPut);
          tx.oncomplete = () => {
            resolve();
          };
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
        } catch (e) {
          reject(e);
        }
      });
    });
  },

  async getDailyRecord(dateStr) {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      const tx = this.db.transaction(['sessions'], 'readonly');
      const store = tx.objectStore('sessions');
      const req = store.get('day_' + dateStr);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  },

  async getDailyRecords() {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['sessions'], 'readonly');
      const store = tx.objectStore('sessions');
      const req = store.getAll();
      req.onsuccess = () => {
        const all = req.result || [];
        const dailyTotals = calculateDailyTotals(all);
        const sorted = Object.values(dailyTotals).sort((a, b) => b.date.localeCompare(a.date));
        resolve(sorted);
      };
      req.onerror = () => reject(req.error);
    });
  },

  async getAllSessions() {
    return this.getDailyRecords();
  },

  async consolidateToDaily() {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(['sessions'], 'readwrite');
        const store = tx.objectStore('sessions');
        const allReq = store.getAll();
        allReq.onsuccess = () => {
          const all = allReq.result || [];
          const sessionRows = all.filter(s => s && s.id && s.id.startsWith('sess_'));
          if (sessionRows.length === 0) return resolve();

          const grouped = {};
          for (const s of sessionRows) {
            const dStr = s.date || getLocalDateString(s.startTime);
            if (!grouped[dStr]) grouped[dStr] = [];
            grouped[dStr].push(s);
          }

          for (const [dStr, rows] of Object.entries(grouped)) {
            const dayId = 'day_' + dStr;
            let existing = all.find(item => item.id === dayId) || null;

            // Deduplicate duplicate snapshots among rows first
            const uniqueSessions = [];
            for (const r of rows) {
              const idx = uniqueSessions.findIndex(u => isSameSessionOrSnapshot(u, r));
              if (idx >= 0) {
                uniqueSessions[idx] = reconcileSessionRecords(uniqueSessions[idx], r);
              } else {
                uniqueSessions.push(r);
              }
            }

            for (const u of uniqueSessions) {
              if (!existing) {
                existing = {
                  id: dayId,
                  date: dStr,
                  startTime: u.startTime || Date.now(),
                  endTime: u.endTime || null,
                  studyTime: u.studyTime || 0,
                  sessionTime: u.sessionTime || 0,
                  pausedTime: u.pausedTime || 0,
                  unverifiedTime: u.unverifiedTime || 0,
                  distractions: { ...(u.distractions || { lookAway: 0, away: 0, lidClosed: 0 }) },
                  pauses: Array.isArray(u.pauses) ? [...u.pauses] : [],
                  lastSaved: u.lastSaved || Date.now(),
                };
              } else {
                existing = reconcileSessionRecords(existing, u);
              }
            }

            for (const r of rows) {
              store.delete(r.id);
            }
            if (existing) {
              store.put(existing);
            }
          }
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        };
        allReq.onerror = () => resolve();
      } catch (_) {
        resolve();
      }
    });
  },

  async clearAll() {
    if (!this.db) await this.init();
    storageEpoch++; // Bump epoch to immediately invalidate any queued saves
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('ayush_tracker_today');
    }
    return queueStorageOperation(() => {
      return new Promise((resolve, reject) => {
        try {
          const storeNames = this.db.objectStoreNames?.contains?.('locks')
            ? ['sessions', 'locks']
            : ['sessions'];
          const tx = this.db.transaction(storeNames, 'readwrite');
          tx.objectStore('sessions').clear();
          if (storeNames.includes('locks')) {
            tx.objectStore('locks').clear();
          }
          tx.oncomplete = () => {
            if (typeof localStorage !== 'undefined') {
              localStorage.removeItem('ayush_tracker_today');
            }
            resolve();
          };
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
        } catch (e) {
          reject(e);
        }
      });
    });
  },
};


// ═══════════════════════════════════════════════
// 22D. AUTHORITATIVE ANALYTICS ENGINE
// ═══════════════════════════════════════════════

/**
 * Normalizes all session records into unique calendar day totals.
 * Distinguishes duplicate snapshots (reconciled by max) from independent sessions (summed).
 */
function calculateDailyTotals(sessions = [], todayDateStr = getLocalDateString(), liveSession = null) {
  const grouped = {};
  for (const raw of sessions) {
    if (!raw) continue;
    const s = normalizeSessionRecord(raw);
    if (!s) continue;
    const dStr = s.date || getLocalDateString(s.startTime || Date.now());
    if (!grouped[dStr]) grouped[dStr] = [];
    grouped[dStr].push(s);
  }

  const dailyTotals = {};
  for (const [dStr, rows] of Object.entries(grouped)) {
    const unique = [];
    for (const r of rows) {
      const idx = unique.findIndex(u => isSameSessionOrSnapshot(u, r));
      if (idx >= 0) {
        unique[idx] = reconcileSessionRecords(unique[idx], r);
      } else {
        unique.push(r);
      }
    }

    let studyTime = 0;
    let sessionTime = 0;
    let pausedTime = 0;
    let unverifiedTime = 0;
    const distractions = { lookAway: 0, away: 0, lidClosed: 0 };

    for (const u of unique) {
      studyTime += (u.studyTime || 0);
      sessionTime += (u.sessionTime || 0);
      pausedTime += (u.pausedTime || 0);
      unverifiedTime += (u.unverifiedTime || 0);
      distractions.lookAway += (u.distractions?.lookAway || 0);
      distractions.away += (u.distractions?.away || 0);
      distractions.lidClosed += (u.distractions?.lidClosed || 0);
    }
    sessionTime = studyTime + unverifiedTime;

    dailyTotals[dStr] = {
      id: 'day_' + dStr,
      date: dStr,
      studyTime,
      sessionTime,
      pausedTime,
      unverifiedTime,
      distractions,
    };
  }

  // Reconcile with live tracking state for today
  const liveRaw = liveSession || (
    (state.session.studyTime > 0 || state.session.active || state.session.sessionTime > 0 ||
      state.session.pausedTime > 0 || state.session.unverifiedTime > 0)
      ? buildSessionRecord(state.session.endTime ?? null)
      : null
  );
  const live = liveRaw ? normalizeSessionRecord(liveRaw) : null;

  if (live && live.date === todayDateStr) {
    if (!dailyTotals[todayDateStr]) {
      dailyTotals[todayDateStr] = {
        id: 'day_' + todayDateStr,
        date: todayDateStr,
        studyTime: live.studyTime || 0,
        sessionTime: (live.studyTime || 0) + (live.unverifiedTime || 0),
        pausedTime: live.pausedTime || 0,
        unverifiedTime: live.unverifiedTime || 0,
        distractions: { ...(live.distractions || { lookAway: 0, away: 0, lidClosed: 0 }) },
      };
    } else {
      const existing = dailyTotals[todayDateStr];
      const merged = reconcileSessionRecords(existing, live);
      dailyTotals[todayDateStr] = {
        id: 'day_' + todayDateStr,
        date: todayDateStr,
        studyTime: merged.studyTime,
        sessionTime: merged.sessionTime,
        pausedTime: merged.pausedTime,
        unverifiedTime: merged.unverifiedTime,
        distractions: merged.distractions,
      };
    }
  }

  return dailyTotals;
}

/**
 * Calculate weekly totals and per-day values for the calendar week (Monday through Sunday).
 */
function calculateWeeklyTotals(dailyTotals = {}, referenceDate = new Date()) {
  const ref = new Date(referenceDate);
  const refDate = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const dayOfWeek = refDate.getDay() === 0 ? 6 : refDate.getDay() - 1; // 0=Mon, 6=Sun

  const weekDays = [];
  const dailyValues = [];
  let weeklyStudyTime = 0;
  let weeklySessionTime = 0;

  for (let i = 0; i < 7; i++) {
    const d = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate() - dayOfWeek + i);
    const dStr = getLocalDateString(d.getTime());
    weekDays.push(dStr);
    const rec = dailyTotals[dStr] || { studyTime: 0, sessionTime: 0 };
    dailyValues.push(rec.studyTime || 0);
    weeklyStudyTime += (rec.studyTime || 0);
    weeklySessionTime += (rec.sessionTime || 0);
  }

  return {
    weeklyStudyTime,
    weeklySessionTime,
    weekDays,
    dailyValues,
  };
}

/**
 * Calculate monthly totals for the calendar month.
 */
function calculateMonthlyTotals(dailyTotals = {}, referenceDate = new Date()) {
  const ref = new Date(referenceDate);
  const year = ref.getFullYear();
  const month = ref.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthDays = [];
  const dailyValues = [];
  let monthlyStudyTime = 0;
  let monthlySessionTime = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    const dStr = getLocalDateString(d.getTime());
    monthDays.push(dStr);
    const rec = dailyTotals[dStr] || { studyTime: 0, sessionTime: 0 };
    dailyValues.push(rec.studyTime || 0);
    monthlyStudyTime += (rec.studyTime || 0);
    monthlySessionTime += (rec.sessionTime || 0);
  }

  return {
    monthlyStudyTime,
    monthlySessionTime,
    daysInMonth,
    monthDays,
    dailyValues,
  };
}

/**
 * Calculate daily averages across recorded sessions, the current week, or the current month.
 */
function calculateDailyAverages(dailyTotals = {}, type = 'all', referenceDate = new Date()) {
  if (type === 'week') {
    const { weeklyStudyTime } = calculateWeeklyTotals(dailyTotals, referenceDate);
    return Math.round(weeklyStudyTime / 7);
  }
  if (type === 'month') {
    const { monthlyStudyTime, daysInMonth } = calculateMonthlyTotals(dailyTotals, referenceDate);
    return Math.round(monthlyStudyTime / daysInMonth);
  }
  // 'all': average across unique days with recorded study time
  const records = Object.values(dailyTotals).filter(r => (r.studyTime || 0) > 0);
  if (records.length === 0) return 0;
  const total = records.reduce((acc, r) => acc + (r.studyTime || 0), 0);
  return Math.round(total / records.length);
}

/**
 * Calculate session utilization percentage (verified study time / total active tracking interval).
 */
function calculateSessionUtilization(studyMs, sessionMs) {
  if (!sessionMs || sessionMs <= 0 || !studyMs || studyMs <= 0) return 0;
  return Math.min(100, Math.round((studyMs / sessionMs) * 100));
}

/**
 * Calculate historical comparisons: today vs yesterday, and this week vs last week.
 */
function calculateHistoricalComparisons(dailyTotals = {}, referenceDate = new Date()) {
  const now = new Date(referenceDate);
  const todayStr = getLocalDateString(now.getTime());
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterdayStr = getLocalDateString(yesterday.getTime());

  const todayStudy = dailyTotals[todayStr]?.studyTime || 0;
  const yesterdayStudy = dailyTotals[yesterdayStr]?.studyTime || 0;
  const todayDiff = todayStudy - yesterdayStudy;

  const thisWeek = calculateWeeklyTotals(dailyTotals, now);
  const lastWeekDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
  const lastWeek = calculateWeeklyTotals(dailyTotals, lastWeekDate);
  const weekDiff = thisWeek.weeklyStudyTime - lastWeek.weeklyStudyTime;

  return {
    todayStudy,
    yesterdayStudy,
    todayDiff,
    thisWeekStudy: thisWeek.weeklyStudyTime,
    lastWeekStudy: lastWeek.weeklyStudyTime,
    weekDiff,
  };
}


// ═══════════════════════════════════════════════
// 23. DASHBOARD — Refresh & Rendering
// ═══════════════════════════════════════════════

async function refreshDashboard() {
  DOM.dailyGoalDisplay.textContent = state.settings.dailyGoal + 'h';
  buildChart([]);

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
  const now = new Date();
  const todayDateStr = getLocalDateString();
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const dailyTotals = calculateDailyTotals(sessions, todayDateStr);
  const { weeklyStudyTime } = calculateWeeklyTotals(dailyTotals, now);

  const todayRecord = dailyTotals[todayDateStr] || {
    studyTime: 0,
    sessionTime: 0,
    distractions: { lookAway: 0, away: 0, lidClosed: 0 },
  };

  const todayStudy = todayRecord.studyTime || 0;
  const todaySession = todayRecord.sessionTime || 0;
  const todayPaused = todayRecord.pausedTime || 0;
  const todayDist = todayRecord.distractions || { lookAway: 0, away: 0, lidClosed: 0 };

  // Update UI Stats
  if (DOM.dashStudyTime) DOM.dashStudyTime.textContent = formatDuration(todayStudy);

  const focusDisplay = formatFocusPercentage(todayStudy, todaySession + todayPaused);
  if (DOM.dashFocus) DOM.dashFocus.textContent = focusDisplay;

  const totalDist = todayDist.lookAway + todayDist.away + todayDist.lidClosed;
  if (DOM.dashDistractions) DOM.dashDistractions.textContent = totalDist;

  if (DOM.distLookAway) DOM.distLookAway.textContent = todayDist.lookAway;
  if (DOM.distAway) DOM.distAway.textContent = todayDist.away;
  if (DOM.distLid) DOM.distLid.textContent = todayDist.lidClosed;

  if (DOM.weeklyTotal) DOM.weeklyTotal.textContent = formatDuration(weeklyStudyTime);

  // Update Summary cards on Home
  if (DOM.homeStudyTime) DOM.homeStudyTime.textContent = formatDuration(todayStudy);
  if (DOM.homeFocus) DOM.homeFocus.textContent = focusDisplay;
  if (DOM.homeDistractions) DOM.homeDistractions.textContent = totalDist;
  if (DOM.hudLiveFocus) DOM.hudLiveFocus.textContent = focusDisplay;
  if (DOM.hudLiveDistractions) DOM.hudLiveDistractions.textContent = totalDist;
  if (DOM.hwGoalVal) DOM.hwGoalVal.textContent = `${Number(state.settings.dailyGoal || 6).toFixed(1)}h`;

  // Calculate Streak
  let streak = 0;
  const goalMs = (state.settings.dailyGoal || 4) * 3600000;

  if (goalMs > 0) {
    for (let i = 0; i < 365; i++) {
      const d = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate() - i);
      const dStr = getLocalDateString(d.getTime());
      const studied = dailyTotals[dStr] ? dailyTotals[dStr].studyTime : 0;

      // If today's goal is not reached yet, it does not break streak achieved through yesterday
      if (i === 0 && studied < goalMs) {
        continue;
      }

      if (studied >= goalMs) {
        streak++;
      } else {
        break;
      }
    }
  }

  const updateStreakBadgeText = (badgeEl, labelText) => {
    if (!badgeEl) return;
    const labelSpan = typeof badgeEl.querySelector === 'function' ? badgeEl.querySelector('span') : null;
    if (labelSpan) {
      labelSpan.textContent = labelText;
    } else {
      badgeEl.textContent = labelText;
    }
  };
  const streakText = `${streak} day${streak === 1 ? '' : 's'}`;
  updateStreakBadgeText(DOM.streakBadge, `${streakText} streak`);
  updateStreakBadgeText(DOM.homeStreakBadge, streakText);

  // Daily goal progress on Home
  const goalPct = goalMs > 0 ? Math.min(100, Math.round((todayStudy / goalMs) * 100)) : 0;
  if (DOM.goalProgressText) {
    DOM.goalProgressText.textContent = `${(todayStudy / 3600000).toFixed(1)}h / ${Number(state.settings.dailyGoal).toFixed(1)}h`;
  }
  if (DOM.goalPctBadge) {
    DOM.goalPctBadge.textContent = `${goalPct}%`;
  }
  if (DOM.goalProgressBar) {
    DOM.goalProgressBar.style.width = goalPct + '%';
  }
  renderGoalSegments(goalPct);

  // Render recent sessions on Home
  renderRecentSessions(sessions);
}

function renderGoalSegments(goalPct = 0) {
  if (!DOM.goalSegments || typeof document === 'undefined' || typeof document.createElement !== 'function') return;
  const TOTAL_SEGMENTS = 20;
  const filledCount = Math.round((Math.max(0, Math.min(100, goalPct)) / 100) * TOTAL_SEGMENTS);
  if (DOM.goalSegments.children.length !== TOTAL_SEGMENTS) {
    DOM.goalSegments.innerHTML = '';
    for (let i = 0; i < TOTAL_SEGMENTS; i++) {
      const seg = document.createElement('span');
      seg.className = 'goal-seg';
      DOM.goalSegments.appendChild(seg);
    }
  }
  for (let i = 0; i < TOTAL_SEGMENTS; i++) {
    const seg = DOM.goalSegments.children[i];
    if (seg && seg.classList) {
      seg.classList.toggle('filled', i < filledCount);
    }
  }
}

function renderRecentSessions(sessions) {
  if (!DOM.homeRecentSessions) return;
  const recent = sessions.slice(0, 5);
  if (recent.length === 0) {
    DOM.homeRecentSessions.innerHTML = '<div class="empty-recent-item">No study time recorded yet</div>';
    return;
  }
  const todayStr = getLocalDateString();
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = getLocalDateString(yesterdayDate.getTime());

  DOM.homeRecentSessions.innerHTML = recent.map(s => {
    let dayLabel = s.date;
    if (s.date === todayStr) {
      dayLabel = 'Today • ' + new Date(s.startTime || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } else if (s.date === yesterdayStr) {
      dayLabel = 'Yesterday • ' + new Date(s.startTime || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } else {
      dayLabel = new Date(s.startTime || (s.date + 'T12:00:00')).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    }
    const focusDisplay = formatFocusPercentage(s.studyTime, (s.sessionTime || 0) + (s.pausedTime || 0));
    const totalDist = (s.distractions?.lookAway || 0) + (s.distractions?.away || 0) + (s.distractions?.lidClosed || 0);
    return `
      <div class="recent-session-item">
        <div class="recent-session-info">
          <div class="recent-session-date">${dayLabel}</div>
          <div class="recent-session-meta">Focus: ${focusDisplay} &bull; ${totalDist} dist.</div>
        </div>
        <div class="recent-session-dur">${formatDuration(s.studyTime)}</div>
      </div>
    `;
  }).join('');
}

function buildChart(sessions) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const now = new Date();
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const currentDayIdx = todayDate.getDay() === 0 ? 6 : todayDate.getDay() - 1; // 0=Mon, 6=Sun
  const todayDateStr = getLocalDateString();

  const dailyTotals = calculateDailyTotals(sessions, todayDateStr);
  const { weekDays, dailyValues } = calculateWeeklyTotals(dailyTotals, now);

  const goalMs = (state.settings.dailyGoal || 4) * 3600000;

  if (DOM.chartContainer) {
    DOM.chartContainer.innerHTML = '';
    days.forEach((day, i) => {
      const studyMs = dailyValues[i] || 0;
      const studyHours = studyMs / 3600000;

      // Cap bar at 150% of goal visually
      const percent = goalMs > 0 ? Math.min((studyMs / goalMs) * 100, 150) : 0;

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
      if (goalMs > 0 && studyMs >= goalMs) bar.style.background = 'var(--success-color)';
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
}

function buildSessionList(sessions) {
  if (!DOM.sessionList) return;
  DOM.sessionList.innerHTML = '';

  const dailyTotals = calculateDailyTotals(sessions, getLocalDateString());
  const dailyList = Object.values(dailyTotals).sort((a, b) => b.date.localeCompare(a.date));

  if (dailyList.length === 0 || dailyList.every(d => (d.studyTime || 0) === 0)) {
    DOM.sessionList.innerHTML =
      '<div class="empty-state"><div class="empty-state-icon text-muted"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg></div><div class="empty-state-text">No recorded study days yet. Begin your first focused session on the tracker!</div></div>';
    return;
  }

  const todayStr = getLocalDateString();
  const yesterdayStr = getLocalDateString(Date.now() - 86400000);

  dailyList.filter(d => (d.studyTime || 0) > 0 || d.date === todayStr).slice(0, 30).forEach(s => {
    let dayLabel = s.date;
    if (s.date === todayStr) {
      dayLabel = 'Today (' + new Date().toLocaleDateString() + ')';
    } else if (s.date === yesterdayStr) {
      dayLabel = 'Yesterday (' + new Date(Date.now() - 86400000).toLocaleDateString() + ')';
    } else {
      dayLabel = new Date(s.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
    }

    const focusDisplay = formatFocusPercentage(s.studyTime, (s.sessionTime || 0) + (s.pausedTime || 0));
    const totalDist = (s.distractions?.lookAway || 0) +
      (s.distractions?.away || 0) +
      (s.distractions?.lidClosed || 0);

    const item = document.createElement('div');
    item.className = 'session-item';
    item.innerHTML = `
      <div>
        <div style="font-weight:600;color:var(--text-primary)">
          ${dayLabel}
        </div>
        <div style="font-size:0.8125rem;color:var(--text-secondary);margin-top:2px">
          Focus: ${focusDisplay} &middot;
          ${totalDist} distraction${totalDist !== 1 ? 's' : ''} &middot;
          Active: ${formatDuration(s.sessionTime)}
        </div>
      </div>
      <div style="font-weight:700;color:var(--accent-primary);text-align:right">
        <div class="font-mono" style="font-size:1.1rem">${formatDuration(s.studyTime)}</div>
        <div style="font-size:0.75rem;font-weight:500;color:var(--text-muted)">
          day's learned
        </div>
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
    state.pipWindow = null;
    if (DOM.pipBtn) DOM.pipBtn.classList.remove('pip-active');
    if (DOM.hwPipBtn) DOM.hwPipBtn.classList.remove('active');
    return;
  }

  try {
    state.pipWindow = await documentPictureInPicture.requestWindow({
      width: 248,
      height: 112,
    });
    if (DOM.pipBtn) DOM.pipBtn.classList.add('pip-active');
    if (DOM.hwPipBtn) DOM.hwPipBtn.classList.add('active');

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

    // Chrono-Optic machined aluminum & carbon PiP mini-instrument styles
    state.pipWindow.document.documentElement.classList.add('pip-html');
    state.pipWindow.document.body.classList.add('pip-body');

    const customStyle = document.createElement('style');
    customStyle.textContent = `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      html.pip-html, body.pip-body, body {
        width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden;
        container-type: size; container-name: piproot;
        font-family: 'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        --pip-chassis-top: #F2F1EC;
        --pip-chassis-bot: #DAD8D0;
        --pip-chassis-border: #C5C3BA;
        --pip-chassis-hl: rgba(255, 255, 255, 0.78);
        --pip-ink-slate: #52524C;
        --pip-carbon: #161614;
        --pip-carbon-border: #2B2C28;
        --pip-present: #57B889;
        --pip-warn: #E86233;
        --pip-muted: #A6A69E;
        background: var(--pip-chassis-bot);
        user-select: none;
      }
      html[data-theme="dark"], html[data-theme="dark"] body.pip-body {
        --pip-chassis-top: #262724;
        --pip-chassis-bot: #191A17;
        --pip-chassis-border: #363833;
        --pip-chassis-hl: rgba(255, 255, 255, 0.08);
        --pip-ink-slate: #A8A89F;
        --pip-carbon: #0E0F0D;
        --pip-carbon-border: #282A25;
      }
      .pip-root {
        position: relative;
        width: 100%; height: 100vh;
        display: flex; flex-direction: column; justify-content: space-between;
        padding: clamp(6px, 6cqh, 12px) clamp(8px, 4cqw, 14px);
        gap: clamp(4px, 4cqh, 8px);
        background: linear-gradient(180deg, var(--pip-chassis-top) 0%, var(--pip-chassis-bot) 100%);
        border: 1px solid var(--pip-chassis-border);
        box-shadow: inset 0 1px 0 var(--pip-chassis-hl);
        overflow: hidden;
      }
      .pip-screw {
        position: absolute; width: 5px; height: 5px; border-radius: 50%;
        background: radial-gradient(circle at 35% 35%, #F4F3EE 0%, #9E9C94 80%);
        border: 0.5px solid rgba(22, 22, 20, 0.3); pointer-events: none; z-index: 3;
      }
      html[data-theme="dark"] .pip-screw {
        background: radial-gradient(circle at 35% 35%, #555750 0%, #242622 80%);
        border-color: rgba(0, 0, 0, 0.65);
      }
      .pip-screw.tl { top: 4px; left: 4px; }
      .pip-screw.tr { top: 4px; right: 4px; }
      .pip-screw.bl { bottom: 4px; left: 4px; }
      .pip-screw.br { bottom: 4px; right: 4px; }
      .pip-header {
        width: 100%; display: flex; justify-content: space-between; align-items: center;
        flex-shrink: 0; gap: 6px; padding: 0 4px;
      }
      .pip-badge {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 2px 8px; border-radius: 5px;
        background: var(--pip-carbon); border: 1px solid var(--pip-carbon-border);
        color: var(--pip-muted);
        font-family: 'JetBrains Mono', ui-monospace, monospace;
        font-size: clamp(0.55rem, min(11cqh, 3.8cqw), 0.78rem);
        font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
        white-space: nowrap;
      }
      .pip-badge-dot {
        width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
        background: var(--pip-muted);
      }
      .pip-root[data-status="studying"] .pip-badge { color: var(--pip-present); }
      .pip-root[data-status="studying"] .pip-badge-dot { background: var(--pip-present); }
      .pip-root[data-status="looking-away"] .pip-badge,
      .pip-root[data-status="away"] .pip-badge,
      .pip-root[data-status="lid-closed"] .pip-badge {
        background: #B83C12; border-color: #8F2B0A; color: #FFFFFF;
      }
      .pip-root[data-status="looking-away"] .pip-badge-dot,
      .pip-root[data-status="away"] .pip-badge-dot,
      .pip-root[data-status="lid-closed"] .pip-badge-dot { background: #FFFFFF; }
      .pip-focus-tag {
        font-family: 'JetBrains Mono', ui-monospace, monospace;
        font-size: clamp(0.55rem, min(11cqh, 3.8cqw), 0.78rem);
        color: var(--pip-ink-slate); font-weight: 700; letter-spacing: 0.04em; white-space: nowrap;
      }
      .pip-console {
        position: relative; flex: 1; min-height: 0;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        border-radius: 7px;
        background: linear-gradient(180deg, #1B1C19 0%, var(--pip-carbon) 100%);
        border: 1px solid var(--pip-carbon-border);
        box-shadow: inset 0 2px 7px rgba(0, 0, 0, 0.72), 0 1px 0 var(--pip-chassis-hl);
        padding: clamp(4px, 4cqh, 10px) clamp(8px, 4cqw, 16px);
        overflow: hidden;
      }
      .pip-root[data-status="studying"] .pip-console {
        border-color: rgba(87, 184, 137, 0.45);
      }
      .pip-root[data-status="looking-away"] .pip-console,
      .pip-root[data-status="away"] .pip-console,
      .pip-root[data-status="lid-closed"] .pip-console {
        border-color: rgba(232, 98, 51, 0.65);
      }
      .pip-bracket {
        position: absolute; width: 7px; height: 7px;
        border-color: rgba(255, 255, 255, 0.22); border-style: solid; border-width: 0;
        pointer-events: none;
      }
      .pip-bracket.tl { top: 4px; left: 5px; border-top-width: 1.5px; border-left-width: 1.5px; }
      .pip-bracket.tr { top: 4px; right: 5px; border-top-width: 1.5px; border-right-width: 1.5px; }
      .pip-bracket.bl { bottom: 4px; left: 5px; border-bottom-width: 1.5px; border-left-width: 1.5px; }
      .pip-bracket.br { bottom: 4px; right: 5px; border-bottom-width: 1.5px; border-right-width: 1.5px; }
      .pip-timer {
        font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-variant-numeric: tabular-nums;
        font-feature-settings: 'tnum' 1, 'zero' 1;
        font-size: clamp(1.15rem, min(42cqh, 15.5cqw), 4.6rem);
        font-weight: 500; letter-spacing: 0.06em; line-height: 1;
        color: #F2F1EC;
        background: linear-gradient(180deg, #FFFFFF 0%, #ECEBE5 36%, #B4B3AB 53%, #DFDED6 75%, #9E9D95 100%);
        -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
        filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.85)) drop-shadow(0 -1px 0 rgba(255, 255, 255, 0.14));
        text-align: center; white-space: nowrap;
      }
      .pip-root[data-status="looking-away"] .pip-timer,
      .pip-root[data-status="away"] .pip-timer,
      .pip-root[data-status="lid-closed"] .pip-timer {
        color: #F2784B;
        background: linear-gradient(180deg, #FFC5AE 0%, #F27C50 38%, #B83D12 54%, #EB6A3B 76%, #942F0D 100%);
        -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
      }
      .pip-alert-banner {
        width: 100%; display: none; align-items: center; justify-content: center; gap: 5px;
        padding: 3px 8px; border-radius: 5px;
        font-family: 'JetBrains Mono', ui-monospace, monospace;
        font-size: clamp(0.55rem, min(10cqh, 3.4cqw), 0.76rem); font-weight: 700;
        letter-spacing: 0.04em; background: rgba(232, 98, 51, 0.14);
        color: var(--pip-warn); border: 1px solid rgba(232, 98, 51, 0.45);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0;
      }
      .pip-root[data-status="looking-away"] .pip-alert-banner,
      .pip-root[data-status="away"] .pip-alert-banner,
      .pip-root[data-status="lid-closed"] .pip-alert-banner {
        display: flex !important;
      }
      @container piproot (max-height: 74px) and (min-width: 170px) {
        .pip-root { flex-direction: row; align-items: center; padding: 5px 8px; gap: 8px; }
        .pip-screw { display: none; }
        .pip-header { width: auto; flex-direction: column; align-items: flex-start; gap: 3px; padding: 0; }
        .pip-console { height: 100%; padding: 4px 10px; }
        .pip-timer { font-size: clamp(1rem, min(52cqh, 14cqw), 2.1rem); }
        .pip-alert-banner { position: absolute; inset: 0; height: 100%; border-radius: 0; z-index: 10; background: #161614; }
      }
      .pip-root[data-layout="compact-row"] {
        flex-direction: row; align-items: center; padding: 5px 8px; gap: 8px;
      }
      .pip-root[data-layout="compact-row"] .pip-screw { display: none; }
      .pip-root[data-layout="compact-row"] .pip-header {
        width: auto; flex-direction: column; align-items: flex-start; gap: 3px; padding: 0;
      }
      .pip-root[data-layout="compact-row"] .pip-console { height: 100%; padding: 4px 10px; }
      .pip-root[data-layout="compact-row"] .pip-alert-banner {
        position: absolute; inset: 0; height: 100%; border-radius: 0; z-index: 10; background: #161614;
      }
    `;
    state.pipWindow.document.head.appendChild(customStyle);

    state.pipWindow.document.body.innerHTML = `
      <div id="pip-container" class="pip-root" data-status="${escapeHtml(state.status)}">
        <span class="pip-screw tl" aria-hidden="true"></span>
        <span class="pip-screw tr" aria-hidden="true"></span>
        <span class="pip-screw bl" aria-hidden="true"></span>
        <span class="pip-screw br" aria-hidden="true"></span>
        <div class="pip-header">
          <div id="pip-status-chip" class="pip-badge" data-status="${escapeHtml(state.status)}">
            <span class="pip-badge-dot"></span>
            <span id="pip-status-text">${escapeHtml(DOM.statusText.textContent)}</span>
          </div>
          <div id="pip-focus-tag" class="pip-focus-tag">Focus: —</div>
        </div>

        <div class="pip-console">
          <span class="pip-bracket tl" aria-hidden="true"></span>
          <span class="pip-bracket tr" aria-hidden="true"></span>
          <span class="pip-bracket bl" aria-hidden="true"></span>
          <span class="pip-bracket br" aria-hidden="true"></span>
          <div id="pip-timer" class="pip-timer" data-status="${escapeHtml(state.status)}">
            ${escapeHtml(DOM.timerDisplay.textContent)}
          </div>
        </div>

        <div id="pip-alert-banner" class="pip-alert-banner">
          <span id="pip-alert-icon">⚠️</span>
          <span id="pip-alert-text">PAUSED — LOOKING AWAY</span>
        </div>
      </div>
    `;

    state.pipWindow.document.documentElement.setAttribute('data-theme', state.theme);

    function updatePiPResponsiveLayout() {
      if (!state.pipWindow) return;
      const w = state.pipWindow.innerWidth;
      const h = state.pipWindow.innerHeight;
      const root = state.pipWindow.document.getElementById('pip-container');
      if (!root) return;
      root.style.setProperty('--pip-w', `${w}px`);
      root.style.setProperty('--pip-h', `${h}px`);
      if (h < 74 && w >= 170) {
        root.setAttribute('data-layout', 'compact-row');
      } else {
        root.setAttribute('data-layout', 'column');
      }
    }

    state.pipWindow.addEventListener('resize', updatePiPResponsiveLayout);
    updatePiPResponsiveLayout();

    state.pipWindow.addEventListener('pagehide', () => {
      state.pipWindow = null;
      if (DOM.pipBtn) DOM.pipBtn.classList.remove('pip-active');
      if (DOM.hwPipBtn) DOM.hwPipBtn.classList.remove('active');
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

  const cutoff = state.settings.focusThreshold ?? 50;
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
    else if (state.status === 'looking-away') textEl.textContent = 'Looking Away';
    else if (state.status === 'away') textEl.textContent = 'No Face';
    else if (state.status === 'lid-closed') textEl.textContent = 'Sleeping';
    else textEl.textContent = DOM.statusText.textContent || 'Idle';
  }

  if (focusTagEl) {
    if (state.headPose.faceDetected) {
      focusTagEl.textContent = `Focus: ${score}%`;
      focusTagEl.style.color = score >= cutoff ? 'var(--status-present, #258564)' : 'var(--status-away, #DE5B5E)';
    } else {
      focusTagEl.textContent = 'No Face';
      focusTagEl.style.color = 'var(--status-away, #DE5B5E)';
    }
  }

  if (alertEl && alertTextEl) {
    if (state.status === 'looking-away') {
      alertEl.style.display = 'flex';
      if (alertIconEl) alertIconEl.textContent = '👀';
      alertTextEl.textContent = `PAUSED (FOCUS ${score}% < ${cutoff}%)`;
    } else if (state.status === 'away') {
      alertEl.style.display = 'flex';
      if (alertIconEl) alertIconEl.textContent = '❌';
      alertTextEl.textContent = 'PAUSED: NO FACE';
    } else if (state.status === 'lid-closed') {
      alertEl.style.display = 'flex';
      if (alertIconEl) alertIconEl.textContent = '💤';
      alertTextEl.textContent = 'PAUSED: ASLEEP';
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
    const records = await DB.getDailyRecords();
    if (records.length === 0) {
      showToast('warning', 'No Data', 'There is no study data to export.');
      return;
    }

    let csv = 'Date,Day Learned Time (ms),Day Learned Duration,Active Time (ms),Paused Time (ms),Focus %,Look Aways,Aways,Lid Closed,Goal Met\n';
    const goalMs = state.settings.dailyGoal * 3600000;

    records.forEach(r => {
      const focusText = formatFocusPercentage(r.studyTime, (r.sessionTime || 0) + (r.pausedTime || 0));
      const goalMet = r.studyTime >= goalMs ? 'Yes' : 'No';
      csv += `"${r.date}",`;
      csv += `${r.studyTime},`;
      csv += `"${formatDuration(r.studyTime)}",`;
      csv += `${r.sessionTime},`;
      csv += `${r.pausedTime || 0},`;
      csv += `"${focusText}",`;
      csv += `${r.distractions?.lookAway || 0},`;
      csv += `${r.distractions?.away || 0},`;
      csv += `${r.distractions?.lidClosed || 0},`;
      csv += `"${goalMet}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ayush-tracker-daily-records-${getLocalDateString()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('success', 'Exported!', 'Your daily study records have been downloaded.');
  } catch (e) {
    console.error('Export failed:', e);
    showToast('error', 'Export failed', 'Could not export data.');
  }
}

async function handleDeleteAll() {
  if (confirm('Delete all study data? This cannot be undone.')) {
    try {
      // 1. Clear any pending autosave timers to prevent resurrection
      if (state.autoSaveInterval) {
        clearInterval(state.autoSaveInterval);
        state.autoSaveInterval = null;
      }

      // 2. Stop detection loop, camera, and worker
      stopDetectionLoop();
      stopCamera();
      stopWorker();
      await releaseTabLock();

      // 3. Close open pauses if any
      endPauseEvent(Date.now(), getMonotonicNow());

      // 4. Update session state to idle and not active
      state.session.active = false;
      state.isPaused = false;
      setStatus('idle');

      // 5. Clear IndexedDB and localStorage
      await DB.clearAll();
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('ayush_tracker_today');
        localStorage.removeItem(ACTIVE_TAB_LOCK_KEY);
      }

      // 6. Reset in-memory session object
      const todayStr = getLocalDateString();
      state.session = {
        active: false,
        id: 'day_' + todayStr,
        dateStr: todayStr,
        startTime: null,
        endTime: null,
        studyStartedAt: null,
        studyCursorMono: null,
        sessionStartedAt: null,
        unverifiedStartedAt: null,
        unverifiedCursorMono: null,
        accStudyMs: 0,
        accSessionMs: 0,
        accUnverifiedMs: 0,
        studyRunMs: 0,
        unverifiedRunMs: 0,
        studyTime: 0,
        sessionTime: 0,
        pausedTime: 0,
        unverifiedTime: 0,
        distractions: { lookAway: 0, away: 0, lidClosed: 0 },
        pauses: [],
        lastSaved: Date.now(),
        schemaVersion: 2,
      };
      state.camera.lastAttemptTime = 0;
      state.camera.lastFrameTime = 0;
      state.camera.lastFaceTime = 0;
      state.camera.lastAttemptMonotonic = null;
      state.camera.lastFrameMonotonic = null;
      state.camera.lastFaceMonotonic = null;
      state.camera.lastDetectionTime = 0;
      state.camera.frameSeq = 0;
      state.camera._lastTickFrameSeq = 0;
      state.camera._msSinceLastFrame = 0;
      state.camera._suspensionDetected = false;
      state._lifecycleSuspended = false;
      state._frozenAtMonotonic = null;
      state.lastDetectionTime = 0;
      state.lastTickTimestamp = 0;
      state.lastTickMonotonic = null;
      state.lastTick = 0;

      // 7. Reset UI displays and buttons
      if (DOM.timerDisplay) DOM.timerDisplay.textContent = '00:00:00';
      if (DOM.statSessionTime) DOM.statSessionTime.textContent = '00:00:00';
      if (DOM.statPausedTime) DOM.statPausedTime.textContent = '00:00:00';
      if (DOM.startBtn) {
        DOM.startBtn.classList.remove('hidden');
        DOM.startBtn.disabled = false;
      }
      if (DOM.endBtn) {
        DOM.endBtn.classList.add('hidden');
      }
      updateStartButtonLabel();
      updateSessionStatsDisplay();
      showToast('warning', 'Data cleared', 'All study data has been deleted.');
      await refreshDashboard();
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

  // Live preview toggle (synced with Settings Drawer)
  DOM.livePreviewCb.addEventListener('change', (e) => {
    setCameraPreviewEnabled(e.target.checked, true);
  });

  // Calibration cancel
  if (DOM.calibrationCancelBtn) {
    DOM.calibrationCancelBtn.addEventListener('click', cancelCalibration);
  }

  // Viewfinder hardware controls
  if (DOM.calHwBtn) {
    DOM.calHwBtn.addEventListener('click', triggerRecalibrateFlow);
  }
  if (DOM.thresholdDial) {
    attachThresholdDialControls(DOM.thresholdDial);
  }
  if (DOM.coneSwitch) {
    DOM.coneSwitch.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cone]');
      if (!btn) return;
      setSensitivityCone(btn.getAttribute('data-cone'), true);
    });
  }
  if (DOM.hwReadingBtn) {
    DOM.hwReadingBtn.addEventListener('click', () => {
      state.settings.readingMode = !state.settings.readingMode;
      if (DOM.settingReadingMode) DOM.settingReadingMode.checked = state.settings.readingMode;
      syncAuxHardwareToggles();
      saveSettings();
      showToast('info', 'Notes Mode Updated', state.settings.readingMode ? 'Downward note reading allowed.' : 'Strict forward posture restored.', 1800);
    });
  }
  if (DOM.hwSoundBtn) {
    DOM.hwSoundBtn.addEventListener('click', () => {
      state.settings.soundOn = !state.settings.soundOn;
      if (DOM.settingSound) DOM.settingSound.checked = state.settings.soundOn;
      syncAuxHardwareToggles();
      saveSettings();
      showToast('info', 'Audio Chimes Updated', state.settings.soundOn ? 'Alert chimes enabled.' : 'Audio chimes muted.', 1800);
    });
  }
  if (DOM.hwPipBtn) {
    DOM.hwPipBtn.addEventListener('click', togglePiP);
  }
  if (DOM.goalDecBtn) {
    DOM.goalDecBtn.addEventListener('click', () => adjustDailyGoal(-0.5));
  }
  if (DOM.goalIncBtn) {
    DOM.goalIncBtn.addEventListener('click', () => adjustDailyGoal(0.5));
  }
  if (DOM.shortcutAnalyticsBtn) {
    DOM.shortcutAnalyticsBtn.addEventListener('click', () => switchTab('history'));
  }

  if (DOM.secondaryAuditDrawer) {
    try {
      if (localStorage.getItem('ayush_audit_open') === 'true') {
        DOM.secondaryAuditDrawer.open = true;
      }
      DOM.secondaryAuditDrawer.addEventListener('toggle', () => {
        try {
          localStorage.setItem('ayush_audit_open', DOM.secondaryAuditDrawer.open ? 'true' : 'false');
        } catch (_) { }
      });
    } catch (_) { }
  }

  // Timer controls
  DOM.startBtn.addEventListener('click', handleStart);
  DOM.endBtn.addEventListener('click', () => handleEnd(Date.now(), getMonotonicNow()));

  // Dashboard actions
  DOM.exportCsvBtn.addEventListener('click', handleExportCSV);
  DOM.deleteAllBtn.addEventListener('click', handleDeleteAll);

  // Install prompt
  DOM.installBtn.addEventListener('click', installApp);
  DOM.installDismissBtn.addEventListener('click', dismissInstall);

  // PiP button
  DOM.pipBtn.addEventListener('click', togglePiP);

  // Keyboard shortcut: Escape to close settings or cancel calibration
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (state.calibration.isCalibrating) {
        cancelCalibration();
      } else if (DOM.settingsPanel && DOM.settingsPanel.classList.contains('open')) {
        closeSettings();
      }
    }
  });
}

/**
 * Periodically or on tab focus check if date rolled over into a new day
 * while the app was idle.
 */
function checkDayRollover() {
  const currentDayStr = getLocalDateString();
  if (state.session.dateStr && state.session.dateStr !== currentDayStr) {
    const now = Date.now();
    const hasLastTick = typeof state.lastTickTimestamp === 'number' && state.lastTickTimestamp > 0;
    const gap = hasLastTick ? (now - state.lastTickTimestamp) : Infinity;
    const isSleep = gap > CONFIG.lidGapMs;
    if (state.session.active) {
      const mid = new Date(now);
      mid.setHours(0, 0, 0, 0);
      handleMidnightRollover(now, currentDayStr, isSleep ? (state.lastTickTimestamp || mid.getTime()) : null);
    } else {
      loadTodayState();
      refreshDashboard();
    }
  }
}


// ═══════════════════════════════════════════════
// 28. INITIALISE THE APP
// ═══════════════════════════════════════════════

let initPromise = null;

function init() {
  if (initPromise) return initPromise;

  // Load today's accumulated progress immediately from localStorage
  loadTodayState();

  initPromise = DB.init()
    .then(() => DB.consolidateToDaily())
    .then(() => recoverUnfinishedSessions())
    .then(async () => {
      // Reconcile with IndexedDB today's record if present
      const todayStr = getLocalDateString();
      const dbDay = await DB.getDailyRecord(todayStr);
      if (dbDay) {
        const localRec = buildSessionRecord();
        const merged = reconcileSessionRecords(localRec, dbDay);
        if (merged) {
          state.session.id = merged.id;
          state.session.dateStr = merged.date;
          state.session.startTime = merged.startTime;
          state.session.endTime = merged.endTime;
          state.session.accStudyMs = merged.studyTime;
          state.session.studyTime = merged.studyTime;
          state.session.accSessionMs = merged.sessionTime;
          state.session.sessionTime = merged.sessionTime;
          state.session.accUnverifiedMs = merged.unverifiedTime;
          state.session.unverifiedTime = merged.unverifiedTime;
          state.session.pausedTime = merged.pausedTime;
          state.session.distractions = merged.distractions;
          state.session.pauses = merged.pauses;
          state.session.lastSaved = merged.lastSaved;
          state.session.schemaVersion = 2;
          if (DOM.timerDisplay) DOM.timerDisplay.textContent = formatTime(state.session.studyTime);
          if (DOM.statSessionTime) DOM.statSessionTime.textContent = formatTime(state.session.sessionTime || 0);
          if (DOM.statPausedTime) DOM.statPausedTime.textContent = formatTime(state.session.pausedTime || 0);
          updateStartButtonLabel();
          updateSessionStatsDisplay();
          saveTodayToLocalStorage();
          await DB.saveSession(merged);
        }
      }
    })
    .then(() => refreshDashboard())
    .catch(e => console.error('DB init error:', e));

  initTheme();
  loadSettings();
  initSettingsListeners();
  renderGoalSegments(0);
  initPrivacyModal();
  initInstallPrompt();
  initPiP();
  attachEventListeners();
  if (typeof window !== 'undefined' && window.location && typeof URLSearchParams !== 'undefined') {
    if (new URLSearchParams(window.location.search).get('view') === 'analytics') {
      switchTab('history');
    }
  }
  registerServiceWorker();
  if (DOM.dailyGoalDisplay) DOM.dailyGoalDisplay.textContent = state.settings.dailyGoal + 'h';

  // Save only when actively tracking so idle tabs never clobber another tab's progress
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      checkDayRollover();
      if (document.hidden && state.session.active) {
        saveTodayToLocalStorage();
        autoSaveSession();
      }
    });
    // Page Lifecycle API signals for browser tab freeze/suspension
    document.addEventListener('freeze', () => {
      if (state.session.active) {
        const freezeWall = Date.now();
        const freezeMono = getMonotonicNow();
        state._frozenAtMonotonic = freezeMono;
        if (state.status === 'studying') {
          freezeStudyTime(freezeWall, freezeMono);
        }
        saveTodayToLocalStorage(freezeWall);
        autoSaveSession();
      }
    });
    document.addEventListener('resume', () => {
      const frozenAt = state._frozenAtMonotonic;
      state._frozenAtMonotonic = null;
      const monoNow = getMonotonicNow();
      if (typeof frozenAt === 'number' && (monoNow - frozenAt) > CONFIG.lidGapMs) {
        state._lifecycleSuspended = true;
      }
    });
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', checkDayRollover);
    setInterval(checkDayRollover, 30000);

    window.addEventListener('beforeunload', () => {
      if (state.session.active) {
        saveTodayToLocalStorage();
        autoSaveSession();
      }
      releaseTabLock();
    });

    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('tab') === 'history') switchTab('history');
      if (urlParams.has('settings')) openSettings();
      if (urlParams.has('calibrate')) setCalibrationUiState(true, 0.35);
    } catch (_) { }
  }

  loadMediaPipeModule();
  return initPromise;
}

if (typeof window !== 'undefined' && typeof process === 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CONFIG,
    state,
    DOM,
    formatTime,
    formatDuration,
    formatFocusPercentage,
    getLocalDateString,
    loadSettings,
    saveSettings,
    setFocusThreshold,
    setSensitivityCone,
    adjustDailyGoal,
    setCameraPreviewEnabled,
    showToast,
    dismissToast,
    setStatus,
    openSettings,
    closeSettings,
    cancelCalibration,
    escapeHtml,
    calculateHeadPose,
    calculateFocusScore,
    calculateYaw,
    calculatePitch,
    isUserFacingScreen,
    calculateGoalProgress,
    calculateBackdatedStudyTime,
    freezeStudyTime,
    resumeStudyTime,
    startPauseEvent,
    endPauseEvent,
    calculateTotalPausedTime,
    normalizeSessionRecord,
    isSameSessionOrSnapshot,
    reconcileSessionRecords,
    buildSessionRecord,
    runDetection,
    startDetectionLoop,
    stopDetectionLoop,
    evaluateCameraHealth,
    checkTabConflict,
    isLockConflicting,
    acquireTabLock,
    refreshTabLock,
    releaseTabLock,
    getMonotonicNow,
    TAB_ID,
    handleTick,
    handleMidnightRollover,
    checkDayRollover,
    processDetectionResult,
    handleCameraTrackEnded,
    handleStart,
    handleEnd,
    handleDeleteAll,
    calculateDailyTotals,
    calculateWeeklyTotals,
    calculateMonthlyTotals,
    calculateDailyAverages,
    calculateSessionUtilization,
    calculateHistoricalComparisons,
    buildDashboardStats,
    buildChart,
    buildSessionList,
    autoSaveSession,
    recoverUnfinishedSessions,
    loadTodayState,
    saveTodayToLocalStorage,
    updatePipeline,
    DB,
    init,
  };
}
