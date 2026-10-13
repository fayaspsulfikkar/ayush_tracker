/**
 * Unit tests for Ayush_Tracker core logic:
 * - Time and duration formatting
 * - Head pose yaw and pitch estimations
 * - Focus detection threshold math
 * - Study goal progress calculation
 * - Back-dated timer rollback logic
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ── Pure Logic Implementations matching Ayush_Tracker ──

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map(n => n.toString().padStart(2, '0')).join(':');
}

function formatDuration(ms) {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.floor(ms / 1000)}s`;
}

function calculateYaw(noseX, leftCheekX, rightCheekX) {
  const dLeft = Math.abs(noseX - leftCheekX);
  const dRight = Math.abs(noseX - rightCheekX);
  const yawRatio = (dLeft - dRight) / (dLeft + dRight);
  return yawRatio * 90;
}

function calculatePitch(noseY, foreheadY, chinY) {
  const dTop = Math.abs(noseY - foreheadY);
  const dBottom = Math.abs(noseY - chinY);
  const pitchRatio = (dTop - dBottom) / (dTop + dBottom);
  return pitchRatio * 90;
}

function isFacingScreen(pose, neutral, threshold) {
  const yawDev = Math.abs(pose.yaw - neutral.yaw);
  const pitchDev = Math.abs(pose.pitch - neutral.pitch);
  return yawDev < threshold && pitchDev < threshold;
}

function calculateGoalProgress(studyMs, goalHours) {
  const goalMs = goalHours * 3600 * 1000;
  if (goalMs <= 0) return 0;
  return Math.min(100, Math.round((studyMs / goalMs) * 100));
}

function calculateBackdatedStudyTime(recordedStudyTime, pauseDelayMs) {
  // Rolls back the unverified delay elapsed before distraction was confirmed
  return Math.max(0, recordedStudyTime - pauseDelayMs);
}

function calculateFocusScore(pose, neutral = { yaw: 0, pitch: 0 }, threshold = 25, readingMode = false) {
  if (!pose) return 0;
  const yawDev = Math.abs(pose.yaw - neutral.yaw);
  let pitchDev = Math.abs(pose.pitch - neutral.pitch);
  if (readingMode && pose.pitch > neutral.pitch) {
    pitchDev = 0;
  }
  const deviation = Math.hypot(yawDev, pitchDev * 0.85);
  const x = Math.min(1.0, deviation / threshold);
  return Math.max(0, Math.min(100, Math.round(100 * (1 - Math.pow(x, 1.5)))));
}

// ── Test Suites ──

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
});

describe('Ayush_Tracker — Head Pose & Geometry', () => {
  test('calculateYaw returns ~0° when nose is centered between cheeks', () => {
    // Left cheek at x=0.3, nose at x=0.5, right cheek at x=0.7
    const yaw = calculateYaw(0.5, 0.3, 0.7);
    assert.equal(Math.round(yaw), 0);
  });

  test('calculateYaw returns positive angle when turned right', () => {
    // Nose shifted closer to right cheek
    const yaw = calculateYaw(0.6, 0.3, 0.7);
    assert.ok(yaw > 0);
  });

  test('calculateYaw returns negative angle when turned left', () => {
    // Nose shifted closer to left cheek
    const yaw = calculateYaw(0.4, 0.3, 0.7);
    assert.ok(yaw < 0);
  });

  test('isFacingScreen checks deviation within sensitivity threshold', () => {
    const neutral = { yaw: 0, pitch: 0 };
    const threshold = 18; // default sensitivity threshold

    assert.equal(isFacingScreen({ yaw: 5, pitch: 8 }, neutral, threshold), true);
    assert.equal(isFacingScreen({ yaw: 25, pitch: 5 }, neutral, threshold), false);
    assert.equal(isFacingScreen({ yaw: 0, pitch: -22 }, neutral, threshold), false);
  });
});

describe('Ayush_Tracker — Focus Measurement & Sudden Stopping', () => {
  test('calculateFocusScore returns 100% when perfectly centered', () => {
    const score = calculateFocusScore({ yaw: 0, pitch: 0 }, { yaw: 0, pitch: 0 }, 25);
    assert.equal(score, 100);
  });

  test('calculateFocusScore stays well above 80% for normal screen movements (preventing accidental pauses)', () => {
    // Normal head shifts and screen scanning (up to 4°-5°)
    const score = calculateFocusScore({ yaw: 3.5, pitch: 2 }, { yaw: 0, pitch: 0 }, 25);
    assert.ok(score >= 80, `Expected score >= 80% to prevent accidental pause, got ${score}%`);
  });

  test('calculateFocusScore drops below 80% default cutoff when looking away (> 8°)', () => {
    const score = calculateFocusScore({ yaw: 9, pitch: 4 }, { yaw: 0, pitch: 0 }, 25);
    assert.ok(score < 80, `Expected score < 80%, got ${score}%`);
  });

  test('reading mode ignores downward pitch in focus score', () => {
    const normalScore = calculateFocusScore({ yaw: 0, pitch: 15 }, { yaw: 0, pitch: 0 }, 25, false);
    const readingScore = calculateFocusScore({ yaw: 0, pitch: 15 }, { yaw: 0, pitch: 0 }, 25, true);
    assert.ok(readingScore > normalScore);
    assert.equal(readingScore, 100);
  });

  test('timer triggers sudden pause immediately if focus < cutoff threshold (80%)', () => {
    const cutoff = 80;
    const focusScore = calculateFocusScore({ yaw: 10, pitch: 0 }, { yaw: 0, pitch: 0 }, 25);
    const shouldStopImmediately = focusScore < cutoff;
    assert.equal(shouldStopImmediately, true);
  });
});

describe('Ayush_Tracker — Timer & Goal Math', () => {
  test('calculateGoalProgress calculates percentage correctly up to 100%', () => {
    assert.equal(calculateGoalProgress(1800000, 1), 50); // 30 mins of 1h
    assert.equal(calculateGoalProgress(3600000, 1), 100);
    assert.equal(calculateGoalProgress(7200000, 1), 100); // capped at 100%
  });

  test('calculateBackdatedStudyTime rolls back unverified delay', () => {
    const totalTime = 60000; // 60s
    const distractionDelay = 3000; // 3s before pause confirmed
    const adjusted = calculateBackdatedStudyTime(totalTime, distractionDelay);
    assert.equal(adjusted, 57000);
  });
});
