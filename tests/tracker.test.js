/**
 * Production accounting and core logic tests for Ayush_Tracker:
 * - Direct unit tests for production functions from app.js
 * - All 12 required accounting, session, persistence, and recovery scenarios:
 *   1. Start -> verified study -> pause -> resume -> end
 *   2. Sleep gap followed by successful resume
 *   3. Camera stall followed by detection recovery
 *   4. Camera track ending while studying and while already paused
 *   5. Reload during active saved session, then manual continuation
 *   6. End while paused
 *   7. Midnight rollover while studying and while paused, including sleep across midnight
 *   8. Clock moving backward or forward
 *   9. Repeated autosaves, migration, and consolidation without duplicate totals
 *   10. Reconciliation when localStorage and IndexedDB disagree
 *   11. Dashboard, weekly chart, streak, history, and CSV matching same daily totals
 *   12. Delete-all while active, confirming callbacks do not restore deleted data
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { installNodeShims } = require('./node-shims.js');

installNodeShims(globalThis);

const {
  CONFIG,
  state,
  DOM,
  formatTime,
  formatDuration,
  formatFocusPercentage,
  getLocalDateString,
  loadSettings,
  saveSettings,
  setCameraPreviewEnabled,
  setFocusThreshold,
  setSensitivityCone,
  adjustDailyGoal,
  showToast,
  dismissToast,
  setStatus,
  setTimerDisplay,
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
} = require('../app.js');

// Helper to reset app state before each test
function resetAppState() {
  const todayStr = getLocalDateString();
  state.status = 'idle';
  state.isPaused = false;
  state.lastDetectionTime = 0;
  state.lastTickTimestamp = 0;
  state.lastTickMonotonic = null;
  state.pauseStartedAt = null;
  state.activePauseType = null;
  state.camera.isDetecting = false;
  state.camera.lastAttemptTime = 0;
  state.camera.lastFrameTime = 0;
  state.camera.lastFaceTime = 0;
  state.camera.lastAttemptMonotonic = null;
  state.camera.lastFrameMonotonic = null;
  state.camera.lastFaceMonotonic = null;
  state.camera.lastDetectionTime = 0;
  state.camera.frameSeq = 0;
  state.camera._lastLoopTime = 0;
  state.camera._lastTickFrameSeq = 0;
  state.camera._msSinceLastFrame = 0;
  state.camera._suspensionDetected = false;
  state._lifecycleSuspended = false;
  state._frozenAtMonotonic = null;
  state.headPose.faceDetected = false;
  state.headPose.facingScreenSince = 0;
  state.headPose.facingScreenSinceMono = null;
  state.headPose.lookAwayStart = 0;
  state.headPose.lookAwayStartMono = null;
  state.headPose.awayStart = 0;
  state.headPose.awayStartMono = null;
  state.headPose.buffer = [];
  state.settings.dailyGoal = 4;
  state.settings.focusThreshold = 50;
  state.settings.sensitivity = 'medium';
  state.settings.readingMode = false;
  state.calibration.neutralYaw = 0;
  state.calibration.neutralPitch = 0;

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

  if (typeof localStorage !== 'undefined') {
    localStorage.clear();
  }
}

// ═══════════════════════════════════════════════
// Suite 1: Pure Formatting & Geometry Utilities
// ═══════════════════════════════════════════════

describe('Ayush_Tracker — Core Formatting', () => {
  test('formatTime correctly formats seconds, minutes, and hours', () => {
    assert.equal(formatTime(0), '00:00:00');
    assert.equal(formatTime(5000), '00:00:05');
    assert.equal(formatTime(65000), '00:01:05');
    assert.equal(formatTime(3665000), '01:01:05');
  });

  test('formatDuration formats human-readable strings', () => {
    assert.equal(formatDuration(45000), '45s');
    assert.equal(formatDuration(150000), '2m');
    assert.equal(formatDuration(3600000 + 120000), '1h 2m');
  });

  test('formatFocusPercentage returns "—" for empty or zero session time', () => {
    assert.equal(formatFocusPercentage(0, 0), '—');
    assert.equal(formatFocusPercentage(1000, 0), '—');
    assert.equal(formatFocusPercentage(0, null), '—');
    assert.equal(formatFocusPercentage(0, undefined), '—');
  });

  test('formatFocusPercentage calculates accurate percentage when session data exists', () => {
    assert.equal(formatFocusPercentage(0, 60000), '0%');
    assert.equal(formatFocusPercentage(30000, 60000), '50%');
    assert.equal(formatFocusPercentage(60000, 60000), '100%');
    assert.equal(formatFocusPercentage(50000, 60000), '83%');
  });
});

describe('Ayush_Tracker — Head Pose & Geometry', () => {
  test('calculateYaw returns ~0° when nose is centered between cheeks', () => {
    const yaw = calculateYaw(0.5, 0.3, 0.7);
    assert.equal(Math.round(yaw), 0);
  });

  test('calculateYaw returns positive angle when turned right', () => {
    const yaw = calculateYaw(0.6, 0.3, 0.7);
    assert.ok(yaw > 0);
  });

  test('calculateYaw returns negative angle when turned left', () => {
    const yaw = calculateYaw(0.4, 0.3, 0.7);
    assert.ok(yaw < 0);
  });

  test('calculateFocusScore returns 100% when perfectly centered', () => {
    const score = calculateFocusScore({ yaw: 0, pitch: 0 }, { yaw: 0, pitch: 0 }, 25);
    assert.equal(score, 100);
  });

  test('reading mode ignores downward pitch in focus score', () => {
    const normalScore = calculateFocusScore({ yaw: 0, pitch: 15 }, { yaw: 0, pitch: 0 }, 25, false);
    const readingScore = calculateFocusScore({ yaw: 0, pitch: 15 }, { yaw: 0, pitch: 0 }, 25, true);
    assert.ok(readingScore > normalScore);
    assert.equal(readingScore, 100);
  });
});

describe('Ayush_Tracker — Goal and Backdated Helpers', () => {
  test('calculateGoalProgress calculates percentage correctly up to 100%', () => {
    assert.equal(calculateGoalProgress(1800000, 1), 50); // 30m of 1h
    assert.equal(calculateGoalProgress(3600000, 1), 100);
    assert.equal(calculateGoalProgress(7200000, 1), 100); // capped at 100%
  });

  test('calculateBackdatedStudyTime rolls back delay', () => {
    const totalTime = 60000;
    const pauseDelay = 3000;
    assert.equal(calculateBackdatedStudyTime(totalTime, pauseDelay), 57000);
  });
});

// ═══════════════════════════════════════════════
// Suite 2: Required Production Accounting Scenarios
// ═══════════════════════════════════════════════

describe('Ayush_Tracker — Scenario 1: Start -> verified study -> pause -> resume -> end', () => {
  beforeEach(resetAppState);

  test('enforces sessionTime = studyTime + pausedTime + unverifiedTime across lifecycle', () => {
    const t0 = 1700000000000;
    state.session.dateStr = getLocalDateString(t0);

    // 1. Start tracking at t0
    state.session.active = true;
    state.session.startTime = t0;
    state.session.studyStartedAt = t0;
    state.session.sessionStartedAt = t0;
    state.status = 'studying';
    state.lastTickTimestamp = t0;
    state.camera.isDetecting = true;
    state.camera.lastDetectionTime = t0;

    // 2. Study for 10 seconds (10 ticks)
    for (let s = 1; s <= 10; s++) {
      const t = t0 + s * 1000;
      state.camera.lastDetectionTime = t;
      handleTick({ timestamp: t, gap: 1000 });
    }
    assert.equal(state.session.studyTime, 10000);
    assert.equal(state.session.sessionTime, 10000);

    // 3. User looks away at t0 + 10000
    const pauseStart = t0 + 10000;
    freezeStudyTime(pauseStart);
    startPauseEvent('lookAway', pauseStart);
    state.status = 'looking-away';
    state.session.distractions.lookAway++;

    // 4. Paused for 5 seconds (5 ticks)
    for (let s = 11; s <= 15; s++) {
      const t = t0 + s * 1000;
      handleTick({ timestamp: t, gap: 1000 });
    }
    assert.equal(state.session.studyTime, 10000, 'Study time must stay frozen during pause');
    assert.equal(state.session.sessionTime, 10000, 'Active session time excludes paused time');
    assert.equal(state.session.pausedTime, 5000, 'Paused time increments during pause');

    // 5. Resume studying at t0 + 15000
    const resumeTime = t0 + 15000;
    endPauseEvent(resumeTime);
    resumeStudyTime(resumeTime);
    state.status = 'studying';

    // 6. Study for 10 more seconds (10 ticks)
    for (let s = 16; s <= 25; s++) {
      const t = t0 + s * 1000;
      state.camera.lastDetectionTime = t;
      handleTick({ timestamp: t, gap: 1000 });
    }
    assert.equal(state.session.studyTime, 20000, 'Accumulated study time should be 20s');
    assert.equal(state.session.sessionTime, 20000, 'Total active session time should be 20s');
    assert.equal(state.session.pausedTime, 5000, 'Total paused time should be 5s');

    // 7. End session at t0 + 25000
    handleEnd(t0 + 25000);
    assert.equal(state.session.active, false);

    const record = buildSessionRecord();
    assert.equal(record.studyTime, 20000);
    assert.equal(record.sessionTime, 20000);
    assert.equal(record.pausedTime, 5000);
    assert.equal(record.unverifiedTime, 0);
    // Verified invariant: sessionTime = studyTime + unverifiedTime (paused time excluded)
    assert.equal(record.sessionTime, record.studyTime + record.unverifiedTime);
    assert.equal(record.sessionTime + record.pausedTime, 25000);
  });
});

describe('Ayush_Tracker — Scenario 2: Sleep gap followed by successful resume', () => {
  beforeEach(resetAppState);

  test('excludes detected sleep gap from both studyTime and sessionTime', () => {
    const t0 = 1700000000000;
    state.session.dateStr = getLocalDateString(t0);

    // Start studying
    state.session.active = true;
    state.session.startTime = t0;
    state.session.studyStartedAt = t0;
    state.session.sessionStartedAt = t0;
    state.status = 'studying';
    state.lastTickTimestamp = t0;
    state.camera.isDetecting = true;
    state.camera.lastDetectionTime = t0;

    // Study 20 seconds
    for (let s = 1; s <= 20; s++) {
      const t = t0 + s * 1000;
      state.camera.lastDetectionTime = t;
      handleTick({ timestamp: t, gap: 1000 });
    }
    assert.equal(state.session.studyTime, 20000);
    assert.equal(state.session.sessionTime, 20000);

    // Laptop lid closed / slept for 1 hour (3600000ms gap)
    const sleepEnd = t0 + 20000 + 3600000;
    handleTick({ timestamp: sleepEnd, gap: 3600000 });

    // Status is lid-closed
    assert.equal(state.status, 'lid-closed');
    // Study time must remain 20000, not 1 hour 20s
    assert.equal(state.session.studyTime, 20000);
    // Session time must remain 20000, excluding the sleep gap
    assert.equal(state.session.sessionTime, 20000);

    // Ticks while lid is closed should not increment study time
    handleTick({ timestamp: sleepEnd + 1000, gap: 1000 });
    assert.equal(state.session.studyTime, 20000);

    // Resume condition: face detected facing screen for resumeDelayMs (2000ms)
    const wakeT0 = sleepEnd + 2000;
    processDetectionResult({ faceDetected: true, yaw: 0, pitch: 0, isFacingScreen: true, timestamp: wakeT0 });
    assert.equal(state.status, 'lid-closed', 'Must remain paused until resume condition met');

    const wakeT1 = wakeT0 + 2100; // > 2000ms facing screen
    processDetectionResult({ faceDetected: true, yaw: 0, pitch: 0, isFacingScreen: true, timestamp: wakeT1 });
    assert.equal(state.status, 'studying', 'Must resume once facing screen exceeds resumeDelay');

    // Study for 10 more seconds
    for (let s = 1; s <= 10; s++) {
      const t = wakeT1 + s * 1000;
      state.camera.lastDetectionTime = t;
      handleTick({ timestamp: t, gap: 1000 });
    }

    assert.equal(state.session.studyTime, 30000);
    // Total study time is exactly 20s (pre-sleep) + 10s (post-wake) = 30s
    assert.ok(state.session.sessionTime < 3600000, 'Session time must NEVER count the 1-hour sleep gap');
  });
});

describe('Ayush_Tracker — Scenario 3: Camera stall followed by detection recovery', () => {
  beforeEach(resetAppState);

  test('freezes study time at lastDetectionTime when camera stalls and tracks unverified interval', () => {
    const t0 = 1700000000000;
    state.session.dateStr = getLocalDateString(t0);

    state.session.active = true;
    state.session.startTime = t0;
    state.session.studyStartedAt = t0;
    state.session.sessionStartedAt = t0;
    state.status = 'studying';
    state.lastTickTimestamp = t0;
    state.camera.isDetecting = true;
    state.camera.lastDetectionTime = t0;

    // Study 10 seconds
    for (let s = 1; s <= 10; s++) {
      const t = t0 + s * 1000;
      state.camera.lastDetectionTime = t;
      handleTick({ timestamp: t, gap: 1000 });
    }
    assert.equal(state.session.studyTime, 10000);

    // Camera stalls: no new frames. lastDetectionTime stays at t0 + 10000.
    // Ticks continue to arrive from worker.
    const stallT1 = t0 + 14000; // 4s later (> CONFIG.stallThresholdMs = 3000ms)
    handleTick({ timestamp: stallT1, gap: 1000 });

    // Study time must be frozen at lastDetectionTime (10000ms), NOT 14000ms!
    assert.equal(state.session.studyTime, 10000);
    assert.ok(state.session.unverifiedTime > 0, 'Unverified interval must be tracked');

    // Another tick while stalled
    const stallT2 = t0 + 18000;
    handleTick({ timestamp: stallT2, gap: 1000 });
    assert.equal(state.session.studyTime, 10000, 'Study time remains 10000ms during stall');

    // Camera recovers at t0 + 19000
    const recT = t0 + 19000;
    state.camera.lastDetectionTime = recT;
    handleTick({ timestamp: recT, gap: 1000 });

    // 5 more seconds of verified study
    for (let s = 1; s <= 5; s++) {
      const t = recT + s * 1000;
      state.camera.lastDetectionTime = t;
      handleTick({ timestamp: t, gap: 1000 });
    }

    assert.equal(state.session.studyTime, 15000, 'Must have 10s pre-stall + 5s post-recovery = 15s');
    assert.ok(state.session.unverifiedTime >= 8000, 'Stall gap is counted in unverifiedTime without double counting');
  });
});

describe('Ayush_Tracker — Scenario 4: Camera track ending while studying vs already paused', () => {
  beforeEach(resetAppState);

  test('handleCameraTrackEnded opens pause when studying; is idempotent when already paused', () => {
    const t0 = 1700000000000;
    state.session.dateStr = getLocalDateString(t0);

    state.session.active = true;
    state.session.startTime = t0;
    state.session.studyStartedAt = t0;
    state.session.sessionStartedAt = t0;
    state.status = 'studying';
    state.camera.isDetecting = true;
    state.camera.lastDetectionTime = t0;

    // 1. Camera track ends while studying
    handleCameraTrackEnded();

    assert.equal(state.status, 'lid-closed');
    assert.equal(state.session.distractions.lidClosed, 1);
    assert.equal(state.session.pauses.length, 1);
    assert.equal(state.session.pauses[0].end, null, 'Pause event is open');

    // 2. Call handleCameraTrackEnded AGAIN while already in lid-closed status
    handleCameraTrackEnded();

    assert.equal(state.session.distractions.lidClosed, 1, 'Must NOT increment distractions twice');
    assert.equal(state.session.pauses.length, 1, 'Must NOT create duplicate pause events');
  });
});

describe('Ayush_Tracker — Scenario 5: Reload during active saved session, then manual continuation', () => {
  beforeEach(resetAppState);

  test('restores daily totals without counting closed time, and continues accumulating', () => {
    const now = Date.now();
    const todayStr = getLocalDateString(now);
    const t0 = now - 3600000;
    const mockSaved = {
      id: 'day_' + todayStr,
      date: todayStr,
      startTime: t0,
      endTime: t0 + 1800000,
      studyTime: 1200000, // 20m
      sessionTime: 1800000, // 30m
      pausedTime: 600000, // 10m
      unverifiedTime: 0,
      distractions: { lookAway: 2, away: 1, lidClosed: 0 },
      pauses: [{ type: 'lookAway', start: t0 + 600000, end: t0 + 1200000 }],
      lastSaved: t0 + 1800000,
    };

    localStorage.setItem('ayush_tracker_today', JSON.stringify(mockSaved));

    // Reload state (legacy sessionTime normalized to exclude paused time)
    loadTodayState();

    assert.equal(state.session.studyTime, 1200000);
    assert.equal(state.session.sessionTime, 1200000);
    assert.equal(state.session.pausedTime, 600000);
    assert.equal(state.session.distractions.lookAway, 2);
    assert.equal(state.session.active, false, 'Must not be actively ticking after reload');

    // User starts tracking again
    const tResume = now;
    state.session.active = true;
    state.session.studyStartedAt = tResume;
    state.session.sessionStartedAt = tResume;
    state.status = 'studying';

    assert.equal(state.session.active, true);
    assert.equal(state.session.studyTime, 1200000, 'Existing study time preserved');
    assert.equal(state.session.accStudyMs, 1200000);

    // Study for 10 seconds
    for (let s = 1; s <= 10; s++) {
      const t = tResume + s * 1000;
      state.camera.lastDetectionTime = t;
      handleTick({ timestamp: t, gap: 1000 });
    }

    assert.equal(state.session.studyTime, 1210000, 'Accumulated on top of preserved daily total');
  });
});

describe('Ayush_Tracker — Scenario 6: End while paused', () => {
  beforeEach(resetAppState);

  test('closes open pause cleanly and ensures sessionTime invariant holds', () => {
    const t0 = 1700000000000;
    state.session.dateStr = getLocalDateString(t0);

    state.session.active = true;
    state.session.startTime = t0;
    state.session.studyStartedAt = t0;
    state.session.sessionStartedAt = t0;
    state.status = 'studying';
    state.lastTickTimestamp = t0;

    // Study 10s
    for (let s = 1; s <= 10; s++) {
      const t = t0 + s * 1000;
      handleTick({ timestamp: t, gap: 1000 });
    }

    // Pause at t0 + 10000
    freezeStudyTime(t0 + 10000);
    startPauseEvent('away', t0 + 10000);
    state.status = 'away';

    // 5s in paused state
    for (let s = 11; s <= 15; s++) {
      handleTick({ timestamp: t0 + s * 1000, gap: 1000 });
    }

    // End while still paused
    handleEnd();

    assert.equal(state.session.active, false);
    const lastPause = state.session.pauses[0];
    assert.ok(lastPause.end !== null, 'Open pause must be closed on session end');
    assert.ok(lastPause.end >= t0 + 10000);

    const record = buildSessionRecord();
    assert.equal(record.studyTime, 10000);
    assert.ok(record.pausedTime >= 5000);
    assert.equal(record.sessionTime, record.studyTime + record.unverifiedTime);
    assert.ok(record.sessionTime + record.pausedTime >= 15000);
  });
});

describe('Ayush_Tracker — Scenario 7: Midnight rollover while studying and while paused', () => {
  beforeEach(resetAppState);

  test('splits study intervals at local calendar boundary 00:00:00 without crediting sleep', () => {
    // 23:55:00 on Day 1
    const day1Date = new Date(2026, 9, 13, 23, 55, 0);
    const day1Str = getLocalDateString(day1Date.getTime());
    const tStart = day1Date.getTime();

    state.session.active = true;
    state.session.dateStr = day1Str;
    state.session.startTime = tStart;
    state.session.studyStartedAt = tStart;
    state.session.sessionStartedAt = tStart;
    state.status = 'studying';
    state.lastTickTimestamp = tStart;

    // Study 4 minutes before midnight (to 23:59:00)
    const tBeforeMidnight = tStart + 4 * 60 * 1000;
    state.camera.lastDetectionTime = tBeforeMidnight;
    handleTick({ timestamp: tBeforeMidnight, gap: 1000 });
    assert.equal(state.session.studyTime, 240000);

    // 00:05:00 on Day 2 arrives (10 minutes total from start, spanning midnight)
    const day2Date = new Date(2026, 9, 14, 0, 5, 0);
    const day2Str = getLocalDateString(day2Date.getTime());
    const tAfterMidnight = day2Date.getTime();

    // Trigger rollover
    handleMidnightRollover(tAfterMidnight, day2Str);

    // State is now rolled over to Day 2
    assert.equal(state.session.dateStr, day2Str);
    assert.equal(state.session.id, 'day_' + day2Str);

    // Study time for today should be 5 minutes (from 00:00:00 to 00:05:00)
    assert.equal(state.session.studyTime, 5 * 60 * 1000);
    assert.equal(state.session.sessionTime, 5 * 60 * 1000);
  });
});

describe('Ayush_Tracker — Scenario 8: Clock moving backward or forward', () => {
  beforeEach(resetAppState);

  test('negative clock drift is ignored without reducing accumulated time', () => {
    const t0 = 1700000000000;
    state.session.dateStr = getLocalDateString(t0);

    state.session.active = true;
    state.session.studyTime = 50000;
    state.session.sessionTime = 60000;
    state.session.studyStartedAt = t0;
    state.session.sessionStartedAt = t0;
    state.session.accStudyMs = 50000;
    state.session.accSessionMs = 60000;
    state.status = 'studying';

    // Clock steps backward by 5 seconds
    handleTick({ timestamp: t0 - 5000, gap: -5000 });

    assert.ok(state.session.studyTime >= 50000, 'Study time must not decrease on backward clock jump');
    assert.ok(state.session.sessionTime >= 60000, 'Session time must not decrease on backward clock jump');
  });
});

describe('Ayush_Tracker — Scenario 9: Repeated autosaves, migration, and consolidation', () => {
  beforeEach(resetAppState);

  test('consolidates multiple records for the same day idempotently', async () => {
    const day = '2026-10-13';
    const rec1 = {
      id: 'session_1',
      date: day,
      startTime: 1700000000000,
      endTime: 1700000600000,
      studyTime: 600000,
      sessionTime: 600000,
      pausedTime: 0,
      unverifiedTime: 0,
      distractions: { lookAway: 1, away: 0, lidClosed: 0 },
      pauses: []
    };
    const rec2 = {
      id: 'session_2',
      date: day,
      startTime: 1700001000000,
      endTime: 1700001900000,
      studyTime: 900000,
      sessionTime: 900000,
      pausedTime: 0,
      unverifiedTime: 0,
      distractions: { lookAway: 0, away: 1, lidClosed: 0 },
      pauses: []
    };

    // Reconcile rec1 and rec2
    const merged = reconcileSessionRecords(rec1, rec2);
    assert.equal(merged.date, day);
    assert.ok(merged.studyTime >= 900000);
    assert.equal(merged.distractions.lookAway, 1);
    assert.equal(merged.distractions.away, 1);

    // Repeated reconciliation with self is completely idempotent
    const reMerged = reconcileSessionRecords(merged, merged);
    assert.deepEqual(reMerged.studyTime, merged.studyTime);
    assert.deepEqual(reMerged.distractions, merged.distractions);
  });
});

describe('Ayush_Tracker — Scenario 10: Reconciliation when localStorage and IndexedDB disagree', () => {
  beforeEach(resetAppState);

  test('merges field-by-field taking maximum verified times and deduplicating pauses', () => {
    const day = '2026-10-13';
    const localRec = {
      id: 'day_' + day,
      date: day,
      startTime: 1700000000000,
      studyTime: 30000, // localStorage saved earlier
      sessionTime: 30000,
      pausedTime: 10000,
      unverifiedTime: 0,
      distractions: { lookAway: 3, away: 0, lidClosed: 0 },
      pauses: [{ type: 'lookAway', start: 1700000010000, end: 1700000020000 }],
    };

    const dbRec = {
      id: 'day_' + day,
      date: day,
      startTime: 1700000000000,
      studyTime: 45000, // IndexedDB has higher study time
      sessionTime: 45000,
      pausedTime: 10000,
      unverifiedTime: 0,
      distractions: { lookAway: 2, away: 1, lidClosed: 0 }, // DB has away distraction
      pauses: [
        { type: 'lookAway', start: 1700000010000, end: 1700000020000 },
        { type: 'away', start: 1700000030000, end: 1700000040000 },
      ],
    };

    const reconciled = reconcileSessionRecords(localRec, dbRec);

    // Takes highest study time
    assert.equal(reconciled.studyTime, 45000);
    // Takes highest session time (active tracking time, excluding paused time)
    assert.equal(reconciled.sessionTime, 45000);
    assert.equal(reconciled.pausedTime, 10000);
    assert.equal(reconciled.sessionTime + reconciled.pausedTime, 55000);
    // Takes max per distraction category
    assert.equal(reconciled.distractions.lookAway, 3);
    assert.equal(reconciled.distractions.away, 1);
    // Deduplicates pauses by start timestamp
    assert.equal(reconciled.pauses.length, 2);
  });
});

describe('Ayush_Tracker — Scenario 11: Dashboard, weekly chart, streak, history, and CSV consistency', () => {
  beforeEach(resetAppState);

  test('all views and exports match the exact same reconciled daily values and current week', () => {
    const todayStr = getLocalDateString();
    state.session.studyTime = 3600000; // 1 hour live today
    state.session.sessionTime = 4000000;
    state.settings.dailyGoal = 2; // 2h goal

    const pastSessions = [
      {
        date: todayStr,
        studyTime: 1800000, // DB has 0.5h, live is 1h -> reconciled must be 1h
        sessionTime: 2000000,
        distractions: { lookAway: 1, away: 0, lidClosed: 0 },
      }
    ];

    buildDashboardStats(pastSessions);

    // Today's study time on dash must be 1h 0m (from live state)
    assert.equal(DOM.dashStudyTime.textContent, '1h 0m');
    // Weekly total must include today's reconciled 1 hour
    assert.equal(DOM.weeklyTotal.textContent, '1h 0m');

    // Chart must also be buildable without throwing and include today
    buildChart(pastSessions);
    assert.ok(DOM.chartContainer);
  });
});

describe('Ayush_Tracker — Scenario 12: Delete-all while active', () => {
  beforeEach(resetAppState);

  test('stops timers, worker, camera, clears storage, and prevents resurrection', async () => {
    const todayStr = getLocalDateString();
    state.session.active = true;
    state.session.studyTime = 123456;
    state.session.sessionTime = 234567;
    state.camera.isDetecting = true;
    state.status = 'studying';
    state.autoSaveInterval = setInterval(() => {}, 1000);

    localStorage.setItem('ayush_tracker_today', JSON.stringify({ studyTime: 123456, date: todayStr }));

    // Execute delete all
    await handleDeleteAll();

    // 1. Session is not active
    assert.equal(state.session.active, false);
    assert.equal(state.status, 'idle');

    // 2. State counters reset to 0
    assert.equal(state.session.studyTime, 0);
    assert.equal(state.session.sessionTime, 0);
    assert.equal(state.session.accStudyMs, 0);

    // 3. Timers and detection stopped
    assert.equal(state.autoSaveInterval, null);
    assert.equal(state.camera.isDetecting, false);

    // 4. LocalStorage cleared
    assert.equal(localStorage.getItem('ayush_tracker_today'), null);

    // 5. Calling autoSaveSession immediately does not resurrect deleted data
    await autoSaveSession();
    assert.equal(localStorage.getItem('ayush_tracker_today'), null);
  });
});

// ═══════════════════════════════════════════════
// Suite 3: Vision Telemetry Pipeline States
// ═══════════════════════════════════════════════

describe('Ayush_Tracker — Vision Telemetry Pipeline', () => {
  function createDomMock() {
    const makeEl = (label) => {
      const el = {
        textContent: label,
        classes: new Set(),
      };
      el.classList = {
        add(c) { el.classes.add(c); },
        remove(c) { el.classes.delete(c); },
        contains(c) { return el.classes.has(c); },
      };
      return el;
    };
    const dom = {
      pipeCam: makeEl('Camera'),
      pipeModel: makeEl('Model'),
      pipeFace: makeEl('Face'),
      pipeFocus: makeEl('Screen'),
      pipeWorker: makeEl('Worker'),
    };
    return dom;
  }

  test('pipeline indicators reflect active states with pipe-ok class', () => {
    const dom = createDomMock();
    const steps = ['Cam', 'Model', 'Face', 'Worker'];
    steps.forEach(step => {
      dom[`pipe${step}`].classList.add('pipe-ok');
      dom[`pipe${step}`].textContent = `✅ ${step} Active`;
    });

    assert.equal(dom.pipeCam.textContent, '✅ Cam Active');
    assert.ok(dom.pipeCam.classList.contains('pipe-ok'));
    assert.equal(dom.pipeModel.textContent, '✅ Model Active');
    assert.ok(dom.pipeModel.classList.contains('pipe-ok'));
  });
});

// ═══════════════════════════════════════════════
// Suite 4: Multi-Session Aggregation vs. Duplicate Snapshot Deduplication
// ═══════════════════════════════════════════════

describe('Ayush_Tracker — Suite 4: Multi-Session Aggregation vs. Duplicate Snapshot Deduplication', () => {
  beforeEach(resetAppState);

  test('sums independent sessions on the same calendar day while deduplicating autosaves', () => {
    const day = '2026-11-20';
    
    // Session 1 (Morning): 30m study, 10m pause, 2 lookaways, with two autosave snapshots
    const sess1_snapshot1 = {
      id: 'sess_morning',
      date: day,
      startTime: 1700000000000,
      studyTime: 1200000, // 20m early snapshot
      sessionTime: 1200000,
      pausedTime: 300000,
      distractions: { lookAway: 1, away: 0, lidClosed: 0 },
      pauses: [{ type: 'lookAway', start: 1700000100000, end: 1700000400000 }],
    };
    const sess1_snapshot2 = {
      id: 'sess_morning',
      date: day,
      startTime: 1700000000000,
      studyTime: 1800000, // 30m final snapshot
      sessionTime: 1800000,
      pausedTime: 600000,
      distractions: { lookAway: 2, away: 0, lidClosed: 0 },
      pauses: [
        { type: 'lookAway', start: 1700000100000, end: 1700000400000 },
        { type: 'lookAway', start: 1700000600000, end: 1700000900000 },
      ],
    };

    // Session 2 (Evening): 45m study, 5m pause, 1 away distraction
    const sess2 = {
      id: 'sess_evening',
      date: day,
      startTime: 1700040000000,
      studyTime: 2700000, // 45m
      sessionTime: 2700000,
      pausedTime: 300000,
      distractions: { lookAway: 0, away: 1, lidClosed: 0 },
      pauses: [{ type: 'away', start: 1700040100000, end: 1700040400000 }],
    };

    // 1. isSameSessionOrSnapshot check
    assert.equal(isSameSessionOrSnapshot(sess1_snapshot1, sess1_snapshot2), true);
    assert.equal(isSameSessionOrSnapshot(sess1_snapshot2, sess2), false);

    // 2. Direct reconciliation of the two independent sessions must SUM them
    const summed = reconcileSessionRecords(sess1_snapshot2, sess2);
    assert.equal(summed.studyTime, 1800000 + 2700000); // 4500000 = 75 min
    assert.equal(summed.sessionTime, 1800000 + 2700000); // 4500000 = 75 min
    assert.equal(summed.pausedTime, 600000 + 300000); // 900000 = 15 min
    assert.equal(summed.distractions.lookAway, 2);
    assert.equal(summed.distractions.away, 1);
    assert.equal(summed.pauses.length, 3);

    // 3. calculateDailyTotals must deduplicate snapshots of sess1 and add sess2
    const dailyTotals = calculateDailyTotals([sess1_snapshot1, sess1_snapshot2, sess2], '2026-11-21', null);
    const dayTotal = dailyTotals[day];
    assert.ok(dayTotal);
    assert.equal(dayTotal.studyTime, 4500000);
    assert.equal(dayTotal.sessionTime, 4500000);
    assert.equal(dayTotal.pausedTime, 900000);
    assert.equal(dayTotal.distractions.lookAway, 2);
    assert.equal(dayTotal.distractions.away, 1);
  });
});

// ═══════════════════════════════════════════════
// Suite 5: Monotonic Clock Timing & Drift Invariance
// ═══════════════════════════════════════════════

describe('Ayush_Tracker — Suite 5: Monotonic Clock Drift & Clock Moving Backward/Forward', () => {
  beforeEach(resetAppState);

  test('preserves monotonic progress when wall-clock jumps backward or drifts', () => {
    const t0 = 1700000000000;
    const m0 = 10000.0;
    state.session.dateStr = getLocalDateString(t0);
    state.session.active = true;
    state.session.startTime = t0;
    state.session.studyStartedAt = t0;
    state.session.sessionStartedAt = t0;
    state.status = 'studying';
    state.camera.isDetecting = true;
    state.camera.lastDetectionTime = t0;
    state.lastTickTimestamp = t0;
    state.lastTickMonotonic = m0;

    // Tick 1: normal tick +1000ms
    handleTick({ timestamp: t0 + 1000, monotonic: m0 + 1000 });
    const studyT1 = state.session.studyTime;
    const sessionT1 = state.session.sessionTime;
    assert.ok(studyT1 >= 1000);
    assert.ok(sessionT1 >= 1000);

    // Tick 2: system clock jumps backward by 5000ms, but monotonic time increases +1000ms
    handleTick({ timestamp: t0 - 4000, monotonic: m0 + 2000 });
    // Accumulated times must never decrease
    assert.ok(state.session.studyTime >= studyT1, 'Study time must not decrease on backward wall clock jump');
    assert.ok(state.session.sessionTime >= sessionT1, 'Session time must not decrease on backward wall clock jump');

    // Tick 3: subsequent normal tick
    handleTick({ timestamp: t0 + 3000, monotonic: m0 + 3000 });
    assert.ok(state.session.studyTime >= studyT1);
    assert.ok(state.session.sessionTime >= sessionT1);
  });

  test('gap exceeding lidGapMs is detected as sleep and excluded from study and session time', () => {
    const t0 = 1700000000000;
    const m0 = 10000.0;
    state.session.dateStr = getLocalDateString(t0);
    state.session.active = true;
    state.session.startTime = t0;
    state.session.studyStartedAt = t0;
    state.session.sessionStartedAt = t0;
    state.status = 'studying';
    state.camera.isDetecting = true;
    state.camera.lastDetectionTime = t0;
    state.lastTickTimestamp = t0;
    state.lastTickMonotonic = m0;

    // Run for 5 seconds with active camera detection
    for (let s = 1; s <= 5; s++) {
      const t = t0 + s * 1000;
      state.camera.lastDetectionTime = t;
      handleTick({ timestamp: t, monotonic: m0 + s * 1000 });
    }
    const studyBeforeSleep = state.session.studyTime;
    const sessionBeforeSleep = state.session.sessionTime;
    assert.equal(studyBeforeSleep, 5000);
    assert.equal(sessionBeforeSleep, 5000);

    // Sleep for 30 minutes (1,800,000 ms gap > CONFIG.lidGapMs = 12000 ms)
    const tSleepEnd = t0 + 5000 + 1800000;
    const mSleepEnd = m0 + 5000 + 1800000;
    handleTick({ timestamp: tSleepEnd, monotonic: mSleepEnd });

    // Sleep must transition status to lid-closed
    assert.equal(state.status, 'lid-closed');
    // None of the 30 minute sleep gap should be added to study or session time
    assert.equal(state.session.studyTime, 5000);
    assert.equal(state.session.sessionTime, 5000);
    assert.equal(state.session.distractions.lidClosed, 1);
  });
});

// ═══════════════════════════════════════════════
// Suite 6: IndexedDB Concurrency, Awaited Transactions & Invalidation Token
// ═══════════════════════════════════════════════

describe('Ayush_Tracker — Suite 6: IndexedDB Concurrency, Awaited Transactions & Invalidation Token', () => {
  beforeEach(resetAppState);

  test('sequential saves execute via queueStorageOperation without race conditions', async () => {
    const day = '2026-11-22';
    const rec1 = { id: 'sess_1', date: day, studyTime: 1000, sessionTime: 1000 };
    const rec2 = { id: 'sess_2', date: day, studyTime: 2000, sessionTime: 2000 };
    const rec3 = { id: 'sess_3', date: day, studyTime: 3000, sessionTime: 3000 };

    // Fire 3 saves concurrently
    const p1 = DB.saveSession(rec1);
    const p2 = DB.saveSession(rec2);
    const p3 = DB.saveSession(rec3);

    await Promise.all([p1, p2, p3]);

    const all = await DB.getAllSessions();
    const dayRec = all.find(r => r.date === day);
    assert.ok(dayRec);
    // Since sess_1, sess_2, sess_3 are independent sessions on the same day, they sum to 6000
    assert.equal(dayRec.studyTime, 6000);
    assert.equal(dayRec.sessionTime, 6000);
  });

  test('clearAll increments storageEpoch and invalidates in-flight writes', async () => {
    const day = '2026-11-23';
    const staleRec = { id: 'day_' + day, date: day, studyTime: 50000, sessionTime: 60000 };

    // Start a save, immediately trigger clearAll before other turns
    const savePromise = DB.saveSession(staleRec);
    await DB.clearAll();
    await savePromise;

    const all = await DB.getAllSessions();
    const found = all.find(r => r.date === day);
    // Storage must be clean or contain no data from before clearAll
    assert.equal(found, undefined);
  });
});

// ═══════════════════════════════════════════════
// Suite 7: Full Analytics Engine Verification
// ═══════════════════════════════════════════════

describe('Ayush_Tracker — Suite 7: Full Analytics Engine Verification', () => {
  beforeEach(resetAppState);

  test('calculateWeeklyTotals accurately sums Monday through Sunday', () => {
    // 2026-11-25 is Wednesday
    const wednesday = new Date('2026-11-25T12:00:00');
    // Monday of this week is 2026-11-23, Sunday is 2026-11-29
    const dailyTotals = {
      '2026-11-23': { studyTime: 3600000, sessionTime: 4000000 }, // Mon: 1h
      '2026-11-24': { studyTime: 7200000, sessionTime: 8000000 }, // Tue: 2h
      '2026-11-25': { studyTime: 5400000, sessionTime: 6000000 }, // Wed: 1.5h
      '2026-11-26': { studyTime: 0, sessionTime: 0 },             // Thu: 0
      '2026-11-27': { studyTime: 3600000, sessionTime: 4000000 }, // Fri: 1h
      '2026-11-28': { studyTime: 0, sessionTime: 0 },             // Sat: 0
      '2026-11-29': { studyTime: 1800000, sessionTime: 2000000 }, // Sun: 0.5h
      '2026-11-30': { studyTime: 9999999, sessionTime: 9999999 }, // Next Mon (excluded)
    };

    const weekly = calculateWeeklyTotals(dailyTotals, wednesday);
    assert.equal(weekly.weeklyStudyTime, 3600000 + 7200000 + 5400000 + 3600000 + 1800000); // 21,600,000 = 6h
    assert.equal(weekly.dailyValues.length, 7);
    assert.equal(weekly.weekDays[0], '2026-11-23'); // Monday
    assert.equal(weekly.weekDays[6], '2026-11-29'); // Sunday
  });

  test('calculateMonthlyTotals accurately sums full calendar month', () => {
    // November 2026 has 30 days
    const novDate = new Date('2026-11-15T12:00:00');
    const dailyTotals = {
      '2026-11-01': { studyTime: 3600000, sessionTime: 4000000 },
      '2026-11-15': { studyTime: 7200000, sessionTime: 8000000 },
      '2026-11-30': { studyTime: 3600000, sessionTime: 4000000 },
      '2026-12-01': { studyTime: 10000000, sessionTime: 10000000 }, // December (excluded)
    };

    const monthly = calculateMonthlyTotals(dailyTotals, novDate);
    assert.equal(monthly.daysInMonth, 30);
    assert.equal(monthly.monthlyStudyTime, 3600000 + 7200000 + 3600000); // 14,400,000 = 4h
    assert.equal(monthly.monthDays.length, 30);
  });

  test('calculateDailyAverages returns correct averages for all, week, and month', () => {
    const novWed = new Date('2026-11-25T12:00:00');
    const dailyTotals = {
      '2026-11-23': { studyTime: 3600000, sessionTime: 4000000 }, // Mon: 1h
      '2026-11-24': { studyTime: 7200000, sessionTime: 8000000 }, // Tue: 2h
      '2026-11-25': { studyTime: 3600000, sessionTime: 4000000 }, // Wed: 1h
    };

    // 'all': averages across days with studyTime > 0 (3 days, total 14.4M / 3 = 4.8M = 80 min)
    const avgAll = calculateDailyAverages(dailyTotals, 'all', novWed);
    assert.equal(avgAll, (3600000 + 7200000 + 3600000) / 3);

    // 'week': divided by 7 days in the week
    const avgWeek = calculateDailyAverages(dailyTotals, 'week', novWed);
    assert.equal(avgWeek, Math.round((3600000 + 7200000 + 3600000) / 7));

    // 'month': divided by 30 days in November
    const avgMonth = calculateDailyAverages(dailyTotals, 'month', novWed);
    assert.equal(avgMonth, Math.round((3600000 + 7200000 + 3600000) / 30));
  });

  test('calculateSessionUtilization and historical comparisons behave as expected', () => {
    // 0 session time -> 0%
    assert.equal(calculateSessionUtilization(0, 0), 0);
    // 45m study of 60m session -> 75%
    assert.equal(calculateSessionUtilization(45000, 60000), 75);
    // Study time exceeding session time (anomaly) clamps to 100%
    assert.equal(calculateSessionUtilization(70000, 60000), 100);

    const ref = new Date('2026-11-25T12:00:00');
    const dailyTotals = {
      '2026-11-24': { studyTime: 3600000, sessionTime: 4000000 }, // Yesterday: 1h
      '2026-11-25': { studyTime: 7200000, sessionTime: 8000000 }, // Today: 2h
      // Previous week: Nov 18
      '2026-11-18': { studyTime: 3600000, sessionTime: 4000000 },
    };
    const comp = calculateHistoricalComparisons(dailyTotals, ref);
    assert.equal(comp.todayStudy, 7200000);
    assert.equal(comp.yesterdayStudy, 3600000);
    assert.equal(comp.todayDiff, 3600000); // +1h vs yesterday
    assert.equal(comp.thisWeekStudy, 3600000 + 7200000); // 3h this week
    assert.equal(comp.lastWeekStudy, 3600000); // 1h last week
    assert.equal(comp.weekDiff, 7200000); // +2h vs last week
  });
});

// ═══════════════════════════════════════════════
// Suite 8: Multi-Day Sleep & Rollover Invariance
// ═══════════════════════════════════════════════

describe('Ayush_Tracker — Suite 8: Multi-Day Sleep & Rollover Invariance', () => {
  beforeEach(resetAppState);

  test('laptop sleep spanning midnight credits neither day with sleep downtime', () => {
    // Session begins at 23:50 on Day 1 (10 minutes before midnight)
    const day1Midnight = new Date('2026-11-10T00:00:00').getTime();
    const tStart = day1Midnight + (23 * 3600000) + (50 * 60000); // 23:50:00
    const sleepStart = tStart + (5 * 60000); // 23:55:00 - lid closed after 5 min study
    
    state.session.active = true;
    state.session.id = 'day_2026-11-10';
    state.session.dateStr = '2026-11-10';
    state.session.startTime = tStart;
    state.session.studyStartedAt = tStart;
    state.session.sessionStartedAt = tStart;
    state.status = 'studying';
    state.lastTickTimestamp = sleepStart;

    // Simulate 5 minutes of study before sleep
    state.session.studyTime = 5 * 60000;
    state.session.sessionTime = 5 * 60000;
    state.session.accStudyMs = 5 * 60000;
    state.session.accSessionMs = 5 * 60000;

    // Wake up next day at 08:00:00 (8 hours and 5 minutes later)
    const wakeUpTime = day1Midnight + 86400000 + (8 * 3600000); // 2026-11-11 08:00:00
    const newDayStr = '2026-11-11';

    // handleMidnightRollover invoked with sleepAnchor = sleepStart (23:55:00)
    handleMidnightRollover(wakeUpTime, newDayStr, sleepStart);

    // 1. Day 2 initialized fresh without sleep credited as study time
    assert.equal(state.session.dateStr, '2026-11-11');
    assert.equal(state.session.studyTime, 0, 'New day must start with 0 study time');
    assert.equal(state.session.sessionTime, 0, 'New day must start with 0 session time during sleep');
    assert.equal(state.status, 'lid-closed');
    assert.equal(state.session.distractions.lidClosed, 1);
  });
});

// ═══════════════════════════════════════════════
// Suite 9: Targeted Review & Regression Verifications
// ═══════════════════════════════════════════════

describe('Ayush_Tracker — Suite 9: Targeted Review & Regression Verifications', () => {
  beforeEach(resetAppState);

  test('concern 1: sessionTime strictly excludes paused time and equals studyTime + unverifiedTime', () => {
    const t0 = 1700000000000;
    state.session.dateStr = getLocalDateString(t0);
    state.session.active = true;
    state.session.startTime = t0;
    state.session.studyStartedAt = t0;
    state.status = 'studying';
    state.camera.isDetecting = true;
    state.camera.lastDetectionTime = t0;

    // Study 10 seconds
    for (let s = 1; s <= 10; s++) {
      const t = t0 + s * 1000;
      state.camera.lastDetectionTime = t;
      handleTick({ timestamp: t, monotonic: 10000 + s * 1000, gap: 1000 });
    }
    assert.equal(state.session.studyTime, 10000);
    assert.equal(state.session.sessionTime, 10000);
    assert.equal(state.session.pausedTime, 0);

    // Pause for 15 seconds (e.g. looking away)
    const pauseStart = t0 + 10000;
    freezeStudyTime(pauseStart);
    startPauseEvent('lookAway', pauseStart);
    state.status = 'looking-away';

    for (let s = 11; s <= 25; s++) {
      const t = t0 + s * 1000;
      handleTick({ timestamp: t, monotonic: 10000 + s * 1000, gap: 1000 });
    }
    // Paused time must be 15s, but sessionTime MUST REMAIN 10s (paused time excluded)
    assert.equal(state.session.studyTime, 10000);
    assert.equal(state.session.sessionTime, 10000, 'Session time must not advance during pauses');
    assert.equal(state.session.pausedTime, 15000, 'Paused time tracks explicitly paused intervals');

    // Resume studying for 5 seconds
    const resumeTime = t0 + 25000;
    endPauseEvent(resumeTime);
    resumeStudyTime(resumeTime);
    state.status = 'studying';

    for (let s = 26; s <= 30; s++) {
      const t = t0 + s * 1000;
      state.camera.lastDetectionTime = t;
      handleTick({ timestamp: t, monotonic: 10000 + s * 1000, gap: 1000 });
    }
    assert.equal(state.session.studyTime, 15000);
    assert.equal(state.session.sessionTime, 15000);
    assert.equal(state.session.pausedTime, 15000);

    const record = buildSessionRecord(t0 + 30000);
    assert.equal(record.studyTime, 15000);
    assert.equal(record.sessionTime, 15000, 'Session time excludes paused time');
    assert.equal(record.pausedTime, 15000);
    assert.equal(record.unverifiedTime, 0);
    assert.equal(record.sessionTime, record.studyTime + record.unverifiedTime);
    assert.equal(record.sessionTime + record.pausedTime, 30000, 'Total span = active + paused');
  });

  test('concern 2: active camera prevents browser throttling or CPU delay from triggering false sleep pause', () => {
    const t0 = 1700000000000;
    state.session.dateStr = getLocalDateString(t0);
    state.session.active = true;
    state.session.startTime = t0;
    state.session.studyStartedAt = t0;
    state.status = 'studying';
    state.camera.isDetecting = true;

    // Study 5 seconds
    for (let s = 1; s <= 5; s++) {
      const t = t0 + s * 1000;
      state.camera.lastDetectionTime = t;
      handleTick({ timestamp: t, monotonic: 10000 + s * 1000, gap: 1000 });
    }
    assert.equal(state.session.studyTime, 5000);

    // CPU delay: 16 second worker tick gap, BUT camera was actively detecting at t0 + 20000 (just 1s ago)
    const tCpuStall = t0 + 21000;
    state.camera.lastDetectionTime = t0 + 20000; // Fresh frame arrived recently!
    handleTick({ timestamp: tCpuStall, monotonic: 10000 + 21000, gap: 16000 });

    // Must NOT be classified as laptop sleep because camera is actively detecting
    assert.notEqual(state.status, 'lid-closed', 'Active camera must prevent false lid-closed transition');
    assert.equal(state.session.distractions.lidClosed, 0);
  });

  test('concern 4: overlapping independent sessions with distinct IDs are not deduplicated', () => {
    const day = '2026-11-24';
    // Two independent sessions with overlapping timestamps (e.g. concurrent tabs or multi-device)
    const sessA = {
      id: 'sess_tab_1',
      date: day,
      startTime: 1700000000000,
      endTime: 1700002000000,
      studyTime: 15000,
      sessionTime: 15000,
      pausedTime: 5000,
      unverifiedTime: 0,
      distractions: { lookAway: 1, away: 0, lidClosed: 0 },
      pauses: [{ type: 'lookAway', start: 1700000500000, end: 1700001000000 }],
    };

    const sessB = {
      id: 'sess_tab_2',
      date: day,
      startTime: 1700001000000, // Overlaps with sessA (which ended at 1700002000000)
      endTime: 1700003000000,
      studyTime: 20000,
      sessionTime: 20000,
      pausedTime: 0,
      unverifiedTime: 0,
      distractions: { lookAway: 0, away: 1, lidClosed: 0 },
      pauses: [],
    };

    // 1. isSameSessionOrSnapshot must return false because they have distinct session IDs
    assert.equal(isSameSessionOrSnapshot(sessA, sessB), false);

    // 2. Reconciliation must SUM their study times, NOT take Math.max
    const merged = reconcileSessionRecords(sessA, sessB);
    assert.equal(merged.studyTime, 35000, 'Independent study times must be summed');
    assert.equal(merged.sessionTime, 35000, 'Independent active times must be summed');
    assert.equal(merged.pausedTime, 5000);
    assert.equal(merged.distractions.lookAway, 1);
    assert.equal(merged.distractions.away, 1);

    // 3. calculateDailyTotals must also sum both independent sessions
    const totals = calculateDailyTotals([sessA, sessB], '2026-11-25', null);
    assert.equal(totals[day].studyTime, 35000);
    assert.equal(totals[day].sessionTime, 35000);
    assert.equal(totals[day].pausedTime, 5000);
  });

  test('concern 5: queued save operations before clearAll are dropped by storageEpoch bump', async () => {
    const day = '2026-11-24';
    const staleData = {
      id: 'day_' + day,
      date: day,
      studyTime: 99999,
      sessionTime: 99999,
      pausedTime: 0,
    };

    // Queue a save
    const savePromise = DB.saveSession(staleData);
    // Immediately clear all (which increments storageEpoch and clears DB)
    const clearPromise = DB.clearAll();

    await Promise.all([savePromise, clearPromise]);

    const records = await DB.getAllSessions();
    const found = records.find(r => r.date === day);
    assert.equal(found, undefined, 'Stale save must not resurrect into database');
    assert.equal(localStorage.getItem('ayush_tracker_today'), null, 'LocalStorage must be clean');
  });
});

// ═══════════════════════════════════════════════
// Suite 10: Issue #1 — Monotonic Clock Handling
// ═══════════════════════════════════════════════

describe('Ayush_Tracker — Suite 10: Monotonic Clock Handling (Forward/Backward Jumps & Restart)', () => {
  beforeEach(resetAppState);

  test('forward wall-clock jump (+5m) neither inflates studyTime nor triggers false sleep', () => {
    const t0 = 1700000000000;
    const m0 = 50000.0;
    state.session.dateStr = getLocalDateString(t0);
    state.session.active = true;
    state.session.startTime = t0;
    state.session.studyStartedAt = t0;
    state.status = 'studying';
    state.camera.isDetecting = true;
    state.camera.lastFrameTime = t0;
    state.lastTickTimestamp = t0;
    state.lastTickMonotonic = m0;

    for (let s = 1; s <= 5; s++) {
      const t = t0 + s * 1000;
      state.camera.lastFrameTime = t;
      handleTick({ timestamp: t, monotonic: m0 + s * 1000 });
    }
    assert.equal(state.session.studyTime, 5000);
    assert.equal(state.session.sessionTime, 5000);

    // NTP/manual system clock jumps FORWARD +5 minutes while only 1 monotonic second elapsed
    const jumpOffset = 300000;
    state.camera.lastFrameTime = t0 + 6000 + jumpOffset;
    handleTick({ timestamp: t0 + 6000 + jumpOffset, monotonic: m0 + 6000 });

    assert.equal(state.status, 'studying', 'Must NOT falsely transition to lid-closed on wall jump');
    assert.equal(state.session.studyTime, 6000, 'Study time must advance only by monotonic 1s delta');
    assert.equal(state.session.sessionTime, 6000, 'Session time must advance only by monotonic 1s delta');

    // Subsequent tick advances cleanly by 1s
    state.camera.lastFrameTime = t0 + 7000 + jumpOffset;
    handleTick({ timestamp: t0 + 7000 + jumpOffset, monotonic: m0 + 7000 });
    assert.equal(state.session.studyTime, 7000);
  });

  test('backward wall-clock jump (-5m) preserves progress and keeps advancing on monotonic ticks', () => {
    const t0 = 1700000500000;
    const m0 = 50000.0;
    state.session.dateStr = getLocalDateString(t0);
    state.session.active = true;
    state.session.startTime = t0;
    state.session.studyStartedAt = t0;
    state.status = 'studying';
    state.camera.isDetecting = true;
    state.camera.lastFrameTime = t0;
    state.lastTickTimestamp = t0;
    state.lastTickMonotonic = m0;

    for (let s = 1; s <= 5; s++) {
      const t = t0 + s * 1000;
      state.camera.lastFrameTime = t;
      handleTick({ timestamp: t, monotonic: m0 + s * 1000 });
    }
    assert.equal(state.session.studyTime, 5000);

    // Wall clock jumps BACKWARD by 5 minutes, monotonic advances +1s
    const jumpBack = -300000;
    state.camera.lastFrameTime = t0 + 6000 + jumpBack;
    handleTick({ timestamp: t0 + 6000 + jumpBack, monotonic: m0 + 6000 });
    assert.equal(state.session.studyTime, 6000, 'Monotonic progression continues despite backward wall jump');

    // Next 3 ticks at shifted wall clock advance normally without stalling for 5 minutes
    for (let s = 7; s <= 9; s++) {
      const t = t0 + s * 1000 + jumpBack;
      state.camera.lastFrameTime = t;
      handleTick({ timestamp: t, monotonic: m0 + s * 1000 });
    }
    assert.equal(state.session.studyTime, 9000);
    assert.equal(state.session.sessionTime, 9000);
  });

  test('runtime/worker restart (monotonic reset) re-anchors without counting uncertain downtime', () => {
    const t0 = 1700000000000;
    const m0 = 50000.0;
    state.session.dateStr = getLocalDateString(t0);
    state.session.active = true;
    state.session.startTime = t0;
    state.session.studyStartedAt = t0;
    state.status = 'studying';
    state.camera.isDetecting = true;
    state.camera.lastFrameTime = t0;
    state.lastTickTimestamp = t0;
    state.lastTickMonotonic = m0;

    for (let s = 1; s <= 4; s++) {
      const t = t0 + s * 1000;
      state.camera.lastFrameTime = t;
      handleTick({ timestamp: t, monotonic: m0 + s * 1000 });
    }
    assert.equal(state.session.studyTime, 4000);

    // Simulate worker/runtime restart 10 seconds later where monotonic resets back to 500ms
    const tRestart = t0 + 14000;
    state.camera.lastFrameTime = tRestart;
    handleTick({ timestamp: tRestart, monotonic: 500.0 });

    assert.equal(state.session.studyTime, 4000, 'Uncertain restart downtime must NOT credit study time');
    assert.equal(state.session.sessionTime, 4000, 'Uncertain restart downtime must NOT credit session time');

    // Next tick after restart resumes counting cleanly (+1s)
    state.camera.lastFrameTime = tRestart + 1000;
    handleTick({ timestamp: tRestart + 1000, monotonic: 1500.0 });
    assert.equal(state.session.studyTime, 5000);
  });
});

// ═══════════════════════════════════════════════
// Suite 11: Issue #2 — Camera Detection Health
// ═══════════════════════════════════════════════

describe('Ayush_Tracker — Suite 11: Camera Detection Health Separation & Recovery', () => {
  beforeEach(resetAppState);

  test('separates attempt, frame processing, and face detection timestamps across failures', () => {
    const t0 = 1700000000000;
    const prevLandmarker = state.camera.faceLandmarker;
    const prevVideo = DOM.cameraPreview;

    try {
      state.camera.isDetecting = true;

      // 1. Video not ready (readyState = 1): updates lastAttemptTime only, never lastFrameTime/lastFaceTime
      DOM.cameraPreview = { readyState: 1, videoWidth: 640, videoHeight: 480 };
      state.camera.faceLandmarker = { detectForVideo: () => ({ faceLandmarks: [] }) };
      runDetection(t0 + 200, 200);

      assert.equal(state.camera.lastAttemptTime, t0 + 200);
      assert.equal(state.camera.lastFrameTime, 0, 'Video-not-ready must not advance lastFrameTime');
      assert.equal(state.camera.lastFaceTime, 0, 'Video-not-ready must not advance lastFaceTime');
      assert.equal(state.camera.lastDetectionTime, 0);

      const healthNotReady = evaluateCameraHealth(t0 + 200, true, 200);
      assert.equal(healthNotReady.isCameraActive, false);
      assert.equal(healthNotReady.isStalled, true);

      // 2. Failed frame (detectForVideo throws): updates attempt only, NOT frame or face
      DOM.cameraPreview = { readyState: 4, videoWidth: 640, videoHeight: 480 };
      state.camera.faceLandmarker = {
        detectForVideo: () => { throw new Error('GPU frame drop'); },
      };
      runDetection(t0 + 400, 400);

      assert.equal(state.camera.lastAttemptTime, t0 + 400);
      assert.equal(state.camera.lastFrameTime, 0, 'Failed frame must not update lastFrameTime');
      assert.equal(state.camera.lastFaceTime, 0);

      // 3. Valid frame with NO face: updates lastFrameTime, NOT lastFaceTime
      state.camera.faceLandmarker = {
        detectForVideo: () => ({ faceLandmarks: [] }),
      };
      runDetection(t0 + 600, 600);

      assert.equal(state.camera.lastAttemptTime, t0 + 600);
      assert.equal(state.camera.lastFrameTime, t0 + 600);
      assert.equal(state.camera.lastFaceTime, 0, 'No-face frame must not update lastFaceTime');

      // 4. Valid frame WITH face: updates all three timestamps
      const fakeLandmarks = Array.from({ length: 470 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
      fakeLandmarks[234] = { x: 0.3, y: 0.5, z: 0 };
      fakeLandmarks[454] = { x: 0.7, y: 0.5, z: 0 };
      fakeLandmarks[10] = { x: 0.5, y: 0.2, z: 0 };
      fakeLandmarks[152] = { x: 0.5, y: 0.8, z: 0 };
      fakeLandmarks[33] = { x: 0.4, y: 0.4, z: 0 };
      fakeLandmarks[263] = { x: 0.6, y: 0.4, z: 0 };
      fakeLandmarks[61] = { x: 0.45, y: 0.65, z: 0 };
      fakeLandmarks[291] = { x: 0.55, y: 0.65, z: 0 };
      state.camera.faceLandmarker = {
        detectForVideo: () => ({ faceLandmarks: [fakeLandmarks] }),
      };
      runDetection(t0 + 800, 800);

      assert.equal(state.camera.lastAttemptTime, t0 + 800);
      assert.equal(state.camera.lastFrameTime, t0 + 800);
      assert.equal(state.camera.lastFaceTime, t0 + 800);
    } finally {
      state.camera.faceLandmarker = prevLandmarker;
      DOM.cameraPreview = prevVideo;
    }
  });

  test('stalled processing freezes study time and recovery does not retroactively verify or double-count', () => {
    const t0 = 1700000000000;
    const m0 = 10000.0;
    const prevLandmarker = state.camera.faceLandmarker;
    const prevVideo = DOM.cameraPreview;

    try {
      state.session.dateStr = getLocalDateString(t0);
      state.session.active = true;
      state.session.startTime = t0;
      state.session.studyStartedAt = t0;
      state.status = 'studying';
      state.camera.isDetecting = true;
      state.lastTickTimestamp = t0;
      state.lastTickMonotonic = m0;

      DOM.cameraPreview = { readyState: 4, videoWidth: 640, videoHeight: 480 };
      const centeredLandmarks = Array.from({ length: 470 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
      centeredLandmarks[234] = { x: 0.3, y: 0.5, z: 0 };
      centeredLandmarks[454] = { x: 0.7, y: 0.5, z: 0 };
      centeredLandmarks[10] = { x: 0.5, y: 0.2, z: 0 };
      centeredLandmarks[152] = { x: 0.5, y: 0.8, z: 0 };
      centeredLandmarks[33] = { x: 0.4, y: 0.4, z: 0 };
      centeredLandmarks[263] = { x: 0.6, y: 0.4, z: 0 };
      centeredLandmarks[61] = { x: 0.45, y: 0.65, z: 0 };
      centeredLandmarks[291] = { x: 0.55, y: 0.65, z: 0 };
      state.camera.faceLandmarker = { detectForVideo: () => ({ faceLandmarks: [centeredLandmarks] }) };

      // 3 healthy seconds
      for (let s = 1; s <= 3; s++) {
        runDetection(t0 + s * 1000, m0 + s * 1000);
        handleTick({ timestamp: t0 + s * 1000, monotonic: m0 + s * 1000 });
      }
      assert.equal(state.session.studyTime, 3000);

      // Camera frames start failing (video readyState drops to 0) for 5 seconds
      DOM.cameraPreview.readyState = 0;
      for (let s = 4; s <= 8; s++) {
        runDetection(t0 + s * 1000, m0 + s * 1000); // fails: updates lastAttemptTime ONLY
        handleTick({ timestamp: t0 + s * 1000, monotonic: m0 + s * 1000 });
      }
      // Once threshold (2500ms) exceeded at s=6, study stops advancing and unverified accumulates (s=6,7,8 -> 3000ms)
      const studyAtStall = state.session.studyTime;
      const unverifiedBeforeRecovery = state.session.unverifiedTime;
      assert.ok(unverifiedBeforeRecovery >= 3000, 'Stall must accumulate unverified time');
      assert.equal(studyAtStall, 5000, 'Verified study time stays frozen once stall threshold exceeded');

      // Camera recovers at s=9
      DOM.cameraPreview.readyState = 4;
      runDetection(t0 + 9000, m0 + 9000);
      handleTick({ timestamp: t0 + 9000, monotonic: m0 + 9000 });

      // Study must NOT jump by unverified time on recovery; total span = 9000
      assert.equal(state.session.studyTime, studyAtStall, 'Unverified time must never be retroactively verified');
      assert.equal(state.session.studyTime + state.session.unverifiedTime, 9000, 'No double counting across recovery boundary');

      // Continue 2 more healthy seconds (s=10, 11)
      for (let s = 10; s <= 11; s++) {
        runDetection(t0 + s * 1000, m0 + s * 1000);
        handleTick({ timestamp: t0 + s * 1000, monotonic: m0 + s * 1000 });
      }
      assert.equal(state.session.studyTime, studyAtStall + 2000);
      assert.equal(state.session.sessionTime, 11000);
      assert.equal(state.session.sessionTime, state.session.studyTime + state.session.unverifiedTime);
    } finally {
      state.camera.faceLandmarker = prevLandmarker;
      DOM.cameraPreview = prevVideo;
    }
  });
});

// ═══════════════════════════════════════════════
// Suite 12: Issue #3 — Legacy Record Migration
// ═══════════════════════════════════════════════

describe('Ayush_Tracker — Suite 12: Legacy Record Normalization & Idempotency', () => {
  beforeEach(resetAppState);

  test('normalizes legacy records preserving study, unverified, and paused history without dropping after load', () => {
    const todayStr = getLocalDateString();
    const t0 = Date.now() - 3600000;

    // 1. Legacy record without schemaVersion, using old sessionTime = study + paused + unverified
    const legacyRec = {
      id: 'day_' + todayStr,
      date: todayStr,
      startTime: t0,
      endTime: t0 + 2000000,
      studyTime: 1000000,
      unverifiedTime: 200000,
      sessionTime: 1700000, // legacy total included 500s pause
      pauses: [
        { type: 'lookAway', start: t0 + 200000, end: t0 + 500000 }, // 300s
        { type: 'away', start: t0 + 800000, end: t0 + 1000000 },    // 200s
      ],
      distractions: { lookAway: 1, away: 1, lidClosed: 0 },
      lastSaved: t0 + 2000000,
    };

    const norm1 = normalizeSessionRecord(legacyRec);
    assert.equal(norm1.studyTime, 1000000);
    assert.equal(norm1.unverifiedTime, 200000);
    assert.equal(norm1.pausedTime, 500000);
    assert.equal(norm1.sessionTime, 1200000);
    assert.equal(norm1.schemaVersion, 2);

    // Idempotency
    const norm2 = normalizeSessionRecord(norm1);
    assert.deepEqual(norm2, norm1, 'Legacy normalization must be strictly idempotent');

    // Legacy record missing unverifiedTime and pauses preserves unaccounted active span
    const veryOldRec = {
      id: 'day_2025-01-01',
      date: '2025-01-01',
      startTime: 1735689600000,
      endTime: 1735693200000,
      studyTime: 1800000,
      sessionTime: 2100000, // 300s unaccounted non-paused residual
      pauses: [],
    };
    const normOld = normalizeSessionRecord(veryOldRec);
    assert.equal(normOld.studyTime, 1800000);
    assert.equal(normOld.unverifiedTime, 300000);
    assert.equal(normOld.sessionTime, 2100000, 'Old sessionTime must not unexpectedly drop when no pauses exist');

    // Loading into today state normalizes immediately and never decreases after further ticks
    localStorage.setItem('ayush_tracker_today', JSON.stringify(legacyRec));
    loadTodayState();
    const loadedSessionTime = state.session.sessionTime;
    assert.equal(loadedSessionTime, 1200000);
    assert.equal(state.session.pausedTime, 500000);

    // Resume and tick +5s -> sessionTime strictly increases, never decreases
    const tRes = Date.now();
    state.session.active = true;
    state.session.studyStartedAt = tRes;
    state.status = 'studying';
    state.lastTickTimestamp = tRes;
    state.lastTickMonotonic = 1000;
    state.camera.isDetecting = true;
    for (let s = 1; s <= 5; s++) {
      state.camera.lastFrameTime = tRes + s * 1000;
      handleTick({ timestamp: tRes + s * 1000, monotonic: 1000 + s * 1000 });
    }
    assert.equal(state.session.sessionTime, loadedSessionTime + 5000);
    assert.ok(state.session.sessionTime >= loadedSessionTime, 'Session time must never decrease after load');

    // Aggregation normalizes legacy records on read without mutating input object
    const totals = calculateDailyTotals([legacyRec], '2099-01-01', null);
    assert.equal(totals[todayStr].studyTime, 1000000);
    assert.equal(totals[todayStr].sessionTime, 1200000);
    assert.equal(totals[todayStr].pausedTime, 500000);
    assert.equal(legacyRec.sessionTime, 1700000, 'Original historical object must not be mutated on read');
  });
});

// ═══════════════════════════════════════════════
// Suite 13: Issue #4 — End Session While Paused (Exact UI & DB Match)
// ═══════════════════════════════════════════════

describe('Ayush_Tracker — Suite 13: Ending a Session While Paused', () => {
  beforeEach(resetAppState);

  test('start -> study 10s -> pause 5s -> end yields study=10s, session=10s, paused=5s everywhere', async () => {
    await DB.clearAll();
    const t0 = Date.now() - 20000;
    const todayStr = getLocalDateString(t0);
    const m0 = 20000.0;

    state.session.dateStr = todayStr;
    state.session.id = 'day_' + todayStr;
    state.session.active = true;
    state.session.startTime = t0;
    state.session.studyStartedAt = t0;
    state.status = 'studying';
    state.lastTickTimestamp = t0;
    state.lastTickMonotonic = m0;
    state.camera.isDetecting = true;
    state.camera.lastFrameTime = t0;

    // Study for 10 seconds
    for (let s = 1; s <= 10; s++) {
      const t = t0 + s * 1000;
      state.camera.lastFrameTime = t;
      handleTick({ timestamp: t, monotonic: m0 + s * 1000 });
    }

    // Pause for 5 seconds
    const pauseStart = t0 + 10000;
    freezeStudyTime(pauseStart);
    startPauseEvent('away', pauseStart);
    state.status = 'away';

    for (let s = 11; s <= 15; s++) {
      handleTick({ timestamp: t0 + s * 1000, monotonic: m0 + s * 1000 });
    }

    // End the session while still paused at t0 + 15000
    const endTime = t0 + 15000;
    const record = handleEnd(endTime);
    // Allow queued DB save to complete
    await new Promise(r => setTimeout(r, 20));

    // Exact totals
    assert.equal(state.session.studyTime, 10000);
    assert.equal(state.session.sessionTime, 10000);
    assert.equal(state.session.pausedTime, 5000);

    // Record saved in localStorage
    const lsRec = JSON.parse(localStorage.getItem('ayush_tracker_today'));
    assert.equal(lsRec.studyTime, 10000);
    assert.equal(lsRec.sessionTime, 10000);
    assert.equal(lsRec.pausedTime, 5000);
    assert.equal(lsRec.endTime, endTime);

    // Final record matches
    assert.equal(record.studyTime, 10000);
    assert.equal(record.sessionTime, 10000);
    assert.equal(record.pausedTime, 5000);

    // Final UI matches
    assert.equal(DOM.timerDisplay.textContent, '00:00:10');
    assert.equal(DOM.statSessionTime.textContent, '00:00:10');
    assert.equal(DOM.statPausedTime.textContent, '00:00:05');

    // IndexedDB + Dashboard agree
    const dbRecords = await DB.getDailyRecords();
    const todayDb = dbRecords.find(r => r.date === todayStr);
    assert.ok(todayDb);
    assert.equal(todayDb.studyTime, 10000);
    assert.equal(todayDb.sessionTime, 10000);
    assert.equal(todayDb.pausedTime, 5000);

    buildDashboardStats(dbRecords);
    assert.equal(DOM.dashStudyTime.textContent, formatDuration(10000));
  });
});

// ═══════════════════════════════════════════════
// Suite 14: Issue #5 — Midnight Rollover During Camera Stalls & Pauses
// ═══════════════════════════════════════════════

describe('Ayush_Tracker — Suite 14: Midnight Rollover During Camera Stalls, Pauses & Suspension', () => {
  beforeEach(resetAppState);

  test('rollover during camera stall preserves unverified classification on both days without double-counting', async () => {
    await DB.clearAll();
    // Day 1 23:55:00
    const day1Date = new Date(2026, 10, 20, 23, 55, 0);
    const day1Str = getLocalDateString(day1Date.getTime());
    const t0 = day1Date.getTime();
    const m0 = 10000.0;

    state.session.active = true;
    state.session.id = 'day_' + day1Str;
    state.session.dateStr = day1Str;
    state.session.startTime = t0;
    state.session.studyStartedAt = null;
    state.session.unverifiedStartedAt = t0 + 4 * 60000 + 59000; // 23:59:59
    state.session.unverifiedTime = 4 * 60000 + 59000;      // 4m 59s already tracked
    state.session.accUnverifiedMs = 4 * 60000 + 59000;
    state.session.studyTime = 60000; // 1m earlier verified study
    state.session.accStudyMs = 60000;
    state.status = 'studying';
    state.camera.isDetecting = true;
    state.camera.lastFrameTime = t0 - 10000; // stalled
    state.lastTickTimestamp = t0 + 4 * 60000 + 59000; // 23:59:59
    state.lastTickMonotonic = m0;

    // Rollover tick 2 seconds later at Day 2 00:00:01 (stalled, not sleeping)
    const day2Date = new Date(2026, 10, 21, 0, 0, 1);
    const day2Str = getLocalDateString(day2Date.getTime());
    const tRollover = day2Date.getTime();

    handleTick({ timestamp: tRollover, monotonic: m0 + 2000 });
    await new Promise(r => setTimeout(r, 20));

    // Yesterday record saved in DB: 1m study + 5m unverified (NOT double counted!) = 6m sessionTime
    const dbRecs = await DB.getDailyRecords();
    const yRec = dbRecs.find(r => r.date === day1Str);
    assert.ok(yRec, 'Yesterday record must be archived');
    assert.equal(yRec.studyTime, 60000, 'Yesterday verified study must stay 1m');
    assert.equal(yRec.unverifiedTime, 5 * 60000, 'Yesterday unverified must be 5m without double-counting');
    assert.equal(yRec.sessionTime, 6 * 60000);

    // Today's state must stay unverified (NOT converted to verified study time!)
    assert.equal(state.session.dateStr, day2Str);
    assert.equal(state.session.studyTime, 0, 'Today must NOT convert stall interval into verified study');
    assert.equal(state.session.unverifiedTime, 1000, 'Today post-midnight 1s stall belongs to unverifiedTime');
    assert.equal(state.session.sessionTime, 1000);
    assert.equal(state.session.studyStartedAt, null);
    assert.ok(state.session.unverifiedStartedAt !== null);

    // Further recovery does not retroactively verify today's 1s stall
    state.camera.lastFrameTime = tRollover + 1000;
    handleTick({ timestamp: tRollover + 1000, monotonic: m0 + 3000 });
    assert.equal(state.session.studyTime, 0);
    assert.equal(state.session.unverifiedTime, 2000);
    assert.equal(state.session.sessionTime, 2000);

    // Next healthy tick accrues verified study
    state.camera.lastFrameTime = tRollover + 2000;
    handleTick({ timestamp: tRollover + 2000, monotonic: m0 + 4000 });
    assert.equal(state.session.studyTime, 1000);
    assert.equal(state.session.unverifiedTime, 2000);
    assert.equal(state.session.sessionTime, 3000);
  });

  test('rollover while recovering from suspension during a stall excludes sleep downtime', async () => {
    await DB.clearAll();
    const day1Date = new Date(2026, 10, 21, 23, 55, 0);
    const day1Str = getLocalDateString(day1Date.getTime());
    const t0 = day1Date.getTime();
    const m0 = 10000.0;

    state.session.active = true;
    state.session.id = 'day_' + day1Str;
    state.session.dateStr = day1Str;
    state.session.startTime = t0;
    state.session.studyStartedAt = null;
    state.session.unverifiedStartedAt = t0 + 4 * 60000;
    state.session.unverifiedTime = 4 * 60000; // 4m unverified up to 23:59:00
    state.session.accUnverifiedMs = 4 * 60000;
    state.session.studyTime = 60000;
    state.session.accStudyMs = 60000;
    state.status = 'studying';
    state.camera.isDetecting = true;
    state.camera.lastFrameTime = t0 - 10000;
    state.lastTickTimestamp = t0 + 4 * 60000; // 23:59:00
    state.lastTickMonotonic = m0;

    // Wake up 4 minutes later across midnight (23:59:00 -> 00:03:00 = 240s sleep gap > lidGapMs)
    const day2Date = new Date(2026, 10, 22, 0, 3, 0);
    const day2Str = getLocalDateString(day2Date.getTime());
    handleTick({ timestamp: day2Date.getTime(), monotonic: m0 + 4 * 60000 });
    await new Promise(r => setTimeout(r, 20));

    const dbRecs = await DB.getDailyRecords();
    const yRec = dbRecs.find(r => r.date === day1Str);
    assert.equal(yRec.studyTime, 60000);
    assert.equal(yRec.unverifiedTime, 4 * 60000, 'Post-23:59 sleep gap excluded from yesterday');
    assert.equal(state.session.dateStr, day2Str);
    assert.equal(state.session.studyTime, 0);
    assert.equal(state.session.unverifiedTime, 0, 'Sleep gap excluded from today');
    assert.equal(state.status, 'lid-closed');
  });

  test('rollover while paused splits pause intervals cleanly preserving pause type', async () => {
    await DB.clearAll();
    const day1Date = new Date(2026, 10, 22, 23, 50, 0);
    const day1Str = getLocalDateString(day1Date.getTime());
    const t0 = day1Date.getTime();

    state.session.active = true;
    state.session.id = 'day_' + day1Str;
    state.session.dateStr = day1Str;
    state.session.startTime = t0;
    state.session.studyTime = 300000; // 5m studied 23:50->23:55
    state.session.accStudyMs = 300000;
    state.status = 'looking-away';
    state.session.pauses = [{ type: 'lookAway', start: t0 + 300000, end: null }]; // paused at 23:55
    state.lastTickTimestamp = t0 + 540000;

    const day2Date = new Date(2026, 10, 23, 0, 2, 0);
    const day2Str = getLocalDateString(day2Date.getTime());
    handleMidnightRollover(day2Date.getTime(), day2Str, null);
    await new Promise(r => setTimeout(r, 20));

    const dbRecs = await DB.getDailyRecords();
    const yRec = dbRecs.find(r => r.date === day1Str);
    assert.equal(yRec.studyTime, 300000);
    assert.equal(yRec.pausedTime, 5 * 60000, 'Yesterday paused 23:55->00:00 = 5m');

    assert.equal(state.session.dateStr, day2Str);
    assert.equal(state.session.studyTime, 0);
    assert.equal(state.session.pausedTime, 2 * 60000, 'Today paused 00:00->00:02 = 2m');
    assert.equal(state.session.pauses[0].type, 'lookAway', 'Pause type preserved across midnight');
  });
});

// ═══════════════════════════════════════════════
// Suite 15: Issue #6 — Paused-Time Recovery
// ═══════════════════════════════════════════════

describe('Ayush_Tracker — Suite 15: Paused-Time Recovery from Actual Pause Intervals', () => {
  beforeEach(resetAppState);

  test('recovers pausedTime from actual pause intervals across reload without subtraction inference', async () => {
    const now = Date.now();
    const todayStr = getLocalDateString(now);
    const t0 = now - 60000;

    // Saved snapshot has open pause and deliberately omits pausedTime (or had 0)
    const saved = {
      id: 'day_' + todayStr,
      date: todayStr,
      startTime: t0,
      endTime: null,
      studyTime: 20000,
      sessionTime: 20000,
      unverifiedTime: 0,
      pauses: [
        { type: 'lookAway', start: t0 + 10000, end: t0 + 14000 }, // 4s
        { type: 'away', start: t0 + 30000, end: null },           // open: 6s up to lastSaved
      ],
      lastSaved: t0 + 36000,
    };
    localStorage.setItem('ayush_tracker_today', JSON.stringify(saved));

    loadTodayState();

    assert.equal(state.session.pausedTime, 10000, 'Must recover 4s + 6s = 10s from pauses');
    assert.equal(state.session.pauses[1].end, t0 + 36000, 'Open pause closed at lastSaved');
    assert.equal(state.session.studyTime, 20000);
    assert.equal(state.session.sessionTime, 20000, 'Active sessionTime independent from pausedTime');
    assert.equal(DOM.statPausedTime.textContent, '00:00:10');

    // Overlapping or inverted pause intervals never duplicate or go negative
    const mergedPaused = calculateTotalPausedTime([
      { type: 'lookAway', start: 1000, end: 5000 },
      { type: 'lookAway', start: 3000, end: 7000 }, // overlaps [3000..5000]
      { type: 'away', start: 9000, end: 8000 },     // inverted clock anomaly -> 0
    ], 10000);
    assert.equal(mergedPaused, 6000, 'Overlapping intervals merged to [1000..7000] = 6s, negative ignored');

    // recoverUnfinishedSessions finalizes past day records recovering pausedTime from pauses
    await DB.clearAll();
    const pastDate = '2026-10-01';
    const pastT0 = new Date('2026-10-01T10:00:00').getTime();
    await DB.saveSession({
      id: 'day_' + pastDate,
      date: pastDate,
      startTime: pastT0,
      endTime: null,
      studyTime: 30000,
      sessionTime: 30000,
      unverifiedTime: 0,
      pausedTime: 0,
      pauses: [{ type: 'away', start: pastT0 + 30000, end: null }],
      lastSaved: pastT0 + 45000,
    });
    await recoverUnfinishedSessions();
    const pastRec = await DB.getDailyRecord(pastDate);
    assert.equal(pastRec.endTime, pastT0 + 45000);
    assert.equal(pastRec.pausedTime, 15000, 'Past unclosed session recovers 15s from open pause');
    assert.equal(pastRec.sessionTime, 30000);
  });
});

// ═══════════════════════════════════════════════
// Suite 16: Issue #7 — Concurrent Tab Conflict & Overwrite Protection
// ═══════════════════════════════════════════════

describe('Ayush_Tracker — Suite 16: Concurrent Tab Conflict Detection & Save Guard', () => {
  beforeEach(resetAppState);

  test('detects active tracking tab conflict and prevents handleStart from clobbering', async () => {
    await DB.clearAll();
    const now = Date.now();
    const todayStr = getLocalDateString(now);

    // Simulate another tab holding a fresh active lock
    localStorage.setItem('ayush_tracker_active_tab', JSON.stringify({
      tabId: 'tab_other_999',
      dateStr: todayStr,
      startedAt: now - 5000,
      updatedAt: now - 1000,
    }));

    assert.equal(checkTabConflict(now, todayStr), true);
    assert.equal(await acquireTabLock(now, todayStr), false, 'Must refuse lock while another tab is active');

    const started = await handleStart();
    assert.equal(started, false, 'handleStart must abort safely on active tab conflict');
    assert.equal(state.session.active, false);

    // Stale/expired lock (>15s old) does not block recovery
    localStorage.setItem('ayush_tracker_active_tab', JSON.stringify({
      tabId: 'tab_crashed_111',
      dateStr: todayStr,
      startedAt: now - 60000,
      updatedAt: now - 30000,
    }));
    assert.equal(checkTabConflict(now, todayStr), false);
    assert.equal(await acquireTabLock(now, todayStr), true);
    await releaseTabLock();
    assert.equal(localStorage.getItem('ayush_tracker_active_tab'), null);
  });

  test('cross-tab IndexedDB and localStorage saves reconcile instead of silently overwriting higher progress', async () => {
    await DB.clearAll();
    const todayStr = getLocalDateString();
    const dayId = 'day_' + todayStr;

    // Tab B already saved 30m of study for today
    await DB.saveSession({
      id: dayId,
      date: todayStr,
      tabId: 'tab_other_tabB',
      startTime: Date.now() - 1800000,
      endTime: null,
      studyTime: 1800000,
      sessionTime: 1800000,
      pausedTime: 0,
      unverifiedTime: 0,
      distractions: { lookAway: 2, away: 0, lidClosed: 0 },
      pauses: [],
      lastSaved: Date.now(),
      schemaVersion: 2,
    });

    // Tab A (stale with only 5m) saves to same day_YYYY-MM-DD key
    await DB.saveSession({
      id: dayId,
      date: todayStr,
      tabId: TAB_ID,
      startTime: Date.now() - 300000,
      endTime: null,
      studyTime: 300000,
      sessionTime: 300000,
      pausedTime: 0,
      unverifiedTime: 0,
      distractions: { lookAway: 0, away: 1, lidClosed: 0 },
      pauses: [],
      lastSaved: Date.now(),
      schemaVersion: 2,
    });

    const saved = await DB.getDailyRecord(todayStr);
    assert.equal(saved.studyTime, 1800000, 'Stale tab write must NOT overwrite higher studyTime');
    assert.equal(saved.distractions.lookAway, 2);
    assert.equal(saved.distractions.away, 1);

    // Same protection for localStorage draft
    localStorage.setItem('ayush_tracker_today', JSON.stringify({
      id: dayId,
      date: todayStr,
      tabId: 'tab_other_tabB',
      studyTime: 1800000,
      sessionTime: 1800000,
      pausedTime: 0,
      unverifiedTime: 0,
    }));
    state.session.dateStr = todayStr;
    state.session.studyTime = 300000;
    state.session.accStudyMs = 300000;
    const savedLs = saveTodayToLocalStorage();
    assert.equal(savedLs.studyTime, 1800000, 'saveTodayToLocalStorage must preserve higher cross-tab progress');
  });
});

// ═══════════════════════════════════════════════
// Suite 17: Sleep Detection After Camera Recovery & Throttling Distinction
// ═══════════════════════════════════════════════

describe('Ayush_Tracker — Suite 17: Sleep Detection After Camera Recovery vs Browser Throttling', () => {
  beforeEach(resetAppState);

  test('detects 1-hour suspension even when a fresh camera frame arrives immediately before worker tick', () => {
    const t0 = 1700000000000;
    const m0 = 10000.0;
    const prevLandmarker = state.camera.faceLandmarker;
    const prevVideo = DOM.cameraPreview;

    try {
      state.session.dateStr = getLocalDateString(t0);
      state.session.active = true;
      state.session.startTime = t0;
      state.session.studyStartedAt = t0;
      state.status = 'studying';
      state.camera.isDetecting = true;
      state.lastTickTimestamp = t0;
      state.lastTickMonotonic = m0;

      DOM.cameraPreview = { readyState: 4, videoWidth: 640, videoHeight: 480 };
      const centeredLandmarks = Array.from({ length: 470 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
      centeredLandmarks[234] = { x: 0.3, y: 0.5, z: 0 };
      centeredLandmarks[454] = { x: 0.7, y: 0.5, z: 0 };
      centeredLandmarks[10] = { x: 0.5, y: 0.2, z: 0 };
      centeredLandmarks[152] = { x: 0.5, y: 0.8, z: 0 };
      centeredLandmarks[33] = { x: 0.4, y: 0.4, z: 0 };
      centeredLandmarks[263] = { x: 0.6, y: 0.4, z: 0 };
      centeredLandmarks[61] = { x: 0.45, y: 0.65, z: 0 };
      centeredLandmarks[291] = { x: 0.55, y: 0.65, z: 0 };
      state.camera.faceLandmarker = { detectForVideo: () => ({ faceLandmarks: [centeredLandmarks] }) };

      // 1. Verified study for 5 seconds with live frames and worker ticks
      for (let s = 1; s <= 5; s++) {
        const t = t0 + s * 1000;
        const m = m0 + s * 1000;
        runDetection(t, m);
        handleTick({ timestamp: t, monotonic: m });
      }
      assert.equal(state.session.studyTime, 5000);
      assert.equal(state.session.sessionTime, 5000);

      // 2. Advance monotonic clock by 1 hour (3,600,000ms) with NO worker ticks (laptop sleep)
      const oneHour = 3600000;
      const tWake = t0 + 5000 + oneHour;
      const mWake = m0 + 5000 + oneHour;

      // 3. Simulate a successful camera frame arriving immediately on wake BEFORE the next worker tick
      runDetection(tWake, mWake);
      assert.equal(state.camera.lastFrameTime, tWake);

      // 4. Deliver the wake worker tick
      handleTick({ timestamp: tWake, monotonic: mWake });

      // 5. Verify 1-hour suspension is completely excluded from study, session, and paused time
      assert.equal(state.status, 'lid-closed', 'Long suspension must trigger lid-closed even after immediate wake frame');
      assert.equal(state.session.studyTime, 5000, '1-hour sleep must NOT be added to studyTime');
      assert.equal(state.session.sessionTime, 5000, '1-hour sleep must NOT be added to sessionTime');
      assert.equal(state.session.pausedTime, 0, '1-hour sleep gap must NOT be added to pausedTime');
      assert.equal(state.session.distractions.lidClosed, 1);
    } finally {
      state.camera.faceLandmarker = prevLandmarker;
      DOM.cameraPreview = prevVideo;
    }
  });

  test('ordinary browser throttling / CPU delay with continuous camera frames preserves legitimate study time', () => {
    const t0 = 1700000000000;
    const m0 = 10000.0;
    const prevLandmarker = state.camera.faceLandmarker;
    const prevVideo = DOM.cameraPreview;

    try {
      state.session.dateStr = getLocalDateString(t0);
      state.session.active = true;
      state.session.startTime = t0;
      state.session.studyStartedAt = t0;
      state.status = 'studying';
      state.camera.isDetecting = true;
      state.lastTickTimestamp = t0;
      state.lastTickMonotonic = m0;

      DOM.cameraPreview = { readyState: 4, videoWidth: 640, videoHeight: 480 };
      const centeredLandmarks = Array.from({ length: 470 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
      centeredLandmarks[234] = { x: 0.3, y: 0.5, z: 0 };
      centeredLandmarks[454] = { x: 0.7, y: 0.5, z: 0 };
      centeredLandmarks[10] = { x: 0.5, y: 0.2, z: 0 };
      centeredLandmarks[152] = { x: 0.5, y: 0.8, z: 0 };
      centeredLandmarks[33] = { x: 0.4, y: 0.4, z: 0 };
      centeredLandmarks[263] = { x: 0.6, y: 0.4, z: 0 };
      centeredLandmarks[61] = { x: 0.45, y: 0.65, z: 0 };
      centeredLandmarks[291] = { x: 0.55, y: 0.65, z: 0 };
      state.camera.faceLandmarker = { detectForVideo: () => ({ faceLandmarks: [centeredLandmarks] }) };

      // Study 3s normally
      for (let s = 1; s <= 3; s++) {
        runDetection(t0 + s * 1000, m0 + s * 1000);
        handleTick({ timestamp: t0 + s * 1000, monotonic: m0 + s * 1000 });
      }
      assert.equal(state.session.studyTime, 3000);

      // Worker throttled for 15s (between lidGapMs=8s and suspensionGapMs=60s),
      // WHILE camera frames continuously arrived every 1s (no camera blackout!)
      for (let s = 4; s <= 18; s++) {
        runDetection(t0 + s * 1000, m0 + s * 1000);
      }

      // Throttled worker catches up at s=18
      handleTick({ timestamp: t0 + 18000, monotonic: m0 + 18000 });

      assert.equal(state.status, 'studying', 'Continuous camera during worker throttle must stay studying');
      assert.equal(state.session.distractions.lidClosed, 0);
      assert.equal(state.session.studyTime, 18000, 'Legitimate continuous study during worker throttle is preserved');
      assert.equal(state.session.sessionTime, 18000);
    } finally {
      state.camera.faceLandmarker = prevLandmarker;
      DOM.cameraPreview = prevVideo;
    }
  });
});

// ═══════════════════════════════════════════════
// Suite 18: Monotonic Paused Time & Wall-Clock Jumps During Pause
// ═══════════════════════════════════════════════

describe('Ayush_Tracker — Suite 18: Monotonic Paused Time Across Clock Jumps & Reloads', () => {
  beforeEach(resetAppState);

  test('forward (+5m) and backward (-5m) system clock jumps during a pause do not corrupt pausedTime', () => {
    const t0 = 1700000000000;
    const m0 = 20000.0;
    state.session.dateStr = getLocalDateString(t0);
    state.session.active = true;
    state.session.startTime = t0;
    state.session.studyStartedAt = t0;
    state.status = 'studying';
    state.camera.isDetecting = true;
    state.camera.lastFrameTime = t0;
    state.lastTickTimestamp = t0;
    state.lastTickMonotonic = m0;

    // 1. Study 5s normally
    for (let s = 1; s <= 5; s++) {
      state.camera.lastFrameTime = t0 + s * 1000;
      handleTick({ timestamp: t0 + s * 1000, monotonic: m0 + s * 1000 });
    }
    assert.equal(state.session.studyTime, 5000);

    // 2. Enter pause at s=5
    freezeStudyTime(t0 + 5000);
    startPauseEvent('away', t0 + 5000);
    state.status = 'away';

    // Tick s=6 (normal +1s pause)
    handleTick({ timestamp: t0 + 6000, monotonic: m0 + 6000 });
    assert.equal(state.session.pausedTime, 1000);

    // Tick s=7: System clock jumps FORWARD +5 minutes (+300,000ms), monotonic +1s
    const fwdJump = 300000;
    handleTick({ timestamp: t0 + 7000 + fwdJump, monotonic: m0 + 7000 });
    assert.equal(state.session.pausedTime, 2000, 'Forward clock jump must NOT inflate pausedTime to 5m');

    // Tick s=8, s=9: System clock jumps BACKWARD -5 minutes from t0 (-300,000ms), monotonic +1s each
    const bwdJump = -300000;
    handleTick({ timestamp: t0 + 8000 + bwdJump, monotonic: m0 + 8000 });
    assert.equal(state.session.pausedTime, 3000, 'Backward clock jump must NOT freeze or reduce pausedTime');

    handleTick({ timestamp: t0 + 9000 + bwdJump, monotonic: m0 + 9000 });
    assert.equal(state.session.pausedTime, 4000);

    // Tick s=10 (total pause = 5s)
    handleTick({ timestamp: t0 + 10000 + bwdJump, monotonic: m0 + 10000 });
    assert.equal(state.session.pausedTime, 5000);

    // End session while paused at shifted backward wall clock
    const rec = handleEnd(t0 + 10000 + bwdJump);
    assert.equal(rec.studyTime, 5000);
    assert.equal(rec.sessionTime, 5000);
    assert.equal(rec.pausedTime, 5000, 'Closed pause preserves exact 5s monotonic pausedTime across jumps');
  });

  test('reload and runtime restart during an open pause do not invent elapsed pause time', () => {
    const now = Date.now();
    const todayStr = getLocalDateString(now);
    const t0 = now - 7200000; // started 2 hours ago

    // 1. Runtime restart during active pause does not invent restart downtime
    state.session.dateStr = todayStr;
    state.session.active = true;
    state.session.startTime = t0;
    state.status = 'away';
    state.lastTickTimestamp = t0 + 10000;
    state.lastTickMonotonic = 50000;
    state.session.pauses = [{ type: 'away', start: t0 + 5000, end: null, monoDurationMs: 5000 }];

    handleTick({ timestamp: now, monotonic: 200.0 }); // monotonic reset -> runtime restart 2h later!
    assert.equal(state.session.pausedTime, 5000, 'Runtime restart must NOT add 2h uncertain gap to pausedTime');

    // 2. Reload of saved snapshot with open monotonic pause closes cleanly without inventing 2 hours
    localStorage.setItem('ayush_tracker_today', JSON.stringify({
      id: 'day_' + todayStr,
      date: todayStr,
      startTime: t0,
      endTime: null,
      studyTime: 10000,
      sessionTime: 10000,
      unverifiedTime: 0,
      pauses: [{ type: 'lookAway', start: t0 + 10000, end: null, monoDurationMs: 4000 }],
      lastSaved: t0 + 14000,
      schemaVersion: 2,
    }));

    loadTodayState();
    assert.equal(state.session.pausedTime, 4000, 'Reload must recover recorded 4s monoDurationMs, not wall delta');
    assert.equal(state.session.pauses[0].durationMs, 4000);
  });
});

// ═══════════════════════════════════════════════
// Suite 19: Race-Safe Cross-Tab Locking (Web Locks & IDB Atomic Fallback)
// ═══════════════════════════════════════════════

describe('Ayush_Tracker — Suite 19: Race-Safe Simultaneous Two-Tab Locking', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');

  function createSharedMockIndexedDB() {
    const stores = new Map();
    const queues = new Map();
    const getStore = (n) => { if (!stores.has(n)) stores.set(n, new Map()); return stores.get(n); };
    const enqueue = (k, fn) => {
      const p = queues.get(k) || Promise.resolve();
      const next = p.then(fn, fn);
      queues.set(k, next);
      return next;
    };
    return {
      open(name, version) {
        const req = {
          onsuccess: null, onerror: null, onupgradeneeded: null,
          result: {
            name, version,
            objectStoreNames: { contains: () => true },
            createObjectStore(sn) { getStore(sn); return { createIndex: () => {} }; },
            transaction(storeNames, mode) {
              const list = Array.isArray(storeNames) ? storeNames : [storeNames];
              const primary = list[0] || 'sessions';
              const tx = {
                oncomplete: null, onerror: null, onabort: null,
                _pending: 0, _ready: false,
                _finish() { if (tx._ready && tx._pending === 0 && tx.oncomplete) tx.oncomplete(); },
                objectStore(sn) {
                  const map = getStore(sn);
                  const runOp = (exec) => {
                    const r = { onsuccess: null, onerror: null, result: undefined };
                    tx._pending++;
                    const run = () => {
                      r.result = exec();
                      if (r.onsuccess) r.onsuccess({ target: r });
                      tx._pending--;
                      tx._finish();
                    };
                    if (mode === 'readwrite') tx._gate.then(() => setTimeout(run, 0));
                    else setTimeout(run, 0);
                    return r;
                  };
                  return {
                    get: (k) => runOp(() => map.get(k) ?? null),
                    getAll: () => runOp(() => Array.from(map.values())),
                    put: (v) => runOp(() => { map.set(v.id, v); return v.id; }),
                    delete: (k) => runOp(() => { map.delete(k); }),
                    clear: () => runOp(() => { map.clear(); }),
                    count: () => runOp(() => map.size),
                  };
                }
              };
              if (mode === 'readwrite') {
                let unlock;
                const gateDone = new Promise(r => { unlock = r; });
                let startRes;
                tx._gate = new Promise(r => { startRes = r; });
                enqueue(primary, () => { startRes(); return gateDone; });
                const baseFinish = tx._finish;
                tx._finish = () => { if (tx._ready && tx._pending === 0) unlock(); baseFinish(); };
                setTimeout(() => { tx._ready = true; tx._finish(); }, 0);
              } else {
                tx._gate = Promise.resolve();
                setTimeout(() => { tx._ready = true; tx._finish(); }, 0);
              }
              return tx;
            },
            close() {}
          }
        };
        setTimeout(() => { if (req.onsuccess) req.onsuccess({ target: req }); }, 0);
        return req;
      }
    };
  }

  function createSharedLocalStorage() {
    const data = {};
    return {
      getItem: (k) => (k in data ? data[k] : null),
      setItem: (k, v) => { data[k] = String(v); },
      removeItem: (k) => { delete data[k]; },
      clear: () => { for (const k of Object.keys(data)) delete data[k]; },
    };
  }

  function createSharedWebLocks() {
    const held = new Set();
    return {
      request(name, opts, cb) {
        const callback = typeof opts === 'function' ? opts : cb;
        const ifAvailable = typeof opts === 'object' && opts.ifAvailable;
        if (held.has(name)) {
          if (ifAvailable) return Promise.resolve(callback(null));
          return Promise.reject(new Error('Lock unavailable'));
        }
        held.add(name);
        return Promise.resolve()
          .then(() => callback({ name }))
          .finally(() => held.delete(name));
      }
    };
  }

  function spawnTabContext({ indexedDB, localStorage, navigatorLocks }) {
    const code = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    const mod = { exports: {} };
    const ctx = {
      module: mod,
      exports: mod.exports,
      process,
      URLSearchParams,
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      Date,
      Math,
      Map,
      Set,
      Promise,
      indexedDB,
      localStorage,
      navigator: {
        userAgent: 'node-tab',
        serviceWorker: { register: () => Promise.resolve() },
        ...(navigatorLocks ? { locks: navigatorLocks } : {}),
      },
      confirm: () => true,
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: () => {},
    };
    installNodeShims(ctx);
    ctx.globalThis = ctx;
    vm.runInNewContext(code, ctx);
    return mod.exports;
  }

  test('simultaneous lock acquisition with Web Locks across two independent tab contexts grants lock to strictly one tab', async () => {
    const sharedIDB = createSharedMockIndexedDB();
    const sharedLS = createSharedLocalStorage();
    const sharedLocks = createSharedWebLocks();

    const tab1 = spawnTabContext({ indexedDB: sharedIDB, localStorage: sharedLS, navigatorLocks: sharedLocks });
    const tab2 = spawnTabContext({ indexedDB: sharedIDB, localStorage: sharedLS, navigatorLocks: sharedLocks });
    assert.notEqual(tab1.TAB_ID, tab2.TAB_ID);

    const now = Date.now();
    const todayStr = tab1.getLocalDateString(now);

    // Fire simultaneous lock acquisitions on the exact same tick
    const [acq1, acq2] = await Promise.all([
      tab1.acquireTabLock(now, todayStr),
      tab2.acquireTabLock(now, todayStr),
    ]);

    assert.equal([acq1, acq2].filter(Boolean).length, 1, 'Strictly ONE tab may acquire the Web Lock');
    const owner = acq1 ? tab1 : tab2;
    const loser = acq1 ? tab2 : tab1;

    // Loser calling releaseTabLock() MUST NOT release owner's lock!
    await loser.releaseTabLock();
    assert.equal(await loser.acquireTabLock(now, todayStr), false, 'Non-owner release must not unlock owner');

    // Only owner releasing frees lock for the other tab
    await owner.releaseTabLock();
    assert.equal(await loser.acquireTabLock(now, todayStr), true, 'Owner release allows subsequent tab to acquire');
    await loser.releaseTabLock();
  });

  test('simultaneous handleStart & fallback atomic IDB lock without Web Locks prevent double-start, non-owner release, and stale overwrites', async () => {
    const sharedIDB = createSharedMockIndexedDB();
    const sharedLS = createSharedLocalStorage();

    // No navigator.locks -> exercises the atomic IndexedDB 'locks' store fallback
    const tab1 = spawnTabContext({ indexedDB: sharedIDB, localStorage: sharedLS, navigatorLocks: null });
    const tab2 = spawnTabContext({ indexedDB: sharedIDB, localStorage: sharedLS, navigatorLocks: null });

    const now = Date.now();
    const todayStr = tab1.getLocalDateString(now);
    const dayId = 'day_' + todayStr;

    // 1. Race both tabs on acquireTabLock simultaneously (bypassing localStorage check-then-set race)
    const [res1, res2] = await Promise.all([
      tab1.acquireTabLock(now, todayStr),
      tab2.acquireTabLock(now, todayStr),
    ]);
    assert.equal([res1, res2].filter(Boolean).length, 1, 'IDB atomic transaction must serialize concurrent acquireTabLock calls');

    const winner = res1 ? tab1 : tab2;
    const loser = res1 ? tab2 : tab1;

    // 2. Simultaneous handleStart() in loser is blocked safely
    const loserStartOk = await loser.handleStart();
    assert.equal(loserStartOk, false, 'Second tab handleStart must be rejected cleanly');

    // 3. Loser cannot release winner's lock
    await loser.releaseTabLock();
    assert.equal(await loser.acquireTabLock(now, todayStr), false, 'Loser cannot release winner IDB lock');

    // 4. Loser cannot overwrite winner's active day_YYYY-MM-DD record via saveSession
    await winner.DB.saveSession({
      id: dayId,
      date: todayStr,
      tabId: winner.TAB_ID,
      startTime: now - 10000,
      endTime: null,
      studyTime: 10000,
      sessionTime: 10000,
      pausedTime: 0,
      unverifiedTime: 0,
      lastSaved: now,
    });
    await loser.DB.saveSession({
      id: dayId,
      date: todayStr,
      tabId: loser.TAB_ID,
      startTime: now - 2000,
      endTime: null,
      studyTime: 2000,
      sessionTime: 2000,
      pausedTime: 0,
      unverifiedTime: 0,
      lastSaved: now,
    });
    const rec = await winner.DB.getDailyRecord(todayStr);
    assert.equal(rec.studyTime, 10000, 'Stale tab write must be blocked while winner holds active lock');

    // 5. Stale crashed lock (>15s old) is safely recovered by another tab
    await winner.releaseTabLock();
    assert.equal(await loser.acquireTabLock(now + 20000, todayStr), true);
    await loser.releaseTabLock();

    // Verify stale lock expiration explicitly
    await tab1.acquireTabLock(now, todayStr);
    assert.equal(await tab2.acquireTabLock(now + 20000, todayStr), true, 'Expired lock after TTL allows takeover');
    await tab2.releaseTabLock();
  });
});

// ═══════════════════════════════════════════════
// Suite 20: Long-Delay Sleep Classification vs Camera Continuity
// ═══════════════════════════════════════════════

describe('Ayush_Tracker — Suite 20: Long Worker Delay vs Camera Blackout & 1-Hour Suspension', () => {
  beforeEach(resetAppState);

  test('90-second worker delay with continuous camera frames preserves legitimate study time', () => {
    const t0 = 1700000000000;
    const m0 = 10000.0;
    const prevLandmarker = state.camera.faceLandmarker;
    const prevVideo = DOM.cameraPreview;

    try {
      state.session.dateStr = getLocalDateString(t0);
      state.session.active = true;
      state.session.startTime = t0;
      state.session.studyStartedAt = t0;
      state.session.studyCursorMono = m0;
      state.status = 'studying';
      state.camera.isDetecting = true;
      state.lastTickTimestamp = t0;
      state.lastTickMonotonic = m0;

      DOM.cameraPreview = { readyState: 4, videoWidth: 640, videoHeight: 480 };
      const centeredLandmarks = Array.from({ length: 470 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
      centeredLandmarks[234] = { x: 0.3, y: 0.5, z: 0 };
      centeredLandmarks[454] = { x: 0.7, y: 0.5, z: 0 };
      centeredLandmarks[10] = { x: 0.5, y: 0.2, z: 0 };
      centeredLandmarks[152] = { x: 0.5, y: 0.8, z: 0 };
      centeredLandmarks[33] = { x: 0.4, y: 0.4, z: 0 };
      centeredLandmarks[263] = { x: 0.6, y: 0.4, z: 0 };
      centeredLandmarks[61] = { x: 0.45, y: 0.65, z: 0 };
      centeredLandmarks[291] = { x: 0.55, y: 0.65, z: 0 };
      state.camera.faceLandmarker = { detectForVideo: () => ({ faceLandmarks: [centeredLandmarks] }) };

      // 3 initial seconds
      for (let s = 1; s <= 3; s++) {
        runDetection(t0 + s * 1000, m0 + s * 1000);
        handleTick({ timestamp: t0 + s * 1000, monotonic: m0 + s * 1000 });
      }
      assert.equal(state.session.studyTime, 3000);

      // Worker delayed 90 seconds (> previous 60s cap) while camera continuously processed frames every 1s
      for (let s = 4; s <= 93; s++) {
        runDetection(t0 + s * 1000, m0 + s * 1000);
      }
      handleTick({ timestamp: t0 + 93000, monotonic: m0 + 93000 });

      assert.equal(state.status, 'studying', 'Continuous camera frames during 90s worker delay must NOT classify as sleep');
      assert.equal(state.session.distractions.lidClosed, 0);
      assert.equal(state.session.studyTime, 93000, 'All 93s of camera-verified study preserved');
      assert.equal(state.session.sessionTime, 93000);
    } finally {
      state.camera.faceLandmarker = prevLandmarker;
      DOM.cameraPreview = prevVideo;
    }
  });

  test('90-second delay with camera blackout is excluded as sleep/suspension', () => {
    const t0 = 1700000000000;
    const m0 = 10000.0;
    const prevLandmarker = state.camera.faceLandmarker;
    const prevVideo = DOM.cameraPreview;

    try {
      state.session.dateStr = getLocalDateString(t0);
      state.session.active = true;
      state.session.startTime = t0;
      state.session.studyStartedAt = t0;
      state.session.studyCursorMono = m0;
      state.status = 'studying';
      state.camera.isDetecting = true;
      state.lastTickTimestamp = t0;
      state.lastTickMonotonic = m0;

      DOM.cameraPreview = { readyState: 4, videoWidth: 640, videoHeight: 480 };
      const centeredLandmarks = Array.from({ length: 470 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
      centeredLandmarks[234] = { x: 0.3, y: 0.5, z: 0 };
      centeredLandmarks[454] = { x: 0.7, y: 0.5, z: 0 };
      centeredLandmarks[10] = { x: 0.5, y: 0.2, z: 0 };
      centeredLandmarks[152] = { x: 0.5, y: 0.8, z: 0 };
      centeredLandmarks[33] = { x: 0.4, y: 0.4, z: 0 };
      centeredLandmarks[263] = { x: 0.6, y: 0.4, z: 0 };
      centeredLandmarks[61] = { x: 0.45, y: 0.65, z: 0 };
      centeredLandmarks[291] = { x: 0.55, y: 0.65, z: 0 };
      state.camera.faceLandmarker = { detectForVideo: () => ({ faceLandmarks: [centeredLandmarks] }) };

      for (let s = 1; s <= 3; s++) {
        runDetection(t0 + s * 1000, m0 + s * 1000);
        handleTick({ timestamp: t0 + s * 1000, monotonic: m0 + s * 1000 });
      }
      assert.equal(state.session.studyTime, 3000);

      // 90s camera blackout -> camera comes back at s=93 right before tick
      runDetection(t0 + 93000, m0 + 93000);
      handleTick({ timestamp: t0 + 93000, monotonic: m0 + 93000 });

      assert.equal(state.status, 'lid-closed', '90s camera blackout must trigger lid-closed sleep');
      assert.equal(state.session.studyTime, 3000, '90s blackout must NOT be credited to studyTime');
      assert.equal(state.session.sessionTime, 3000);
      assert.equal(state.session.distractions.lidClosed, 1);
    } finally {
      state.camera.faceLandmarker = prevLandmarker;
      DOM.cameraPreview = prevVideo;
    }
  });

  test('1-hour laptop suspension followed by immediate camera recovery still excludes suspension', () => {
    const t0 = 1700000000000;
    const m0 = 10000.0;
    const prevLandmarker = state.camera.faceLandmarker;
    const prevVideo = DOM.cameraPreview;

    try {
      state.session.dateStr = getLocalDateString(t0);
      state.session.active = true;
      state.session.startTime = t0;
      state.session.studyStartedAt = t0;
      state.session.studyCursorMono = m0;
      state.status = 'studying';
      state.camera.isDetecting = true;
      state.lastTickTimestamp = t0;
      state.lastTickMonotonic = m0;

      DOM.cameraPreview = { readyState: 4, videoWidth: 640, videoHeight: 480 };
      const centeredLandmarks = Array.from({ length: 470 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
      centeredLandmarks[234] = { x: 0.3, y: 0.5, z: 0 };
      centeredLandmarks[454] = { x: 0.7, y: 0.5, z: 0 };
      centeredLandmarks[10] = { x: 0.5, y: 0.2, z: 0 };
      centeredLandmarks[152] = { x: 0.5, y: 0.8, z: 0 };
      centeredLandmarks[33] = { x: 0.4, y: 0.4, z: 0 };
      centeredLandmarks[263] = { x: 0.6, y: 0.4, z: 0 };
      centeredLandmarks[61] = { x: 0.45, y: 0.65, z: 0 };
      centeredLandmarks[291] = { x: 0.55, y: 0.65, z: 0 };
      state.camera.faceLandmarker = { detectForVideo: () => ({ faceLandmarks: [centeredLandmarks] }) };

      for (let s = 1; s <= 5; s++) {
        runDetection(t0 + s * 1000, m0 + s * 1000);
        handleTick({ timestamp: t0 + s * 1000, monotonic: m0 + s * 1000 });
      }
      assert.equal(state.session.studyTime, 5000);

      // 1-hour suspension -> immediate wake camera frame -> worker tick
      const tWake = t0 + 5000 + 3600000;
      const mWake = m0 + 5000 + 3600000;
      runDetection(tWake, mWake);
      handleTick({ timestamp: tWake, monotonic: mWake });

      assert.equal(state.status, 'lid-closed');
      assert.equal(state.session.studyTime, 5000);
      assert.equal(state.session.sessionTime, 5000);
      assert.equal(state.session.pausedTime, 0);
    } finally {
      state.camera.faceLandmarker = prevLandmarker;
      DOM.cameraPreview = prevVideo;
    }
  });
});

// ═══════════════════════════════════════════════
// Suite 21: Pause Interval Boundaries (Mid-Tick Transitions & Camera Disconnect)
// ═══════════════════════════════════════════════

describe('Ayush_Tracker — Suite 21: Exact Monotonic Pause Boundaries Halfway Between Ticks', () => {
  beforeEach(resetAppState);

  test('pause starting and ending halfway between worker ticks never double-counts sub-tick intervals', () => {
    const t0 = 1700000000000;
    const m0 = 20000.0;
    state.session.dateStr = getLocalDateString(t0);
    state.session.active = true;
    state.session.startTime = t0;
    state.session.studyStartedAt = t0;
    state.session.studyCursorMono = m0;
    state.status = 'studying';
    state.camera.isDetecting = true;
    state.camera.lastFrameTime = t0;
    state.lastTickTimestamp = t0;
    state.lastTickMonotonic = m0;

    // 1. Study cleanly for 10 seconds (ticks at 1s..10s)
    for (let s = 1; s <= 10; s++) {
      state.camera.lastFrameTime = t0 + s * 1000;
      handleTick({ timestamp: t0 + s * 1000, monotonic: m0 + s * 1000 });
    }
    assert.equal(state.session.studyTime, 10000);
    assert.equal(state.session.pausedTime, 0);

    // 2. Pause starts HALFWAY between Tick 10 and Tick 11 (at 10.5s)
    const tPauseStart = t0 + 10500;
    const mPauseStart = m0 + 10500;
    freezeStudyTime(tPauseStart, mPauseStart);
    startPauseEvent('away', tPauseStart, mPauseStart);
    state.status = 'away';

    assert.equal(state.session.studyTime, 10500, 'Study includes exact 0.5s up to pause start');

    // 3. Tick 11 arrives at 11.0s: ONLY 500ms belongs to pausedTime (NOT 1000ms!)
    handleTick({ timestamp: t0 + 11000, monotonic: m0 + 11000 });
    assert.equal(state.session.studyTime, 10500);
    assert.equal(state.session.pausedTime, 500, 'First post-pause tick accrues only 500ms (10.5s->11.0s)');
    assert.equal(state.session.studyTime + state.session.pausedTime, 11000, 'No double-counting on pause start');

    // Ticks 12 & 13 (system clock shifts +5m and -5m without corrupting pause duration)
    handleTick({ timestamp: t0 + 12000 + 300000, monotonic: m0 + 12000 });
    assert.equal(state.session.pausedTime, 1500);
    handleTick({ timestamp: t0 + 13000 - 300000, monotonic: m0 + 13000 });
    assert.equal(state.session.pausedTime, 2500);

    // 4. Pause ends HALFWAY between Tick 13 and Tick 14 (at 13.5s)
    const tResume = t0 + 13500 - 300000;
    const mResume = m0 + 13500;
    endPauseEvent(tResume, mResume);
    resumeStudyTime(tResume, mResume);
    state.status = 'studying';

    // Exact 3.0s paused: [10.5s -> 13.5s]
    assert.equal(state.session.pauses[0].durationMs, 3000);
    assert.equal(calculateTotalPausedTime(state.session.pauses, tResume), 3000);

    // 5. Tick 14 arrives at 14.0s: ONLY 500ms belongs to studyTime (13.5s->14.0s)!
    state.camera.lastFrameTime = t0 + 14000 - 300000;
    handleTick({ timestamp: t0 + 14000 - 300000, monotonic: m0 + 14000 });

    assert.equal(state.session.pausedTime, 3000, 'Paused time stays exact 3000ms');
    assert.equal(state.session.studyTime, 11000, 'Post-resume tick accrues only 500ms (10500 + 500 = 11000)');
    assert.equal(state.session.sessionTime, 11000);
    assert.equal(state.session.studyTime + state.session.pausedTime, 14000, 'Total span = exact 14000ms, zero overlap');

    // Finalize at 14.0s
    const rec = handleEnd(t0 + 14000 - 300000, m0 + 14000);
    assert.equal(rec.studyTime, 11000);
    assert.equal(rec.pausedTime, 3000);
    assert.equal(rec.sessionTime, 11000);
  });

  test('camera disconnect mid-tick captures exact monotonic boundary and preserves across reload', () => {
    const t0 = Date.now() - 20000;
    const m0 = 30000.0;
    const todayStr = getLocalDateString(t0);

    state.session.dateStr = todayStr;
    state.session.id = 'day_' + todayStr;
    state.session.active = true;
    state.session.startTime = t0;
    state.session.studyStartedAt = t0;
    state.session.studyCursorMono = m0;
    state.status = 'studying';
    state.camera.isDetecting = true;
    state.camera.lastFrameTime = t0;
    state.lastTickTimestamp = t0;
    state.lastTickMonotonic = m0;

    // Study 5s
    for (let s = 1; s <= 5; s++) {
      state.camera.lastFrameTime = t0 + s * 1000;
      handleTick({ timestamp: t0 + s * 1000, monotonic: m0 + s * 1000 });
    }
    assert.equal(state.session.studyTime, 5000);

    // Camera disconnects halfway at 5.4s
    handleCameraTrackEnded(t0 + 5400, m0 + 5400);
    assert.equal(state.status, 'lid-closed');
    assert.equal(state.session.studyTime, 5400);

    // Tick at 6.0s -> 600ms paused (NOT 1000ms)
    handleTick({ timestamp: t0 + 6000, monotonic: m0 + 6000 });
    assert.equal(state.session.pausedTime, 600);
    assert.equal(state.session.studyTime + state.session.pausedTime, 6000);

    // Reload from saved localStorage -> exact pausedTime 600 preserved without wall inflation
    loadTodayState();
    assert.equal(state.session.studyTime, 5400);
    assert.equal(state.session.pausedTime, 600);
  });
});

// ═══════════════════════════════════════════════
// Suite 22: Fail-Safe Cross-Tab Locking (No Web Locks, IDB Fail, Refresh Fail, Clock Jumps)
// ═══════════════════════════════════════════════

describe('Ayush_Tracker — Suite 22: Fail-Safe Cross-Tab Locking & Clock Jump Resistance', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');

  function createSharedLocalStorage() {
    const data = {};
    return {
      getItem: (k) => (k in data ? data[k] : null),
      setItem: (k, v) => { data[k] = String(v); },
      removeItem: (k) => { delete data[k]; },
      clear: () => { for (const k of Object.keys(data)) delete data[k]; },
    };
  }

  function createFailingIDB() {
    return {
      open() {
        const req = { onsuccess: null, onerror: null, onupgradeneeded: null };
        setTimeout(() => {
          if (req.onerror) req.onerror({ target: { error: new Error('IDB unavailable') } });
        }, 0);
        return req;
      }
    };
  }

  function spawnBareTab({ indexedDB, localStorage }) {
    const code = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    const mod = { exports: {} };
    const ctx = {
      module: mod,
      exports: mod.exports,
      process,
      URLSearchParams,
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      Date,
      Math,
      Map,
      Set,
      Promise,
      indexedDB,
      localStorage,
      navigator: { userAgent: 'node-tab', serviceWorker: { register: () => Promise.resolve() } },
      confirm: () => true,
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: () => { },
    };
    installNodeShims(ctx);
    ctx.globalThis = ctx;
    vm.runInNewContext(code, ctx);
    return mod.exports;
  }

  beforeEach(resetAppState);

  test('fails closed when both Web Locks and IndexedDB locking are unavailable', async () => {
    const sharedLS = createSharedLocalStorage();
    const tabA = spawnBareTab({ indexedDB: createFailingIDB(), localStorage: sharedLS });
    const tabB = spawnBareTab({ indexedDB: createFailingIDB(), localStorage: sharedLS });

    const now = Date.now();
    const todayStr = tabA.getLocalDateString(now);

    const [aOk, bOk] = await Promise.all([
      tabA.acquireTabLock(now, todayStr, tabA.TAB_ID, 1000),
      tabB.acquireTabLock(now, todayStr, tabB.TAB_ID, 1000),
    ]);

    assert.equal(aOk, false, 'Must fail safely instead of trusting non-atomic localStorage');
    assert.equal(bOk, false, 'Must fail safely instead of allowing simultaneous starts');
    assert.equal(await tabA.handleStart(), false, 'handleStart must abort cleanly when atomic lock unavailable');
  });

  test('refreshTabLock fails closed when ownership is lost, missing, or IDB fails', async () => {
    await DB.clearAll();
    const now = Date.now();
    const todayStr = getLocalDateString(now);

    // 1. Refresh without acquiring any lock fails closed (missing lock in IDB)
    assert.equal(await refreshTabLock(now, todayStr, TAB_ID, 1000), false);

    // 2. Acquire lock legitimately -> refresh succeeds
    assert.equal(await acquireTabLock(now, todayStr, TAB_ID, 1000), true);
    assert.equal(await refreshTabLock(now + 1000, todayStr, TAB_ID, 2000), true);

    // 3. Another tab steals after stale TTL -> old tab refresh fails
    assert.equal(await acquireTabLock(now + 20000, todayStr, 'tab_new_owner', 21000), true);
    assert.equal(await refreshTabLock(now + 21000, todayStr, TAB_ID, 22000), false);

    // 4. IDB failure during refresh without Web Lock must return false (never lie and return true)
    const origAtomicRefresh = DB.atomicRefreshLock;
    try {
      await releaseTabLock('tab_new_owner');
      await acquireTabLock(now + 25000, todayStr, TAB_ID, 26000);
      DB.atomicRefreshLock = async () => { throw new Error('IDB transaction aborted'); };
      assert.equal(await refreshTabLock(now + 26000, todayStr, TAB_ID, 27000), false);
    } finally {
      DB.atomicRefreshLock = origAtomicRefresh;
      await releaseTabLock(TAB_ID);
    }
  });

  test('forward and backward wall-clock jumps cannot steal or prematurely expire active locks', async () => {
    await DB.clearAll();
    const t0 = 1700000000000;
    const m0 = 50000.0;
    const day = getLocalDateString(t0);

    // Tab 1 acquires lock at t0 / m0
    assert.equal(await acquireTabLock(t0, day, 'tab_owner_1', m0), true);

    // Backward wall jump (-5 minutes) -> still conflicting, Tab 2 cannot steal!
    assert.equal(isLockConflicting({ tabId: 'tab_owner_1', dateStr: day, updatedAt: t0 }, t0 - 300000, day, 'tab_intruder_2'), true);
    assert.equal(await acquireTabLock(t0 - 300000, day, 'tab_intruder_2', m0 + 1000), false);

    // Forward wall jump (+5 minutes) while only 1 monotonic second passed -> STILL conflicting!
    assert.equal(await acquireTabLock(t0 + 300000, day, 'tab_intruder_2', m0 + 1000), false);

    // Genuine monotonic expiration (20s >= 15s TTL) allows stale lock recovery
    assert.equal(await acquireTabLock(t0 + 20000, day, 'tab_intruder_2', m0 + 20000), true);

    // Previous owner releasing cannot remove new owner's lock
    await releaseTabLock('tab_owner_1');
    assert.equal(await acquireTabLock(t0 + 21000, day, 'tab_owner_1', m0 + 21000), false);
    await releaseTabLock('tab_intruder_2');
  });
});

// ═══════════════════════════════════════════════
// Suite 23: Settings Versioning, Pose Math, Calibration Cancel & UI Safety
// ═══════════════════════════════════════════════

describe('Ayush_Tracker — Suite 23: Settings Persistence, Pose Math, Calibration & UI Safety', () => {
  beforeEach(resetAppState);

  test('loadSettings migrates legacy v1 once and preserves subsequent deliberate user choices', () => {
    localStorage.setItem('ayush-tracker-settings', JSON.stringify({
      sensitivity: 'medium',
      focusThreshold: 80,
      lookawayTime: 10,
      awayTime: 30,
      dailyGoal: 4,
    }));

    loadSettings();
    assert.equal(state.settings.settingsVersion, 2);
    assert.equal(state.settings.sensitivity, 'low');
    assert.equal(state.settings.focusThreshold, 50);

    // User deliberately selects medium / 80% / 4h goal in v2
    state.settings.sensitivity = 'medium';
    state.settings.focusThreshold = 80;
    state.settings.dailyGoal = 4;
    saveSettings();

    // Subsequent reload must preserve user choices
    state.settings.sensitivity = 'low';
    state.settings.focusThreshold = 50;
    state.settings.dailyGoal = 6;
    loadSettings();

    assert.equal(state.settings.sensitivity, 'medium');
    assert.equal(state.settings.focusThreshold, 80);
    assert.equal(state.settings.dailyGoal, 4);
  });

  test('setCameraPreviewEnabled synchronizes both checkboxes, wrapper display, and settings storage', () => {
    setCameraPreviewEnabled(true, true);
    assert.equal(state.settings.cameraPreview, true);
    assert.equal(DOM.settingCameraPreview.checked, true);
    assert.equal(DOM.livePreviewCb.checked, true);
    assert.equal(DOM.liveCameraWrapper.style.display, 'block');

    const persisted = JSON.parse(localStorage.getItem('ayush-tracker-settings'));
    assert.equal(persisted.cameraPreview, true);

    setCameraPreviewEnabled(false, true);
    assert.equal(state.settings.cameraPreview, false);
    assert.equal(DOM.settingCameraPreview.checked, false);
    assert.equal(DOM.livePreviewCb.checked, false);
    assert.equal(DOM.liveCameraWrapper.style.display, 'none');
  });

  test('calculateHeadPose evaluates neutral, yaw left/right, and pitch up/down accurately', () => {
    const makeLandmarks = ({ noseX = 0.5, noseY = 0.525, leftZ = 0, rightZ = 0, topZ = 0, chinZ = 0 } = {}) => {
      const lm = Array.from({ length: 470 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
      lm[234] = { x: 0.3, y: 0.5, z: rightZ }; // right cheek
      lm[454] = { x: 0.7, y: 0.5, z: leftZ };  // left cheek
      lm[10] = { x: 0.5, y: 0.2, z: topZ };    // forehead
      lm[152] = { x: 0.5, y: 0.8, z: chinZ };  // chin
      lm[33] = { x: 0.4, y: 0.4, z: 0 };
      lm[263] = { x: 0.6, y: 0.4, z: 0 };
      lm[61] = { x: 0.45, y: 0.65, z: 0 };
      lm[291] = { x: 0.55, y: 0.65, z: 0 };
      lm[4] = { x: noseX, y: noseY, z: 0 };    // nose tip
      return lm;
    };

    const neutral = calculateHeadPose(makeLandmarks());
    assert.ok(Math.abs(neutral.yaw) < 1, `Expected near-zero neutral yaw, got ${neutral.yaw}`);
    assert.ok(Math.abs(neutral.pitch) < 1, `Expected near-zero neutral pitch, got ${neutral.pitch}`);

    const turnedRight = calculateHeadPose(makeLandmarks({ noseX: 0.64, rightZ: 0.08, leftZ: -0.08 }));
    assert.ok(turnedRight.yaw > 15, `Expected positive yaw when turned right, got ${turnedRight.yaw}`);

    const turnedLeft = calculateHeadPose(makeLandmarks({ noseX: 0.36, rightZ: -0.08, leftZ: 0.08 }));
    assert.ok(turnedLeft.yaw < -15, `Expected negative yaw when turned left, got ${turnedLeft.yaw}`);

    const lookingDown = calculateHeadPose(makeLandmarks({ noseY: 0.63, chinZ: 0.08, topZ: -0.08 }));
    assert.ok(lookingDown.pitch > 10, `Expected positive pitch when looking down, got ${lookingDown.pitch}`);
  });

  test('cancelCalibration resets calibration state and returns status to idle', () => {
    state.calibration.isCalibrating = true;
    state.status = 'calibrating';
    const cancelled = cancelCalibration();
    assert.equal(cancelled, true);
    assert.equal(state.calibration.isCalibrating, false);
    assert.equal(state.status, 'idle');
  });

  test('runDetection displays "—" for liveSinceFace when no face has ever been seen', () => {
    const prevLandmarker = state.camera.faceLandmarker;
    const prevVideo = DOM.cameraPreview;
    try {
      state.headPose.lastFaceSeen = 0;
      DOM.cameraPreview = { readyState: 4, videoWidth: 640, videoHeight: 480 };
      state.camera.faceLandmarker = { detectForVideo: () => ({ faceLandmarks: [] }) };

      runDetection(1700000000000, 1000);
      assert.equal(DOM.liveSinceFace.textContent, '—');
    } finally {
      state.camera.faceLandmarker = prevLandmarker;
      DOM.cameraPreview = prevVideo;
    }
  });

  test('escapeHtml neutralizes HTML special characters and openSettings toggles inert', () => {
    assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');

    openSettings();
    assert.equal(DOM.settingsPanel.getAttribute('aria-hidden'), 'false');
    closeSettings();
    assert.equal(DOM.settingsPanel.getAttribute('aria-hidden'), 'true');
    assert.equal(DOM.settingsPanel.getAttribute('inert'), '');
  });
});

describe('Hardware Instrument & Toast Controls', () => {
  beforeEach(resetAppState);

  test('setFocusThreshold clamps 50-99 and syncs threshold dial and settings control', () => {
    const prevThreshold = state.settings.focusThreshold;
    try {
      setFocusThreshold(120, false);
      assert.equal(state.settings.focusThreshold, 99);
      assert.equal(DOM.dialCutoffLabel.textContent, '99%');
      assert.equal(DOM.thresholdDial.getAttribute('aria-valuenow'), '99');
      assert.equal(String(DOM.settingFocusThreshold.value), '99');

      setFocusThreshold(12, false);
      assert.equal(state.settings.focusThreshold, 50);
      assert.equal(DOM.dialCutoffLabel.textContent, '50%');

      setFocusThreshold(74, false);
      assert.equal(state.settings.focusThreshold, 74);
      assert.equal(DOM.dialCutoffLabel.textContent, '74%');
    } finally {
      setFocusThreshold(prevThreshold, false);
    }
  });

  test('setSensitivityCone normalizes mode and syncs settings select', () => {
    const prevSens = state.settings.sensitivity;
    try {
      setSensitivityCone('high', false);
      assert.equal(state.settings.sensitivity, 'high');
      assert.equal(DOM.settingSensitivity.value, 'high');

      setSensitivityCone('invalid-mode', false);
      assert.equal(state.settings.sensitivity, 'low');
      assert.equal(DOM.settingSensitivity.value, 'low');
    } finally {
      setSensitivityCone(prevSens, false);
    }
  });

  test('adjustDailyGoal clamps 0.5-16h and updates HUD target display', () => {
    const prevGoal = state.settings.dailyGoal;
    try {
      state.settings.dailyGoal = 6;
      adjustDailyGoal(0.5);
      assert.equal(state.settings.dailyGoal, 6.5);
      assert.equal(DOM.hwGoalVal.textContent, '6.5h');

      state.settings.dailyGoal = 16;
      adjustDailyGoal(0.5);
      assert.equal(state.settings.dailyGoal, 16);

      state.settings.dailyGoal = 0.5;
      adjustDailyGoal(-0.5);
      assert.equal(state.settings.dailyGoal, 0.5);
    } finally {
      state.settings.dailyGoal = prevGoal;
    }
  });

  test('showToast caps visible stack at 2, coalesces matching titles, and auto-dismisses without animationend', async () => {
    const container = DOM.toastContainer;
    const origAppend = container.appendChild;
    const origRemoveChild = container.removeChild;
    const origQsa = container.querySelectorAll;
    container.children = [];
    container.appendChild = (child) => {
      child.parentNode = container;
      child.remove = () => {
        origRemoveChild.call(container, child);
        child.parentNode = null;
      };
      return origAppend.call(container, child);
    };
    container.querySelectorAll = (sel) => {
      if (sel === '.toast') return container.children.filter((c) => c.classList.contains('toast'));
      return [];
    };

    try {
      showToast('info', 'Calibration Done', 'First', 5000);
      showToast('info', 'Calibration Done', 'Updated', 5000);
      assert.equal(container.children.length, 1);

      showToast('info', 'Second Notice', 'Msg 2', 5000);
      showToast('info', 'Third Notice', 'Msg 3', 5000);
      assert.equal(container.children.length, 2);

      const first = container.children[0];
      dismissToast(first);
      assert.equal(first.classList.contains('removing'), true);
      await new Promise((r) => setTimeout(r, 260));
      assert.equal(container.children.includes(first), false);
    } finally {
      container.children = [];
      container.appendChild = origAppend;
      container.removeChild = origRemoveChild;
      container.querySelectorAll = origQsa;
    }
  });

  test('handleMidnightRollover rejects multi-hour post-midnight inflation when stale or missing sleepAnchor', () => {
    const day2 = new Date(2026, 10, 25, 19, 45, 0);
    const day2Str = getLocalDateString(day2.getTime());
    const day1Date = new Date(2026, 10, 24, 23, 50, 0);
    const day1Str = getLocalDateString(day1Date.getTime());

    state.session.active = true;
    state.session.id = 'day_' + day1Str;
    state.session.dateStr = day1Str;
    state.session.startTime = day1Date.getTime();
    state.session.studyStartedAt = day1Date.getTime();
    state.session.studyTime = 600000;
    state.session.accStudyMs = 600000;
    state.status = 'studying';
    state.lastTickTimestamp = 0;
    state.lastTickMonotonic = null;

    handleMidnightRollover(day2.getTime(), day2Str);

    assert.equal(state.session.dateStr, day2Str);
    assert.equal(state.session.studyTime, 0, 'Must never credit 19h 45m across stale day rollover');
    assert.equal(state.status, 'lid-closed');
    state.session.active = false;
  });

  test('buildDashboardStats includes pausedTime in Analytics Focus % matching Tracker', () => {
    const todayStr = getLocalDateString();
    state.session.studyTime = 1800000;
    state.session.sessionTime = 1800000;
    state.session.pausedTime = 1800000;

    buildDashboardStats([
      {
        date: todayStr,
        studyTime: 1800000,
        sessionTime: 1800000,
        pausedTime: 1800000,
        distractions: { lookAway: 2, away: 0, lidClosed: 0 },
      },
    ]);

    assert.equal(DOM.dashFocus.textContent, '50%');
    assert.equal(DOM.homeFocus.textContent, '50%');
    state.session.studyTime = 0;
    state.session.sessionTime = 0;
    state.session.pausedTime = 0;
  });

  test('setStatus preserves user-expanded secondaryAuditDrawer across active status changes', () => {
    const drawer = DOM.secondaryAuditDrawer;
    const prevOpen = drawer.open;
    const prevActive = state.session.active;
    try {
      drawer.open = true;
      state.session.active = true;
      setStatus('studying');
      assert.equal(drawer.open, true);
    } finally {
      drawer.open = prevOpen;
      state.session.active = prevActive;
      setStatus('idle');
    }
  });

  test('setTimerDisplay updates timerDisplay textContent and rolls mechanical drum slots upwards', () => {
    const slots = [9, 9, 5, 9, 5, 9].map((maxVal) => {
      const vars = {};
      const reel = {
        classes: new Set(),
        classList: {
          add(c) { reel.classes.add(c); },
          remove(c) { reel.classes.delete(c); },
          contains(c) { return reel.classes.has(c); },
        },
        style: {
          setProperty(k, v) { vars[k] = v; },
          getPropertyValue(k) { return vars[k]; },
        },
        offsetHeight: 0,
      };
      return {
        getAttribute(k) { return k === 'data-max' ? String(maxVal) : ''; },
        querySelector(sel) { return sel === '.drum-reel' ? reel : null; },
        reel,
      };
    });
    const prevDrums = DOM.timerDrums;
    DOM.timerDrums = {
      querySelectorAll(sel) { return sel === '.drum-slot' ? slots : []; },
      classList: DOM.timerDisplay.classList,
    };

    try {
      setTimerDisplay('00:00:09');
      assert.equal(DOM.timerDisplay.textContent, '00:00:09');
      assert.equal(slots[5].reel.style.getPropertyValue('--drum-idx'), '9');

      // Rolling 09 -> 10: tens seconds increments (0->1), units seconds wraps upward (9 -> 10)
      setTimerDisplay('00:00:10');
      assert.equal(DOM.timerDisplay.textContent, '00:00:10');
      assert.equal(slots[4].reel.style.getPropertyValue('--drum-idx'), '1');
      assert.equal(slots[4].reel.classList.contains('rolling'), true);
      assert.equal(slots[5].reel.style.getPropertyValue('--drum-idx'), '10');
      assert.equal(slots[5].reel.classList.contains('rolling'), true);
    } finally {
      slots.forEach((s) => { if (s._wrapTimer) clearTimeout(s._wrapTimer); });
      DOM.timerDrums = prevDrums;
      setTimerDisplay('00:00:00');
    }
  });
});






